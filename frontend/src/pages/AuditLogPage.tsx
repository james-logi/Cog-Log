import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  target: string | null;
  change_summary: string | null;
  ip_address: string | null;
  success: number;
  occurred_at: string;
}

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ audit_logs: AuditLogRow[] }>("/audit-logs")
      .then((res) => setRows(res.audit_logs))
      .catch(() => setError("감사 로그를 불러오지 못했습니다."));
  }, []);

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>감사 로그</h1>
          <div className="page-subtitle">로그인·사용자·설정·다운로드 이력</div>
        </div>
      </div>
      {error && <div className="banner banner-danger">! {error}</div>}

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>작업</th>
                <th>대상</th>
                <th>요약</th>
                <th>IP</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {r.occurred_at}
                  </td>
                  <td className="mono">{r.action}</td>
                  <td className="text-secondary">{r.target ?? "-"}</td>
                  <td className="text-secondary">{r.change_summary ?? "-"}</td>
                  <td className="mono text-muted">{r.ip_address ?? "-"}</td>
                  <td>
                    <span className={`pill ${r.success ? "pill-success" : "pill-danger"}`}>
                      {r.success ? "✓ 성공" : "! 실패"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="text-muted" style={{ padding: "20px 10px", textAlign: "center" }}>
                    기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
