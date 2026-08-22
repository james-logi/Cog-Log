import path from "node:path";
import { getDb } from "./connection.js";

const SETTINGS_ID = "default";

export interface StorageSettings {
  allowedRootPath: string;
  txtEnabled: boolean;
  xlsxEnabled: boolean;
  filenamePattern: string;
  timezone: string;
  retentionPolicy: string | null;
}

interface StorageSettingsRow {
  allowed_root_path: string;
  txt_enabled: number;
  xlsx_enabled: number;
  filename_pattern: string;
  timezone: string;
  retention_policy: string | null;
}

function rowToSettings(row: StorageSettingsRow): StorageSettings {
  return {
    allowedRootPath: row.allowed_root_path,
    txtEnabled: !!row.txt_enabled,
    xlsxEnabled: !!row.xlsx_enabled,
    filenamePattern: row.filename_pattern,
    timezone: row.timezone,
    retentionPolicy: row.retention_policy,
  };
}

export function getOrCreateStorageSettings(): StorageSettings {
  const db = getDb();
  let row = db.prepare("SELECT * FROM storage_settings WHERE id = ?").get(SETTINGS_ID) as
    | StorageSettingsRow
    | undefined;
  if (!row) {
    // 스펙 14장 기본값: 백엔드 데이터 디렉터리 아래 logs, TXT ON / XLSX OFF
    const defaultRoot = path.resolve("data/logs");
    db.prepare(
      `INSERT INTO storage_settings (id, allowed_root_path, txt_enabled, xlsx_enabled, filename_pattern, timezone)
       VALUES (?, ?, 1, 0, 'VisionLog_YYYY-MM-DD', 'Asia/Seoul')`
    ).run(SETTINGS_ID, defaultRoot);
    row = db.prepare("SELECT * FROM storage_settings WHERE id = ?").get(SETTINGS_ID) as StorageSettingsRow;
  }
  return rowToSettings(row);
}

export function saveStorageSettings(input: StorageSettings): StorageSettings {
  const db = getDb();
  db.prepare(
    `INSERT INTO storage_settings (id, allowed_root_path, txt_enabled, xlsx_enabled, filename_pattern, timezone, retention_policy, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       allowed_root_path = excluded.allowed_root_path,
       txt_enabled = excluded.txt_enabled,
       xlsx_enabled = excluded.xlsx_enabled,
       filename_pattern = excluded.filename_pattern,
       timezone = excluded.timezone,
       retention_policy = excluded.retention_policy,
       updated_at = datetime('now')`
  ).run(
    SETTINGS_ID,
    input.allowedRootPath,
    input.txtEnabled ? 1 : 0,
    input.xlsxEnabled ? 1 : 0,
    input.filenamePattern,
    input.timezone,
    input.retentionPolicy
  );
  return getOrCreateStorageSettings();
}
