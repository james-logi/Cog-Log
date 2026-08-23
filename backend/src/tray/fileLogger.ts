import fs from "node:fs";

// 트레이로 숨겨진 뒤에는 원래 콘솔을 보던 창(부모 프로세스)이 종료되면서
// 이 프로세스의 stdout 파이프가 더는 아무도 읽지 않는 상태가 된다 — 거기에
// 계속 쓰면 EPIPE로 죽을 수 있으니 에러는 무시하고, 대신 로그는 파일에도
// 남겨서 콘솔이 없어도 운영 중 문제를 확인할 수 있게 한다.
export function installFileLogging(logPath: string): void {
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});

  const stream = fs.createWriteStream(logPath, { flags: "a" });
  const wrap =
    (original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      stream.write(`[${new Date().toISOString()}] ${line}\n`);
      original(...args);
    };

  // eslint-disable-next-line no-console
  console.log = wrap(console.log.bind(console));
  // eslint-disable-next-line no-console
  console.error = wrap(console.error.bind(console));
}
