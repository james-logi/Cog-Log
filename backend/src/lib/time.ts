// DB에 저장되는 타임스탬프는 두 형식이 섞여 있다:
//  - SQLite datetime('now') 기본값: "YYYY-MM-DD HH:MM:SS" (UTC, 타임존 표기 없음)
//  - 애플리케이션 코드가 직접 계산한 Date#toISOString(): "YYYY-MM-DDTHH:MM:SS.sssZ"
// 두 형식을 모두 안전하게 밀리초로 변환한다.
export function parseDbTimestamp(value: string): number {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).getTime();
}
