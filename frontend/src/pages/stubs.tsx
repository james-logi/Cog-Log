import { PagePlaceholder } from "./PagePlaceholder.js";

// Placeholder pages for spec section 7 (화면 목록) screens not yet built.
// UsersPage/AuditLogPage/MonitorPage/ConnectionSettingsPage/StorageSettingsPage는 실제 구현으로 대체됨.
// 일정 관리는 당분간 메뉴에서 제외(사용자 요청) — 백엔드 /api/schedules는 그대로 501 유지.
export const LogsPage = () => <PagePlaceholder title="로그 조회" />;
export const SystemStatusPage = () => <PagePlaceholder title="시스템 상태" />;
