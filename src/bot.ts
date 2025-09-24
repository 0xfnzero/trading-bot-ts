import 'dotenv/config';
import { EventSubscriber } from './subscriber';
import { TradingProxyClient } from './client';
import { TradingStrategy, StrategyConfig, Position } from './strategy';
import { PumpSwapEvent, LatencyInfo } from './types';

export class TradingBot {
  private subscriber: EventSubscriber;
  private client: TradingProxyClient;
  private strategy: TradingStrategy;

  constructor() {
    // 初始化客户端
    this.client = new TradingProxyClient();
    this.subscriber = new EventSubscriber();

    // 连续买入策略配置
    const strategyConfig: StrategyConfig = {
      consecutiveBuys: parseInt(process.env.CONSECUTIVE_BUYS || '3'),
      totalAmountThreshold: parseFloat(process.env.TOTAL_AMOUNT_THRESHOLD || '5.0'),
      timeWindowMinutes: parseInt(process.env.TIME_WINDOW_MINUTES || '5'),
      buyAmountSOL: parseFloat(process.env.BUY_AMOUNT_SOL || '0.01'),
      slippageBps: parseInt(process.env.SLIPPAGE_BPS || '500'),
      takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || '15.0'),
      stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '-10.0'),
      checkIntervalSeconds: parseInt(process.env.CHECK_INTERVAL_SECONDS || '10'),
      maxPositions: parseInt(process.env.MAX_POSITIONS || '5'),
      cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES || '5'),
      priceHistoryLimit: parseInt(process.env.PRICE_HISTORY_LIMIT || '100'),
      dataMaxAgeHours: parseInt(process.env.DATA_MAX_AGE_HOURS || '24')
    };

    this.strategy = new TradingStrategy(this.client, strategyConfig);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // WebSocket连接事件
    this.subscriber.on('connected', () => {
      console.log('🚀 交易机器人已连接到数据流');
    });

    this.subscriber.on('disconnected', () => {
      console.log('🔌 与数据流断开连接');
    });

    this.subscriber.on('error', (error: Error) => {
      console.error('❌ WebSocket错误:', error.message);
    });

    // 订阅PumpSwap事件
    this.subscriber.on('pumpswap', async (event: PumpSwapEvent, latency?: LatencyInfo) => {
      const action = event.is_buy ? '🟢 BUY' : '🔴 SELL';
      const delay = latency ? `[${latency.latency_ms}ms]` : '';
      const mintShort = event.mint.substring(0, 8);

      console.log(`${action} ${delay} ${mintShort}... Amount: ${(event.amount_in / 1e9).toFixed(4)} SOL`);

      // 分析事件并可能触发买入
      await this.strategy.analyzeEvent(event);
    });

    // 策略事件
    this.strategy.on('buy-success', (data: any) => {
      const { position, priceChange } = data;
      console.log(`🎉 买入成功!`);
      console.log(`   代币: ${position.mint}`);
      console.log(`   价格下跌: ${priceChange.percent.toFixed(2)}%`);
      console.log(`   交易签名: ${position.txSignature}`);
      this.logStats();
    });

    this.strategy.on('buy-failed', (data: any) => {
      console.log(`❌ 买入失败: ${data.result.message}`);
    });

    this.strategy.on('buy-error', (data: any) => {
      console.error(`💥 买入错误:`, data.error.message);
    });

    this.strategy.on('error', (error: Error) => {
      console.error('💥 策略错误:', error.message);
    });
  }

  private logStats(): void {
    const stats = this.strategy.getStats();
    console.log(`📊 当前状态: ${stats.totalPositions} 个持仓, 总投资 ${stats.totalInvested} SOL`);
  }

  async start(): Promise<void> {
    console.log('🚀 启动交易机器人...');

    try {
      // 检查服务器健康状态
      const health = await this.client.health();
      console.log(`✅ 服务器状态: ${health.status}`);

      // 连接WebSocket
      this.subscriber.connect();

      // 定期清理过期数据
      setInterval(() => {
        this.strategy.cleanup();
      }, 30 * 60 * 1000); // 每30分钟清理一次

      console.log('✅ 交易机器人启动成功');
      console.log('📡 正在监听链上交易事件...');
      this.logStats();

    } catch (error) {
      console.error('❌ 启动失败:', error);
      process.exit(1);
    }
  }

  stop(): void {
    console.log('🛑 停止交易机器人...');
    this.subscriber.disconnect();
    console.log('✅ 交易机器人已停止');
  }

  // 获取当前持仓
  getPositions(): Map<string, Position> {
    return this.strategy.getPositions();
  }

  // 获取统计信息
  getStats() {
    return this.strategy.getStats();
  }
}

// 主函数
async function main() {
  const bot = new TradingBot();

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n👋 接收到关闭信号...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 接收到终止信号...');
    bot.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error);
    bot.stop();
    process.exit(1);
  });

  await bot.start();
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

export default TradingBot;