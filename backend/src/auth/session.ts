import crypto from "node:crypto";
import type { Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { config, isProduction } from "../config/index.js";
import { parseDbTimestamp } from "../lib/time.js";

export const SESSION_COOKIE = "vlp_sid";
export const CSRF_COOKIE = "vlp_csrf";

export interface SessionUser {
  id: string;
  login_id: string;
  display_name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
  is_active: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  csrf_token: string;
  last_seen_at: string;
}

export function createSession(userId: string): { sessionId: string; csrfToken: string } {
  const db = getDb();
  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(24).toString("hex");
  db.prepare(
    "INSERT INTO sessions (id, user_id, csrf_token) VALUES (?, ?, ?)"
  ).run(sessionId, userId, csrfToken);
  return { sessionId, csrfToken };
}

// 유휴 세션 만료(스펙 14장 기본 30분)를 조회 시점에 검사한다.
export function loadSession(sessionId: string): { session: SessionRow; user: SessionUser } | null {
  const db = getDb();
  const session = db
    .prepare("SELECT id, user_id, csrf_token, last_seen_at FROM sessions WHERE id = ?")
    .get(sessionId) as SessionRow | undefined;
  if (!session) return null;

  const lastSeenMs = parseDbTimestamp(session.last_seen_at);
  if (Date.now() - lastSeenMs > config.sessionIdleTimeoutMs) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }

  const user = db
    .prepare(
      "SELECT id, login_id, display_name, role, is_active FROM users WHERE id = ? AND deleted_at IS NULL"
    )
    .get(session.user_id) as SessionUser | undefined;
  if (!user || !user.is_active) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }

  db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").run(sessionId);
  return { session, user };
}

export function destroySession(sessionId: string) {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function destroyAllSessionsForUser(userId: string) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function setSessionCookies(res: Response, sessionId: string, csrfToken: string) {
  const maxAge = config.sessionIdleTimeoutMs;
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge,
    path: "/",
  });
  // CSRF 토큰은 더블 서브밋 패턴이라 클라이언트 JS가 읽어 헤더로 되돌려야 하므로 httpOnly가 아니다.
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function readSessionCookie(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}
