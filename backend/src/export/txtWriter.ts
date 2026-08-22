import fs from "node:fs";
import path from "node:path";

export interface TxtRow {
  displayNumber: string;
  displayText: string;
  scheduleId: string | null;
  occurredAt: string;
  direction: string;
  communicationStatus: string;
}

// 스펙 10.1: 데이터 내 CR/LF는 이스케이프해서 행 구분과 혼동되지 않게 보존한다.
function escapeField(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

// 같은 파일에 대한 쓰기는 fs.appendFileSync로 직렬화한다(Node는 단일 스레드라
// 동기 호출 사이에 다른 쓰기가 끼어들 수 없다) — 스펙 10.1 "같은 파일 쓰기는 직렬화".
export function appendTxtRow(targetPath: string, row: TxtRow): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const fields = [
    row.displayNumber,
    escapeField(row.displayText),
    row.scheduleId ?? "",
    row.occurredAt,
    row.direction,
    row.communicationStatus,
  ];
  fs.appendFileSync(targetPath, fields.join("\t") + "\r\n", "utf-8");
}
