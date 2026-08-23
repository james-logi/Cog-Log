-- 멀티 PC(여러 현장) 지원: 통신 설정에 사이트 식별자와 클라우드 동기화
-- 켜기/끄기를 추가한다. site_id는 클라우드 ingest 페이로드에 그대로 실려
-- 나가 원격 대시보드에서 현장별로 구분해 볼 수 있게 한다.
ALTER TABLE connection_profiles ADD COLUMN site_id TEXT;
ALTER TABLE connection_profiles ADD COLUMN cloud_sync_enabled INTEGER NOT NULL DEFAULT 0;
