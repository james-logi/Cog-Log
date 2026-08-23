import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import http from "node:http";
import { config } from "./config/index.js";
import { apiRouter } from "./api/index.js";
import { realtimeHub } from "./realtime/hub.js";
import { ensureBootstrapAdmin } from "./auth/bootstrap.js";
import { exportQueue } from "./export/queue.js";
import { cloudSync } from "./cloud/sync.js";
import { runMigrations } from "./db/runMigrations.js";
import { staticSiteMiddleware } from "./staticSite.js";

// 배포용 단일 exe는 별도 "npm run migrate" 없이 최초 실행 시 스스로 스키마를 만든다.
runMigrations();
ensureBootstrapAdmin();
exportQueue.start();
cloudSync.start();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/api", apiRouter);
app.use(staticSiteMiddleware);

const server = http.createServer(app);
realtimeHub.attach(server);

server.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port} (timezone: ${config.timezone})`);
});
