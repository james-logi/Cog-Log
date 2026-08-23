import { useState, type FormEvent } from "react";
import { apiFetch } from "../lib/api.js";

type FileStatus = "WRITING" | "SAVED" | "FAILED";

interface LogRow {
  id: string;
  display_number: string;
  occurred_at: string;
  direction: "TX" | "RX";
  display_text: string;
  communication_status: string;
  communication_error: string | null;
  txt_status?: FileStatus;
  xlsx_status?: FileStatus;
}

const FILE_STATUS_ICON: Record<FileStatus, string> = { WRITING: "…", SAVED: "✓", FAILED: "!" };
const FILE_STATUS_CLASS: Record<FileStatus, string> = {
  WRITING: "pill-neutral",
  SAVED: "pill-success",
  FAILED: "pill-danger",
};

interface Filters {
  q: string;
  direction: "" | "TX" | "RX";
  communication_status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { q: "", direction: "", communication_status: "", from: "", to: "" };

export function LogsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: "500" });
      if (filters.q.trim()) qs.set("q", filters.q.trim());
      if (filters.direction) qs.set("direction", filters.direction);
      if (filters.communication_status) qs.set("communication_status", filters.communication_status);
      if (filters.from) qs.set("from", `${filters.from} 00:00:00`);
      if (filters.to) qs.set("to", `${filters.to} 23:59:59`);
      const res = await apiFetch<{ log_records: LogRow[] }>(`/logs?${qs.toString()}`);
      // /logs는 화면 append용으로 오래된 순을 반환한다 — 조회 화면에서는 최신순이 자연스럽다.
      setRows([...res.log_records].reverse());
      setSearched(true);
    } catch {
      setError("로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>로그 조회</h1>
          <div className="page-subtitle">기간·방향·상태·문자열로 통신 기록 검색</div>
        </div>
      </div>
      {error && <div className="banner banner-danger">! {error}</div>}

      <form onSubmit={search} className="panel" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
        <label style={{ minWidth: 180, flex: 1 }}>
          데이터 문자열
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="포함된 텍스트로 검색"
          />
        </label>
        <label>
          방향
          <select value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value as Filters["direction"] })}>
            <option value="">전체</option>
            <option value="RX">RX</option>
            <option value="TX">TX</option>
          </select>
        </label>
        <label>
          통신 상태
          <select
            value={filters.communication_status}
            onChange={(e) => setFilters({ ...filters, communication_status: e.target.value })}
          >
            <option value="">전체</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="QUEUED">QUEUED</option>
            <option value="PROCESSING">PROCESSING</option>
          </select>
        </label>
        <label>
          시작일
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label>
          종료일
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "검색 중..." : "검색"}
        </button>
        <button type="button" onClick={reset}>
          초기화
        </button>
      </form>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>번호</th>
                <th>발생 일시</th>
                <th>방향</th>
                <th>데이터</th>
                <th>통신 상태</th>
                <th>TXT</th>
                <th>XLSX</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {r.display_number}
                  </td>
                  <td className="mono text-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {r.occurred_at}
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        color: r.direction === "RX" ? "var(--color-info)" : "var(--color-accent)",
                      }}
                    >
                      {r.direction}
                    </span>
                  </td>
                  <td className="mono" style={{ maxWidth: 380, wordBreak: "break-all" }}>
                    {r.display_text}
                  </td>
                  <td>
                    <span className={`pill ${r.communication_status === "FAILED" ? "pill-danger" : "pill-success"}`}>
                      {r.communication_status}
                    </span>
                  </td>
                  <td>
                    {r.txt_status && (
                      <span className={`pill ${FILE_STATUS_CLASS[r.txt_status]}`}>{FILE_STATUS_ICON[r.txt_status]}</span>
                    )}
                  </td>
                  <td>
                    {r.xlsx_status && (
                      <span className={`pill ${FILE_STATUS_CLASS[r.xlsx_status]}`}>{FILE_STATUS_ICON[r.xlsx_status]}</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted" style={{ padding: "24px 10px", textAlign: "center" }}>
                    {searched ? "조건에 맞는 로그가 없습니다." : "검색 조건을 입력하고 검색을 눌러주세요 (조건 없이도 최근 500건 조회 가능)."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
        최대 500건까지 조회됩니다. 파일 다운로드는 다음 단계에서 제공될 예정입니다.
      </p>
    </section>
  );
}
