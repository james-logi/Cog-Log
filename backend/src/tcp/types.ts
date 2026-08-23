// TCP adapter contracts (spec sections 5.1, 6.2-6.4).
// Server/Client 구현은 serverAdapter.ts / clientAdapter.ts, 프레이밍은
// framer.ts, DB/실시간 연동은 manager.ts를 참고.

export type ConnectionStatus =
  | "STOPPED"
  | "LISTENING"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "ERROR";

export type DelimiterKind = "CR" | "LF" | "CRLF" | "CUSTOM";

export interface ConnectionProfile {
  id: string;
  mode: "SERVER" | "CLIENT";
  bindAddress?: string;
  targetHost?: string;
  port: number;
  encoding: string;
  delimiterKind: DelimiterKind;
  customDelimiter?: string;
  maxMessageBytes: number;
  connectTimeoutMs: number;
  readIdleTimeoutMs: number;
  reconnectEnabled: boolean;
  reconnectInitialMs: number;
  reconnectMaxMs: number;
  siteId?: string;
  cloudSyncEnabled: boolean;
}

export interface ConnectionInfo {
  status: ConnectionStatus;
  mode: "SERVER" | "CLIENT";
  peerAddress?: string;
  peerPort?: number;
  lastError?: string;
  lastRxAt?: string;
  lastTxAt?: string;
  reconnectAttempt?: number;
  nextRetryAt?: string;
}

// 수신 바이트 스트림을 완전한 메시지로 재조립한다(TCP-04: 분할/병합 패킷 처리).
export interface MessageFramer {
  push(chunk: Buffer): void;
  onMessage(handler: (message: Buffer) => void): void;
  onError(handler: (error: Error) => void): void;
  reset(): void;
}

export interface TcpAdapter {
  start(profile: ConnectionProfile): Promise<void>;
  stop(): Promise<void>;
  send(data: Buffer): Promise<void>;
  getInfo(): ConnectionInfo;
  onStatusChange(handler: (info: ConnectionInfo) => void): void;
  onMessage(handler: (message: Buffer) => void): void;
}
