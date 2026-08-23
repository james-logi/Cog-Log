export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SYNC_API_KEY: string;
}

interface IngestBody {
  id?: string;
  site_id?: string | null;
  daily_date?: string;
  display_number?: string;
  occurred_at?: string;
  direction?: string;
  display_text?: string;
  communication_status?: string;
}

interface LogRow {
  id: string;
  site_id: string | null;
  daily_date: string;
  display_number: string;
  occurred_at: string;
  direction: string;
  display_text: string;
  communication_status: string;
  synced_at: string;
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
      if (url.pathname === "/api/sites" && request.method === "GET") {
        return await handleSites(env);
      }
      if (url.pathname === "/api/export" && request.method === "GET") {
        return await handleExport(request, env);
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
    return json({ error: "unauthorized" }, 401);
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { id, site_id, daily_date, display_number, occurred_at, direction, display_text, communication_status } =
    body;
  if (!id || !daily_date || !display_number || !occurred_at || !direction || !communication_status) {
    return json({ error: "invalid_request" }, 400);
  }

  // id 기준 upsert: 같은 레코드가 재시도나 여러 로컬 백엔드에서 동시에 들어와도
  // 중복 행 없이 항상 최신 값 하나만 남는다(동시 접속 중복 방지 요구사항).
  await env.DB.prepare(
    `INSERT INTO log_records (id, site_id, daily_date, display_number, occurred_at, direction, display_text, communication_status, synced_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       site_id = excluded.site_id,
       daily_date = excluded.daily_date,
       display_number = excluded.display_number,
       occurred_at = excluded.occurred_at,
       direction = excluded.direction,
       display_text = excluded.display_text,
       communication_status = excluded.communication_status,
       synced_at = datetime('now')`
  )
    .bind(id, site_id ?? null, daily_date, display_number, occurred_at, direction, display_text ?? "", communication_status)
    .run();

  return new Response(null, { status: 204 });
}

function buildFilterClause(url: URL): { where: string; params: unknown[] } {
  const siteId = url.searchParams.get("site_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (siteId) {
    clauses.push("site_id = ?");
    params.push(siteId);
  }
  if (from) {
    clauses.push("occurred_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("occurred_at <= ?");
    params.push(to);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

// 읽기 전용 조회 — 인증 없이 공개돼 있다(docs/cloud-dashboard-setup.md 참고).
async function handleLogs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));
  const { where, params } = buildFilterClause(url);

  const { results } = await env.DB.prepare(
    `SELECT id, site_id, daily_date, display_number, occurred_at, direction, display_text, communication_status, synced_at
     FROM log_records ${where} ORDER BY occurred_at DESC LIMIT ?`
  )
    .bind(...params, limit)
    .all();

  return json({ log_records: results });
}

// 대시보드의 사이트 선택 드롭다운용 — 지금까지 들어온 site_id 목록.
async function handleSites(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT site_id FROM log_records WHERE site_id IS NOT NULL AND site_id != '' ORDER BY site_id"
  ).all();
  const sites = (results as Array<{ site_id: string }>).map((r) => r.site_id);
  return json({ sites });
}

// TXT/CSV 다운로드. site_id + 기간(from/to, occurred_at 기준)으로 좁혀서 내려받는다.
async function handleExport(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "txt";
  const { where, params } = buildFilterClause(url);

  const { results } = await env.DB.prepare(
    `SELECT id, site_id, daily_date, display_number, occurred_at, direction, display_text, communication_status
     FROM log_records ${where} ORDER BY occurred_at ASC LIMIT 10000`
  )
    .bind(...params)
    .all();

  const rows = results as LogRow[];
  const siteLabel = url.searchParams.get("site_id") || "all";
  const filename = `cog-comm-log_${siteLabel}_${new Date().toISOString().slice(0, 10)}.${format}`;

  const body = format === "csv" ? toCsv(rows) : toTxt(rows);
  return new Response(body, {
    headers: {
      "content-type": format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function toTxt(rows: LogRow[]): string {
  const lines = rows.map((r) =>
    [r.display_number, r.site_id ?? "", escapeField(r.display_text), r.occurred_at, r.direction, r.communication_status].join(
      "\t"
    )
  );
  return lines.join("\r\n") + (lines.length ? "\r\n" : "");
}

function toCsv(rows: LogRow[]): string {
  const header = ["번호", "사이트", "데이터", "발생 일시", "방향", "통신 상태"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.display_number, r.site_id ?? "", r.display_text, r.occurred_at, r.direction, r.communication_status]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// 스펙 10.2 취지와 동일: =, +, -, @로 시작하면 수식으로 해석될 수 있으므로
// 선행 아포스트로피를 붙여 문자열로 고정한다(CSV는 셀 타입 지정이 불가능).
function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  const escaped = guarded.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function escapeField(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
