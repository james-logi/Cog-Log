-- 이미 배포된 D1 데이터베이스에 site_id 컬럼을 추가한다.
-- schema.sql의 CREATE TABLE IF NOT EXISTS는 기존 테이블에 컬럼을 더해주지
-- 않으므로, 이미 만들어둔 D1(cog-comm-log)에는 이 파일을 D1 Console에서
-- 별도로 실행해야 한다.
ALTER TABLE log_records ADD COLUMN site_id TEXT;
CREATE INDEX IF NOT EXISTS idx_log_records_site_id ON log_records (site_id);
