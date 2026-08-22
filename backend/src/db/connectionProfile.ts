import { getDb } from "./connection.js";
import type { ConnectionProfile } from "../tcp/types.js";

// MVP는 단일 통신 설정만 다룬다(스펙 6.3 "MVP 기본은 단일"과 동일한 단순화 전제).
// 복수 프로필/복수 클라이언트 지원은 17장 확정 후 확장한다.
const DEFAULT_PROFILE_ID = "default";
const KNOWN_DELIMITERS = new Set(["CR", "LF", "CRLF"]);

interface ProfileRow {
  id: string;
  mode: "SERVER" | "CLIENT";
  bind_address: string | null;
  target_host: string | null;
  port: number;
  encoding: string;
  delimiter: string;
  max_message_bytes: number;
  connect_timeout_ms: number;
  read_idle_timeout_ms: number;
  reconnect_enabled: number;
  reconnect_initial_ms: number;
  reconnect_max_ms: number;
}

export interface ConnectionProfileInput {
  mode: "SERVER" | "CLIENT";
  bindAddress?: string;
  targetHost?: string;
  port: number;
  encoding: string;
  delimiterKind: "CR" | "LF" | "CRLF" | "CUSTOM";
  customDelimiter?: string;
  maxMessageBytes: number;
  connectTimeoutMs: number;
  readIdleTimeoutMs: number;
  reconnectEnabled: boolean;
  reconnectInitialMs: number;
  reconnectMaxMs: number;
}

function rowToProfile(row: ProfileRow): ConnectionProfile {
  const kind = KNOWN_DELIMITERS.has(row.delimiter) ? (row.delimiter as "CR" | "LF" | "CRLF") : "CUSTOM";
  return {
    id: row.id,
    mode: row.mode,
    bindAddress: row.bind_address ?? undefined,
    targetHost: row.target_host ?? undefined,
    port: row.port,
    encoding: row.encoding,
    delimiterKind: kind,
    customDelimiter: kind === "CUSTOM" ? row.delimiter : undefined,
    maxMessageBytes: row.max_message_bytes,
    connectTimeoutMs: row.connect_timeout_ms,
    readIdleTimeoutMs: row.read_idle_timeout_ms,
    reconnectEnabled: !!row.reconnect_enabled,
    reconnectInitialMs: row.reconnect_initial_ms,
    reconnectMaxMs: row.reconnect_max_ms,
  };
}

export function getOrCreateConnectionProfile(): ConnectionProfile {
  const db = getDb();
  let row = db.prepare("SELECT * FROM connection_profiles WHERE id = ?").get(DEFAULT_PROFILE_ID) as
    | ProfileRow
    | undefined;
  if (!row) {
    // 스펙 14장 기본값
    db.prepare(
      `INSERT INTO connection_profiles (id, mode, bind_address, port, is_active) VALUES (?, 'SERVER', '0.0.0.0', 5000, 1)`
    ).run(DEFAULT_PROFILE_ID);
    row = db.prepare("SELECT * FROM connection_profiles WHERE id = ?").get(DEFAULT_PROFILE_ID) as ProfileRow;
  }
  return rowToProfile(row);
}

export function saveConnectionProfile(input: ConnectionProfileInput): ConnectionProfile {
  const db = getDb();
  const delimiterValue = input.delimiterKind === "CUSTOM" ? input.customDelimiter ?? "" : input.delimiterKind;

  db.prepare(
    `INSERT INTO connection_profiles (
       id, mode, bind_address, target_host, port, encoding, delimiter, max_message_bytes,
       connect_timeout_ms, read_idle_timeout_ms, reconnect_enabled, reconnect_initial_ms, reconnect_max_ms,
       is_active, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode, bind_address = excluded.bind_address, target_host = excluded.target_host,
       port = excluded.port, encoding = excluded.encoding, delimiter = excluded.delimiter,
       max_message_bytes = excluded.max_message_bytes, connect_timeout_ms = excluded.connect_timeout_ms,
       read_idle_timeout_ms = excluded.read_idle_timeout_ms, reconnect_enabled = excluded.reconnect_enabled,
       reconnect_initial_ms = excluded.reconnect_initial_ms, reconnect_max_ms = excluded.reconnect_max_ms,
       updated_at = datetime('now')`
  ).run(
    DEFAULT_PROFILE_ID,
    input.mode,
    input.bindAddress ?? null,
    input.targetHost ?? null,
    input.port,
    input.encoding,
    delimiterValue,
    input.maxMessageBytes,
    input.connectTimeoutMs,
    input.readIdleTimeoutMs,
    input.reconnectEnabled ? 1 : 0,
    input.reconnectInitialMs,
    input.reconnectMaxMs
  );

  return getOrCreateConnectionProfile();
}
