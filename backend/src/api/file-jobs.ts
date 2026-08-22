import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { recordAudit } from "../audit/log.js";
import { exportQueue } from "../export/queue.js";

export const fileJobsRouter = Router();
fileJobsRouter.use(requireAuth);

fileJobsRouter.get("/", (req, res) => {
  const db = getDb();
  const { status } = req.query;
  const rows =
    typeof status === "string" && status
      ? db
          .prepare("SELECT * FROM file_write_results WHERE save_status = ? ORDER BY updated_at DESC LIMIT 200")
          .all(status)
      : db.prepare("SELECT * FROM file_write_results ORDER BY updated_at DESC LIMIT 200").all();
  res.json({ file_jobs: rows });
});

// LOG-09: 실패 건 수동 재시도.
fileJobsRouter.post("/retry", requireRole("ADMIN", "OPERATOR"), (req, res) => {
  const { id } = req.body ?? {};
  if (typeof id !== "string" || !id) return res.status(400).json({ error: "invalid_request" });

  const ok = exportQueue.retryNow(id);
  if (!ok) return res.status(404).json({ error: "not_found" });

  recordAudit(req, { userId: req.user!.id, action: "file_job.retry", target: id, success: true });
  res.status(204).end();
});
