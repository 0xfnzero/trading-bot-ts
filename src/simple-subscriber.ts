import { EventSubscriber, TradingProxyClient, PumpSwapEvent, LatencyInfo } from './index';

export class SimpleTradingSubscriber {
  private subscriber: EventSubscriber;
  private client: TradingProxyClient;

  constructor(wsUrl: string = 'ws://127.0.0.1:9001', httpUrl: string = 'http://localhost:3000') {
    this.subscriber = new EventSubscriber(wsUrl);
    this.client = new TradingProxyClient({ baseURL: httpUrl });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.subscriber.on('connected', () => {
      console.log('✅ Connected to trading data stream');
    });

    this.subscriber.on('disconnected', ({ code, reason }) => {
      console.log(`🔌 Disconnected (${code}): ${reason}`);
    });

    this.subscriber.on('error', (error: Error) => {
      console.error('❌ Stream error:', error.message);
    });

    this.subscriber.on('reconnecting', (attempt: number) => {
      console.log(`🔄 Reconnecting... (attempt ${attempt})`);
    });

    // 订阅PumpSwap交易事件
    this.subscriber.on('pumpswap', (event: PumpSwapEvent, latency?: LatencyInfo) => {
      this.handlePumpSwapEvent(event, latency);
    });

    // 订阅PumpFun交易事件
    this.subscriber.on('pumpfun:trade', (event: any, latency?: LatencyInfo) => {
      this.handlePumpFunEvent(event, latency);
    });

    // 订阅Raydium交易事件
    this.subscriber.on('raydium:ammv4', (event: any, latency?: LatencyInfo) => {
      this.handleRaydiumEvent(event, latency);
    });
  }

  private handlePumpSwapEvent(event: PumpSwapEvent, latency?: LatencyInfo): void {
    const latencyMs = latency?.latency_ms ?? 0;
    const action = event.is_buy ? '🟢 BUY' : '🔴 SELL';

    console.log(`${action} PumpSwap [${latencyMs}ms]`);
    console.log(`  Token: ${event.mint.slice(0, 8)}...`);
    console.log(`  Pool: ${event.pool.slice(0, 8)}...`);
    console.log(`  Trader: ${event.trader.slice(0, 8)}...`);
    console.log(`  Amount In: ${this.formatNumber(event.amount_in)}`);
    console.log(`  Amount Out: ${this.formatNumber(event.amount_out)}`);
    console.log('---');

    // 这里可以添加交易策略逻辑
    this.checkTradingOpportunity(event, 'PumpSwap');
  }

  private handlePumpFunEvent(event: any, latency?: LatencyInfo): void {
    const latencyMs = latency?.latency_ms ?? 0;
    const action = event.is_buy ? '🟢 BUY' : '🔴 SELL';

    console.log(`${action} PumpFun [${latencyMs}ms]`);
    console.log(`  Token: ${event.mint.slice(0, 8)}...`);
    console.log(`  SOL: ${event.amount_sol / 1e9}`);
    console.log(`  Tokens: ${this.formatNumber(event.amount_token)}`);
    console.log('---');

    this.checkTradingOpportunity(event, 'PumpFun');
  }

  private handleRaydiumEvent(event: any, latency?: LatencyInfo): void {
    const latencyMs = latency?.latency_ms ?? 0;

    console.log(`💧 Raydium Swap [${latencyMs}ms]`);
    console.log(`  Pool: ${event.pool.slice(0, 8)}...`);
    console.log(`  Token In: ${event.token_in.slice(0, 8)}...`);
    console.log(`  Token Out: ${event.token_out.slice(0, 8)}...`);
    console.log(`  Amount In: ${this.formatNumber(event.amount_in)}`);
    console.log(`  Amount Out: ${this.formatNumber(event.amount_out)}`);
    console.log('---');

    this.checkTradingOpportunity(event, 'Raydium');
  }

  private checkTradingOpportunity(event: any, dexType: string): void {
    // 简单的跟单策略示例：如果是大额买入，可以考虑跟单
    if (dexType === 'PumpSwap' && event.is_buy && event.amount_in > 50000000) { // > 0.05 SOL
      console.log(`🎯 Large buy detected on ${dexType}! Amount: ${event.amount_in / 1e9} SOL`);
      // 这里可以调用交易逻辑
      // this.executeTrade(event);
    }
  }

  private async executeTrade(event: any): Promise<void> {
    try {
      // 这里实现具体的交易逻辑
      // 注意：需要根据事件数据构建正确的DexParams
      console.log('🚀 Executing trade based on event data...');
      // const result = await this.client.buy(dexParams, buyRequest);
    } catch (error) {
      console.error('💥 Trade execution failed:', error);
    }
  }

  private formatNumber(value: number): string {
    if (value >= 1e9) return `${(value / 1e9).toFixed(3)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(3)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(3)}K`;
    return value.toString();
  }

  start(): void {
    console.log('🚀 Starting trading data subscriber...');
    this.subscriber.connect();
  }

  stop(): void {
    console.log('🛑 Stopping trading data subscriber...');
    this.subscriber.disconnect();
  }

  isConnected(): boolean {
    return this.subscriber.isConnected();
  }

  getConnectionState(): string {
    return this.subscriber.getConnectionState();
  }
}

// 使用示例
if (require.main === module) {
  const subscriber = new SimpleTradingSubscriber();

  subscriber.start();

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    subscriber.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error);
    subscriber.stop();
    process.exit(1);
  });
}