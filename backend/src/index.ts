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

ensureBootstrapAdmin();
exportQueue.start();
cloudSync.start();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/api", apiRouter);

const server = http.createServer(app);
realtimeHub.attach(server);

server.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port} (timezone: ${config.timezone})`);
});
