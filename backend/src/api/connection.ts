import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { recordAudit } from "../audit/log.js";
import { getOrCreateConnectionProfile } from "../db/connectionProfile.js";
import { tcpManager } from "../tcp/manager.js";

export const connectionRouter = Router();
connectionRouter.use(requireAuth);

// 스펙 3장: 조회는 전체, 시작·중지·송신은 Admin/Operator만.
connectionRouter.get("/status", (_req, res) => {
  res.json({ info: tcpManager.getInfo() });
});

connectionRouter.post("/start", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  try {
    const profile = getOrCreateConnectionProfile();
    await tcpManager.start(profile);
    recordAudit(req, { userId: req.user!.id, action: "connection.start", changeSummary: `mode=${profile.mode}`, success: true });
    res.json({ info: tcpManager.getInfo() });
  } catch (err) {
    recordAudit(req, { userId: req.user!.id, action: "connection.start", success: false, changeSummary: (err as Error).message });
    res.status(500).json({ error: "start_failed", message: (err as Error).message });
  }
});

connectionRouter.post("/stop", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  await tcpManager.stop();
  recordAudit(req, { userId: req.user!.id, action: "connection.stop", success: true });
  res.json({ info: tcpManager.getInfo() });
});

connectionRouter.post("/send", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.length) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const result = await tcpManager.send(text);
  if (!result.ok) return res.status(409).json({ error: result.error ?? "send_failed" });
  res.status(204).end();
});
