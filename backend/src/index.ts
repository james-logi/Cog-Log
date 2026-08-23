import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import http from "node:http";
import path from "node:path";
import readline from "node:readline";
import { isSea } from "node:sea";
import { config } from "./config/index.js";
import { apiRouter } from "./api/index.js";
import { realtimeHub } from "./realtime/hub.js";
import { ensureBootstrapAdmin } from "./auth/bootstrap.js";
import { exportQueue } from "./export/queue.js";
import { cloudSync } from "./cloud/sync.js";
import { runMigrations } from "./db/runMigrations.js";
import { staticSiteMiddleware } from "./staticSite.js";
import { isHiddenTrayChild, relaunchHiddenAndExit } from "./tray/hiddenLauncher.js";
import { installFileLogging } from "./tray/fileLogger.js";
import { startTray } from "./tray/tray.js";

// 패키징된 exe를 탐색기에서 더블클릭해 실행하면, 프로세스가 죽는 순간 콘솔
// 창도 같이 닫혀서 오류 메시지를 읽을 새가 없다. SEA로 실행 중일 때는
// 종료 전에 키 입력을 기다려 창이 바로 사라지지 않게 한다. 이 프라미스는
// 절대 정상적으로 resolve되지 않는다(항상 process.exit로 끝난다) — 호출부는
// await한 뒤 그냥 함수를 빠져나오면 된다.
let handlingFatalError = false;

function fatalError(message: string): Promise<never> {
  if (handlingFatalError) return new Promise<never>(() => {}); // 이미 처리 중이면 중복 출력/종료 방지
  handlingFatalError = true;

  console.error(`\n! ${message}`);
  if (!isSea()) {
    process.exit(1);
  }
  return new Promise<never>(() => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\n종료하려면 Enter 키를 누르세요...", () => {
      rl.close();
      process.exit(1);
    });
  });
}

// 어디서 터지든(라이브러리 내부 등 우리가 직접 리스너를 못 붙인 곳 포함)
// 처리되지 않은 예외 때문에 콘솔 창이 메시지도 없이 바로 닫히는 일이 없도록
// 마지막 안전망을 둔다.
process.on("uncaughtException", (err) => {
  void fatalError(`처리되지 않은 오류가 발생했습니다: ${err.message}`);
});
process.on("unhandledRejection", (reason) => {
  void fatalError(`처리되지 않은 오류가 발생했습니다: ${reason instanceof Error ? reason.message : String(reason)}`);
});

async function main() {
  try {
    // 배포용 단일 exe는 별도 "npm run migrate" 없이 최초 실행 시 스스로 스키마를 만든다.
    runMigrations();
    ensureBootstrapAdmin();
  } catch (err) {
    await fatalError(`초기화 중 오류가 발생했습니다: ${(err as Error).message}`);
    return;
  }

  exportQueue.start();
  cloudSync.start();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", apiRouter);
  app.use(staticSiteMiddleware);

  const server = http.createServer(app);
  realtimeHub.attach(server);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      void fatalError(
        `포트 ${config.port}번이 이미 사용 중입니다. 다른 프로그램(또는 이미 실행 중인 이 프로그램)을 ` +
          `종료하거나, PORT 환경 변수로 다른 포트를 지정한 뒤 다시 실행하세요.`
      );
      return;
    }
    void fatalError(`서버를 시작하지 못했습니다: ${err.message}`);
  });

  server.listen(config.port, () => {
    console.log(`Backend listening on port ${config.port} (timezone: ${config.timezone})`);
    // 트레이 아이콘은 "숨김 자식" 프로세스에서만 띄운다(보이는 콘솔로 직접
    // 실행했거나 개발 모드일 땐 필요 없다). 트레이 초기화 실패는 부가 기능
    // 문제일 뿐이니 서버 자체는 계속 떠 있어야 한다 — 전역 uncaughtException
    // 처리(대화형 콘솔이 없는 숨김 프로세스에서는 응답 못 받는 Enter 대기로
    // 이어짐)로 새지 않도록 여기서 직접 잡는다.
    if (isHiddenTrayChild()) {
      startTray(config.port, () => process.exit(0)).catch((err: Error) => {
        console.error(`트레이 아이콘을 시작하지 못했습니다: ${err.message}`);
      });
    }
  });
}

// SEA로 패키징된 exe를 더블클릭하면 창을 숨기고 트레이 아이콘으로 백그라운드
// 실행한다. NO_TRAY=1을 설정하면(디버깅용) 원래대로 콘솔에 그대로 띄운다.
if (isSea() && !isHiddenTrayChild() && process.env.NO_TRAY !== "1") {
  relaunchHiddenAndExit();
} else {
  if (isHiddenTrayChild()) {
    installFileLogging(path.join(process.cwd(), "coglog.log"));
  }
  void main();
}
