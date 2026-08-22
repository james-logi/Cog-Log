import { Router } from "express";
import { getDb } from "../db/connection.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  try {
    getDb().prepare("SELECT 1").get();
    res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});
