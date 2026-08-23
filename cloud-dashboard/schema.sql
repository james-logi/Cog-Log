-- Cloudflare D1 스키마: 로컬 백엔드가 복제해 보내는 로그의 읽기 전용 사본.
-- id는 로컬 log_records.id(UUID)를 그대로 사용 — 재시도/동시 전송이 겹쳐도
-- ingest.ts의 ON CONFLICT(id) DO UPDATE로 항상 한 행만 남는다.
CREATE TABLE IF NOT EXISTS log_records (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  daily_date TEXT NOT NULL,
  display_number TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  direction TEXT NOT NULL,
  display_text TEXT NOT NULL,
  communication_status TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_log_records_occurred_at ON log_records (occurred_at);
CREATE INDEX IF NOT EXISTS idx_log_records_site_id ON log_records (site_id);
