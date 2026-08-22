import bcrypt from "bcryptjs";

// 스펙 6.1 계정 규칙: 평문 저장 금지, Argon2id 또는 bcrypt 허용 — 순수 JS로
// 네이티브 빌드 의존성 없이 배포 가능한 bcrypt를 사용한다.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}
