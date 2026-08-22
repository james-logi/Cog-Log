import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../lib/api.js";

interface ConnectionProfile {
  mode: "SERVER" | "CLIENT";
  bindAddress?: string;
  targetHost?: string;
  port: number;
  encoding: string;
  delimiterKind: "CR" | "LF" | "CRLF" | "CUSTOM";
  customDelimiter?: string;
  maxMessageBytes: number;
  connectTimeoutMs: number;
  readIdleTimeoutMs: number;
  reconnectEnabled: boolean;
  reconnectInitialMs: number;
  reconnectMaxMs: number;
}

// 스펙 14장 기본값
const DEFAULT_PROFILE: ConnectionProfile = {
  mode: "SERVER",
  bindAddress: "0.0.0.0",
  targetHost: "",
  port: 5000,
  encoding: "UTF-8",
  delimiterKind: "CRLF",
  customDelimiter: "",
  maxMessageBytes: 1048576,
  connectTimeoutMs: 10000,
  readIdleTimeoutMs: 30000,
  reconnectEnabled: true,
  reconnectInitialMs: 5000,
  reconnectMaxMs: 60000,
};

export function ConnectionSettingsPage() {
  const [form, setForm] = useState<ConnectionProfile>(DEFAULT_PROFILE);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: ConnectionProfile }>("/settings/connection")
      .then((res) => setForm(res.profile))
      .catch(() => setError("설정을 불러오지 못했습니다."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ profile: ConnectionProfile; running: boolean }>("/settings/connection", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setForm(res.profile);
      setNeedsRestart(res.running);
      setNotice(res.running ? "저장됨 — 실행 중이던 연결에 반영하려면 재시작하세요." : "저장되었습니다.");
    } catch {
      setError("저장에 실패했습니다.");
    }
  }

  async function restart() {
    setRestarting(true);
    setError(null);
    try {
      await apiFetch("/connection/stop", { method: "POST" });
      await apiFetch("/connection/start", { method: "POST" });
      setNeedsRestart(false);
      setNotice("재시작되었습니다.");
    } catch {
      setError("재시작에 실패했습니다.");
    } finally {
      setRestarting(false);
    }
  }

  return (
    <section>
      <h1>통신 설정</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>! {error}</p>}
      {notice && <p style={{ color: "var(--color-success)" }}>{notice}</p>}
      {needsRestart && (
        <button onClick={() => void restart()} disabled={restarting}>
          지금 재시작
        </button>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 420, marginTop: 12 }}>
        <label>
          모드
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as "SERVER" | "CLIENT" })}>
            <option value="SERVER">SERVER</option>
            <option value="CLIENT">CLIENT</option>
          </select>
        </label>

        {form.mode === "SERVER" ? (
          <label>
            바인딩 IP
            <input value={form.bindAddress ?? ""} onChange={(e) => setForm({ ...form, bindAddress: e.target.value })} />
          </label>
        ) : (
          <label>
            대상 호스트/IP
            <input value={form.targetHost ?? ""} onChange={(e) => setForm({ ...form, targetHost: e.target.value })} required />
          </label>
        )}

        <label>
          포트
          <input
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
          />
        </label>

        <label>
          인코딩
          <input value={form.encoding} onChange={(e) => setForm({ ...form, encoding: e.target.value })} />
        </label>

        <label>
          구분자
          <select
            value={form.delimiterKind}
            onChange={(e) => setForm({ ...form, delimiterKind: e.target.value as ConnectionProfile["delimiterKind"] })}
          >
            <option value="CR">CR</option>
            <option value="LF">LF</option>
            <option value="CRLF">CRLF</option>
            <option value="CUSTOM">사용자 지정</option>
          </select>
        </label>
        {form.delimiterKind === "CUSTOM" && (
          <label>
            사용자 지정 구분자
            <input value={form.customDelimiter ?? ""} onChange={(e) => setForm({ ...form, customDelimiter: e.target.value })} />
          </label>
        )}

        <label>
          최대 메시지 크기(byte)
          <input
            type="number"
            value={form.maxMessageBytes}
            onChange={(e) => setForm({ ...form, maxMessageBytes: Number(e.target.value) })}
          />
        </label>

        {form.mode === "CLIENT" && (
          <label>
            연결 제한시간(ms)
            <input
              type="number"
              value={form.connectTimeoutMs}
              onChange={(e) => setForm({ ...form, connectTimeoutMs: Number(e.target.value) })}
            />
          </label>
        )}

        <label>
          읽기 유휴 제한시간(ms)
          <input
            type="number"
            value={form.readIdleTimeoutMs}
            onChange={(e) => setForm({ ...form, readIdleTimeoutMs: Number(e.target.value) })}
          />
        </label>

        {form.mode === "CLIENT" && (
          <>
            <label>
              <input
                type="checkbox"
                checked={form.reconnectEnabled}
                onChange={(e) => setForm({ ...form, reconnectEnabled: e.target.checked })}
              />{" "}
              자동 재접속
            </label>
            <label>
              재접속 시작 간격(ms)
              <input
                type="number"
                value={form.reconnectInitialMs}
                onChange={(e) => setForm({ ...form, reconnectInitialMs: Number(e.target.value) })}
              />
            </label>
            <label>
              재접속 최대 간격(ms)
              <input
                type="number"
                value={form.reconnectMaxMs}
                onChange={(e) => setForm({ ...form, reconnectMaxMs: Number(e.target.value) })}
              />
            </label>
          </>
        )}

        <button type="submit">저장</button>
      </form>
    </section>
  );
}
