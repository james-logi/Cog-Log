import fs from "node:fs";
import path from "node:path";
import { isSea, getAsset, getAssetKeys } from "node:sea";
import type { NextFunction, Request, Response } from "express";
import { moduleDirname } from "./lib/moduleDir.js";

const FRONTEND_DIST = path.resolve(moduleDirname(import.meta.url), "../../frontend/dist");
const WEB_KEY_PREFIX = "web/";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
}

// 단일 .exe로 패키징됐을 때는 프런트엔드 빌드 산출물이 디스크에 없고 SEA
// 자산으로 실행 파일 안에 내장돼 있다(scripts/package-exe.mjs가 web/ 접두사로
// frontend/dist 전체를 넣는다). 개발/일반 빌드에서는 frontend/dist를 그대로
// 서빙한다.
const seaActive = isSea();
const embeddedKeys = seaActive ? new Set(getAssetKeys().filter((k) => k.startsWith(WEB_KEY_PREFIX))) : null;

// 웹 화면(정적 파일) 서빙. API(/api)와 WebSocket(/ws) 경로는 건드리지 않는다.
export function staticSiteMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api") || req.path === "/ws") return next();

  const relPath = req.path === "/" ? "index.html" : req.path.replace(/^\/+/, "");

  if (seaActive && embeddedKeys) {
    const key = `${WEB_KEY_PREFIX}${relPath}`;
    const finalKey = embeddedKeys.has(key) ? key : `${WEB_KEY_PREFIX}index.html`; // SPA fallback
    if (!embeddedKeys.has(finalKey)) return next(); // 프런트엔드가 아예 안 내장된 경우(API 전용)
    res.setHeader("content-type", contentTypeFor(finalKey));
    res.send(Buffer.from(getAsset(finalKey)));
    return;
  }

  const requested = path.join(FRONTEND_DIST, relPath);
  if (!requested.startsWith(FRONTEND_DIST)) return next(); // 경로 조작 방지

  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    res.sendFile(requested);
    return;
  }
  const indexPath = path.join(FRONTEND_DIST, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath); // SPA 라우팅 fallback
    return;
  }
  next(); // frontend/dist 자체가 없으면(API 전용 개발 환경) 그냥 다음으로
}
