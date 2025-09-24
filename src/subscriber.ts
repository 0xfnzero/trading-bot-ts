import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import {
  DexEvent,
  LatencyInfo,
  EventWithLatency,
  PumpSwapEvent,
  PumpFunTradeEvent,
  PumpFunCreateEvent,
  RaydiumSwapEvent,
  OrcaSwapEvent,
} from './types/events';

export interface SubscriberConfig {
  wsUrl?: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  messageBufferSize?: number;
}

export class EventSubscriber extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly config: Required<SubscriberConfig>;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private messageBuffer: string[] = [];

  constructor(config: SubscriberConfig | string = {}) {
    super();

    if (typeof config === 'string') {
      config = { wsUrl: config };
    }

    this.config = {
      wsUrl: config.wsUrl ?? 'ws://127.0.0.1:9001',
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000,
      messageBufferSize: config.messageBufferSize ?? 100,
    };

    this.setMaxListeners(50);
  }

  connect(): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    this.ws = new WebSocket(this.config.wsUrl);

    this.ws.on('open', () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.processBufferedMessages();
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      this.isConnecting = false;
      this.emit('error', err);
    });

    this.ws.on('close', (code: number, reason: string) => {
      this.isConnecting = false;
      this.emit('disconnected', { code, reason });
      this.attemptReconnect();
    });
  }

  private processBufferedMessages(): void {
    while (this.messageBuffer.length > 0) {
      const message = this.messageBuffer.shift()!;
      this.handleMessage(message);
    }
  }

  private handleMessage(data: WebSocket.Data | string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.messageBuffer.length < this.config.messageBufferSize) {
        this.messageBuffer.push(data.toString());
      }
      return;
    }

    const nowMs = performance.timeOrigin + performance.now();
    const clientRecvUs = Math.floor(nowMs * 1000);

    try {
      const rawEvent = JSON.parse(data.toString());
      const event = this.convertArraysInObject(rawEvent);

      const eventData = Object.values(event)[0] as any;
      const grpcRecvUs = eventData?.metadata?.grpc_recv_us as number | undefined;

      let latency: LatencyInfo | undefined;
      if (grpcRecvUs !== undefined) {
        const rawLatencyUs = clientRecvUs - grpcRecvUs;
        const latencyUs = Math.max(0, rawLatencyUs);
        const latencyMs = latencyUs / 1000;

        latency = {
          grpc_recv_us: grpcRecvUs,
          client_recv_us: clientRecvUs,
          latency_us: latencyUs,
          latency_ms: parseFloat(latencyMs.toFixed(2)),
        };
      }

      const eventWithLatency: EventWithLatency = {
        event: event as DexEvent,
        latency,
        timestamp: new Date(),
      };

      this.emit('event', eventWithLatency);
      this.emitSpecificEvent(event, latency);

    } catch (e: any) {
      this.emit('error', new Error(`Failed to parse message: ${e.message}`));
    }
  }

  private emitSpecificEvent(event: any, latency?: LatencyInfo): void {
    const eventMap = {
      PumpSwap: 'pumpswap',
      PumpFunTrade: 'pumpfun:trade',
      PumpFunCreate: 'pumpfun:create',
      RaydiumAmmV4Swap: 'raydium:ammv4',
      RaydiumClmmSwap: 'raydium:clmm',
      OrcaWhirlpoolSwap: 'orca:whirlpool',
    };

    for (const [eventKey, eventName] of Object.entries(eventMap)) {
      if (event[eventKey]) {
        this.emit(eventName, event[eventKey], latency);
        break;
      }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.emit('reconnecting', this.reconnectAttempts);
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.reconnectAttempts = this.config.maxReconnectAttempts;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageBuffer = [];
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    if (!this.ws) return 'DISCONNECTED';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getBufferedMessageCount(): number {
    return this.messageBuffer.length;
  }

  private pubkeyArrayToString(arr: number[]): string {
    try {
      const buffer = Buffer.from(arr);
      return new PublicKey(buffer).toBase58();
    } catch (e) {
      return arr.join(',');
    }
  }

  private signatureArrayToString(arr: number[]): string {
    try {
      const buffer = Buffer.from(arr);
      return bs58.encode(buffer);
    } catch (e) {
      return arr.join(',');
    }
  }

  private convertArraysInObject(obj: any, path: string = ''): any {
    if (Array.isArray(obj)) {
      // 优化：先检查长度再检查内容，避免不必要的every调用
      if (obj.length === 32 && this.isUint8Array(obj)) {
        return this.pubkeyArrayToString(obj);
      }
      if (obj.length === 64 && this.isUint8Array(obj) &&
          (path.endsWith('.signature') || path === 'signature')) {
        return this.signatureArrayToString(obj);
      }
      // 批量转换数组元素
      return obj.map((item, idx) => this.convertArraysInObject(item, `${path}[${idx}]`));
    } else if (obj && typeof obj === 'object' && obj.constructor === Object) {
      const converted: any = {};
      // 使用Object.keys避免重复遍历
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const newPath = path ? `${path}.${key}` : key;
        converted[key] = this.convertArraysInObject(obj[key], newPath);
      }
      return converted;
    }
    return obj;
  }

  private isUint8Array(arr: any[]): boolean {
    // 优化：使用位运算检查范围，更快
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i];
      if (typeof n !== 'number' || (n & 0xFF) !== n || n < 0) {
        return false;
      }
    }
    return true;
  }
}

export default EventSubscriber;