import fs from "node:fs";
import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { recordAudit } from "../audit/log.js";
import { getOrCreateConnectionProfile, saveConnectionProfile, type ConnectionProfileInput } from "../db/connectionProfile.js";
import { getOrCreateStorageSettings, saveStorageSettings, type StorageSettings } from "../db/storageSettings.js";
import { tcpManager } from "../tcp/manager.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const DELIMITER_KINDS = new Set(["CR", "LF", "CRLF", "CUSTOM"]);
const MODES = new Set(["SERVER", "CLIENT"]);

function validateInput(body: unknown): ConnectionProfileInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (!MODES.has(b.mode as string)) return null;
  if (!Number.isInteger(b.port) || (b.port as number) < 1 || (b.port as number) > 65535) return null;
  if (typeof b.encoding !== "string" || !b.encoding) return null;
  if (!DELIMITER_KINDS.has(b.delimiterKind as string)) return null;
  if (b.delimiterKind === "CUSTOM" && (typeof b.customDelimiter !== "string" || !b.customDelimiter)) return null;
  if (b.mode === "CLIENT" && (typeof b.targetHost !== "string" || !b.targetHost)) return null;
  for (const key of ["maxMessageBytes", "connectTimeoutMs", "readIdleTimeoutMs", "reconnectInitialMs", "reconnectMaxMs"]) {
    if (!Number.isInteger(b[key]) || (b[key] as number) <= 0) return null;
  }

  return {
    mode: b.mode as "SERVER" | "CLIENT",
    bindAddress: typeof b.bindAddress === "string" ? b.bindAddress : undefined,
    targetHost: typeof b.targetHost === "string" ? b.targetHost : undefined,
    port: b.port as number,
    encoding: b.encoding,
    delimiterKind: b.delimiterKind as ConnectionProfileInput["delimiterKind"],
    customDelimiter: typeof b.customDelimiter === "string" ? b.customDelimiter : undefined,
    maxMessageBytes: b.maxMessageBytes as number,
    connectTimeoutMs: b.connectTimeoutMs as number,
    readIdleTimeoutMs: b.readIdleTimeoutMs as number,
    reconnectEnabled: Boolean(b.reconnectEnabled),
    reconnectInitialMs: b.reconnectInitialMs as number,
    reconnectMaxMs: b.reconnectMaxMs as number,
  };
}

settingsRouter.get("/connection", (_req, res) => {
  res.json({ profile: getOrCreateConnectionProfile() });
});

// TCP-05: 실행 중 변경 시 재시작이 필요함을 응답의 running 플래그로 안내한다.
// 실제 재시작 확인/실행은 프런트엔드가 /api/connection/stop → /start로 수행한다.
settingsRouter.put("/connection", requireRole("ADMIN", "OPERATOR"), (req, res) => {
  const input = validateInput(req.body);
  if (!input) return res.status(400).json({ error: "invalid_request" });

  const wasRunning = tcpManager.getInfo().status !== "STOPPED";
  const profile = saveConnectionProfile(input);
  recordAudit(req, {
    userId: req.user!.id,
    action: "settings.connection_update",
    changeSummary: `mode=${profile.mode}, port=${profile.port}`,
    success: true,
  });
  res.json({ profile, running: wasRunning });
});

function validateStorageInput(body: unknown): StorageSettings | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.allowedRootPath !== "string" || !b.allowedRootPath.trim()) return null;
  if (typeof b.filenamePattern !== "string" || !b.filenamePattern.trim()) return null;
  if (typeof b.timezone !== "string" || !b.timezone.trim()) return null;
  if (b.retentionPolicy !== undefined && b.retentionPolicy !== null && typeof b.retentionPolicy !== "string") {
    return null;
  }

  return {
    allowedRootPath: b.allowedRootPath.trim(),
    txtEnabled: Boolean(b.txtEnabled),
    xlsxEnabled: Boolean(b.xlsxEnabled),
    filenamePattern: b.filenamePattern.trim(),
    timezone: b.timezone.trim(),
    retentionPolicy: typeof b.retentionPolicy === "string" && b.retentionPolicy.trim() ? b.retentionPolicy.trim() : null,
  };
}

settingsRouter.get("/storage", (_req, res) => {
  res.json({ settings: getOrCreateStorageSettings() });
});

// LOG-04: 경로 존재/쓰기 권한을 저장 시점에 확인한다(없으면 생성 시도).
// 실제 TXT/XLSX 쓰기 큐는 5단계(파일 Export)에서 이 설정을 사용한다.
settingsRouter.put("/storage", requireRole("ADMIN", "OPERATOR"), (req, res) => {
  const input = validateStorageInput(req.body);
  if (!input) return res.status(400).json({ error: "invalid_request" });

  try {
    fs.mkdirSync(input.allowedRootPath, { recursive: true });
    fs.accessSync(input.allowedRootPath, fs.constants.W_OK);
  } catch (err) {
    recordAudit(req, {
      userId: req.user!.id,
      action: "settings.storage_update",
      changeSummary: (err as Error).message,
      success: false,
    });
    return res.status(400).json({ error: "path_not_writable", message: (err as Error).message });
  }

  const settings = saveStorageSettings(input);
  recordAudit(req, {
    userId: req.user!.id,
    action: "settings.storage_update",
    changeSummary: `path=${settings.allowedRootPath}, txt=${settings.txtEnabled}, xlsx=${settings.xlsxEnabled}`,
    success: true,
  });
  res.json({ settings });
});
