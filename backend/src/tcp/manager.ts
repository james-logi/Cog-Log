import crypto from "node:crypto";
import { getDb } from "../db/connection.js";
import { issueDailySequence } from "../db/dailySequence.js";
import { currentDateInTimezone } from "../lib/timezoneDate.js";
import { config } from "../config/index.js";
import { realtimeHub } from "../realtime/hub.js";
import { exportQueue, type LogRecordRow } from "../export/queue.js";
import { cloudSync } from "../cloud/sync.js";
import { TcpServerAdapter } from "./serverAdapter.js";
import { TcpClientAdapter } from "./clientAdapter.js";
import { resolveDelimiterBytes } from "./framer.js";
import type { ConnectionInfo, ConnectionProfile, TcpAdapter } from "./types.js";

// 스펙 4.2 권장 처리 흐름의 "TCP 수신/송신 → 메시지 검증 → DB/번호 저장 → 웹 이벤트"
// 구간을 담당한다. 파일 Export 큐 연동은 5단계에서 추가된다.
class TcpManager {
  private adapter: TcpAdapter | null = null;
  private profile: ConnectionProfile | null = null;
  private sessionId: string | null = null;

  getInfo(): ConnectionInfo {
    return this.adapter?.getInfo() ?? { status: "STOPPED", mode: this.profile?.mode ?? "SERVER" };
  }

  async start(profile: ConnectionProfile): Promise<void> {
    if (this.adapter) await this.stop();
    this.profile = profile;
    const adapter: TcpAdapter = profile.mode === "SERVER" ? new TcpServerAdapter() : new TcpClientAdapter();
    adapter.onStatusChange((info) => this.handleStatusChange(info));
    adapter.onMessage((message) => this.handleMessage(message));
    this.adapter = adapter;
    await adapter.start(profile);
  }

  async stop(): Promise<void> {
    await this.adapter?.stop();
    this.adapter = null;
  }

  async send(text: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.adapter || !this.profile) return { ok: false, error: "not_started" };
    const payload = Buffer.from(text, this.profile.encoding as BufferEncoding);
    const framed = Buffer.concat([payload, resolveDelimiterBytes(this.profile)]);
    try {
      await this.adapter.send(framed);
      this.recordLog("TX", payload, "COMPLETED");
      return { ok: true };
    } catch (err) {
      const message = (err as Error).message;
      this.recordLog("TX", payload, "FAILED", message);
      return { ok: false, error: message };
    }
  }

  private handleStatusChange(info: ConnectionInfo) {
    const profile = this.profile;
    if (!profile) return;
    const db = getDb();

    if (info.status === "CONNECTED" && !this.sessionId) {
      this.sessionId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO connection_sessions (id, connection_profile_id, peer_address, peer_port)
         VALUES (?, ?, ?, ?)`
      ).run(this.sessionId, profile.id, info.peerAddress ?? null, info.peerPort ?? null);
    } else if (info.status !== "CONNECTED" && this.sessionId) {
      db.prepare(
        `UPDATE connection_sessions SET ended_at = datetime('now'), end_reason = ? WHERE id = ?`
      ).run(info.lastError ?? "disconnected", this.sessionId);
      this.sessionId = null;
    }

    realtimeHub.broadcast({ type: "connection.status", payload: info });
  }

  private handleMessage(message: Buffer) {
    this.recordLog("RX", message, "COMPLETED");
  }

  private recordLog(direction: "RX" | "TX", data: Buffer, status: "COMPLETED" | "FAILED", error?: string) {
    if (!this.profile) return;
    const db = getDb();
    const dailyDate = currentDateInTimezone(config.timezone);
    const { dailySequence, displayNumber } = issueDailySequence(db, dailyDate);
    const id = crypto.randomUUID();
    const info = this.adapter?.getInfo();
    const displayText = data.toString(this.profile.encoding as BufferEncoding);

    db.prepare(
      `INSERT INTO log_records (
         id, daily_date, daily_sequence, display_number, occurred_at, direction, raw_data, display_text,
         communication_status, communication_error, connection_profile_id, connection_session_id,
         peer_address, peer_port
       ) VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      dailyDate,
      dailySequence,
      displayNumber,
      direction,
      data,
      displayText,
      status,
      error ?? null,
      this.profile.id,
      this.sessionId,
      info?.peerAddress ?? null,
      info?.peerPort ?? null
    );

    const record = db.prepare("SELECT * FROM log_records WHERE id = ?").get(id) as LogRecordRow;
    realtimeHub.broadcast({ type: "log.created", payload: record });
    exportQueue.enqueueForRecord(record);
    cloudSync.enqueueForRecord(record);
  }
}

export const tcpManager = new TcpManager();
