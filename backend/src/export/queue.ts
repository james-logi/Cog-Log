import crypto from "node:crypto";
import path from "node:path";
import { getDb } from "../db/connection.js";
import { getOrCreateStorageSettings, type StorageSettings } from "../db/storageSettings.js";
import { realtimeHub } from "../realtime/hub.js";
import { parseDbTimestamp } from "../lib/time.js";
import { buildFilename } from "./filename.js";
import { appendTxtRow } from "./txtWriter.js";
import { appendXlsxRow } from "./xlsxWriter.js";

type FileFormat = "TXT" | "XLSX";

export interface LogRecordRow {
  id: string;
  daily_date: string;
  display_number: string;
  display_text: string;
  occurred_at: string;
  direction: string;
  communication_status: string;
  schedule_id: string | null;
}

interface FileJobRow {
  id: string;
  log_record_id: string;
  format: FileFormat;
  attempt_count: number;
}

// 스펙 14 기본값: 1, 5, 15, 30, 60초 후 반복
const RETRY_DELAYS_MS = [1000, 5000, 15000, 30000, 60000];

// 스펙 4.2/6.6: DB 저장을 먼저 끝내고 TXT/XLSX 쓰기는 별도 큐에서 실패해도
// TCP 수신을 막지 않는다(LOG-09). 여기서는 새 로그마다 즉시 시도하고,
// 실패한 건은 setInterval로 주기적으로 재시도한다.
class ExportQueue {
  private retryTimer: NodeJS.Timeout | null = null;

  start() {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => this.processDueRetries(), 5000);
  }

  enqueueForRecord(record: LogRecordRow) {
    const settings = getOrCreateStorageSettings();
    if (settings.txtEnabled) void this.attempt(record, "TXT", settings);
    if (settings.xlsxEnabled) void this.attempt(record, "XLSX", settings);
  }

  retryNow(fileJobId: string): boolean {
    const db = getDb();
    const job = db.prepare("SELECT * FROM file_write_results WHERE id = ?").get(fileJobId) as FileJobRow | undefined;
    if (!job) return false;
    const record = db.prepare("SELECT * FROM log_records WHERE id = ?").get(job.log_record_id) as
      | LogRecordRow
      | undefined;
    if (!record) return false;
    void this.attempt(record, job.format);
    return true;
  }

  private processDueRetries() {
    const db = getDb();
    const failed = db.prepare("SELECT * FROM file_write_results WHERE save_status = 'FAILED'").all() as Array<
      FileJobRow & { next_retry_at: string | null }
    >;
    const now = Date.now();
    for (const job of failed) {
      if (job.next_retry_at && parseDbTimestamp(job.next_retry_at) > now) continue;
      const record = db.prepare("SELECT * FROM log_records WHERE id = ?").get(job.log_record_id) as
        | LogRecordRow
        | undefined;
      if (record) void this.attempt(record, job.format);
    }
  }

  private async attempt(record: LogRecordRow, format: FileFormat, settingsIn?: StorageSettings) {
    const db = getDb();
    const settings = settingsIn ?? getOrCreateStorageSettings();
    const ext = format === "TXT" ? "txt" : "xlsx";
    const filename = buildFilename(settings.filenamePattern, record.daily_date, ext);
    const targetPath = path.join(settings.allowedRootPath, filename);

    const existing = db
      .prepare("SELECT id, attempt_count FROM file_write_results WHERE log_record_id = ? AND format = ?")
      .get(record.id, format) as { id: string; attempt_count: number } | undefined;

    const jobId = existing?.id ?? crypto.randomUUID();
    const attemptCount = (existing?.attempt_count ?? 0) + 1;

    if (!existing) {
      db.prepare(
        `INSERT INTO file_write_results (id, log_record_id, format, save_status, target_path, attempt_count)
         VALUES (?, ?, ?, 'WRITING', ?, ?)`
      ).run(jobId, record.id, format, targetPath, attemptCount);
    } else {
      db.prepare(
        `UPDATE file_write_results SET save_status = 'WRITING', target_path = ?, attempt_count = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(targetPath, attemptCount, jobId);
    }
    this.broadcast(record.id, format, "WRITING", jobId);

    try {
      if (format === "TXT") {
        appendTxtRow(targetPath, {
          displayNumber: record.display_number,
          displayText: record.display_text,
          scheduleId: record.schedule_id,
          occurredAt: record.occurred_at,
          direction: record.direction,
          communicationStatus: record.communication_status,
        });
      } else {
        await appendXlsxRow(targetPath, {
          displayNumber: record.display_number,
          displayText: record.display_text,
          scheduleId: record.schedule_id,
          scheduleTitle: null,
          occurredAt: record.occurred_at,
          direction: record.direction,
          communicationStatus: record.communication_status,
        });
      }
      db.prepare(
        `UPDATE file_write_results
         SET save_status = 'SAVED', saved_at = datetime('now'), error_code = NULL, error_message = NULL,
             next_retry_at = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(jobId);
      this.broadcast(record.id, format, "SAVED", jobId, targetPath);
    } catch (err) {
      const message = (err as Error).message;
      const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
      const nextRetryAt = new Date(Date.now() + delay).toISOString();
      db.prepare(
        `UPDATE file_write_results
         SET save_status = 'FAILED', error_message = ?, next_retry_at = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(message, nextRetryAt, jobId);
      this.broadcast(record.id, format, "FAILED", jobId, undefined, message);
    }
  }

  private broadcast(
    logRecordId: string,
    format: FileFormat,
    status: "WRITING" | "SAVED" | "FAILED",
    fileJobId: string,
    targetPath?: string,
    error?: string
  ) {
    realtimeHub.broadcast({
      type: "log.file.updated",
      payload: { logRecordId, format, status, fileJobId, targetPath, error },
    });
  }
}

export const exportQueue = new ExportQueue();
