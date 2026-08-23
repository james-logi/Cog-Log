export interface Env {
  ASSETS: Fetcher;
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

// 단일 Worker가 정적 대시보드(ASSETS)와 API 두 가지를 함께 처리한다
// (Cloudflare의 새 통합 Workers 배포 방식 — 예전 "Pages Functions" 파일 기반
// 라우팅 대신 fetch 핸들러 안에서 직접 분기한다).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/ingest" && request.method === "POST") {
        return await handleIngest(request, env);
      }
      if (url.pathname === "/api/logs" && request.method === "GET") {
        return await handleLogs(request, env);
      }
    } catch (err) {
      // D1 스키마 미적용 등으로 인한 예외를 Cloudflare 기본 에러 페이지 대신
      // JSON으로 내려서 원인을 바로 알 수 있게 한다.
      return json({ error: "internal_error", message: (err as Error).message }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};

// 로컬 백엔드(backend/src/cloud/sync.ts)가 새 로그마다 호출하는 수신 엔드포인트.
// 공유 비밀키로만 인증한다 — 인터넷에 노출되므로 반드시 강력한 값으로 설정할 것.
async function handleIngest(request: Request, env: Env): Promise<Response> {
  const key = request.headers.get("x-sync-key");
  if (!env.SYNC_API_KEY || key !== env.SYNC_API_KEY) {
    // TEMP DEBUG(제거 예정): 실제 값은 절대 노출하지 않고 상태만 확인한다.
    return json(
      {
        error: "unauthorized",
        debug: {
          envKeyConfigured: !!env.SYNC_API_KEY,
          envKeyLength: env.SYNC_API_KEY?.length ?? 0,
          receivedHeaderPresent: key !== null,
          receivedLength: key?.length ?? 0,
        },
      },
      401
    );
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { id, daily_date, display_number, occurred_at, direction, display_text, communication_status } = body;
  if (!id || !daily_date || !display_number || !occurred_at || !direction || !communication_status) {
    return json({ error: "invalid_request" }, 400);
  }

  // id 기준 upsert: 같은 레코드가 재시도나 여러 로컬 백엔드에서 동시에 들어와도
  // 중복 행 없이 항상 최신 값 하나만 남는다(동시 접속 중복 방지 요구사항).
  await env.DB.prepare(
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
}

// 읽기 전용 조회 — 인증 없이 공개할지, 뒤에 Cloudflare Access 등을 붙일지는
// 배포 시점에 정한다(docs/cloud-dashboard-setup.md 참고).
async function handleLogs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));

  const { results } = await env.DB.prepare(
    "SELECT id, daily_date, display_number, occurred_at, direction, display_text, communication_status, synced_at FROM log_records ORDER BY occurred_at DESC LIMIT ?1"
  )
    .bind(limit)
    .all();

  return json({ log_records: results });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
