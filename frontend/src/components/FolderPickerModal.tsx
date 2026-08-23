import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "../lib/api.js";

interface Entry {
  name: string;
  path: string;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: Entry[];
}

interface Props {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function FolderPickerModal({ initialPath, onSelect, onClose }: Props) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  function load(nextPath: string) {
    setError(null);
    apiFetch<BrowseResponse>(`/fs/browse?path=${encodeURIComponent(nextPath)}`)
      .then(setData)
      .catch(() => setError("폴더를 불러오지 못했습니다."));
  }

  useEffect(() => {
    load(initialPath ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createFolder() {
    if (!data?.path || !newFolderName.trim()) return;
    try {
      await apiFetch("/fs/mkdir", {
        method: "POST",
        body: JSON.stringify({ path: data.path, name: newFolderName.trim() }),
      });
      setNewFolderName("");
      load(data.path);
    } catch {
      setError("폴더를 만들지 못했습니다.");
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>저장 폴더 선택</h2>
        <p className="mono text-muted" style={{ fontSize: 12, wordBreak: "break-all" }}>
          {data?.path || "드라이브를 선택하세요"}
        </p>
        {error && <div className="banner banner-danger">! {error}</div>}

        <div style={listStyle}>
          {data?.path && (
            <div className="folder-item" onClick={() => load(data.parent ?? "")}>
              ↰ 상위 폴더
            </div>
          )}
          {data?.entries.map((entry) => (
            <div key={entry.path} className="folder-item" onClick={() => load(entry.path)}>
              📁 {entry.name}
            </div>
          ))}
          {data && data.entries.length === 0 && (
            <div className="text-muted" style={{ padding: 10, fontSize: 12 }}>
              하위 폴더 없음
            </div>
          )}
        </div>

        {data?.path && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="새 폴더 이름"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => void createFolder()} disabled={!newFolderName.trim()}>
              폴더 만들기
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!data?.path}
            onClick={() => data?.path && onSelect(data.path)}
          >
            이 폴더 선택
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: CSSProperties = {
  width: 480,
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-panel)",
  padding: 20,
};

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  background: "var(--color-surface-sunken)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-sm)",
  minHeight: 240,
  maxHeight: 320,
};
