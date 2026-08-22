-- Session store for AUTH-04 (HttpOnly/Secure/SameSite cookie sessions).
-- Idle timeout (spec 14장 기본값: 30분) is enforced in application code by
-- comparing last_seen_at to now(); this table has no fixed expires_at.

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
