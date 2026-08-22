interface Env {
  DB: D1Database;
  SYNC_API_KEY: string;
}

interface IngestBody {
  id?: string;
  daily_date?: string;
  display_number?: string;
  occurred_at?: string;
  direction?: string;
  display_text?: string;
  communication_status?: string;
}

// 로컬 백엔드(backend/src/cloud/sync.ts)가 새 로그마다 호출하는 수신 엔드포인트.
// 공유 비밀키로만 인증한다 — 인터넷에 노출되므로 반드시 강력한 값으로 설정할 것.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const key = context.request.headers.get("x-sync-key");
  if (!context.env.SYNC_API_KEY || key !== context.env.SYNC_API_KEY) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const { id, daily_date, display_number, occurred_at, direction, display_text, communication_status } = body;
  if (!id || !daily_date || !display_number || !occurred_at || !direction || !communication_status) {
    return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 });
  }

  // id 기준 upsert: 같은 레코드가 재시도나 여러 로컬 백엔드에서 동시에 들어와도
  // 중복 행 없이 항상 최신 값 하나만 남는다(동시 접속 중복 방지 요구사항).
  await context.env.DB.prepare(
    `INSERT INTO log_records (id, daily_date, display_number, occurred_at, direction, display_text, communication_status, synced_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       daily_date = excluded.daily_date,
       display_number = excluded.display_number,
       occurred_at = excluded.occurred_at,
       direction = excluded.direction,
       display_text = excluded.display_text,
       communication_status = excluded.communication_status,
       synced_at = datetime('now')`
  )
    .bind(id, daily_date, display_number, occurred_at, direction, display_text ?? "", communication_status)
    .run();

  return new Response(null, { status: 204 });
};
