import { spawn } from "node:child_process";
import readline from "node:readline";

const CHILD_ENV_MARKER = "COGLOG_TRAY_CHILD";
const READY_MARKER = "Backend listening on port";
const STARTUP_TIMEOUT_MS = 20_000;

export function isHiddenTrayChild(): boolean {
  return process.env[CHILD_ENV_MARKER] === "1";
}

// SEA로 패키징된 exe를 처음 실행하면(보이는 콘솔), 같은 exe를 숨김 + 분리
// 모드로 다시 띄우고 그 자식이 정상적으로 뜨는지 잠깐 지켜본 뒤:
//  - 성공하면 조용히 이 프로세스만 종료한다(자식은 트레이 아이콘으로 계속 동작)
//  - 실패하면 자식의 출력을 그대로 보여주고 Enter 입력을 기다린다
// 창이 이유 없이 사라지는 문제(예: 포트 충돌)를 다시 만들지 않기 위함이다.
export function relaunchHiddenAndExit(): void {
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, [CHILD_ENV_MARKER]: "1" },
  });

  let settled = false;
  let buffered = "";
  let timer: NodeJS.Timeout;

  const finishSuccess = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.log("트레이 아이콘으로 백그라운드에서 계속 실행됩니다.");
    child.unref();
    process.exit(0);
  };

  const finishFailure = (extra: string) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    process.stdout.write(buffered);
    console.error(`\n! ${extra}`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\n종료하려면 Enter 키를 누르세요...", () => {
      rl.close();
      process.exit(1);
    });
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    buffered += text;
    if (text.includes(READY_MARKER)) finishSuccess();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
  });
  child.on("exit", (code) => {
    if (!settled) finishFailure(`프로그램이 시작되지 못했습니다(종료 코드 ${code}).`);
  });
  child.on("error", (err) => {
    finishFailure(`프로그램을 실행하지 못했습니다: ${err.message}`);
  });

  timer = setTimeout(() => finishFailure("시작 확인 시간이 초과됐습니다."), STARTUP_TIMEOUT_MS);
  timer.unref();
}
