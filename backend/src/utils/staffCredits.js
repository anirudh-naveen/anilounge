/**
 * Staff credits per episode: AniList credits a role to episodes in a note ("Animation
 * Director (eps 3, 7-9)"), TMDB lists each episode's crew. These keep the roles worth
 * showing on an episode (directing, storyboards, scripts, animation direction) and
 * which episodes each person had them on.
 *
 * Utils layer: pure. services/catalogImport.js writes the result to `episode_credits`.
 */

/** Roles shown per episode, in display order. */
export const EPISODE_ROLES = [
  'Episode Director',
  'Storyboard',
  'Script',
  'Chief Animation Director',
  'Animation Director',
]

/** AniList role names folded onto `EPISODE_ROLES`. */
const ANILIST_EPISODE_ROLES = new Map([
  ['episode director', 'Episode Director'],
  ['director', 'Episode Director'],
  ['storyboard', 'Storyboard'],
  ['script', 'Script'],
  ['screenplay', 'Script'],
  ['chief animation director', 'Chief Animation Director'],
  ['animation director', 'Animation Director'],
])

/** TMDB episode crew jobs folded onto `EPISODE_ROLES`. */
const TMDB_EPISODE_JOBS = new Map([
  ['director', 'Episode Director'],
  ['supervising director', 'Episode Director'],
  ['storyboard', 'Storyboard'],
  ['storyboard artist', 'Storyboard'],
  ['writer', 'Script'],
  ['teleplay', 'Script'],
  ['screenplay', 'Script'],
  ['story', 'Script'],
  ['animation director', 'Animation Director'],
])

/** TMDB show crew kept as a western show's key staff, by job, in display order. */
const TMDB_KEY_JOBS = new Map(
  [
    'Creator',
    'Developer',
    'Supervising Director',
    'Director',
    'Head Writer',
    'Story Editor',
    'Original Music Composer',
    'Music',
    'Art Direction',
    'Character Designer',
  ].map((job, index) => [job.toLowerCase(), index]),
)
/** TMDB movie crew kept as key staff. */
const TMDB_MOVIE_JOBS = new Map(
  [
    'Director',
    'Screenplay',
    'Writer',
    'Story',
    'Original Music Composer',
    'Music',
    'Character Designer',
    'Art Direction',
  ].map((job, index) => [job.toLowerCase(), index]),
)
const MAX_KEY_STAFF = 16
/** A director or writer of fewer episodes than this isn't key staff of the show. */
const MIN_KEY_EPISODES = 3

/**
 * Episode numbers in an AniList role note: "ep 3", "eps 1, 5-7", "eps 1-12, ED".
 * Opening/ending credits (OP1, ED2) are not episodes.
 * @param {string} note - Text inside the role's parentheses
 * @returns {number[]}
 */
export function noteEpisodes(note) {
  const episodes = new Set()
  let inEpisodes = false
  for (const raw of String(note || '').split(',')) {
    const token = raw.trim().toLowerCase()
    const match = /^(?:eps?\.?\s*)?(\d+)(?:\s*-\s*(\d+))?$/.exec(token)
    const startsList = /^eps?\b/.test(token)
    if (match && (startsList || inEpisodes)) {
      inEpisodes = true
      const from = Number(match[1])
      const to = Math.min(Number(match[2] || match[1]), from + 500)
      for (let number = from; number <= to; number += 1) episodes.add(number)
    } else {
      inEpisodes = false
    }
  }
  return [...episodes].sort((left, right) => left - right)
}

/**
 * An AniList staff role split into its name and the episodes its note names.
 * @param {string} role - e.g. "Animation Director (eps 3, 7)", "Director "
 * @returns {{ role: string, episodes: number[], hasNote: boolean }}
 */
export function parseAnilistRole(role) {
  const text = String(role || '').trim()
  const match = /^(.*?)\s*\((.*)\)\s*$/.exec(text)
  if (!match) return { role: text, episodes: [], hasNote: false }
  return { role: match[1].trim(), episodes: noteEpisodes(match[2]), hasNote: true }
}

