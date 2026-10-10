/**
 * Release bot: opens a forum megathread for each newly released episode, movie, and special.
 *
 * Layer: service. Releases are queued in `release_threads` from two places: a scan of
 * the catalog (series whose stored next episode has aired, movies and specials whose
 * release date has come) and the `episode-aired` catalog event, which `Content.save`
 * emits when a refresh moves a series past an episode before the scan saw it. Only
 * releases from the last LOOKBACK_DAYS are queued, so turning the bot on never floods
 * the forum with old titles. Only titles someone follows are queued: at least one real
 * account (not the demo, banned, or unverified) has it on their watchlist, not dropped.
 * Each run then posts up to MAX_PER_RUN pending threads,
 * most popular first, as the bot account (created on first use; it has a random
 * password and an undeliverable email, so nobody can sign in as it).
 *
 * Env knobs: RELEASE_THREADS_ENABLED (default on in production), RELEASE_THREADS_CRON
 * (default every 15 minutes), RELEASE_THREADS_MAX_PER_RUN (default 20).
 */

import crypto from 'node:crypto'
import cron from 'node-cron'
import { query, withTransaction } from '../../config/postgres.js'
import { withJobLock } from '../utils/jobLock.js'
import { hashPassword } from '../utils/passwordHash.js'
import catalogEvents from './catalogEvents.js'
import Content from '../models/Content.js'
import { createMegathread } from './forumService.js'
import { queuePost } from './indexNowService.js'
import { resolveTmdbEpisode } from './seasonService.js'

export const BOT_USERNAME = 'AniLoungeBot'
export const BOT_EMAIL = 'release-bot@anilounge.invalid'
const DEFAULT_CRON = '*/15 * * * *'
const DEFAULT_MAX_PER_RUN = 20
/** Releases older than this are never queued. */
export const LOOKBACK_DAYS = 2
/** A release that fails this many times is left alone. */
const MAX_ATTEMPTS = 3

const KIND_NOUNS = { movie: 'Movie', special: 'Special' }

let botId = null
let scheduledTask = null

/**
 * RELEASE_THREADS_ENABLED overrides; otherwise on in production and off in development.
 * @returns {boolean}
 */
function isEnabled() {
  if (process.env.RELEASE_THREADS_ENABLED === 'false') return false
  if (process.env.RELEASE_THREADS_ENABLED === 'true') return true
  return process.env.NODE_ENV === 'production'
}

/**
 * @returns {number}
 */
