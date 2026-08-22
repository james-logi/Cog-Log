-- 클라우드 대시보드(D1) 복제용 재시도 큐. 원본은 항상 로컬 log_records이며,
-- 이 테이블은 "이 로그를 클라우드로 몇 번 시도했고 지금 상태가 무엇인지"만 추적한다.
CREATE TABLE IF NOT EXISTS cloud_sync_results (
  id TEXT PRIMARY KEY,
  log_record_id TEXT NOT NULL UNIQUE REFERENCES log_records(id),
  sync_status TEXT NOT NULL CHECK (sync_status IN ('PENDING', 'SYNCING', 'SYNCED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  error_message TEXT,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
