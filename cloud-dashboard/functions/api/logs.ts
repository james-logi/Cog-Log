interface Env {
  DB: D1Database;
}

// 읽기 전용 조회 — 인증 없이 공개할지, 뒤에 Cloudflare Access 등을 붙일지는
// 배포 시점에 정한다(docs/cloud-dashboard-setup.md 참고).
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));

  const { results } = await context.env.DB.prepare(
    "SELECT id, daily_date, display_number, occurred_at, direction, display_text, communication_status, synced_at FROM log_records ORDER BY occurred_at DESC LIMIT ?1"
  )
    .bind(limit)
    .all();

  return new Response(JSON.stringify({ log_records: results }), {
    headers: { "content-type": "application/json" },
  });
};
