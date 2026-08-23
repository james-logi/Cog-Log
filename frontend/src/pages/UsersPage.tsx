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
      <h1>사용자 관리</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>! {error}</p>}
      {notice && <p style={{ color: "var(--color-success)" }}>{notice}</p>}

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 24 }}>
        <label>
          <div>ID</div>
          <input value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })} required />
        </label>
        <label>
          <div>이름</div>
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
        </label>
        <label>
          <div>역할</div>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div>초기 비밀번호</div>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
        </label>
        <button type="submit" disabled={creating}>
          등록
        </button>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
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
            <tr key={u.id} style={{ borderBottom: "1px solid var(--color-surface-raised)" }}>
              <td>{u.login_id}</td>
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
              <td>{u.locked_until ? "잠김" : "-"}</td>
              <td>{u.last_login_at ?? "-"}</td>
              <td>
                <button onClick={() => void resetPassword(u.id)}>비밀번호 초기화</button>{" "}
                <button onClick={() => void deleteUser(u.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
