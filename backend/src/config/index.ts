import "dotenv/config";
import path from "node:path";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? path.resolve("data/vision-log.sqlite3"),
  timezone: process.env.TIMEZONE ?? "Asia/Seoul",
  // spec 14장 기본값
  sessionIdleTimeoutMs: Number(process.env.SESSION_IDLE_TIMEOUT_MS ?? 30 * 60 * 1000),
  loginLockThreshold: Number(process.env.LOGIN_LOCK_THRESHOLD ?? 5),
  loginLockMs: Number(process.env.LOGIN_LOCK_MS ?? 15 * 60 * 1000),
  // 최초 실행 시 관리자 계정이 없으면 자동 생성할 로그인 ID/비밀번호.
  // 현장 테스트 편의를 위해 고정값을 기본으로 두었다 — 운영 배포 전 반드시 변경할 것.
  bootstrapAdminLoginId: process.env.BOOTSTRAP_ADMIN_LOGIN_ID ?? "admin",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "1234",
  // 클라우드(원격 조회용) 대시보드 복제 — 비워두면 완전히 비활성화된다.
  // cloud-dashboard/ 를 Cloudflare Pages에 배포한 뒤 그 URL과 SYNC_API_KEY를 넣는다.
  cloudSyncUrl: process.env.CLOUD_SYNC_URL ?? "",
  cloudSyncApiKey: process.env.CLOUD_SYNC_API_KEY ?? "",
};

export const isProduction = config.nodeEnv === "production";
