import type { DatabaseSync } from "node:sqlite";

// 스펙 4.2/10.3: 일자별 번호를 DB 트랜잭션으로 원자적으로 발급한다(daily_sequences).
// node:sqlite에는 better-sqlite3의 db.transaction() 헬퍼가 없어 BEGIN IMMEDIATE로
// 직접 잠근다(IMMEDIATE: 같은 파일에 대한 다른 쓰기 트랜잭션과의 경합을 즉시 차단).
export function issueDailySequence(
  db: DatabaseSync,
  dailyDate: string
): { dailySequence: number; displayNumber: string } {
  db.exec("BEGIN IMMEDIATE");
  let sequence: number;
  try {
    db.prepare(
      `INSERT INTO daily_sequences (daily_date, last_sequence) VALUES (?, 1)
       ON CONFLICT(daily_date) DO UPDATE SET last_sequence = last_sequence + 1`
    ).run(dailyDate);
    const row = db.prepare("SELECT last_sequence FROM daily_sequences WHERE daily_date = ?").get(dailyDate) as {
      last_sequence: number;
    };
    sequence = row.last_sequence;
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  const displayNumber = `${dailyDate.replace(/-/g, "")}-${String(sequence).padStart(6, "0")}`;
  return { dailySequence: sequence, displayNumber };
}
