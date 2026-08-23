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
      <div className="page-header">
        <div>
          <h1>대시보드</h1>
          <div className="page-subtitle">시스템 상태 요약</div>
        </div>
      </div>

      {error && <div className="banner banner-danger">! {error}</div>}

      <div className="panel" style={{ maxWidth: 420 }}>
        <h3>백엔드 상태</h3>
        {health ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <div className="pill pill-success" style={{ width: "fit-content" }}>
              ● 연결됨
            </div>
            <div className="text-secondary" style={{ fontSize: 12 }}>
              DB 상태 <span className="mono">{health.db}</span>
            </div>
            <div className="text-muted mono" style={{ fontSize: 11 }}>
              {health.timestamp}
            </div>
          </div>
        ) : !error ? (
          <div className="pill pill-neutral" style={{ marginTop: 10, width: "fit-content" }}>
            확인 중...
          </div>
        ) : null}
      </div>

      <p className="text-muted" style={{ fontSize: 12, marginTop: 20 }}>
        통신 현황·저장 상태·최근 로그를 모은 대시보드는 다음 단계에서 채워질 예정입니다. 지금은
        왼쪽 메뉴의 모니터링/로그 조회 화면에서 확인해주세요.
      </p>
    </section>
  );
}
