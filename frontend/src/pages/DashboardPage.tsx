import { useEffect, useState } from "react";

interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
}

export function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError("백엔드에 연결할 수 없습니다."));
  }, []);

  return (
    <section>
      <h1>대시보드</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>! {error}</p>}
      {health && (
        <p style={{ color: "var(--color-success)" }}>
          ● 백엔드 연결됨 · DB {health.db} · {health.timestamp}
        </p>
      )}
      {!health && !error && <p style={{ color: "var(--color-text-muted)" }}>확인 중...</p>}
    </section>
  );
}
