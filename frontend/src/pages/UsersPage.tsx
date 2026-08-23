import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";
import type { Role } from "../auth/AuthContext.js";

interface UserRow {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
  is_active: number;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
}

const ROLES: Role[] = ["ADMIN", "OPERATOR", "VIEWER"];

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ login_id: "", display_name: "", role: "OPERATOR" as Role, password: "" });
  const [creating, setCreating] = useState(false);

  async function reload() {
    try {
      const res = await apiFetch<{ users: UserRow[] }>("/users");
      setUsers(res.users);
    } catch {
      setError("사용자 목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreating(true);
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ login_id: "", display_name: "", role: "OPERATOR", password: "" });
      setNotice("사용자가 등록되었습니다.");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError && err.body && (err.body as { error?: string }).error === "login_id_taken"
        ? "이미 사용 중인 ID입니다."
        : "사용자 등록에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(id: string, patch: Partial<{ role: Role; is_active: boolean }>) {
    setError(null);
    try {
      await apiFetch(`/users/${id}`, { method: "PUT", body: JSON.stringify(patch) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError && err.body && (err.body as { error?: string }).error === "last_active_admin"
        ? "마지막 활성 Admin은 변경할 수 없습니다."
        : "사용자 수정에 실패했습니다.");
    }
  }

  async function deleteUser(id: string) {
    setError(null);
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.body && (err.body as { error?: string }).error === "cannot_delete_self") {
        setError("본인 계정은 삭제할 수 없습니다.");
      } else if (err instanceof ApiError && err.body && (err.body as { error?: string }).error === "last_active_admin") {
        setError("마지막 활성 Admin은 삭제할 수 없습니다.");
      } else {
        setError("사용자 삭제에 실패했습니다.");
      }
    }
  }

  async function resetPassword(id: string) {
    setError(null);
    try {
      const res = await apiFetch<{ temporary_password: string }>(`/users/${id}/reset-password`, { method: "POST" });
      setNotice(`임시 비밀번호: ${res.temporary_password} (한 번만 표시됩니다)`);
    } catch {
      setError("비밀번호 초기화에 실패했습니다.");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>사용자 관리</h1>
          <div className="page-subtitle">계정 등록 및 권한 관리</div>
        </div>
      </div>
      {error && <div className="banner banner-danger">! {error}</div>}
      {notice && <div className="banner banner-success">{notice}</div>}

      <form onSubmit={handleCreate} className="panel" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
        <label>
          ID
          <input value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })} required />
        </label>
        <label>
          이름
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
        </label>
        <label>
          역할
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          초기 비밀번호
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={creating}>
          등록
        </button>
      </form>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>이름</th>
              <th>역할</th>
              <th>활성</th>
              <th>잠금</th>
              <th>최근 로그인</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.login_id}</td>
                <td>{u.display_name}</td>
                <td>
                  <select value={u.role} onChange={(e) => void updateUser(u.id, { role: e.target.value as Role })}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!u.is_active}
                    onChange={(e) => void updateUser(u.id, { is_active: e.target.checked })}
                  />
                </td>
                <td>{u.locked_until ? <span className="pill pill-warning">잠김</span> : <span className="text-muted">-</span>}</td>
                <td className="mono text-secondary" style={{ fontSize: 12 }}>
                  {u.last_login_at ?? "-"}
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => void resetPassword(u.id)}>비밀번호 초기화</button>
                  <button onClick={() => void deleteUser(u.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
