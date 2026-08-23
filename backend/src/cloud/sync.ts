import crypto from "node:crypto";
import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";
import { parseDbTimestamp } from "../lib/time.js";
import { getOrCreateConnectionProfile } from "../db/connectionProfile.js";
import type { LogRecordRow } from "../export/queue.js";

const RETRY_DELAYS_MS = [1000, 5000, 15000, 30000, 60000];

interface SyncJobRow {
  id: string;
  log_record_id: string;
  attempt_count: number;
  next_retry_at: string | null;
}

// 로컬 백엔드가 TCP 통신/로컬 DB 저장을 전담하고(원본), 이 큐는 그 결과를
// 클라우드 D1 대시보드로 "복제"만 한다 — 비전 카메라와의 통신 자체는 절대
// 클라우드로 옮기지 않는다(Cloudflare Workers는 공장 내부망 TCP에 붙을 수
// 없음). 클라우드 전송 실패가 TCP 수신/로컬 저장에 영향을 주지 않도록
// 완전히 비동기·재시도 큐로 분리한다(export/queue.ts와 동일한 패턴).
//
// 중복 방지: log_records.id(UUID)를 그대로 클라우드 쪽 기본키로 써서
// upsert하므로, 재시도나 여러 로컬 백엔드에서 동시에 같은 레코드를 보내도
// 클라우드 DB에는 항상 한 행만 남는다(cloud-dashboard/functions/api/ingest.ts).
class CloudSyncQueue {
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (!config.cloudSyncUrl) return; // 설정하지 않으면 완전히 비활성
    if (this.timer) return;
    this.timer = setInterval(() => this.processDueRetries(), 5000);
  }

  enqueueForRecord(record: LogRecordRow) {
    if (!config.cloudSyncUrl) return;
    if (!getOrCreateConnectionProfile().cloudSyncEnabled) return; // 통신 설정의 "클라우드 동기화" 토글
    void this.attempt(record);
  }

  private processDueRetries() {
    if (!config.cloudSyncUrl || !getOrCreateConnectionProfile().cloudSyncEnabled) return;
    const db = getDb();
    const failed = db.prepare("SELECT * FROM cloud_sync_results WHERE sync_status = 'FAILED'").all() as SyncJobRow[];
    const now = Date.now();
    for (const job of failed) {
      if (job.next_retry_at && parseDbTimestamp(job.next_retry_at) > now) continue;
      const record = db.prepare("SELECT * FROM log_records WHERE id = ?").get(job.log_record_id) as
        | LogRecordRow
        | undefined;
      if (record) void this.attempt(record);
    }
  }

  private async attempt(record: LogRecordRow) {
    const db = getDb();
    const existing = db
      .prepare("SELECT id, attempt_count FROM cloud_sync_results WHERE log_record_id = ?")
      .get(record.id) as { id: string; attempt_count: number } | undefined;
    const jobId = existing?.id ?? crypto.randomUUID();
    const attemptCount = (existing?.attempt_count ?? 0) + 1;

    if (!existing) {
      db.prepare(
        `INSERT INTO cloud_sync_results (id, log_record_id, sync_status, attempt_count) VALUES (?, ?, 'SYNCING', ?)`
      ).run(jobId, record.id, attemptCount);
    } else {
      db.prepare(
        `UPDATE cloud_sync_results SET sync_status = 'SYNCING', attempt_count = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(attemptCount, jobId);
    }

    try {
      const siteId = getOrCreateConnectionProfile().siteId ?? null;
      const res = await fetch(`${config.cloudSyncUrl.replace(/\/$/, "")}/api/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sync-key": config.cloudSyncApiKey },
        body: JSON.stringify({
          id: record.id,
          site_id: siteId,
          daily_date: record.daily_date,
          display_number: record.display_number,
          occurred_at: record.occurred_at,
          direction: record.direction,
          display_text: record.display_text,
          communication_status: record.communication_status,
        }),
      });
      if (!res.ok) throw new Error(`http_${res.status}`);

      db.prepare(
        `UPDATE cloud_sync_results
         SET sync_status = 'SYNCED', synced_at = datetime('now'), error_message = NULL, next_retry_at = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(jobId);
    } catch (err) {
      const message = (err as Error).message;
      const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
      const nextRetryAt = new Date(Date.now() + delay).toISOString();
      db.prepare(
        `UPDATE cloud_sync_results SET sync_status = 'FAILED', error_message = ?, next_retry_at = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(message, nextRetryAt, jobId);
    }
  }
}

export const cloudSync = new CloudSyncQueue();
