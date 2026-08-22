import crypto from "node:crypto";
import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";
import { hashPassword } from "./password.js";

interface AdminCountRow {
  count: number;
}

// 스펙 14장은 원래 무작위 초기 비밀번호를 권장하지만, 현장 테스트 편의를 위해
// 고정 기본값(config.bootstrapAdminPassword, 기본 "1234")을 쓰도록 변경했다.
// 운영 배포 전에는 BOOTSTRAP_ADMIN_PASSWORD 환경 변수로 반드시 바꿀 것.
export function ensureBootstrapAdmin() {
  const db = getDb();
  const { count } = db
    .prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1 AND deleted_at IS NULL"
    )
    .get() as AdminCountRow;
  if (count > 0) return;

  const loginId = config.bootstrapAdminLoginId;
  const password = config.bootstrapAdminPassword;

  db.prepare(
    `INSERT INTO users (id, login_id, password_hash, display_name, role, is_active)
     VALUES (?, ?, ?, ?, 'ADMIN', 1)
     ON CONFLICT(login_id) DO UPDATE SET
       password_hash = excluded.password_hash,
       role = 'ADMIN',
       is_active = 1,
       deleted_at = NULL`
  ).run(crypto.randomUUID(), loginId, hashPassword(password), "System Admin");

  console.log("");
  console.log("==================================================");
  console.log(" 초기 Admin 계정이 생성되었습니다. 최초 로그인 후 즉시 비밀번호를 변경하세요.");
  console.log(` ID: ${loginId}`);
  console.log(` PW: ${password}`);
  console.log("==================================================");
  console.log("");
}