function maxPerRun() {
  const parsed = parseInt(process.env.RELEASE_THREADS_MAX_PER_RUN, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PER_RUN
}

/**
 * The bot's user id, creating the account the first time.
 * @returns {Promise<string>}
 */
export async function ensureBotAccount() {
  if (botId) return botId
  const existing = await query('SELECT id FROM users WHERE email = $1', [BOT_EMAIL])
  if (existing.rows[0]) {
    botId = String(existing.rows[0].id)
    return botId
  }
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'))
  const { rows } = await query(
    `INSERT INTO users (username, email, password_hash, bio, email_verified_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [
      BOT_USERNAME,
      BOT_EMAIL,
      passwordHash,
      'I open a discussion megathread whenever a new episode or movie comes out.',
    ],
  )
  botId = String(rows[0].id)
  return botId
}

/**
 * Megathread title and body for one release.
 * @param {{ name: string, kind: string, season_number: number | null, episode_number: number | null, season_count: number | null, own_entry?: boolean }} release
 *   `own_entry`: the title is that season's own entry, so its name already says the season.
 * @returns {{ title: string, body: string }}
 */
export function megathreadText(release) {
  const { name, kind, season_number: season, episode_number: episode } = release
  if (episode == null) {
    const noun = KIND_NOUNS[kind] || 'Release'
    return {
      title: `${name} - ${noun} Discussion`,
      body:
        `${name} is out! Share your thoughts on the ${noun.toLowerCase()} here.\n\n` +
        'Please keep spoilers to this thread.',
    }
  }
  const showSeason =
    !release.own_entry && season != null && (season > 1 || (release.season_count ?? 1) > 1)
  const label = showSeason ? `Season ${season} Episode ${episode}` : `Episode ${episode}`
  return {
    title: `${name} - ${label} Discussion`,
    body:
      `${label} of ${name} has aired! Talk about it here.\n\n` +
      'Comments may spoil this episode and earlier ones, so watch first.',
  }
}

/**
 * Forum tags for a release: the episode when its season is known, else the title.
 * @param {{ content_id: string, kind: string, season_number: number | null, episode_number: number | null }} release
 * @returns {Array<{ contentId: string, season: number | null, episode: number | null, top: boolean }>}
 */
export function megathreadTags(release) {
  const contentId = String(release.content_id)
  const episodeTag =
    release.kind === 'series' && release.season_number != null && release.episode_number != null
  return [
    {
      contentId,
      season: episodeTag ? release.season_number : null,
      episode: episodeTag ? release.episode_number : null,
      top: true,
    },
  ]
}

/**
 * Where an episode release belongs. Releases are queued with TMDB's numbering,
 * which can run across a whole show; for anime the thread goes on the
 * MAL/AniList entry the episode is part of, numbered within it (The Apothecary
 * Diaries' TMDB "Episode 50" is "The Apothecary Diaries Season 3 - Episode 2").
 * @param {{ content_id: string, kind: string, name: string, season_number: number | null, episode_number: number | null }} release
 * @returns {Promise<object>} The release, retargeted when the season guide places it elsewhere.
 */
export async function placeRelease(release) {
  if (
    release.kind !== 'series' ||
    release.season_number == null ||
    release.episode_number == null
  ) {
    return release
  }
  const content = await Content.findById(release.content_id)
  if (!content?.tmdbId) return release
  const place = await resolveTmdbEpisode(content, release.season_number, release.episode_number)
  if (!place) return release
  const placed = {
    ...release,
    season_number: place.seasonNumber,
    episode_number: place.episodeNumber,
  }
  if (place.contentId === String(release.content_id)) return placed
  const { rows } = await query('SELECT name FROM content WHERE id = $1', [place.contentId])
  if (!rows.length) return release
  return { ...placed, content_id: place.contentId, name: rows[0].name, own_entry: true }
}

/**
 * SQL for an episode's season: TMDB's when stored, else 1 for single-season shows.
 * @param {string} season - Stored season expression.
 * @returns {string}
 */
const seasonSql = (season) =>
  `COALESCE(${season}, CASE WHEN COALESCE(s.season_count, 1) <= 1 THEN 1 END)`

/**
 * SQL condition: someone follows the title (see the file comment).
 * @param {string} contentId - Content id expression.
 * @returns {string}
 */
export const followedSql = (contentId) => `EXISTS (
  SELECT 1 FROM watchlist wl JOIN users wu ON wu.id = wl.user_id
  WHERE wl.content_id = ${contentId} AND wl.status <> 'dropped'
    AND NOT wu.is_demo AND NOT wu.pending_signup AND wu.banned_at IS NULL
)`

/**
 * Queue followed releases from the last LOOKBACK_DAYS that aren't queued yet.
 * @returns {Promise<number>} Rows queued.
 */
export async function queueReleases() {
  const { rowCount } = await query(
    `INSERT INTO release_threads (content_id, season_number, episode_number, released_at)
     SELECT s.content_id, ${seasonSql('s.next_episode_season')}, s.next_episode_number, s.next_episode_at
     FROM series s
     WHERE s.next_episode_number IS NOT NULL
       AND s.next_episode_at <= now()
       AND s.next_episode_at > now() - make_interval(days => $1)
       AND ${followedSql('s.content_id')}
     UNION ALL
     SELECT r.content_id, NULL, NULL, r.release_date::timestamptz
     FROM (
       SELECT content_id, release_date FROM movies
       UNION ALL
       SELECT content_id, release_date FROM specials
     ) r
     WHERE r.release_date <= current_date
       AND r.release_date > current_date - $1::int
       AND ${followedSql('r.content_id')}
     ON CONFLICT DO NOTHING`,
    [LOOKBACK_DAYS],
  )
  return rowCount || 0
}

/**
 * Queue one aired episode from the `episode-aired` catalog event, if someone follows it.
 * @param {{ contentId: string, season: number | null, episode: number, airedAt: Date }} event
 * @returns {Promise<void>}
 */
export async function queueAiredEpisode({ contentId, season, episode, airedAt }) {
  if (Date.now() - new Date(airedAt).getTime() > LOOKBACK_DAYS * 24 * 60 * 60_000) return
  await query(
    `INSERT INTO release_threads (content_id, season_number, episode_number, released_at)
     SELECT $1, ${seasonSql('$2::int')}, $3, $4
     FROM content c LEFT JOIN series s ON s.content_id = c.id
     WHERE c.id = $1 AND ${followedSql('c.id')}
     ON CONFLICT DO NOTHING`,
    [contentId, season, episode, airedAt],
  )
}

/**
 * Open threads for pending releases, most popular first.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ posted: number, failed: number }>}
 */
export async function postPendingThreads({ limit = maxPerRun() } = {}) {
  const { rows } = await query(
    `SELECT rt.id, rt.content_id, rt.season_number, rt.episode_number,
            c.kind, c.name, s.season_count
     FROM release_threads rt
     JOIN content c ON c.id = rt.content_id
     LEFT JOIN works w ON w.id = rt.content_id
     LEFT JOIN series s ON s.content_id = rt.content_id
     WHERE rt.posted_at IS NULL AND rt.attempts < $1
     ORDER BY w.popularity DESC NULLS LAST, rt.released_at
     LIMIT $2`,
    [MAX_ATTEMPTS, limit],
  )
  if (!rows.length) return { posted: 0, failed: 0 }

  const bot = await ensureBotAccount()
  let posted = 0
  let failed = 0
  for (const release of rows) {
    try {
      const placed = await placeRelease(release)
      const post = await withTransaction(async () => {
        const created = await createMegathread(bot, {
          ...megathreadText(placed),
          tags: megathreadTags(placed),
        })
        await query(
          `UPDATE release_threads SET post_id = $2, posted_at = now(), attempts = attempts + 1
           WHERE id = $1`,
          [release.id, created.id],
        )
        return created
      })
      queuePost(post)
      posted += 1
    } catch (error) {
      failed += 1
      console.error(`Release megathread for ${release.name} failed:`, error.message)
      await query('UPDATE release_threads SET attempts = attempts + 1 WHERE id = $1', [
        release.id,
      ]).catch(() => {})
    }
  }
  // Posting counts as activity, so the inactive-account cleanup leaves the bot alone.
  if (posted) await query('UPDATE users SET last_active_at = now() WHERE id = $1', [bot])
  return { posted, failed }
}

/**
 * One pass: queue new releases, then post pending threads.
 * @returns {Promise<{ queued: number, posted: number, failed: number }>}
 */
export async function runReleaseThreads() {
  const queued = await queueReleases()
  const result = await postPendingThreads()
  if (queued || result.posted || result.failed) {
    console.log(
      `Release megathreads: ${queued} queued, ${result.posted} posted, ${result.failed} failed`,
    )
  }
  return { queued, ...result }
}

/**
 * Listen for aired episodes and schedule `runReleaseThreads` (one instance at a time;
 * see utils/jobLock.js). Call once at server start.
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startReleaseThreadScheduler() {
  if (!isEnabled()) {
    console.log('Release megathreads disabled (set RELEASE_THREADS_ENABLED=true to enable)')
    return null
  }
  const schedule = process.env.RELEASE_THREADS_CRON || DEFAULT_CRON
  if (!cron.validate(schedule)) {
    console.error(`Invalid RELEASE_THREADS_CRON "${schedule}"; release megathreads not started`)
    return null
  }
  if (scheduledTask) return scheduledTask

  catalogEvents.on('episode-aired', (event) => {
    queueAiredEpisode(event).catch((error) =>
      console.error('Queueing aired episode failed:', error.message),
    )
  })
  scheduledTask = cron.schedule(schedule, () => {
    withJobLock('release-threads', runReleaseThreads, { ttlMs: 10 * 60_000 }).catch((error) =>
      console.error('Release megathreads failed:', error.message),
    )
  })
  console.log(`Release megathreads scheduled (${schedule})`)
  return scheduledTask
}
