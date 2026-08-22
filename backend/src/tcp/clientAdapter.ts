import net from "node:net";
import { createFramer } from "./framer.js";
import type { ConnectionInfo, ConnectionProfile, MessageFramer, TcpAdapter } from "./types.js";

// 스펙 6.4: Client 모드 연결/재접속. 재접속 간격은 reconnectInitialMs에서
// 시작해 실패마다 2배씩 늘어나며 reconnectMaxMs로 상한된다(스펙 14 기본값 5→60초).
export class TcpClientAdapter implements TcpAdapter {
  private socket: net.Socket | null = null;
  private framer: MessageFramer | null = null;
  private profile: ConnectionProfile | null = null;
  private info: ConnectionInfo = { status: "STOPPED", mode: "CLIENT" };
  private statusHandler: ((info: ConnectionInfo) => void) | null = null;
  private messageHandler: ((message: Buffer) => void) | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectTimeoutTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private manualStop = false;

  onStatusChange(handler: (info: ConnectionInfo) => void): void {
    this.statusHandler = handler;
  }

  onMessage(handler: (message: Buffer) => void): void {
    this.messageHandler = handler;
  }

  getInfo(): ConnectionInfo {
    return this.info;
  }

  private setInfo(patch: Partial<ConnectionInfo>) {
    this.info = { ...this.info, ...patch };
    this.statusHandler?.(this.info);
  }

  async start(profile: ConnectionProfile): Promise<void> {
    if (!profile.targetHost) throw new Error("targetHost is required for CLIENT mode");
    this.profile = profile;
    this.manualStop = false;
    this.reconnectAttempt = 0;
    this.connect();
  }

  private connect() {
    const profile = this.profile!;
    this.setInfo({ status: "CONNECTING", mode: "CLIENT", lastError: undefined });

    const socket = new net.Socket();
    this.socket = socket;

    this.connectTimeoutTimer = setTimeout(() => {
      socket.destroy(new Error("connect_timeout"));
    }, profile.connectTimeoutMs);

    socket.once("connect", () => {
      if (this.connectTimeoutTimer) clearTimeout(this.connectTimeoutTimer);
      this.reconnectAttempt = 0;
      this.framer = createFramer(profile);
      this.framer.onMessage((message) => this.messageHandler?.(message));
      this.framer.onError((err) => this.setInfo({ lastError: err.message }));
      // OS 레벨에서 유휴 소켓이 NAT/방화벽에 의해 조용히 끊기지 않도록 TCP keepalive를 켠다.
      socket.setKeepAlive(true, 10_000);
      this.setInfo({
        status: "CONNECTED",
        peerAddress: socket.remoteAddress,
        peerPort: socket.remotePort,
        lastError: undefined,
        reconnectAttempt: 0,
        nextRetryAt: undefined,
      });
    });

    socket.on("data", (chunk) => {
      this.setInfo({ lastRxAt: new Date().toISOString() });
      this.framer?.push(chunk);
    });
    // 읽기 유휴 제한시간(readIdleTimeoutMs)은 스펙 14 기본값(30초)만 보관하고
    // 아직 강제 종료에는 쓰지 않는다. "종료 여부 설정 가능"에 대응하는 UI 토글이
    // 생기면 그때 socket.setTimeout으로 다시 연결한다.
    socket.on("error", (err: NodeJS.ErrnoException) => {
      this.setInfo({ lastError: describeClientError(err) });
    });
    socket.on("close", () => {
      if (this.connectTimeoutTimer) clearTimeout(this.connectTimeoutTimer);
      this.socket = null;
      this.framer = null;
      if (this.manualStop) return;
      this.scheduleReconnect();
    });

    socket.connect(profile.port, profile.targetHost!);
  }

  private scheduleReconnect() {
    const profile = this.profile!;
    if (!profile.reconnectEnabled) {
      this.setInfo({ status: "ERROR" });
      return;
    }
    this.reconnectAttempt += 1;
    const delay = Math.min(
      profile.reconnectInitialMs * 2 ** (this.reconnectAttempt - 1),
      profile.reconnectMaxMs
    );
    this.setInfo({
      status: "RECONNECTING",
      peerAddress: undefined,
      peerPort: undefined,
      reconnectAttempt: this.reconnectAttempt,
      nextRetryAt: new Date(Date.now() + delay).toISOString(),
    });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  async send(data: Buffer): Promise<void> {
    if (!this.socket || this.info.status !== "CONNECTED") throw new Error("no_active_connection");
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(data, (err) => {
        if (err) return reject(err);
        this.setInfo({ lastTxAt: new Date().toISOString() });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.manualStop = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimeoutTimer) clearTimeout(this.connectTimeoutTimer);
    this.socket?.destroy();
    this.socket = null;
    this.framer = null;
    this.setInfo({
      status: "STOPPED",
      peerAddress: undefined,
      peerPort: undefined,
      reconnectAttempt: undefined,
      nextRetryAt: undefined,
    });
  }
}

function describeClientError(err: NodeJS.ErrnoException): string {
  if (err.message === "connect_timeout") return "connect_timeout";
  if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") return "dns_failure";
  if (err.code === "ECONNREFUSED") return "connection_refused";
  if (err.code === "ETIMEDOUT") return "connect_timeout";
  return err.message;
}
