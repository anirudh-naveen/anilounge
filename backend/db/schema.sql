-- AniLounge catalog: content supertype + disjoint subtypes.
-- Watchables: movie | series | special
-- People/orgs: character | voice | studio
-- Groups: franchise

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN (
                  'movie', 'series', 'special', 'franchise', 'character', 'voice', 'studio'
                )),
  name          TEXT NOT NULL,
  native_name   TEXT,
  about         TEXT,
  image_path    TEXT,
  mal_id        INTEGER,
  tmdb_id       INTEGER,
  anilist_id    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('simple', coalesce(name, '')), 'A')
                  || setweight(to_tsvector('simple', coalesce(native_name, '')), 'A')
                  || setweight(to_tsvector('simple', coalesce(about, '')), 'C')
                ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS content_kind_mal_id_unique
  ON content (kind, mal_id)
  WHERE mal_id IS NOT NULL AND mal_id > 0;

CREATE UNIQUE INDEX IF NOT EXISTS content_kind_tmdb_id_unique
  ON content (kind, tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS content_kind_anilist_id_unique
  ON content (kind, anilist_id)
  WHERE anilist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_kind_name_idx ON content (kind, name);
CREATE INDEX IF NOT EXISTS content_search_idx ON content USING GIN (search_vector);

-- Default catalog order for watchables (the "hidden" sort in db/mongoFilter.js):
-- unified score, plus 1 and 5% of popularity for titles TMDB knows. Stored and indexed
-- (triggers in the Scaling section keep it current) so a catalog page reads 20 index
-- entries instead of scoring every title through the `works` view.
ALTER TABLE content ADD COLUMN IF NOT EXISTS catalog_score DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Community rating totals, kept by statement triggers on `ratings` (Scaling section), so
-- `works` reads two columns instead of aggregating `ratings` for every row it returns.
ALTER TABLE content ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content ADD COLUMN IF NOT EXISTS rating_sum NUMERIC NOT NULL DEFAULT 0;

-- Admin edits (services/adminService.js): `{ field: value }` for watchable fields an admin
-- set by hand. Content.save re-applies them so the hourly catalog sync cannot undo them.
ALTER TABLE content ADD COLUMN IF NOT EXISTS admin_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Sync notices (services/syncGuard.js): what the catalog sync changed on existing rows
-- ('changed', an admin can revert and lock it) or wanted to change on a locked field
-- ('blocked', an admin can take the new value). One row per (content, field); rows
-- expire 14 days after they are created.
CREATE TABLE IF NOT EXISTS content_sync_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  field       TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('changed', 'blocked')),
  old_value   JSONB,
  new_value   JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, field)
);
CREATE INDEX IF NOT EXISTS content_sync_changes_created_idx ON content_sync_changes (created_at DESC);

-- Admin log (services/adminLog.js): append-only record of content changes, moderation,
-- and sync changes, read by month on the admin page. No foreign keys, so deleting a user or
-- title never touches it; the trigger refuses UPDATE and DELETE.
CREATE TABLE IF NOT EXISTS admin_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category        TEXT NOT NULL,
  actor_id        UUID,
  actor_username  TEXT,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_log_created_idx ON admin_log (created_at DESC);
-- 'content' = catalog edits; 'moderation' = everything else admins do; 'sync' = the
-- catalog sync. 'admin' is the older name for content edits (rows can't be rewritten).
ALTER TABLE admin_log DROP CONSTRAINT IF EXISTS admin_log_category_check;
ALTER TABLE admin_log ADD CONSTRAINT admin_log_category_check
  CHECK (category IN ('content', 'moderation', 'sync', 'admin'));

-- Bug reports and suggestions from the Feedback page (controllers/feedbackController.js).
-- Each one is also emailed to SUPPORT_EMAIL; admins read them in the admin Log tab.
CREATE TABLE IF NOT EXISTS feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'other')),
  message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  email       TEXT,
  user_id     UUID,
  page_url    TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);

CREATE OR REPLACE FUNCTION admin_log_append_only() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN RAISE EXCEPTION ''admin_log is append-only''; END';
DROP TRIGGER IF EXISTS admin_log_no_change ON admin_log;
CREATE TRIGGER admin_log_no_change BEFORE UPDATE OR DELETE ON admin_log
  FOR EACH ROW EXECUTE FUNCTION admin_log_append_only();

CREATE TABLE IF NOT EXISTS movies (
  content_id       UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE,
  original_title   TEXT,
  tagline          TEXT,
  backdrop_path    TEXT,
  release_date     DATE,
  origin_country   CHAR(2),
  runtime_minutes  INTEGER,
  tmdb_score       DOUBLE PRECISION,
  tmdb_votes       INTEGER,
  mal_score        DOUBLE PRECISION,
  mal_votes        INTEGER,
  popularity       DOUBLE PRECISION,
  unified_score    DOUBLE PRECISION,
  airing_status    TEXT CHECK (airing_status IN ('upcoming', 'airing', 'finished'))
);

