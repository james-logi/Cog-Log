import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";
import { realtimeClient } from "../lib/realtime.js";
import { useAuth } from "../auth/AuthContext.js";

type ConnectionStatus = "STOPPED" | "LISTENING" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

interface ConnectionInfo {
  status: ConnectionStatus;
  mode: "SERVER" | "CLIENT";
  peerAddress?: string;
  peerPort?: number;
  lastError?: string;
  lastRxAt?: string;
  lastTxAt?: string;
  reconnectAttempt?: number;
  nextRetryAt?: string;
}

type FileStatus = "WRITING" | "SAVED" | "FAILED";

interface LogRecord {
  id: string;
  display_number: string;
  occurred_at: string;
  direction: "TX" | "RX";
  display_text: string;
  communication_status: string;
  communication_error: string | null;
  txtStatus?: FileStatus;
  xlsxStatus?: FileStatus;
}

interface FileUpdatedPayload {
  logRecordId: string;
  format: "TXT" | "XLSX";
  status: FileStatus;
  targetPath?: string;
  error?: string;
}

const FILE_STATUS_ICON: Record<FileStatus, string> = { WRITING: "…", SAVED: "✓", FAILED: "!" };
const FILE_STATUS_CLASS: Record<FileStatus, string> = {
  WRITING: "pill-neutral",
  SAVED: "pill-success",
  FAILED: "pill-danger",
};

// 스펙 5.1 표
const STATUS_LABEL: Record<ConnectionStatus, string> = {
  STOPPED: "중지",
  LISTENING: "수신 대기",
  CONNECTING: "연결 중",
  CONNECTED: "연결됨",
  RECONNECTING: "재연결 중",
  ERROR: "오류",
};
const STATUS_PILL_CLASS: Record<ConnectionStatus, string> = {
  STOPPED: "pill-neutral",
  LISTENING: "pill-info",
  CONNECTING: "pill-info",
  CONNECTED: "pill-success",
  RECONNECTING: "pill-warning",
  ERROR: "pill-danger",
};

const MAX_DISPLAY = 1000; // 스펙 14 기본값

