import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "../lib/api.js";
import { FolderPickerModal } from "../components/FolderPickerModal.js";

interface StorageSettings {
  allowedRootPath: string;
  txtEnabled: boolean;
  xlsxEnabled: boolean;
  filenamePattern: string;
  timezone: string;
  retentionPolicy: string | null;
}

// 스펙 14장 기본값
const DEFAULT_SETTINGS: StorageSettings = {
  allowedRootPath: "",
  txtEnabled: true,
  xlsxEnabled: false,
  filenamePattern: "VisionLog_YYYY-MM-DD",
  timezone: "Asia/Seoul",
  retentionPolicy: "",
};

export function StorageSettingsPage() {
  const [form, setForm] = useState<StorageSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ settings: StorageSettings }>("/settings/storage")
      .then((res) => setForm({ ...res.settings, retentionPolicy: res.settings.retentionPolicy ?? "" }))
      .catch(() => setError("설정을 불러오지 못했습니다."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ settings: StorageSettings }>("/settings/storage", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setForm({ ...res.settings, retentionPolicy: res.settings.retentionPolicy ?? "" });
      setNotice("저장되었습니다.");
    } catch (err) {
      if (err instanceof ApiError && (err.body as { error?: string })?.error === "path_not_writable") {
        setError(`저장 경로에 쓸 수 없습니다: ${(err.body as { message?: string }).message ?? ""}`);
      } else {
        setError("저장에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h1>저장 설정</h1>
      {error && <p style={{ color: "var(--color-danger)" }}>! {error}</p>}
      {notice && <p style={{ color: "var(--color-success)" }}>{notice}</p>}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label>
          <input
            type="checkbox"
            checked={form.txtEnabled}
            onChange={(e) => setForm({ ...form, txtEnabled: e.target.checked })}
          />{" "}
          TXT 저장
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.xlsxEnabled}
            onChange={(e) => setForm({ ...form, xlsxEnabled: e.target.checked })}
          />{" "}
          XLSX 저장
        </label>

        <label>
          저장 경로 (백엔드 PC 기준)
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={form.allowedRootPath}
              readOnly
              placeholder="폴더 선택 버튼으로 지정하세요"
              style={{ flex: 1, background: "var(--color-surface-raised)", cursor: "not-allowed" }}
            />
            <button type="button" onClick={() => setPickerOpen(true)}>
              폴더 선택
            </button>
          </div>
        </label>

        <label>
          파일명 패턴
          <input
            value={form.filenamePattern}
            onChange={(e) => setForm({ ...form, filenamePattern: e.target.value })}
          />
        </label>

        <label>
          시간대
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
        </label>

        <label>
          보존 정책 메모 (참고용, 자동 삭제는 아직 동작하지 않음)
          <input
            value={form.retentionPolicy ?? ""}
            onChange={(e) => setForm({ ...form, retentionPolicy: e.target.value })}
            placeholder="예: 90일 (현재는 저장만 되고 자동 삭제는 미구현)"
          />
        </label>

        <button type="submit" disabled={saving}>
          저장
        </button>
      </form>

      <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 12 }}>
        TXT/XLSX 파일은 이 설정에 따라 실시간으로 기록됩니다. 보존 정책에 따른 자동 삭제만 아직 미구현입니다
        (스펙 LOG-13, Admin 권한·감사 로그 필요).
      </p>

      {pickerOpen && (
        <FolderPickerModal
          initialPath={form.allowedRootPath}
          onClose={() => setPickerOpen(false)}
          onSelect={(path) => {
            setForm({ ...form, allowedRootPath: path });
            setPickerOpen(false);
          }}
        />
      )}
    </section>
  );
}
