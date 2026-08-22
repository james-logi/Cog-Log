import { Router } from "express";
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";
import { usersRouter } from "./users.js";
import { auditLogsRouter } from "./audit-logs.js";
import { connectionRouter } from "./connection.js";
import { settingsRouter } from "./settings.js";
import { fileJobsRouter } from "./file-jobs.js";
import { fsRouter } from "./fs.js";
import { attachSession } from "../auth/middleware.js";

// Endpoint groups mirror spec section 15 (API/실시간 경계 제안).
// 개발 순서(18장) 진행 상황: 인증/사용자/감사 로그, TCP 서비스, 통신·저장
// 설정, 파일 Export(TXT/XLSX) 구현됨. 로그 조회 화면 API와 일정은 남음.
const notImplemented = Router().all("*", (_req, res) => {
  res.status(501).json({ error: "not_implemented" });
});

export const apiRouter = Router();
apiRouter.use(attachSession);
apiRouter.use("/", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/connection", connectionRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/settings", notImplemented);
apiRouter.use("/logs", notImplemented);
apiRouter.use("/file-jobs", fileJobsRouter);
apiRouter.use("/schedules", notImplemented);
apiRouter.use("/users", usersRouter);
apiRouter.use("/audit-logs", auditLogsRouter);
apiRouter.use("/fs", fsRouter);
