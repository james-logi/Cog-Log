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

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "관리자",
  OPERATOR: "운영자",
  VIEWER: "조회자",
};

export function Layout() {
  const { user, logout } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-wordmark">{PROGRAM_NAME}</span>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {PROGRAM_ATTRIBUTION}
        </span>
      </header>
      <div className="app-body">
        <nav className="app-nav">
          <div>
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="user-card">
            <div className="user-card-name">
              <strong>{user?.display_name}</strong>
              <br />
              {user ? ROLE_LABEL[user.role] : ""}
            </div>
            <button onClick={() => void logout()} style={{ width: "100%" }}>
              로그아웃
            </button>
          </div>
        </nav>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
