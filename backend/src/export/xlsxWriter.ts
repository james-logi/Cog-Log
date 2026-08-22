import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const HEADERS = ["번호", "데이터", "일정 ID", "일정", "발생 일시", "방향", "통신 상태"];

export interface XlsxRow {
  displayNumber: string;
  displayText: string;
  scheduleId: string | null;
  scheduleTitle: string | null;
  occurredAt: string;
  direction: string;
  communicationStatus: string;
}

// 같은 파일에 대한 XLSX 쓰기는 파일 경로별 프라미스 체인으로 직렬화한다
// (스펙 10.2). 매 행마다 전체 워크북을 읽고 다시 쓰는 방식은 단순하지만
// 로그가 많아지면 느려진다 — 처리량이 커지면 스트리밍 writer로 교체할 것.
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeQueues.set(
    key,
    next.catch(() => undefined)
  );
  return next;
}

export function appendXlsxRow(targetPath: string, row: XlsxRow): Promise<void> {
  return enqueue(targetPath, async () => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const workbook = new ExcelJS.Workbook();
    let sheet: ExcelJS.Worksheet;
    if (fs.existsSync(targetPath)) {
      await workbook.xlsx.readFile(targetPath);
      sheet = workbook.worksheets[0] ?? workbook.addWorksheet("Log");
      if (sheet.rowCount === 0) sheet.addRow(HEADERS);
    } else {
      sheet = workbook.addWorksheet("Log");
      sheet.addRow(HEADERS);
    }

    const values = [
      row.displayNumber,
      row.displayText,
      row.scheduleId ?? "",
      row.scheduleTitle ?? "",
      row.occurredAt,
      row.direction,
      row.communicationStatus,
    ];
    const excelRow = sheet.addRow(values);
    // 스펙 10.2: =, +, -, @로 시작하는 값도 수식으로 실행되지 않도록 텍스트
    // 서식을 강제한다. exceljs는 문자열을 formula 객체로 넘기지 않는 한
    // 애초에 formula 타입 셀을 만들지 않지만, 표시 서식까지 텍스트로 고정한다.
    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = "@";
    });

    await workbook.xlsx.writeFile(targetPath);
  });
}
