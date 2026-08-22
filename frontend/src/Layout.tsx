import { NavLink, Outlet } from "react-router-dom";
import { useAuth, type Role } from "./auth/AuthContext.js";
import { PROGRAM_ATTRIBUTION, PROGRAM_NAME } from "./branding.js";

// 접근 역할은 스펙 3장(사용자와 권한) 표 기준.
const NAV_ITEMS: Array<{ to: string; label: string; roles?: Role[] }> = [
  { to: "/", label: "대시보드" },
  { to: "/monitor", label: "모니터링" },
  { to: "/connection-settings", label: "통신 설정", roles: ["ADMIN", "OPERATOR"] },
  { to: "/logs", label: "로그 조회" },
  { to: "/storage-settings", label: "저장 설정", roles: ["ADMIN", "OPERATOR"] },
  { to: "/users", label: "사용자 관리", roles: ["ADMIN"] },
  { to: "/audit-logs", label: "감사 로그", roles: ["ADMIN"] },
  { to: "/system-status", label: "시스템 상태", roles: ["ADMIN", "OPERATOR"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <strong style={{ color: "var(--color-accent)", letterSpacing: 1, fontSize: 16 }}>{PROGRAM_NAME}</strong>
        <span style={{ marginLeft: 12, color: "var(--color-text-muted)", fontSize: 12 }}>{PROGRAM_ATTRIBUTION}</span>
      </header>
      <div style={{ display: "flex", flex: 1 }}>
        <nav
          style={{
            width: 200,
            borderRight: "1px solid var(--color-border)",
            padding: "var(--space-unit)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 1 }}>
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                style={({ isActive }) => ({
                  display: "block",
                  padding: "8px 12px",
                  color: isActive ? "var(--color-accent)" : "var(--color-text-primary)",
                  textDecoration: "none",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
              {user?.display_name} ({user?.role})
            </div>
            <button
              onClick={() => void logout()}
              style={{
                marginTop: 8,
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-primary)",
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        </nav>
        <main style={{ flex: 1, padding: "calc(var(--space-unit) * 4)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
