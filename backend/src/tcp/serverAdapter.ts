import net from "node:net";
import { createFramer } from "./framer.js";
import type { ConnectionInfo, ConnectionProfile, MessageFramer, TcpAdapter } from "./types.js";

// 스펙 6.3: MVP 기본은 단일 클라이언트. 이미 연결된 클라이언트가 있으면
// 새 접속은 즉시 거부(소켓 종료)한다. 복수 클라이언트 정책은 17장 확정 후 추가.
export class TcpServerAdapter implements TcpAdapter {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private framer: MessageFramer | null = null;
  private profile: ConnectionProfile | null = null;
  private info: ConnectionInfo = { status: "STOPPED", mode: "SERVER" };
  private statusHandler: ((info: ConnectionInfo) => void) | null = null;
  private messageHandler: ((message: Buffer) => void) | null = null;

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
    if (this.server) await this.stop();
    this.profile = profile;

    await new Promise<void>((resolve, reject) => {
      const server = net.createServer((socket) => this.handleConnection(socket));
      server.once("error", (err: NodeJS.ErrnoException) => {
        this.setInfo({ status: "ERROR", mode: "SERVER", lastError: describeServerError(err) });
        reject(err);
      });
      server.listen(profile.port, profile.bindAddress ?? "0.0.0.0", () => {
        this.server = server;
        this.setInfo({ status: "LISTENING", mode: "SERVER", lastError: undefined });
        resolve();
      });
    });
  }

  private handleConnection(socket: net.Socket) {
    if (this.socket) {
      // 단일 클라이언트 정책: 이미 연결된 클라이언트가 있으면 신규 접속 거부
      socket.destroy();
      return;
    }

    this.socket = socket;
    this.framer = createFramer(this.profile!);
    this.framer.onMessage((message) => this.messageHandler?.(message));
    this.framer.onError((err) => this.setInfo({ lastError: err.message }));

    // OS 레벨에서 유휴 소켓이 NAT/방화벽에 의해 조용히 끊기지 않도록 TCP keepalive를 켠다.
    socket.setKeepAlive(true, 10_000);
    this.setInfo({
      status: "CONNECTED",
      mode: "SERVER",
      peerAddress: socket.remoteAddress,
      peerPort: socket.remotePort,
      lastError: undefined,
    });

    socket.on("data", (chunk) => {
      this.setInfo({ lastRxAt: new Date().toISOString() });
      this.framer?.push(chunk);
    });
    // 읽기 유휴 제한시간(readIdleTimeoutMs)은 스펙 14 기본값(30초)만 보관하고
    // 아직 강제 종료에는 쓰지 않는다. "종료 여부 설정 가능"에 대응하는 UI 토글이
    // 생기면 그때 socket.setTimeout으로 다시 연결한다.
    socket.on("error", (err) => this.setInfo({ lastError: err.message }));
    socket.on("close", () => {
      this.socket = null;
      this.framer = null;
      if (this.server) this.setInfo({ status: "LISTENING", peerAddress: undefined, peerPort: undefined });
    });
  }

  async send(data: Buffer): Promise<void> {
    if (!this.socket) throw new Error("no_active_connection");
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(data, (err) => {
        if (err) return reject(err);
        this.setInfo({ lastTxAt: new Date().toISOString() });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
    this.framer = null;
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.setInfo({ status: "STOPPED", peerAddress: undefined, peerPort: undefined });
  }
}

function describeServerError(err: NodeJS.ErrnoException): string {
  if (err.code === "EADDRINUSE") return "port_in_use";
  if (err.code === "EACCES") return "permission_denied";
  if (err.code === "EADDRNOTAVAIL") return "invalid_bind_address";
  return err.message;
}
