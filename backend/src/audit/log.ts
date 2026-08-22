import crypto from "node:crypto";
import type { Request } from "express";
import { getDb } from "../db/connection.js";

// 스펙 9.5 audit_logs: 사용자, 작업, 대상, 변경 요약, IP, 성공 여부, 일시.
export function recordAudit(
  req: Request,
  params: {
    userId: string | null;
    action: string;
    target?: string;
    changeSummary?: string;
    success: boolean;
  }
) {
  getDb()
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, target, change_summary, ip_address, success)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      params.userId,
      params.action,
      params.target ?? null,
      params.changeSummary ?? null,
      req.ip ?? null,
      params.success ? 1 : 0
    );
}
