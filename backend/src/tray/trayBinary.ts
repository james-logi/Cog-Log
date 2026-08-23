import fs from "node:fs";
import path from "node:path";
import { isSea, getAsset } from "node:sea";

const ASSET_KEY = "systray-helper.exe";

// systray2는 './traybin/<binName>'을 현재 작업 디렉터리 기준으로 먼저 찾는다
// (없으면 자기 node_modules 안의 것을 쓰는데, SEA로 패키징하면 그 폴더 자체가
// 없다). 그래서 SEA로 실행 중일 때는 내장해둔 헬퍼 바이너리를 최초 1회
// 그 경로에 풀어준다. exe와 같은 폴더에 작은 traybin/ 폴더가 하나 더
// 생긴다는 뜻이다(완전한 단일 파일은 아니지만, 매 실행마다 새로 만들지 않고
// 한 번만 만든다).
export function ensureTrayBinaryOnDisk(): void {
  if (!isSea()) return;
  if (process.platform !== "win32") return; // 지금은 Windows용 헬퍼만 내장했다

  const trayDir = path.join(process.cwd(), "traybin");
  const trayBinPath = path.join(trayDir, "tray_windows_release.exe");
  if (fs.existsSync(trayBinPath)) return;

  fs.mkdirSync(trayDir, { recursive: true });
  fs.writeFileSync(trayBinPath, Buffer.from(getAsset(ASSET_KEY)));
}
