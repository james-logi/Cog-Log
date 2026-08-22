import type { ConnectionProfile, MessageFramer } from "./types.js";

// TCP-03/04: CR/LF/CRLF/사용자 구분자 기준으로 스트림을 완전한 메시지로 분리한다.
// 고정 길이·길이 헤더 프레이밍은 스펙 17장 확정 후 별도 구현체로 추가한다.
export class DelimiterFramer implements MessageFramer {
  private buffer = Buffer.alloc(0);
  private readonly delimiter: Buffer;
  private readonly maxMessageBytes: number;
  private messageHandler: ((message: Buffer) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  constructor(delimiter: Buffer, maxMessageBytes: number) {
    if (delimiter.length === 0) throw new Error("delimiter must not be empty");
    this.delimiter = delimiter;
    this.maxMessageBytes = maxMessageBytes;
  }

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    let index: number;
    while ((index = this.buffer.indexOf(this.delimiter)) !== -1) {
      const message = this.buffer.subarray(0, index);
      this.buffer = this.buffer.subarray(index + this.delimiter.length);
      this.messageHandler?.(message);
    }

    // 과대 메시지(TCP-과대 메시지 처리): 구분자를 못 찾은 채 버퍼가 한도를 넘으면
    // 해당 데이터를 버리고 에러로 알린다. 연결 종료 여부는 매니저가 정책으로 결정한다.
    if (this.buffer.length > this.maxMessageBytes) {
      const droppedBytes = this.buffer.length;
      this.buffer = Buffer.alloc(0);
      this.errorHandler?.(new Error(`message_too_large: ${droppedBytes} bytes exceeded ${this.maxMessageBytes}`));
    }
  }

  onMessage(handler: (message: Buffer) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}

export function resolveDelimiterBytes(profile: Pick<ConnectionProfile, "delimiterKind" | "customDelimiter" | "encoding">): Buffer {
  switch (profile.delimiterKind) {
    case "CR":
      return Buffer.from("\r", "ascii");
    case "LF":
      return Buffer.from("\n", "ascii");
    case "CRLF":
      return Buffer.from("\r\n", "ascii");
    case "CUSTOM": {
      if (!profile.customDelimiter) throw new Error("customDelimiter is required when delimiterKind is CUSTOM");
      return Buffer.from(profile.customDelimiter, profile.encoding as BufferEncoding);
    }
    default:
      throw new Error(`unsupported delimiterKind: ${profile.delimiterKind as string}`);
  }
}

export function createFramer(profile: ConnectionProfile): MessageFramer {
  return new DelimiterFramer(resolveDelimiterBytes(profile), profile.maxMessageBytes);
}
