import crypto from "node:crypto";
import { Router } from "express";
import { getDb } from "../db/connection.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import { destroyAllSessionsForUser } from "../auth/session.js";
import { recordAudit } from "../audit/log.js";
import { normalizeLoginId } from "../lib/normalize.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("ADMIN"));

const ROLES = ["ADMIN", "OPERATOR", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

interface UserRow {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
  is_active: number;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const PUBLIC_COLUMNS =
  "id, login_id, display_name, role, is_active, failed_login_count, locked_until, last_login_at, created_at, updated_at";

function countActiveAdmins(db: ReturnType<typeof getDb>, excludeUserId?: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM users
       WHERE role = 'ADMIN' AND is_active = 1 AND deleted_at IS NULL
       AND (? IS NULL OR id != ?)`
    )
    .get(excludeUserId ?? null, excludeUserId ?? null) as { count: number };
  return row.count;
}

usersRouter.get("/", (req, res) => {
  const db = getDb();
  const { q, role, is_active } = req.query;
  const clauses: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (typeof q === "string" && q.trim()) {
    clauses.push("(login_id LIKE ? OR display_name LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }
  if (typeof role === "string" && (ROLES as readonly string[]).includes(role)) {
    clauses.push("role = ?");
    params.push(role);
  }
  if (is_active === "true" || is_active === "false") {
    clauses.push("is_active = ?");
    params.push(is_active === "true" ? 1 : 0);
  }

  const rows = db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`)
    .all(...params);
  res.json({ users: rows });
});

usersRouter.get("/:id", (req, res) => {
  const row = getDb()
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? AND deleted_at IS NULL`)
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({ user: row });
});

usersRouter.post("/", (req, res) => {
  const { login_id, display_name, role, is_active, password } = req.body ?? {};
  if (
    typeof login_id !== "string" ||
    !login_id.trim() ||
    typeof display_name !== "string" ||
    !display_name.trim() ||
    typeof password !== "string" ||
    password.length < 8 ||
    !(ROLES as readonly string[]).includes(role)
  ) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const db = getDb();
  const loginId = normalizeLoginId(login_id);
  const existing = db.prepare("SELECT id FROM users WHERE login_id = ?").get(loginId);
  if (existing) return res.status(409).json({ error: "login_id_taken" }); // USR-03

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, login_id, password_hash, display_name, role, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, loginId, hashPassword(password), display_name.trim(), role, is_active === false ? 0 : 1);

  recordAudit(req, { userId: req.user!.id, action: "user.create", target: id, changeSummary: `login_id=${loginId}, role=${role}`, success: true });
  const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id);
  res.status(201).json({ user: row });
});

usersRouter.put("/:id", (req, res) => {
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL").get(req.params.id) as
    | UserRow
    | undefined;
  if (!target) return res.status(404).json({ error: "not_found" });

  const { display_name, role, is_active } = req.body ?? {};
  const nextRole: Role = role && (ROLES as readonly string[]).includes(role) ? role : target.role;
  const nextActive = typeof is_active === "boolean" ? (is_active ? 1 : 0) : target.is_active;

  // USR-03: 마지막 활성 Admin은 강등/비활성화할 수 없다.
  const losingAdminStatus = target.role === "ADMIN" && (nextRole !== "ADMIN" || nextActive === 0);
  if (losingAdminStatus && countActiveAdmins(db, target.id) === 0) {
    return res.status(409).json({ error: "last_active_admin" });
  }

  db.prepare(
    `UPDATE users SET display_name = COALESCE(?, display_name), role = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(typeof display_name === "string" && display_name.trim() ? display_name.trim() : null, nextRole, nextActive, target.id);

  recordAudit(req, {
    userId: req.user!.id,
    action: "user.update",
    target: target.id,
    changeSummary: `role=${nextRole}, is_active=${nextActive}`,
    success: true,
  });
  const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(target.id);
  res.json({ user: row });
});

usersRouter.delete("/:id", (req, res) => {
  const db = getDb();
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL").get(req.params.id) as
    | UserRow
    | undefined;
  if (!target) return res.status(404).json({ error: "not_found" });

  // USR-03: 본인 삭제, 마지막 활성 Admin 삭제를 서버에서 거부
  if (target.id === req.user!.id) return res.status(409).json({ error: "cannot_delete_self" });
  if (target.role === "ADMIN" && countActiveAdmins(db, target.id) === 0) {
    return res.status(409).json({ error: "last_active_admin" });
  }

  db.prepare("UPDATE users SET is_active = 0, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
    target.id
  );
  destroyAllSessionsForUser(target.id);
  recordAudit(req, { userId: req.user!.id, action: "user.deactivate", target: target.id, success: true });
  res.status(204).end();
});

usersRouter.post("/:id/reset-password", (req, res) => {
  const db = getDb();
  const target = db.prepare("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL").get(req.params.id) as
    | { id: string }
    | undefined;
  if (!target) return res.status(404).json({ error: "not_found" });

  const tempPassword = crypto.randomBytes(9).toString("base64url");
  db.prepare(
    "UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(hashPassword(tempPassword), target.id);
  destroyAllSessionsForUser(target.id);

  recordAudit(req, { userId: req.user!.id, action: "user.password_reset", target: target.id, success: true });
  res.json({ temporary_password: tempPassword });
});
