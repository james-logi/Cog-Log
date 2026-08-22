import { Router } from "express";
import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  clearSessionCookies,
  createSession,
  destroySession,
  setSessionCookies,
} from "../auth/session.js";
import { requireAuth } from "../auth/middleware.js";
import { recordAudit } from "../audit/log.js";
import { normalizeLoginId } from "../lib/normalize.js";
import { parseDbTimestamp } from "../lib/time.js";

export const authRouter = Router();

interface UserRow {
  id: string;
  login_id: string;
  password_hash: string;
  display_name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
  is_active: number;
  failed_login_count: number;
  locked_until: string | null;
  deleted_at: string | null;
}

authRouter.post("/login", (req, res) => {
  const { login_id, password } = req.body ?? {};
  if (typeof login_id !== "string" || typeof password !== "string" || !login_id || !password) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const db = getDb();
  const loginId = normalizeLoginId(login_id);
  const user = db
    .prepare("SELECT * FROM users WHERE login_id = ? AND deleted_at IS NULL")
    .get(loginId) as UserRow | undefined;

  // AUTH-02: 비활성/삭제/잠금 계정 로그인 거부
  if (!user || !user.is_active) {
    recordAudit(req, { userId: user?.id ?? null, action: "auth.login_failed", target: loginId, success: false });
    return res.status(401).json({ error: "invalid_credentials" });
  }

  if (user.locked_until && parseDbTimestamp(user.locked_until) > Date.now()) {
    recordAudit(req, { userId: user.id, action: "auth.login_failed", target: loginId, changeSummary: "account_locked", success: false });
    return res.status(423).json({ error: "account_locked", locked_until: user.locked_until });
  }

  if (!verifyPassword(password, user.password_hash)) {
    const nextCount = user.failed_login_count + 1;
    const lockedUntil =
      nextCount >= config.loginLockThreshold
        ? new Date(Date.now() + config.loginLockMs).toISOString()
        : null;
    db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextCount,
      lockedUntil,
      user.id
    );
    recordAudit(req, {
      userId: user.id,
      action: "auth.login_failed",
      target: loginId,
      changeSummary: lockedUntil ? "locked_after_failed_attempts" : `failed_count=${nextCount}`,
      success: false,
    });
    return res.status(401).json({ error: "invalid_credentials" });
  }

  db.prepare(
    "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(user.id);

  const { sessionId, csrfToken } = createSession(user.id);
  setSessionCookies(res, sessionId, csrfToken);
  recordAudit(req, { userId: user.id, action: "auth.login", target: loginId, success: true });

  res.json({
    user: { id: user.id, login_id: user.login_id, display_name: user.display_name, role: user.role },
  });
});

authRouter.post("/logout", requireAuth, (req, res) => {
  if (req.sessionId) destroySession(req.sessionId);
  clearSessionCookies(res);
  recordAudit(req, { userId: req.user!.id, action: "auth.logout", success: true });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  const { id, login_id, display_name, role } = req.user!;
  res.json({ user: { id, login_id, display_name, role } });
});

authRouter.post("/password", requireAuth, (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  if (typeof current_password !== "string" || typeof new_password !== "string" || new_password.length < 8) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as UserRow;

  // AUTH-03: 본인 비밀번호 변경 시 현재 비밀번호 재확인
  if (!verifyPassword(current_password, user.password_hash)) {
    recordAudit(req, { userId: user.id, action: "user.password_change", success: false });
    return res.status(401).json({ error: "current_password_mismatch" });
  }

  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    hashPassword(new_password),
    user.id
  );
  recordAudit(req, { userId: user.id, action: "user.password_change", target: user.id, success: true });
  res.status(204).end();
});
