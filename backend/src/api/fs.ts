import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";

export const fsRouter = Router();
fsRouter.use(requireAuth, requireRole("ADMIN", "OPERATOR"));

// 저장 경로 설정 화면의 폴더 선택기 전용 — 디렉터리 목록만 노출한다(파일 내용 접근 없음).
function listWindowsDrives(): string[] {
  const drives: string[] = [];
  for (let code = 65; code <= 90; code++) {
    const drivePath = `${String.fromCharCode(code)}:\\`;
    try {
      if (fs.existsSync(drivePath)) drives.push(drivePath);
    } catch {
      // 접근 불가한 드라이브는 건너뛴다
    }
  }
  return drives;
}

fsRouter.get("/browse", (req, res) => {
  const requested = typeof req.query.path === "string" ? req.query.path : "";

  if (!requested) {
    const drives = listWindowsDrives();
    return res.json({ path: "", parent: null, entries: drives.map((d) => ({ name: d, path: d })) });
  }

  const resolved = path.resolve(requested);
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (err) {
    return res.status(400).json({ error: "cannot_read", message: (err as Error).message });
  }

  const entries = dirents
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: path.join(resolved, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(resolved);
  res.json({ path: resolved, parent: parent === resolved ? null : parent, entries });
});

// 브라우징 중 새 하위 폴더를 즉시 만들 수 있게(스펙 LOG-04와 맞물림: 없으면 만들고 검증).
fsRouter.post("/mkdir", (req, res) => {
  const { path: parentPath, name } = req.body ?? {};
  if (typeof parentPath !== "string" || !parentPath || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (/[\\/:*?"<>|]/.test(name)) return res.status(400).json({ error: "invalid_name" });

  const target = path.join(parentPath, name.trim());
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    return res.status(400).json({ error: "mkdir_failed", message: (err as Error).message });
  }
  res.status(201).json({ path: target });
});
