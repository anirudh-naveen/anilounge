-- AniLounge catalog, accounts, and graph tables.
-- Replaces Mongo Content / Entity / User / RefreshToken / IPBan documents.
-- mongo_id columns are the ObjectId hex from Atlas; drop them after cutover.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations (TEXT + CHECK so we can add values without ALTER TYPE)
-- ---------------------------------------------------------------------------

-- content.content_type: movie | tv | special
-- entities.entity_type: character | voice_actor | studio
-- content_relations.kind: typed MAL-style edges only (never genre-similarity)

-- ---------------------------------------------------------------------------
-- Franchises
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS franchises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Titles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                TEXT UNIQUE,
  internal_id             TEXT NOT NULL UNIQUE,
  title                   TEXT NOT NULL,
  english_title           TEXT,
  native_title            TEXT,
  original_title          TEXT,
  overview                TEXT,
  tagline                 TEXT,
  content_type            TEXT NOT NULL CHECK (content_type IN ('movie', 'tv', 'special')),
  poster_path             TEXT,
  backdrop_path           TEXT,
  release_date            DATE,
  last_air_date           DATE,
  runtime                 INTEGER,
  episode_count           INTEGER,
  season_count            INTEGER,
  tmdb_id                 INTEGER,
  mal_id                  INTEGER,
  vote_average            DOUBLE PRECISION,
  vote_count              INTEGER,
  popularity              DOUBLE PRECISION,
  unified_score           DOUBLE PRECISION,
  user_rating_average     DOUBLE PRECISION,
  user_rating_count       INTEGER NOT NULL DEFAULT 0,
  user_rating_sum         DOUBLE PRECISION NOT NULL DEFAULT 0,
  mal_score               DOUBLE PRECISION,
  mal_scored_by           INTEGER,
  mal_rank                INTEGER,
  mal_status              TEXT CHECK (mal_status IN (
                            'finished_airing', 'currently_airing', 'not_yet_aired'
                          )),
  mal_episodes            INTEGER,
  mal_media_type          TEXT CHECK (mal_media_type IN (
                            'unknown', 'tv', 'ova', 'movie', 'special', 'ona', 'music'
                          )),
  mal_source              TEXT CHECK (mal_source IN (
                            'manga', 'light_novel', 'novel', 'web_novel', 'original',
                            'game', '4_koma_manga', 'web_manga', 'music',
                            'picture_book', 'visual_novel', 'other'
                          )),
  mal_rating              TEXT CHECK (mal_rating IN ('g', 'pg', 'pg_13', 'r', 'r+', 'rx')),
  broadcast_day           TEXT,
  broadcast_time          TEXT,
  next_episode_air_date   TIMESTAMPTZ,
  next_episode_number     INTEGER,
  next_episode_season     INTEGER,
  airing_updated_at       TIMESTAMPTZ,
  start_season_year       INTEGER,
  start_season            TEXT CHECK (start_season IN ('winter', 'spring', 'summer', 'fall')),
  tmdb_has_data           BOOLEAN NOT NULL DEFAULT false,
  tmdb_last_updated       TIMESTAMPTZ,
  mal_has_data            BOOLEAN NOT NULL DEFAULT false,
  mal_last_updated        TIMESTAMPTZ,
  character_sync_at       TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector           tsvector GENERATED ALWAYS AS (
                            setweight(to_tsvector('simple', coalesce(title, '')), 'A')
                            || setweight(to_tsvector('simple', coalesce(english_title, '')), 'A')
                            || setweight(to_tsvector('simple', coalesce(native_title, '')), 'B')
                            || setweight(to_tsvector('simple', coalesce(original_title, '')), 'B')
                            || setweight(to_tsvector('simple', coalesce(overview, '')), 'C')
                          ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS content_tmdb_id_unique
  ON content (tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS content_mal_id_unique
  ON content (mal_id)
  WHERE mal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_type_popularity_idx
  ON content (content_type, popularity DESC);

CREATE INDEX IF NOT EXISTS content_type_unified_idx
  ON content (content_type, unified_score DESC);

CREATE INDEX IF NOT EXISTS content_type_mal_score_idx
  ON content (content_type, mal_score DESC);

CREATE INDEX IF NOT EXISTS content_airing_idx
  ON content (content_type, next_episode_air_date)
  WHERE mal_status = 'currently_airing';

CREATE INDEX IF NOT EXISTS content_release_date_idx
  ON content (content_type, release_date);

CREATE INDEX IF NOT EXISTS content_search_idx
  ON content USING GIN (search_vector);

-- ---------------------------------------------------------------------------
-- Title arrays that were nested on the Mongo document
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_genres (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  tmdb_id     INTEGER,
  name        TEXT NOT NULL,
  PRIMARY KEY (content_id, name)
);

CREATE INDEX IF NOT EXISTS content_genres_name_idx ON content_genres (name);

CREATE TABLE IF NOT EXISTS content_alternative_titles (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  PRIMARY KEY (content_id, title)
);

CREATE TABLE IF NOT EXISTS content_origin_countries (
  content_id    UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  country_code  CHAR(2) NOT NULL,
  PRIMARY KEY (content_id, country_code)
);

-- String studios/companies as stored today. Studio entities (below) are the
-- clickable records; this table preserves the ingest list during migration.
CREATE TABLE IF NOT EXISTS content_studio_names (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  PRIMARY KEY (content_id, name)
);

CREATE TABLE IF NOT EXISTS content_production_companies (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  PRIMARY KEY (content_id, name)
);

-- ---------------------------------------------------------------------------
-- Franchise membership and typed title-to-title edges
-- kind is MAL-style only. Do not insert genre-similarity as a relation.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS franchise_members (
  franchise_id  UUID NOT NULL REFERENCES franchises (id) ON DELETE CASCADE,
  content_id    UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  PRIMARY KEY (franchise_id, content_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS franchise_members_content_unique
  ON franchise_members (content_id);

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

-- ---------------------------------------------------------------------------
-- People and studios
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entities (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                TEXT UNIQUE,
  entity_type             TEXT NOT NULL CHECK (entity_type IN ('character', 'voice_actor', 'studio')),
  name                    TEXT NOT NULL,
  english_name            TEXT,
  native_name             TEXT,
  about                   TEXT,
  image_path              TEXT,
  mal_id                  INTEGER,
  tmdb_id                 INTEGER,
  favorites_count         INTEGER NOT NULL DEFAULT 0,
  last_synced_at          TIMESTAMPTZ,
  voice_credits_synced_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_vector           tsvector GENERATED ALWAYS AS (
                            setweight(to_tsvector('simple', coalesce(name, '')), 'A')
                            || setweight(to_tsvector('simple', coalesce(english_name, '')), 'A')
                            || setweight(to_tsvector('simple', coalesce(native_name, '')), 'B')
                            || setweight(to_tsvector('simple', coalesce(about, '')), 'C')
                          ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS entities_type_mal_id_unique
  ON entities (entity_type, mal_id)
  WHERE mal_id IS NOT NULL AND mal_id > 0;

CREATE INDEX IF NOT EXISTS entities_type_name_idx ON entities (entity_type, name);
CREATE INDEX IF NOT EXISTS entities_search_idx ON entities USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS entity_alternative_names (
  entity_id  UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  PRIMARY KEY (entity_id, name)
);

CREATE TABLE IF NOT EXISTS appearances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id      UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  character_id    UUID REFERENCES entities (id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'Supporting',
  importance      INTEGER NOT NULL DEFAULT 0,
  character_name  TEXT,
  language        TEXT,
  UNIQUE (content_id, character_id)
);

CREATE INDEX IF NOT EXISTS appearances_content_idx ON appearances (content_id);
CREATE INDEX IF NOT EXISTS appearances_character_idx ON appearances (character_id);

CREATE TABLE IF NOT EXISTS voice_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appearance_id   UUID NOT NULL REFERENCES appearances (id) ON DELETE CASCADE,
  voice_actor_id  UUID REFERENCES entities (id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  language        TEXT,
  mal_id          INTEGER,
  tmdb_id         INTEGER,
  image_path      TEXT
);

CREATE INDEX IF NOT EXISTS voice_credits_actor_idx ON voice_credits (voice_actor_id);
CREATE INDEX IF NOT EXISTS voice_credits_appearance_idx ON voice_credits (appearance_id);

-- Studio (entity) credited on a title. Distinct from content_studio_names.
CREATE TABLE IF NOT EXISTS content_studios (
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  studio_id   UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, studio_id)
);

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                TEXT UNIQUE,
  username                TEXT NOT NULL UNIQUE,
  email                   TEXT NOT NULL UNIQUE,
  password_hash           TEXT NOT NULL,
  profile_picture         TEXT,
  is_demo_account         BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
  lock_until              TIMESTAMPTZ,
  last_login              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(username) BETWEEN 3 AND 20)
);

CREATE TABLE IF NOT EXISTS watchlist_entries (
  user_id           UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id        UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'plan_to_watch' CHECK (status IN (
                      'plan_to_watch', 'watching', 'completed', 'dropped'
                    )),
  rating            INTEGER CHECK (rating BETWEEN 1 AND 10),
  current_episode   INTEGER NOT NULL DEFAULT 0,
  total_episodes    INTEGER,
  current_season    INTEGER NOT NULL DEFAULT 1,
  total_seasons     INTEGER,
  notes             TEXT CHECK (char_length(notes) <= 500),
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS watchlist_content_idx ON watchlist_entries (content_id);

CREATE TABLE IF NOT EXISTS user_ratings (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES content (id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  review      TEXT CHECK (char_length(review) <= 1000),
  watched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);

CREATE TABLE IF NOT EXISTS user_favorite_entities (
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entity_id  UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_id)
);

CREATE TABLE IF NOT EXISTS user_favorite_genres (
  user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);

CREATE TABLE IF NOT EXISTS user_favorite_studios (
  user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  is_revoked  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
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