/**
 * Per-episode credits from AniList staff edges.
 * @param {object[]} edges - `staff.edges` (`role`, `node { id name { full native } image { large } }`)
 * @returns {Array<{ episode: number, role: string, person: object }>}
 */
export function anilistEpisodeCredits(edges = []) {
  const credits = []
  const seen = new Set()
  for (const edge of edges) {
    const parsed = parseAnilistRole(edge?.role)
    const role = ANILIST_EPISODE_ROLES.get(parsed.role.toLowerCase())
    const anilistId = Number(edge?.node?.id)
    const name = String(edge?.node?.name?.full || '').trim()
    if (!role || !parsed.episodes.length || !(anilistId > 0) || !name) continue
    const person = {
      anilistId,
      name,
      nativeName: String(edge.node.name?.native || '').trim(),
      imagePath: String(edge.node.image?.large || '').trim(),
    }
    for (const episode of parsed.episodes) {
      const key = `${episode}:${role}:${anilistId}`
      if (seen.has(key)) continue
      seen.add(key)
      credits.push({ episode, role, person })
    }
  }
  return credits
}

/**
 * Per-episode credits from TMDB episode crew.
 * @param {Array<{ number: number, crew?: object[] }>} episodes - Numbered within the season
 * @returns {Array<{ episode: number, role: string, person: object }>}
 */
export function tmdbEpisodeCredits(episodes = []) {
  const credits = []
  const seen = new Set()
  for (const episode of episodes) {
    for (const member of episode?.crew || []) {
      const role = TMDB_EPISODE_JOBS.get(
        String(member?.job || '')
          .trim()
          .toLowerCase(),
      )
      const tmdbId = Number(member?.id)
      const name = String(member?.name || '').trim()
      if (!role || !(tmdbId > 0) || !name) continue
      const key = `${episode.number}:${role}:${tmdbId}`
      if (seen.has(key)) continue
      seen.add(key)
      credits.push({
        episode: episode.number,
        role,
        person: { tmdbId, name, imagePath: String(member.profile_path || '').trim() },
      })
    }
  }
  return credits
}

/**
 * Key staff of a show TMDB lists (western animation): its creators, then crew from
 * TMDB's aggregate credits in the jobs worth listing, directors and writers only when
 * they worked on several episodes.
 * @param {{ created_by?: object[] }} details - TMDB TV document
 * @param {{ crew?: object[] }} [credits] - TMDB `aggregate_credits` (shows) or `credits` (movies)
 * @param {{ movie?: boolean }} [options] - A movie's director and writers are all key.
 * @returns {Array<{ tmdbId: number, name: string, imagePath: string, role: string }>}
 */
export function tmdbKeyStaff(details, credits, { movie = false } = {}) {
  const staff = []
  const seen = new Set()
  const add = (person, role, rank) => {
    const tmdbId = Number(person?.id)
    const name = String(person?.name || '').trim()
    if (!(tmdbId > 0) || !name || seen.has(`${tmdbId}:${role}`)) return
    seen.add(`${tmdbId}:${role}`)
    staff.push({ tmdbId, name, imagePath: String(person.profile_path || '').trim(), role, rank })
  }
  for (const creator of details?.created_by || []) add(creator, 'Creator', -1)
  for (const member of credits?.crew || []) {
    for (const job of member?.jobs || [
      { job: member?.job, episode_count: member?.episode_count },
    ]) {
      const name = String(job?.job || '').trim()
      const rank = (movie ? TMDB_MOVIE_JOBS : TMDB_KEY_JOBS).get(name.toLowerCase())
      if (rank == null) continue
      const minor = ['director', 'head writer', 'story editor'].includes(name.toLowerCase())
      if (!movie && minor && Number(job.episode_count || 0) < MIN_KEY_EPISODES) continue
      add(member, name, rank)
    }
  }
  return staff
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MAX_KEY_STAFF)
    .map(({ rank: _rank, ...person }) => person)
}
