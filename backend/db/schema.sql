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
  (SELECT avg(r.score) FROM ratings r WHERE r.content_id = c.id) AS user_rating_average,
  (SELECT count(*) FROM ratings r WHERE r.content_id = c.id) AS user_rating_count,
  (SELECT coalesce(sum(r.score), 0) FROM ratings r WHERE r.content_id = c.id) AS user_rating_sum
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
