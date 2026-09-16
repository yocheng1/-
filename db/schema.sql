-- KPlus 活動報名系統 schema
-- 所有時間欄位一律存 ISO-8601 UTC 字串 (e.g. 2026-09-15T08:00:00.000Z)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- 使用者
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  name              TEXT,
  email             TEXT,
  email_verified_at TEXT,
  phone             TEXT,
  phone_verified_at TEXT,
  password_hash     TEXT,
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- email / phone 可為 NULL，但有值時必須唯一。
-- SQLite 的 UNIQUE 索引允許多個 NULL，正好符合需求。
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone) WHERE phone IS NOT NULL;

-- 第三方登入身分 (LINE / 未來的 Google 等)
CREATE TABLE IF NOT EXISTS identities (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('line', 'google')),
  provider_user_id TEXT NOT NULL,
  display_name     TEXT,
  picture_url      TEXT,
  created_at       TEXT NOT NULL,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON identities (user_id);

-- ---------------------------------------------------------------- 登入 / session
-- 只存 token 的 SHA-256，資料庫外洩時無法直接冒用 session
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- 手機 OTP 驗證碼；同樣只存 hash
CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'login',
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_lookup ON otp_codes (destination, purpose, consumed_at);

-- OAuth (LINE) 的 state / nonce，用來擋 CSRF
CREATE TABLE IF NOT EXISTS oauth_states (
  state       TEXT PRIMARY KEY,
  nonce       TEXT NOT NULL,
  redirect_to TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- 通用的次數限制（寄送驗證碼、登入嘗試…）
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

-- ---------------------------------------------------------------- 活動
CREATE TABLE IF NOT EXISTS events (
  id                      TEXT PRIMARY KEY,
  slug                    TEXT NOT NULL UNIQUE,
  title                   TEXT NOT NULL,
  summary                 TEXT NOT NULL DEFAULT '',
  description             TEXT NOT NULL DEFAULT '',
  cover_image_url         TEXT,
  location                TEXT NOT NULL DEFAULT '',
  starts_at               TEXT NOT NULL,
  ends_at                 TEXT NOT NULL,
  registration_opens_at   TEXT,
  registration_closes_at  TEXT,
  -- capacity = 0 代表不限名額
  capacity                INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  waitlist_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_enabled IN (0, 1)),
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'published', 'closed')),
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_status_start ON events (status, starts_at);

-- ---------------------------------------------------------------- 報名
CREATE TABLE IF NOT EXISTS registrations (
  id                       TEXT PRIMARY KEY,
  event_id                 TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id                  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status                   TEXT NOT NULL
                             CHECK (status IN ('confirmed', 'waitlist', 'cancelled')),
  name                     TEXT NOT NULL,
  phone                    TEXT NOT NULL,
  email                    TEXT,
  helmet_size              TEXT,
  emergency_contact_name   TEXT,
  emergency_contact_phone  TEXT,
  notes                    TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  cancelled_at             TEXT
);

-- 一個人在同一場活動只能有一筆「有效」報名，
-- 但取消後可以重新報名 —— 所以用 partial unique index 排除 cancelled。
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_active_unique
  ON registrations (event_id, user_id)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations (event_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations (user_id, created_at);

-- ---------------------------------------------------------------- 現場抽獎
-- 抽獎的參加者來自該活動「報名成功」的名單。

CREATE TABLE IF NOT EXISTS prizes (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url   TEXT,
  -- 這個獎項要抽出幾位
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- 加碼獎項：活動進行中臨時新增，事前不公布
  is_bonus    INTEGER NOT NULL DEFAULT 0 CHECK (is_bonus IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  -- 抽獎種子：公開後任何人都能重算驗證中獎名單
  draw_seed   TEXT,
  drawn_at    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prizes_event ON prizes (event_id, sort_order);

CREATE TABLE IF NOT EXISTS winners (
  id              TEXT PRIMARY KEY,
  prize_id        TEXT NOT NULL REFERENCES prizes (id) ON DELETE CASCADE,
  event_id        TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
  -- 中獎當下的姓名與電話另存一份，之後報名資料被改也不影響已公布的結果
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  rank            INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);

-- 同一個獎項不會重複抽到同一個人
CREATE UNIQUE INDEX IF NOT EXISTS idx_winners_prize_registration
  ON winners (prize_id, registration_id);

-- 中過獎的人不再參加後續抽獎 —— 一場活動每個人最多中一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_winners_event_registration
  ON winners (event_id, registration_id);

CREATE INDEX IF NOT EXISTS idx_winners_event ON winners (event_id, created_at);