CREATE TABLE IF NOT EXISTS series (
  content_id          UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE,
  original_title      TEXT,
  tagline             TEXT,
  backdrop_path       TEXT,
  release_date        DATE,
  origin_country      CHAR(2),
  season_count        INTEGER,
  episode_count       INTEGER,
  airing_status       TEXT CHECK (airing_status IN ('upcoming', 'airing', 'finished')),
  start_season        TEXT CHECK (start_season IN ('winter', 'spring', 'summer', 'fall')),
  start_year          INTEGER,
  broadcast_day       TEXT,
  next_episode_at     TIMESTAMPTZ,
  next_episode_number INTEGER,
  tmdb_score          DOUBLE PRECISION,
  tmdb_votes          INTEGER,
  mal_score           DOUBLE PRECISION,
  mal_votes           INTEGER,
  popularity          DOUBLE PRECISION,
  unified_score       DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS specials (
  content_id       UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE,
  original_title   TEXT,
  tagline          TEXT,
  backdrop_path    TEXT,
  release_date     DATE,
  origin_country   CHAR(2),
  runtime_minutes  INTEGER,
  tmdb_score       DOUBLE PRECISION,
  tmdb_votes       INTEGER,
  mal_score        DOUBLE PRECISION,
  mal_votes        INTEGER,
  popularity       DOUBLE PRECISION,
  unified_score    DOUBLE PRECISION,
  airing_status    TEXT CHECK (airing_status IN ('upcoming', 'airing', 'finished'))
);

CREATE INDEX IF NOT EXISTS movies_unified_idx ON movies (unified_score DESC);
CREATE INDEX IF NOT EXISTS series_unified_idx ON series (unified_score DESC);
CREATE INDEX IF NOT EXISTS series_airing_idx ON series (next_episode_at)
  WHERE airing_status = 'airing';
CREATE INDEX IF NOT EXISTS specials_unified_idx ON specials (unified_score DESC);

ALTER TABLE movies ADD COLUMN IF NOT EXISTS airing_status TEXT;
ALTER TABLE specials ADD COLUMN IF NOT EXISTS airing_status TEXT;

CREATE TABLE IF NOT EXISTS genres (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS content_genres (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  genre_id    UUID NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, genre_id)
);

CREATE INDEX IF NOT EXISTS content_genres_genre_idx ON content_genres (genre_id);

CREATE TABLE IF NOT EXISTS content_akas (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  PRIMARY KEY (content_id, name)
);

CREATE TABLE IF NOT EXISTS content_relations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id     UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  to_id       UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN (
                'sequel',
                'prequel',
                'side_story',
                'parent_story',
                'alternative_setting',
                'alternative_version',
                'alternative',
                'summary',
                'full_story',
                'other'
              )),
  source      TEXT NOT NULL DEFAULT 'curated' CHECK (source IN ('mal', 'tmdb', 'curated')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_id <> to_id),
  UNIQUE (from_id, to_id, kind)
);

CREATE INDEX IF NOT EXISTS content_relations_from_idx ON content_relations (from_id, kind);
CREATE INDEX IF NOT EXISTS content_relations_to_idx ON content_relations (to_id, kind);

