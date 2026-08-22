-- Initial schema from spec section 9 (데이터 모델).
-- Draft only: field types are SQLite-appropriate approximations; refine once
-- section 17 "개발 전 확정 사항" items are resolved.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER')),
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS connection_profiles (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('SERVER', 'CLIENT')),
  bind_address TEXT,
  target_host TEXT,
  port INTEGER NOT NULL,
  encoding TEXT NOT NULL DEFAULT 'UTF-8',
  delimiter TEXT NOT NULL DEFAULT 'CRLF',
  max_message_bytes INTEGER NOT NULL DEFAULT 1048576,
  connect_timeout_ms INTEGER NOT NULL DEFAULT 10000,
  read_idle_timeout_ms INTEGER NOT NULL DEFAULT 30000,
  reconnect_enabled INTEGER NOT NULL DEFAULT 1,
  reconnect_initial_ms INTEGER NOT NULL DEFAULT 5000,
  reconnect_max_ms INTEGER NOT NULL DEFAULT 60000,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connection_sessions (
  id TEXT PRIMARY KEY,
  connection_profile_id TEXT NOT NULL REFERENCES connection_profiles(id),
  peer_address TEXT,
  peer_port INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  end_reason TEXT,
  last_tx_at TEXT,
  last_rx_at TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'COMPLETED')) DEFAULT 'OPEN',
  assignee_user_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  completed_at TEXT,
  completed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_sequences (
  daily_date TEXT PRIMARY KEY,
  last_sequence INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS log_records (
  id TEXT PRIMARY KEY,
  daily_date TEXT NOT NULL,
  daily_sequence INTEGER NOT NULL,
  display_number TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('TX', 'RX')),
  raw_data BLOB NOT NULL,
  display_text TEXT NOT NULL,
  communication_status TEXT NOT NULL CHECK (
    communication_status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')
  ),
  communication_error TEXT,
  connection_profile_id TEXT NOT NULL REFERENCES connection_profiles(id),
  connection_session_id TEXT REFERENCES connection_sessions(id),
  peer_address TEXT,
  peer_port INTEGER,
  schedule_id TEXT REFERENCES schedules(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (daily_date, daily_sequence)
);

CREATE INDEX IF NOT EXISTS idx_log_records_occurred_at ON log_records (occurred_at);
CREATE INDEX IF NOT EXISTS idx_log_records_direction_occurred_at ON log_records (direction, occurred_at);
CREATE INDEX IF NOT EXISTS idx_log_records_comm_status_occurred_at ON log_records (communication_status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_log_records_schedule_id ON log_records (schedule_id);

CREATE TABLE IF NOT EXISTS file_write_results (
  id TEXT PRIMARY KEY,
  log_record_id TEXT NOT NULL REFERENCES log_records(id),
  format TEXT NOT NULL CHECK (format IN ('TXT', 'XLSX')),
  save_status TEXT NOT NULL CHECK (
    save_status IN ('DISABLED', 'PENDING', 'WRITING', 'SAVED', 'FAILED')
  ),
  target_path TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  saved_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (log_record_id, format)
);

CREATE TABLE IF NOT EXISTS storage_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  allowed_root_path TEXT NOT NULL,
  txt_enabled INTEGER NOT NULL DEFAULT 1,
  xlsx_enabled INTEGER NOT NULL DEFAULT 0,
  filename_pattern TEXT NOT NULL DEFAULT 'VisionLog_YYYY-MM-DD',
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  retention_policy TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  change_summary TEXT,
  ip_address TEXT,
  success INTEGER NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
