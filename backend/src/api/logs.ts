import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth } from "../auth/middleware.js";

export const logsRouter = Router();
logsRouter.use(requireAuth);

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

// 스펙 6.7: 기간/방향/통신 상태/데이터 문자열로 검색. 조회는 전체 역할 허용(3장).
logsRouter.get("/", (req, res) => {
  const db = getDb();
  const { direction, communication_status, q, from, to, limit } = req.query;

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (direction === "TX" || direction === "RX") {
    clauses.push("lr.direction = ?");
    params.push(direction);
  }
  if (typeof communication_status === "string" && communication_status) {
    clauses.push("lr.communication_status = ?");
    params.push(communication_status);
  }
  if (typeof q === "string" && q.trim()) {
    clauses.push("lr.display_text LIKE ?");
    params.push(`%${q.trim()}%`);
  }
  if (typeof from === "string" && from) {
    clauses.push("lr.occurred_at >= ?");
    params.push(from);
  }
  if (typeof to === "string" && to) {
    clauses.push("lr.occurred_at <= ?");
    params.push(to);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));

  const rows = db
    .prepare(
      `SELECT lr.id, lr.display_number, lr.occurred_at, lr.direction, lr.display_text,
              lr.communication_status, lr.communication_error,
              txt.save_status AS txt_status, xlsx.save_status AS xlsx_status
       FROM log_records lr
       LEFT JOIN file_write_results txt ON txt.log_record_id = lr.id AND txt.format = 'TXT'
       LEFT JOIN file_write_results xlsx ON xlsx.log_record_id = lr.id AND xlsx.format = 'XLSX'
       ${where}
       ORDER BY lr.occurred_at DESC, lr.daily_sequence DESC
       LIMIT ?`
    )
    .all(...params, limitNum) as unknown[];

  // 화면(모니터링 터미널)에 그대로 append할 수 있도록 오래된 순으로 뒤집어 반환한다.
  res.json({ log_records: rows.reverse() });
});
