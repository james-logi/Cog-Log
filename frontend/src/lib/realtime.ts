// 백엔드 realtime/hub.ts가 방송하는 이벤트를 구독하는 싱글턴 WS 클라이언트.
// connection.status, log.created 등(스펙 15장)을 그대로 전달한다.
export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

type Listener = (event: RealtimeEvent) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: number | null = null;

  private connect() {
    if (this.ws) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        this.listeners.forEach((listener) => listener(parsed));
      } catch {
        // 잘못된 페이로드는 무시
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.listeners.size > 0) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
      }
    };
    this.ws = ws;
  }

  subscribe(listener: Listener): () => void {
    this.connect();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    };
  }
}

export const realtimeClient = new RealtimeClient();