CREATE TABLE IF NOT EXISTS franchises (
  content_id UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS franchise_members (
  franchise_id  UUID NOT NULL REFERENCES franchises (content_id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  PRIMARY KEY (franchise_id, member_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS franchise_members_member_unique
  ON franchise_members (member_id);

CREATE TABLE IF NOT EXISTS characters (
  content_id    UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE,
  english_name  TEXT
);

CREATE TABLE IF NOT EXISTS voices (
  content_id    UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE,
  english_name  TEXT
);

CREATE TABLE IF NOT EXISTS studios (
  content_id UUID PRIMARY KEY REFERENCES content (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appearances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id       UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  character_id  UUID NOT NULL REFERENCES characters (content_id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'supporting' CHECK (role IN ('main', 'supporting', 'cameo')),
  importance    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (work_id, character_id)
);

CREATE INDEX IF NOT EXISTS appearances_work_idx ON appearances (work_id);
CREATE INDEX IF NOT EXISTS appearances_character_idx ON appearances (character_id);

CREATE TABLE IF NOT EXISTS voice_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appearance_id   UUID NOT NULL REFERENCES appearances (id) ON DELETE CASCADE,
  voice_id        UUID NOT NULL REFERENCES voices (content_id) ON DELETE CASCADE,
  language        TEXT,
  UNIQUE (appearance_id, voice_id, language)
);

CREATE INDEX IF NOT EXISTS voice_credits_voice_idx ON voice_credits (voice_id);

CREATE TABLE IF NOT EXISTS studio_credits (
  work_id    UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  studio_id  UUID NOT NULL REFERENCES studios (content_id) ON DELETE CASCADE,
  PRIMARY KEY (work_id, studio_id)
);

-- Admin link editing (services/adminLinks.js). Links an admin adds or reorders are
-- marked so the catalog sync never deletes or reshuffles them; links an admin removes
-- are remembered in admin_link_removals so the sync does not add them back.
-- `appearances.position` is the admin's cast order (NULL = the sync's order).
ALTER TABLE appearances ADD COLUMN IF NOT EXISTS position INTEGER;
ALTER TABLE appearances ADD COLUMN IF NOT EXISTS admin_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE voice_credits ADD COLUMN IF NOT EXISTS admin_added BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE studio_credits ADD COLUMN IF NOT EXISTS admin_added BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_link_removals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_kind   TEXT NOT NULL CHECK (link_kind IN ('appearance', 'voice_credit', 'studio_credit')),
  work_id     UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  -- The character (appearance, voice_credit) or studio (studio_credit).
  other_id    UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  voice_id    UUID REFERENCES content (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_link_removals_unique ON admin_link_removals
  (link_kind, work_id, other_id, COALESCE(voice_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username                TEXT NOT NULL UNIQUE,
  email                   TEXT NOT NULL UNIQUE,
  password_hash           TEXT NOT NULL,
  profile_picture         TEXT,
  bio                     TEXT,
  is_demo                 BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
  lock_until              TIMESTAMPTZ,
  last_login_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(username) BETWEEN 3 AND 20)
);

-- Favorite genres/studios and public profile customization (see utils/profileSettings.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Email verification. The temporary default marks accounts that existed before this
-- column as verified; dropping it right after means new sign-ups start unverified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE users ALTER COLUMN email_verified_at DROP DEFAULT;

-- Authenticator-app (TOTP) two-factor auth. `two_factor_pending_secret` holds a secret
-- during setup until the user confirms a code from it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_pending_secret TEXT;

-- Inactivity cleanup (services/inactiveAccountService.js): accounts unused for a year are
-- deleted after warning emails. Existing rows start from their last login or sign-up.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
UPDATE users SET last_active_at = COALESCE(last_login_at, created_at) WHERE last_active_at IS NULL;
ALTER TABLE users ALTER COLUMN last_active_at SET DEFAULT now();
-- Smallest "days before deletion" warning already sent since the last activity (NULL = none).
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_warning_days INTEGER;
CREATE INDEX IF NOT EXISTS users_last_active_idx ON users (last_active_at) WHERE is_demo = false;

-- Sign-ups that never verified their email are deleted 3 days after sign-up, with a
-- reminder one day before (services/unverifiedAccountService.js). Only set at sign-up,
-- so established accounts that change email are never affected.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_signup BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_reminder_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_pending_signup_idx ON users (created_at) WHERE pending_signup;

-- Account role (middleware/adminOnly.js). Admins edit content and mute users from the
-- admin page; the single creator (set with `npm run role:creator`) also adds/removes
-- admins and bans users. ADMIN_EMAILS accounts are admins regardless of this column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'creator'));
CREATE UNIQUE INDEX IF NOT EXISTS users_single_creator ON users ((true)) WHERE role = 'creator';

-- Badges (utils/badges.js). Creator/Admin badges come from the role; every other badge
-- a user holds is granted here (Developer, Artist, Influencer today, more later; ids are
-- checked against the registry in code, so new badges need no schema change).
-- `featured_badge` is the one emblem shown next to the name: NULL = their highest,
-- 'none' = no emblem.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cosmetic_roles TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cosmetic_roles_check;
ALTER TABLE users ADD COLUMN IF NOT EXISTS featured_badge TEXT;

-- Moderation (services/adminService.js). A muted user can't do anything other people see
-- until `muted_until` (year 9999 = until unmuted). A banned user can't sign in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Opt-out for announcement emails (services/announcementService.js). Security and
-- account emails ignore it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS announcement_emails BOOLEAN NOT NULL DEFAULT true;
-- Opt-out for friend request emails (services/emailPreferenceService.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_request_emails BOOLEAN NOT NULL DEFAULT true;

-- When the user last finished a watchlist import (services/watchlistImportService.js).
-- New accounts are reminded about importing for their first month until this is set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS watchlist_imported_at TIMESTAMPTZ;

-- Profile pictures live in the database (services/avatarService.js) so they survive
-- redeploys and work from every environment that shares this database.
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id       UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  data          BYTEA NOT NULL CHECK (octet_length(data) <= 2097152),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Emailed one-time codes (sign-up verification, lockout unlock). Only hashes are stored.
CREATE TABLE IF NOT EXISTS email_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL CHECK (purpose IN ('verify_email', 'unlock_account')),
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_codes_user_purpose_idx ON email_codes (user_id, purpose, created_at DESC);

-- Single-use 2FA recovery codes (hashed).
CREATE TABLE IF NOT EXISTS two_factor_backup_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS two_factor_backup_codes_user_idx ON two_factor_backup_codes (user_id);

CREATE TABLE IF NOT EXISTS friendships (
  follower_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

-- Friend requests (services/friendService.js). `follower_id` sent the request; an
-- accepted row is a friendship in both directions. The optional note is shown with the
-- request and becomes the first direct message once accepted.
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS message TEXT CHECK (char_length(message) <= 300);
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS friendships_followee_idx ON friendships (followee_id, status);

-- Re-request cooldown (services/friendService.js). Each time a request from
-- requester to recipient ends without a friendship (cancelled or declined), or the
-- requester unfriends the recipient, `strikes` goes up and new requests are paused
-- for 5 minutes, doubling with every strike. Strikes never reset.
CREATE TABLE IF NOT EXISTS friend_request_cooldowns (
  requester_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recipient_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  strikes        INTEGER NOT NULL DEFAULT 0,
  blocked_until  TIMESTAMPTZ,
  PRIMARY KEY (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id       UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'plan_to_watch' CHECK (status IN (
                     'plan_to_watch', 'watching', 'completed', 'dropped'
                   )),
  current_episode  INTEGER NOT NULL DEFAULT 0,
  current_season   INTEGER NOT NULL DEFAULT 1,
  notes            TEXT CHECK (char_length(notes) <= 500),
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS watchlist_content_idx ON watchlist (content_id);

-- Episode the user had reached before their latest progress change.
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS previous_episode INTEGER NOT NULL DEFAULT 0;

-- List fields AniList and MyAnimeList keep (services/watchlistImportService.js): a paused
-- status ('on_hold'), when the user started and finished the title, and how many times
-- they rewatched it.
ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_status_check;
ALTER TABLE watchlist ADD CONSTRAINT watchlist_status_check
  CHECK (status IN ('plan_to_watch', 'watching', 'completed', 'on_hold', 'dropped'));
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS started_on DATE;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS completed_on DATE;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS rewatch_count INTEGER NOT NULL DEFAULT 0
  CHECK (rewatch_count >= 0);
-- When an import last wrote the row. The homepage feed skips rows not changed since,
-- so importing a list doesn't flood friends' feeds.
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

-- Watch history (services/watchEvents.js): units (episodes, or whole watches for
-- movies) a user got through on a day. In-app progress changes log what they add
-- ('manual'); imports log an estimate spread between the source's start and finish
-- dates ('import'). The profile calendar places watch time by it.
CREATE TABLE IF NOT EXISTS watch_events (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  watched_on  DATE NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('manual', 'import')),
  units       INTEGER NOT NULL CHECK (units > 0),
  PRIMARY KEY (user_id, content_id, watched_on, source)
);

-- Import clashes waiting on the user (services/watchlistImportService.js): titles whose
-- imported sources disagree, or disagree with the user's watchlist row. `options` holds
-- each distinct imported version; nothing is written for the title until the user picks.
CREATE TABLE IF NOT EXISTS watchlist_import_conflicts (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  options     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

-- Linked AniList / MyAnimeList / TMDB accounts (services/connectionService.js).
-- Tokens are encrypted (utils/secretBox.js). `sync_cursor` is the newest remote change
-- (ms since epoch) already pulled; polling only looks at entries newer than it.
CREATE TABLE IF NOT EXISTS account_connections (
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('anilist', 'mal', 'tmdb')),
  external_id       TEXT NOT NULL,
  external_name     TEXT,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  sync_cursor       BIGINT NOT NULL DEFAULT 0,
  last_polled_at    TIMESTAMPTZ,
  last_synced_at    TIMESTAMPTZ,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider),
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS account_connections_poll_idx
  ON account_connections (provider, last_polled_at NULLS FIRST);

CREATE TABLE IF NOT EXISTS ratings (
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  review     TEXT CHECK (char_length(review) <= 1000),
  rated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

-- Ratings to the tenth (8.5). `works` reads ratings.score, so it is dropped for the
-- type change and recreated just below.
DROP VIEW IF EXISTS works;
ALTER TABLE ratings ALTER COLUMN score TYPE NUMERIC(3, 1);

CREATE OR REPLACE VIEW works AS
SELECT
  c.id,
  c.kind,
  CASE c.kind WHEN 'series' THEN 'tv' ELSE c.kind END AS content_type,
  c.name AS title,
  c.name AS english_title,
  c.native_name AS native_title,
  c.about AS overview,
  c.image_path AS poster_path,
  c.mal_id,
  c.tmdb_id,
  c.anilist_id,
  c.created_at,
  c.updated_at,
  COALESCE(m.original_title, s.original_title, sp.original_title) AS original_title,
  COALESCE(m.tagline, s.tagline, sp.tagline) AS tagline,
  COALESCE(m.backdrop_path, s.backdrop_path, sp.backdrop_path) AS backdrop_path,
  COALESCE(m.release_date, s.release_date, sp.release_date) AS release_date,
  COALESCE(m.origin_country, s.origin_country, sp.origin_country) AS origin_country,
  COALESCE(m.runtime_minutes, sp.runtime_minutes) AS runtime,
  s.episode_count,
  s.season_count,
  COALESCE(m.tmdb_score, s.tmdb_score, sp.tmdb_score) AS vote_average,
  COALESCE(m.tmdb_votes, s.tmdb_votes, sp.tmdb_votes) AS vote_count,
  COALESCE(m.popularity, s.popularity, sp.popularity) AS popularity,
  COALESCE(m.unified_score, s.unified_score, sp.unified_score) AS unified_score,
  COALESCE(m.mal_score, s.mal_score, sp.mal_score) AS mal_score,
  COALESCE(m.mal_votes, s.mal_votes, sp.mal_votes) AS mal_votes,
  COALESCE(s.airing_status, m.airing_status, sp.airing_status) AS airing_status,
  s.start_season,
  s.start_year,
  s.broadcast_day,
  s.next_episode_at,
  s.next_episode_number,
  CASE WHEN c.rating_count > 0 THEN c.rating_sum / c.rating_count END AS user_rating_average,
  c.rating_count::bigint AS user_rating_count,
  c.rating_sum AS user_rating_sum,
  c.catalog_score
FROM content c
LEFT JOIN movies m ON m.content_id = c.id
LEFT JOIN series s ON s.content_id = c.id
LEFT JOIN specials sp ON sp.content_id = c.id
WHERE c.kind IN ('movie', 'series', 'special');

CREATE TABLE IF NOT EXISTS favorites (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'discussion' CHECK (kind IN ('discussion', 'review')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  content_id  UUID REFERENCES content (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES comments (id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forum (services/forumService.js). A post is a discussion, a review (reviews carry
-- a 1–10 score), a guide, or an article; `content_id` is the review's subject, tags
-- live in post_tags. Text is masked for
-- blocked language like direct messages, with language warnings to the author.
-- `last_activity_at` moves on new comments so active threads sort up.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score NUMERIC(3, 1) CHECK (score BETWEEN 1 AND 10);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS spoiler BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_kind_check;
ALTER TABLE posts ADD CONSTRAINT posts_kind_check
  CHECK (kind IN ('discussion', 'review', 'guide', 'article'));
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_title_length_check;
ALTER TABLE posts ADD CONSTRAINT posts_title_length_check
  CHECK (char_length(title) BETWEEN 1 AND 150);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_body_length_check;
ALTER TABLE posts ADD CONSTRAINT posts_body_length_check
  CHECK (char_length(body) BETWEEN 1 AND 10000);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_review_score_check;
ALTER TABLE posts ADD CONSTRAINT posts_review_score_check
  CHECK ((kind = 'review') = (score IS NOT NULL));
CREATE INDEX IF NOT EXISTS posts_activity_idx ON posts (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts (user_id, created_at DESC);

-- What a post is about: a movie, series, special, franchise, or character, or one
-- episode of a series (season_number + episode_number set; both or neither).
CREATE TABLE IF NOT EXISTS post_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  content_id      UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  season_number   INTEGER CHECK (season_number BETWEEN 0 AND 999),
  episode_number  INTEGER CHECK (episode_number BETWEEN 1 AND 9999),
  CHECK ((season_number IS NULL) = (episode_number IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS post_tags_unique
  ON post_tags (post_id, content_id, COALESCE(season_number, -1), COALESCE(episode_number, -1));
CREATE INDEX IF NOT EXISTS post_tags_content_idx ON post_tags (content_id, season_number, episode_number);
-- The author's "top tag": highlighted on the post, and its picture is the post's image.
-- At most one per post; posts without one fall back to the highest tag with a picture
-- (franchise pictures are never used).
ALTER TABLE post_tags ADD COLUMN IF NOT EXISTS is_top BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS post_tags_one_top ON post_tags (post_id) WHERE is_top;
-- A review's subject (posts.content_id): its first movie/series/special tag. Its score
-- shows the author's watchlist rating for that title.
UPDATE posts p SET content_id = (
  SELECT t.content_id FROM post_tags t JOIN content c ON c.id = t.content_id
  WHERE t.post_id = p.id AND c.kind IN ('movie', 'series', 'special')
  ORDER BY t.id LIMIT 1
) WHERE p.kind = 'review' AND p.content_id IS NULL;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
-- A deleted comment that has replies is blanked (body '[deleted]') instead of removed.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_body_length_check;
ALTER TABLE comments ADD CONSTRAINT comments_body_length_check
  CHECK (char_length(body) BETWEEN 1 AND 4000);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at);

-- Likes. "Leading" posts and "highlighted" comments are ranked by these.
CREATE TABLE IF NOT EXISTS post_likes (
  post_id     UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id  UUID NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Direct messages (services/messageService.js). Only friends can send; history stays
-- readable after an unfriend. `read_at` is set when the recipient opens the thread.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_body_length_check;
ALTER TABLE messages ADD CONSTRAINT messages_body_length_check
  CHECK (char_length(body) BETWEEN 1 AND 2000);
CREATE INDEX IF NOT EXISTS messages_pair_idx
  ON messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC);
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (recipient_id, sender_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  post_id     UUID REFERENCES posts (id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES users (id) ON DELETE SET NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inbox (services/notificationService.js): the comment a post_comment/comment_reply
-- notification points at.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES comments (id) ON DELETE CASCADE;
-- Extra fields for kinds that need them (e.g. a language warning's masked excerpt).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS detail JSONB;
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- Site news shown in every inbox (services/inboxService.js), posted by
-- scripts/sendAnnouncement.js. News from before an account existed starts out read.
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements (created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id  UUID NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

-- Language warnings (services/languageWarningService.js). One row each time a user
-- sends text with blocked language; the text goes out masked. Past the warning limit
-- every offense alerts admins (admin log, plus one email to SUPPORT_EMAIL).
-- `excerpt` is the masked text; `term` is the matched list term, for admins.
CREATE TABLE IF NOT EXISTS language_warnings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  surface     TEXT NOT NULL,
  term        TEXT NOT NULL,
  excerpt     TEXT NOT NULL CHECK (char_length(excerpt) <= 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS language_warnings_user_idx ON language_warnings (user_id, created_at DESC);
-- 'curse' or 'slur' (utils/moderation.js termCategory); older rows count as curses.
ALTER TABLE language_warnings ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'curse';
ALTER TABLE language_warnings DROP CONSTRAINT IF EXISTS language_warnings_category_check;
ALTER TABLE language_warnings ADD CONSTRAINT language_warnings_category_check
  CHECK (category IN ('curse', 'slur'));

-- Settings → Communication. When both people in a private chat turn this on, curses
-- go through unmasked between them; slurs are always masked (services/messageService.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_profanity BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  is_revoked  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Tokens are stored as SHA-256 hashes (services/sessionService.js). `revoked_at`
-- separates a two-tab refresh race from reuse of a stolen, already-rotated token.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
-- Retire refresh tokens stored in plain text before hashing (128 hex chars vs 64).
UPDATE refresh_tokens SET is_revoked = true
  WHERE is_revoked = false AND char_length(token) <> 64;
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx ON refresh_tokens (expires_at)
  WHERE is_revoked = false;

CREATE TABLE IF NOT EXISTS ip_bans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip          TEXT NOT NULL UNIQUE,
  reason      TEXT NOT NULL CHECK (reason IN (
                'bot_detection',
                'brute_force',
                'suspicious_activity',
                'rate_limit_exceeded',
                'manual'
              )),
  banned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 1,
  user_agent  TEXT,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS ip_bans_active_idx
  ON ip_bans (ip)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- Scaling
-- ---------------------------------------------------------------------------

-- Foreign-key and lookup indexes for the hot paths. Without ratings_content_idx every
-- `works` row ran three full scans of `ratings` (rating average/count/sum).
CREATE INDEX IF NOT EXISTS ratings_content_idx ON ratings (content_id) INCLUDE (score);
CREATE INDEX IF NOT EXISTS favorites_content_idx ON favorites (content_id);
-- Activity feed (services/homeService.js): each friend's latest in-app changes. Rows an
-- import wrote and nobody touched since are never shown, so they stay out of the index.
DROP INDEX IF EXISTS watchlist_user_updated_idx;
CREATE INDEX IF NOT EXISTS watchlist_activity_idx ON watchlist (user_id, updated_at DESC)
  WHERE imported_at IS NULL OR updated_at > imported_at;
CREATE INDEX IF NOT EXISTS watch_events_content_idx ON watch_events (content_id);
-- Conversation lists read "messages I sent or received".
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id, created_at DESC);
-- Cascades and SET NULLs from deleting a user, post, or comment.
CREATE INDEX IF NOT EXISTS comments_user_idx ON comments (user_id);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes (user_id);
CREATE INDEX IF NOT EXISTS comment_likes_user_idx ON comment_likes (user_id);
CREATE INDEX IF NOT EXISTS notifications_post_idx ON notifications (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_comment_idx ON notifications (comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_actor_idx ON notifications (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS announcement_reads_user_idx ON announcement_reads (user_id);
CREATE INDEX IF NOT EXISTS friend_request_cooldowns_recipient_idx ON friend_request_cooldowns (recipient_id);
CREATE INDEX IF NOT EXISTS posts_content_idx ON posts (content_id) WHERE content_id IS NOT NULL;

-- Forum counters (services/forumService.js). Likes and live comments are counted on the
-- post by triggers, and `hot_score` (engagement decayed by age) is stored so 'hot' and
-- 'top' pages read an index instead of recounting every post. The score depends on
-- now(), so refreshHotScores re-decays posts from the last 60 days every few minutes.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hot_score DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION forum_hot_score(likes INTEGER, comments INTEGER, created TIMESTAMPTZ)
  RETURNS DOUBLE PRECISION LANGUAGE sql STABLE AS
  'SELECT (likes + 2 * comments + 1)::float8
     / power(extract(epoch FROM now() - created)::float8 / 3600 + 2, 1.5)';

CREATE OR REPLACE FUNCTION posts_set_hot_score() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
     NEW.hot_score := forum_hot_score(NEW.like_count, NEW.comment_count, NEW.created_at);
     RETURN NEW;
   END';
DROP TRIGGER IF EXISTS posts_hot_score ON posts;
CREATE TRIGGER posts_hot_score BEFORE INSERT OR UPDATE OF like_count, comment_count ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_set_hot_score();

CREATE OR REPLACE FUNCTION post_likes_count() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
     IF TG_OP = ''INSERT'' THEN
       UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
     ELSE
       UPDATE posts SET like_count = greatest(like_count - 1, 0) WHERE id = OLD.post_id;
     END IF;
     RETURN NULL;
   END';
DROP TRIGGER IF EXISTS post_likes_count ON post_likes;
CREATE TRIGGER post_likes_count AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION post_likes_count();

CREATE OR REPLACE FUNCTION comments_count() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
     IF TG_OP = ''INSERT'' THEN
       IF NEW.deleted_at IS NULL THEN
         UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
       END IF;
     ELSIF TG_OP = ''DELETE'' THEN
       IF OLD.deleted_at IS NULL THEN
         UPDATE posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = OLD.post_id;
       END IF;
     ELSIF (OLD.deleted_at IS NULL) <> (NEW.deleted_at IS NULL) THEN
       UPDATE posts
         SET comment_count = greatest(comment_count + CASE WHEN NEW.deleted_at IS NULL THEN 1 ELSE -1 END, 0)
         WHERE id = NEW.post_id;
     END IF;
     RETURN NULL;
   END';
DROP TRIGGER IF EXISTS comments_count ON comments;
CREATE TRIGGER comments_count AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_count();

-- Backfill (and repair any drift): only rows whose stored counts are wrong are written.
UPDATE posts p SET like_count = x.likes, comment_count = x.comments
FROM (
  SELECT p2.id,
         (SELECT count(*) FROM post_likes l WHERE l.post_id = p2.id)::int AS likes,
         (SELECT count(*) FROM comments c WHERE c.post_id = p2.id AND c.deleted_at IS NULL)::int AS comments
  FROM posts p2
) x
WHERE x.id = p.id AND (p.like_count <> x.likes OR p.comment_count <> x.comments);
UPDATE posts SET hot_score = forum_hot_score(like_count, comment_count, created_at)
  WHERE created_at > now() - interval '60 days' OR hot_score = 0;

CREATE INDEX IF NOT EXISTS posts_hot_idx ON posts (hot_score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_top_idx ON posts (like_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON comment_likes (comment_id);

-- Catalog order (content.catalog_score, see the content table). Watchable rows update
-- it when their scores change; content updates it when its TMDB id changes.
CREATE OR REPLACE FUNCTION catalog_score_of(unified DOUBLE PRECISION, pop DOUBLE PRECISION, tmdb INTEGER)
  RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE AS
  'SELECT COALESCE(unified, 0)
     + CASE WHEN tmdb IS NOT NULL THEN 1.0 + COALESCE(pop, 0) * 0.05 ELSE 0 END';

CREATE OR REPLACE FUNCTION watchable_catalog_score() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
     UPDATE content c
       SET catalog_score = catalog_score_of(NEW.unified_score, NEW.popularity, c.tmdb_id)
       WHERE c.id = NEW.content_id
         AND c.catalog_score IS DISTINCT FROM catalog_score_of(NEW.unified_score, NEW.popularity, c.tmdb_id);
     RETURN NULL;
   END';
DROP TRIGGER IF EXISTS movies_catalog_score ON movies;
CREATE TRIGGER movies_catalog_score AFTER INSERT OR UPDATE OF unified_score, popularity ON movies
  FOR EACH ROW EXECUTE FUNCTION watchable_catalog_score();
DROP TRIGGER IF EXISTS series_catalog_score ON series;
CREATE TRIGGER series_catalog_score AFTER INSERT OR UPDATE OF unified_score, popularity ON series
  FOR EACH ROW EXECUTE FUNCTION watchable_catalog_score();
DROP TRIGGER IF EXISTS specials_catalog_score ON specials;
CREATE TRIGGER specials_catalog_score AFTER INSERT OR UPDATE OF unified_score, popularity ON specials
  FOR EACH ROW EXECUTE FUNCTION watchable_catalog_score();

CREATE OR REPLACE FUNCTION content_catalog_score() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
     SELECT catalog_score_of(COALESCE(m.unified_score, s.unified_score, sp.unified_score),
                             COALESCE(m.popularity, s.popularity, sp.popularity), NEW.tmdb_id)
       INTO NEW.catalog_score
       FROM (SELECT 1) one
       LEFT JOIN movies m ON m.content_id = NEW.id
       LEFT JOIN series s ON s.content_id = NEW.id
       LEFT JOIN specials sp ON sp.content_id = NEW.id;
     RETURN NEW;
   END';
DROP TRIGGER IF EXISTS content_catalog_score ON content;
CREATE TRIGGER content_catalog_score BEFORE UPDATE OF tmdb_id ON content
  FOR EACH ROW EXECUTE FUNCTION content_catalog_score();

-- Backfill (and repair drift): only rows whose stored score is wrong are written.
UPDATE content c SET catalog_score = x.score
FROM (
  SELECT c2.id, catalog_score_of(COALESCE(m.unified_score, s.unified_score, sp.unified_score),
                                 COALESCE(m.popularity, s.popularity, sp.popularity), c2.tmdb_id) AS score
  FROM content c2
  LEFT JOIN movies m ON m.content_id = c2.id
  LEFT JOIN series s ON s.content_id = c2.id
  LEFT JOIN specials sp ON sp.content_id = c2.id
  WHERE c2.kind IN ('movie', 'series', 'special')
) x
WHERE x.id = c.id AND c.catalog_score IS DISTINCT FROM x.score;

CREATE INDEX IF NOT EXISTS content_catalog_order_idx
  ON content (kind, catalog_score DESC NULLS LAST, id DESC NULLS LAST)
  WHERE kind IN ('movie', 'series', 'special');
CREATE INDEX IF NOT EXISTS content_catalog_order_all_idx
  ON content (catalog_score DESC NULLS LAST, id DESC NULLS LAST)
  WHERE kind IN ('movie', 'series', 'special');

-- Rating totals (content.rating_count / rating_sum). Statement-level, so a save that
-- rewrites a whole list updates each title once; titles are locked in id order so two
-- large saves at once can't deadlock on each other.
CREATE OR REPLACE FUNCTION ratings_apply_delta() RETURNS trigger LANGUAGE plpgsql AS
  'BEGIN
     IF TG_OP = ''INSERT'' THEN
       PERFORM c.id FROM content c WHERE c.id IN (SELECT content_id FROM new_rows)
         ORDER BY c.id FOR NO KEY UPDATE;
       UPDATE content c SET rating_count = greatest(c.rating_count + d.n, 0), rating_sum = c.rating_sum + d.s
         FROM (SELECT content_id, count(*)::int AS n, sum(score) AS s FROM new_rows GROUP BY content_id) d
         WHERE c.id = d.content_id;
     ELSIF TG_OP = ''DELETE'' THEN
       PERFORM c.id FROM content c WHERE c.id IN (SELECT content_id FROM old_rows)
         ORDER BY c.id FOR NO KEY UPDATE;
       UPDATE content c SET rating_count = greatest(c.rating_count - d.n, 0), rating_sum = c.rating_sum - d.s
         FROM (SELECT content_id, count(*)::int AS n, sum(score) AS s FROM old_rows GROUP BY content_id) d
         WHERE c.id = d.content_id;
     ELSE
       PERFORM c.id FROM content c
         WHERE c.id IN (SELECT content_id FROM new_rows UNION SELECT content_id FROM old_rows)
         ORDER BY c.id FOR NO KEY UPDATE;
       UPDATE content c SET rating_count = greatest(c.rating_count + d.n, 0), rating_sum = c.rating_sum + d.s
         FROM (
           SELECT content_id, sum(n)::int AS n, sum(s) AS s FROM (
             SELECT content_id, 1 AS n, score AS s FROM new_rows
             UNION ALL SELECT content_id, -1, -score FROM old_rows) x
           GROUP BY content_id HAVING sum(n) <> 0 OR sum(s) <> 0
         ) d
         WHERE c.id = d.content_id;
     END IF;
     RETURN NULL;
   END';
DROP TRIGGER IF EXISTS ratings_totals_insert ON ratings;
CREATE TRIGGER ratings_totals_insert AFTER INSERT ON ratings
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION ratings_apply_delta();
DROP TRIGGER IF EXISTS ratings_totals_update ON ratings;
CREATE TRIGGER ratings_totals_update AFTER UPDATE ON ratings
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION ratings_apply_delta();
DROP TRIGGER IF EXISTS ratings_totals_delete ON ratings;
CREATE TRIGGER ratings_totals_delete AFTER DELETE ON ratings
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION ratings_apply_delta();

-- Backfill (and repair drift): only titles whose stored totals are wrong are written.
UPDATE content c SET rating_count = x.n, rating_sum = x.s
FROM (
  SELECT c2.id, count(r.score)::int AS n, coalesce(sum(r.score), 0) AS s
  FROM content c2 LEFT JOIN ratings r ON r.content_id = c2.id
  WHERE c2.kind IN ('movie', 'series', 'special')
  GROUP BY c2.id
) x
WHERE x.id = c.id AND (c.rating_count <> x.n OR c.rating_sum <> x.s);

-- Substring search (Content.searchIds): trigram indexes serve ILIKE '%text%'.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS content_name_trgm_idx ON content USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS content_native_name_trgm_idx ON content USING GIN (native_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS content_about_trgm_idx ON content USING GIN (about gin_trgm_ops)
  WHERE kind IN ('movie', 'series', 'special');
CREATE INDEX IF NOT EXISTS content_akas_name_trgm_idx ON content_akas USING GIN (name gin_trgm_ops);

-- Scheduled-job leases (utils/jobLock.js): with several server instances, each job runs
-- on whichever instance claims its row first.
CREATE TABLE IF NOT EXISTS job_leases (
  name             TEXT PRIMARY KEY,
  locked_until     TIMESTAMPTZ NOT NULL,
  last_started_at  TIMESTAMPTZ NOT NULL
);

-- Shared rate-limit counters (middleware/pgRateLimitStore.js), used when
-- RATE_LIMIT_STORE=postgres so limits hold across instances. UNLOGGED: losing the
-- counters in a crash only resets the windows.
CREATE UNLOGGED TABLE IF NOT EXISTS rate_limit_hits (
  key       TEXT PRIMARY KEY,
  hits      INTEGER NOT NULL,
  reset_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_reset_idx ON rate_limit_hits (reset_at);

-- Watchlist import progress (services/watchlistImportService.js), so the progress poll
-- works whichever instance it reaches. The import itself runs where it started.
CREATE TABLE IF NOT EXISTS watchlist_import_jobs (
  user_id     UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  job         JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI chat/search calls per account (or IP) per day (controllers/contentController.js).
CREATE TABLE IF NOT EXISTS ai_usage (
  subject  TEXT NOT NULL,
  day      DATE NOT NULL DEFAULT current_date,
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day)
);
