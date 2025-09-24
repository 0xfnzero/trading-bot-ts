import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PumpSwapEvent, LatencyInfo } from './types';

export class EventSubscriber extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string;

  constructor(wsUrl?: string) {
    super();
    this.wsUrl = wsUrl || process.env.WS_URL || 'ws://127.0.0.1:9001';
  }

  connect(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('✅ Connected to trading data stream');
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleEvent(event);
      } catch (e) {
        console.error('Failed to parse event:', e);
      }
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
      this.emit('error', err);
    });

    this.ws.on('close', () => {
      console.log('🔌 Disconnected from server');
      this.emit('disconnected');
    });
  }

  private handleEvent(event: any): void {
    const nowUs = Date.now() * 1000;
    const eventData = Object.values(event)[0] as any;
    const grpcRecvUs = eventData?.metadata?.grpc_recv_us;
    
    let latency: LatencyInfo | undefined;
    if (grpcRecvUs) {
      const latencyUs = nowUs - grpcRecvUs;
      latency = {
        grpc_recv_us: grpcRecvUs,
        client_recv_us: nowUs,
        latency_us: latencyUs,
        latency_ms: parseFloat((latencyUs / 1000).toFixed(2)),
      };
    }

    if (event.PumpSwap) {
      this.emit('pumpswap', event.PumpSwap, latency);
    } else if (event.PumpFunTrade) {
      this.emit('pumpfun:trade', event.PumpFunTrade, latency);
    } else if (event.RaydiumAmmV4Swap) {
      this.emit('raydium:swap', event.RaydiumAmmV4Swap, latency);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