export function MonitorPage() {
  const { user } = useAuth();
  const canControl = user?.role === "ADMIN" || user?.role === "OPERATOR";
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [sendText, setSendText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ info: ConnectionInfo }>("/connection/status")
      .then((res) => setInfo(res.info))
      .catch(() => setError("상태를 불러오지 못했습니다."));

    // 다른 화면에 갔다 돌아와도(또는 새로고침해도) 최근 기록이 다시 보이도록
    // DB에서 최근 로그를 먼저 불러온다.
    apiFetch<{
      log_records: Array<
        Omit<LogRecord, "txtStatus" | "xlsxStatus"> & { txt_status?: FileStatus; xlsx_status?: FileStatus }
      >;
    }>("/logs?limit=200")
      .then((res) => {
        setRecords(res.log_records.map(({ txt_status, xlsx_status, ...rest }) => ({
          ...rest,
          txtStatus: txt_status,
          xlsxStatus: xlsx_status,
        })));
      })
      .catch(() => {
        /* 로그 조회 실패는 조용히 무시 — 실시간 표시는 계속 동작한다 */
      });

    const unsubscribe = realtimeClient.subscribe((event) => {
      if (event.type === "connection.status") setInfo(event.payload as ConnectionInfo);
      if (event.type === "log.created") {
        const record = event.payload as LogRecord;
        // 개발 모드 StrictMode/HMR로 구독이 중복될 수 있어 id 기준으로 방어적으로 중복 제거한다.
        setRecords((prev) => (prev.some((r) => r.id === record.id) ? prev : [...prev.slice(-(MAX_DISPLAY - 1)), record]));
      }
      if (event.type === "log.file.updated") {
        const { logRecordId, format, status } = event.payload as FileUpdatedPayload;
        setRecords((prev) =>
          prev.map((r) =>
            r.id === logRecordId ? { ...r, [format === "TXT" ? "txtStatus" : "xlsxStatus"]: status } : r
          )
        );
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [records]);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ info: ConnectionInfo }>("/connection/start", { method: "POST" });
      setInfo(res.info);
    } catch (err) {
      setError(err instanceof ApiError ? `시작 실패: ${(err.body as { message?: string })?.message ?? err.message}` : "시작 실패");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ info: ConnectionInfo }>("/connection/stop", { method: "POST" });
      setInfo(res.info);
    } finally {
      setBusy(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!sendText) return;
    setError(null);
    try {
      await apiFetch("/connection/send", { method: "POST", body: JSON.stringify({ text: sendText }) });
      setSendText("");
    } catch (err) {
      setError(err instanceof ApiError ? "송신 실패: 연결 상태를 확인하세요." : "송신 실패");
    }
  }

  const status = info?.status ?? "STOPPED";

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>모니터링</h1>
          <div className="page-subtitle">실시간 통신 터미널</div>
        </div>
      </div>

      {error && <div className="banner banner-danger">! {error}</div>}

      <div
        className="panel"
        style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14, padding: "12px 16px" }}
      >
        <span className={`pill ${STATUS_PILL_CLASS[status]}`}>
          ● {STATUS_LABEL[status]} · {info?.mode ?? "-"}
        </span>
        {info?.peerAddress && (
          <span className="mono text-secondary" style={{ fontSize: 12 }}>
            {info.peerAddress}:{info.peerPort}
          </span>
        )}
        {info?.lastError && <span style={{ color: "var(--color-danger)", fontSize: 12 }}>! {info.lastError}</span>}
        {info?.status === "RECONNECTING" && (
          <span style={{ color: "var(--color-warning)", fontSize: 12 }}>
            재시도 {info.reconnectAttempt}회 · 다음 시도 {info.nextRetryAt}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {canControl && (
            <>
              <button onClick={() => void start()} disabled={busy || status !== "STOPPED"}>
                시작
              </button>
              <button onClick={() => void stop()} disabled={busy || status === "STOPPED"}>
                중지
              </button>
            </>
          )}
          <button onClick={() => setRecords([])} title="화면 표시만 지웁니다. DB/파일 기록은 그대로 유지됩니다.">
            화면 지우기
          </button>
        </div>
      </div>

      <div
        className="mono"
        style={{
          height: 440,
          overflowY: "auto",
          background: "var(--color-surface-sunken)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "10px 4px",
          fontSize: 12.5,
        }}
      >
        {records.length === 0 && (
          <div className="text-muted" style={{ padding: "8px 14px", fontFamily: "var(--font-ui)" }}>
            표시할 기록이 없습니다.
          </div>
        )}
        {records.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              padding: "3px 14px",
              borderLeft: `2px solid ${r.direction === "RX" ? "var(--color-info)" : "var(--color-accent)"}`,
            }}
          >
            <span className="text-muted" style={{ flexShrink: 0 }}>
              {r.occurred_at}
            </span>
            <span className="text-secondary" style={{ flexShrink: 0 }}>
              {r.display_number}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontWeight: 600,
                color: r.direction === "RX" ? "var(--color-info)" : "var(--color-accent)",
              }}
            >
              {r.direction}
            </span>
            <span style={{ color: "var(--color-text-primary)", wordBreak: "break-all" }}>{r.display_text}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
              {r.communication_status === "FAILED" && (
                <span className="pill pill-danger">! {r.communication_error}</span>
              )}
              {r.txtStatus && (
                <span className={`pill ${FILE_STATUS_CLASS[r.txtStatus]}`}>TXT {FILE_STATUS_ICON[r.txtStatus]}</span>
              )}
              {r.xlsxStatus && (
                <span className={`pill ${FILE_STATUS_CLASS[r.xlsxStatus]}`}>XLSX {FILE_STATUS_ICON[r.xlsxStatus]}</span>
              )}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <p className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
        최근 200건까지 자동으로 불러옵니다. 전체 검색·필터는 로그 조회 화면에서 제공됩니다.
      </p>

      {canControl && (
        <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
            placeholder="송신할 텍스트"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" disabled={status !== "CONNECTED"}>
            송신
          </button>
        </form>
      )}
    </section>
  );
}
