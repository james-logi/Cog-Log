import { useState, type FormEvent } from "react";
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
        background:
          "radial-gradient(circle at 50% -10%, rgba(255,195,0,0.06), transparent 45%), var(--color-bg)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="panel"
        style={{
          width: 340,
          padding: "30px 32px 32px",
          borderTop: "2px solid var(--color-accent)",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        <div className="app-wordmark" style={{ fontSize: 18, marginBottom: 2 }}>
          {PROGRAM_NAME}
        </div>
        <p className="text-muted" style={{ fontSize: 11, marginBottom: 24 }}>
          {PROGRAM_ATTRIBUTION}
        </p>

        <div className="field-grid" style={{ marginBottom: error ? 12 : 22 }}>
          <label>
            ID
            <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus required />
          </label>
          <label>
            PASSWORD
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>

        {error && <div className="banner banner-danger">! {error}</div>}

        <button type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
