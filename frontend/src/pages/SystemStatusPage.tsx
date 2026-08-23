import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";

interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
}

interface ConnectionInfo {
  status: "STOPPED" | "LISTENING" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";
  mode: "SERVER" | "CLIENT";
  lastError?: string;
}

interface FileJobRow {
  format: "TXT" | "XLSX";
  save_status: "DISABLED" | "PENDING" | "WRITING" | "SAVED" | "FAILED";
}

const CONN_LABEL: Record<ConnectionInfo["status"], string> = {
  STOPPED: "중지",
  LISTENING: "수신 대기",
  CONNECTING: "연결 중",
  CONNECTED: "연결됨",
  RECONNECTING: "재연결 중",
  ERROR: "오류",
};
const CONN_PILL: Record<ConnectionInfo["status"], string> = {
  STOPPED: "pill-neutral",
  LISTENING: "pill-info",
  CONNECTING: "pill-info",
  CONNECTED: "pill-success",
  RECONNECTING: "pill-warning",
  ERROR: "pill-danger",
};

export function SystemStatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [jobs, setJobs] = useState<FileJobRow[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function refresh() {
    await Promise.all([
      fetch("/api/health")
        .then((res) => res.json())
        .then((data) => {
          setHealth(data);
          setHealthError(false);
        })
        .catch(() => setHealthError(true)),
      apiFetch<{ info: ConnectionInfo }>("/connection/status")
        .then((res) => setConn(res.info))
        .catch(() => setConn(null)),
      apiFetch<{ file_jobs: FileJobRow[] }>("/file-jobs")
        .then((res) => setJobs(res.file_jobs))
        .catch(() => setJobs([])),
    ]);
    setLastChecked(new Date());
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(interval);
  }, []);

  const pending = jobs.filter((j) => j.save_status === "PENDING" || j.save_status === "WRITING").length;
  const failed = jobs.filter((j) => j.save_status === "FAILED").length;
  const saved = jobs.filter((j) => j.save_status === "SAVED").length;

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>시스템 상태</h1>
          <div className="page-subtitle">서비스 · 통신 · 파일 큐 상태</div>
        </div>
        <button onClick={() => void refresh()}>새로고침</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div className="panel">
          <h3>백엔드 서비스</h3>
          {health && !healthError ? (
            <span className="pill pill-success" style={{ marginTop: 8 }}>
              ● 정상
            </span>
          ) : (
            <span className="pill pill-danger" style={{ marginTop: 8 }}>
              ! 연결 안 됨
            </span>
          )}
        </div>

        <div className="panel">
          <h3>데이터베이스</h3>
          {health ? (
            <span className={`pill ${health.db === "ok" ? "pill-success" : "pill-danger"}`} style={{ marginTop: 8 }}>
              {health.db === "ok" ? "● 정상" : "! 오류"}
            </span>
          ) : (
            <span className="pill pill-neutral" style={{ marginTop: 8 }}>
              확인 중
            </span>
          )}
        </div>

        <div className="panel">
          <h3>TCP 통신</h3>
          {conn ? (
            <>
              <span className={`pill ${CONN_PILL[conn.status]}`} style={{ marginTop: 8 }}>
                ● {CONN_LABEL[conn.status]} · {conn.mode}
              </span>
              {conn.lastError && (
                <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                  {conn.lastError}
                </div>
              )}
            </>
          ) : (
            <span className="pill pill-neutral" style={{ marginTop: 8 }}>
              확인 중
            </span>
          )}
        </div>

        <div className="panel">
          <h3>파일 저장 큐</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span className="pill pill-success">저장됨 {saved}</span>
            <span className="pill pill-info">대기/쓰는 중 {pending}</span>
            <span className={`pill ${failed > 0 ? "pill-danger" : "pill-neutral"}`}>실패 {failed}</span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
            최근 200건 기준
          </div>
        </div>
      </div>

      {lastChecked && (
        <p className="text-muted mono" style={{ fontSize: 11, marginTop: 16 }}>
          마지막 갱신 {lastChecked.toLocaleTimeString("ko-KR")} · 10초마다 자동 새로고침
        </p>
      )}
    </section>
  );
}
