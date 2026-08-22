import { Route, Routes } from "react-router-dom";
import { Layout } from "./Layout.js";
import { RequireAuth, RequireRole } from "./auth/RouteGuards.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { AuditLogPage } from "./pages/AuditLogPage.js";
import { MonitorPage } from "./pages/MonitorPage.js";
import { ConnectionSettingsPage } from "./pages/ConnectionSettingsPage.js";
import { StorageSettingsPage } from "./pages/StorageSettingsPage.js";
import { LogsPage, SystemStatusPage } from "./pages/stubs.js";

// 화면 접근 역할은 스펙 3장(사용자와 권한) 표 기준.
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route element={<RequireRole roles={["ADMIN", "OPERATOR"]} />}>
            <Route path="/connection-settings" element={<ConnectionSettingsPage />} />
            <Route path="/storage-settings" element={<StorageSettingsPage />} />
            <Route path="/system-status" element={<SystemStatusPage />} />
          </Route>
          <Route element={<RequireRole roles={["ADMIN"]} />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit-logs" element={<AuditLogPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
