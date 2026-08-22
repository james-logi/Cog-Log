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
      <h1>감사 로그</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>! {error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
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
            <tr key={r.id} style={{ borderBottom: "1px solid var(--color-surface-raised)" }}>
              <td>{r.occurred_at}</td>
              <td>{r.action}</td>
              <td>{r.target ?? "-"}</td>
              <td>{r.change_summary ?? "-"}</td>
              <td>{r.ip_address ?? "-"}</td>
              <td style={{ color: r.success ? "var(--color-success)" : "var(--color-danger)" }}>
                {r.success ? "✓ 성공" : "! 실패"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
