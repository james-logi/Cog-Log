import { useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../lib/api.js";
import { PROGRAM_ATTRIBUTION, PROGRAM_NAME } from "../branding.js";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 423) return "계정이 잠겼습니다. 잠시 후 다시 시도하세요.";
    if (err.status === 401) return "ID 또는 비밀번호가 올바르지 않습니다.";
  }
  return "로그인에 실패했습니다.";
}

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const from = (location.state as { from?: { pathname: string } })?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(loginId, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 320,
          padding: 32,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: 20 }}>{PROGRAM_NAME}</h1>
        <p style={{ marginTop: 0, marginBottom: 20, fontSize: 12, color: "var(--color-text-muted)" }}>
          {PROGRAM_ATTRIBUTION}
        </p>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", marginBottom: 4, color: "var(--color-text-muted)" }}>ID</span>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoFocus
            required
            style={inputStyle}
          />
        </label>
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", marginBottom: 4, color: "var(--color-text-muted)" }}>PASSWORD</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        {error && (
          <p style={{ color: "var(--color-danger)", marginTop: 0 }}>! {error}</p>
        )}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  background: "var(--color-surface-raised)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text-primary)",
};

const buttonStyle: CSSProperties = {
  width: "100%",
  padding: "10px 0",
  background: "var(--color-accent)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-bg)",
  fontWeight: 600,
  cursor: "pointer",
};
