import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE, loadSession, readSessionCookie, type SessionUser } from "./session.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: string;
    }
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// 세션 쿠키를 검사해 req.user를 채운다. 인증 실패 시 401만 반환하고,
// 어떤 라우트를 보호할지는 requireAuth/requireRole이 결정한다.
export function attachSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = readSessionCookie(req);
  if (!sessionId) return next();

  const loaded = loadSession(sessionId);
  if (!loaded) return next();

  req.user = loaded.user;
  req.sessionId = sessionId;

  // 더블 서브밋 CSRF 검사: 세션이 있는 상태에서 변형 요청(GET 외)은
  // 쿠키의 csrf_token과 요청 헤더 값이 일치해야 한다(AUTH-04).
  if (!SAFE_METHODS.has(req.method)) {
    const headerToken = req.get("x-csrf-token");
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    if (!headerToken || !cookieToken || headerToken !== cookieToken || headerToken !== loaded.session.csrf_token) {
      return res.status(403).json({ error: "csrf_check_failed" });
    }
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  next();
}

export function requireRole(...roles: Array<SessionUser["role"]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "unauthenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}
