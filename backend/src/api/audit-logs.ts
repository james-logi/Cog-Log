import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth, requireRole("ADMIN"));

const MAX_PAGE_SIZE = 200;

auditLogsRouter.get("/", (req, res) => {
  const db = getDb();
  const { action, user_id, from, to, page = "1", page_size = "50" } = req.query;

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (typeof action === "string" && action) {
    clauses.push("action = ?");
    params.push(action);
  }
  if (typeof user_id === "string" && user_id) {
    clauses.push("user_id = ?");
    params.push(user_id);
  }
  if (typeof from === "string" && from) {
    clauses.push("occurred_at >= ?");
    params.push(from);
  }
  if (typeof to === "string" && to) {
    clauses.push("occurred_at <= ?");
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(page_size) || 50));
  const offset = (pageNum - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT id, user_id, action, target, change_summary, ip_address, success, occurred_at
       FROM audit_logs ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${where}`).get(...params) as {
    total: number;
  };

  res.json({ audit_logs: rows, page: pageNum, page_size: pageSize, total });
});
