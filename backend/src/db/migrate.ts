import { runMigrations } from "./runMigrations.js";

// CLI 진입점: `npm run migrate`. 배포용 단일 exe는 index.ts에서 시작 시
// runMigrations()를 자동으로 호출하므로 이 스크립트를 따로 실행할 필요가 없다.
runMigrations();
