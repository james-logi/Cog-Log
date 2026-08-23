import { exec } from "node:child_process";
import * as SysTrayNS from "systray2";
import type SysTrayType from "systray2";
import type { MenuItem } from "systray2";
import { getTrayIconBase64 } from "./icon.js";
import { ensureTrayBinaryOnDisk } from "./trayBinary.js";

// systray2는 CJS 모듈인데 __esModule 마커 없이 `exports.default = SysTray`만
// 써서, 네임스페이스 import가 실제 클래스를 어디에 두는지 번들러/런타임마다
// 다르다(esbuild 번들, Node 네이티브 ESM, tsc 빌드에서 각각 다르게 해석됨).
// 나올 수 있는 모양을 순서대로 시도해서 실제 생성자 함수를 찾는다.
function resolveSysTrayClass(): typeof SysTrayType {
  const ns = SysTrayNS as unknown as Record<string, unknown>;
  const candidates: unknown[] = [
    ns.default,
    (ns.default as Record<string, unknown> | undefined)?.default,
    ns["module.exports"],
    (ns["module.exports"] as Record<string, unknown> | undefined)?.default,
    ns,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "function") return candidate as typeof SysTrayType;
  }
  throw new Error("systray2 모듈에서 SysTray 클래스를 찾지 못했습니다.");
}

const SysTray = resolveSysTrayClass();

type ClickableMenuItem = MenuItem & { click?: () => void };

function openBrowser(url: string) {
  if (process.platform === "win32") exec(`start "" "${url}"`);
  else if (process.platform === "darwin") exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}

// 창을 닫아도(숨겨진 채로) 백그라운드에서 계속 돌 때, 우측 하단 트레이
// 아이콘으로 웹 화면을 다시 열거나 완전히 종료할 수 있게 한다.
export async function startTray(port: number, onQuit: () => void): Promise<void> {
  ensureTrayBinaryOnDisk();

  const url = `http://localhost:${port}`;

  const openItem: ClickableMenuItem = {
    title: "웹 화면 열기",
    tooltip: url,
    checked: false,
    enabled: true,
    click: () => openBrowser(url),
  };
  const quitItem: ClickableMenuItem = {
    title: "종료",
    tooltip: "프로그램 종료",
    checked: false,
    enabled: true,
    click: () => {
      onQuit();
    },
  };

  const systray = new SysTray({
    menu: {
      icon: getTrayIconBase64(),
      title: "COG COMM LOG",
      tooltip: `COG COMM LOG (포트 ${port})`,
      items: [openItem, SysTray.separator, quitItem],
    },
  });

  systray.onClick((action) => {
    (action.item as ClickableMenuItem).click?.();
  });

  // onError/onExit는 (onClick과 달리) 내부적으로 ready()를 기다리지 않고
  // this._process에 바로 접근한다 — 준비되기 전에 부르면 process가 아직
  // null이라 "Cannot read properties of null"로 죽는다.
  await systray.ready();
  systray.onError((err) => {
    console.error(`트레이 아이콘 오류: ${err.message}`);
  });
}
