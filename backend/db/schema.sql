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

-- Opt-out for announcement emails (services/announcementService.js). Security and
-- account emails ignore it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS announcement_emails BOOLEAN NOT NULL DEFAULT true;
-- Opt-out for friend request emails (services/emailPreferenceService.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_request_emails BOOLEAN NOT NULL DEFAULT true;

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

CREATE TABLE IF NOT EXISTS ratings (
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  review     TEXT CHECK (char_length(review) <= 1000),
  rated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

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
