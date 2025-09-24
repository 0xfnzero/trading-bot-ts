import { EventEmitter } from 'events';
import { TradingProxyClient } from '../client';
import { EventSubscriber } from '../subscriber';
import { BaseStrategy, StrategyContext } from './strategy';
import { PositionManager } from './position-manager';
import { ConfigManager } from './config-manager';
import { TradeExecutor } from './trade-executor';
import { DexEvent, LatencyInfo, EventWithLatency } from '../types/events';
import { Position } from '../types/position';
import { TradeSignal, TradingStats } from '../types/trading';

export interface BotConfig {
  /** HTTP API URL */
  httpUrl: string;

  /** WebSocket URL */
  wsUrl: string;

  /** 全局配置 */
  global: {
    /** 最大总仓位 */
    maxTotalPositions: number;
    /** 最大总投资金额 (SOL) */
    maxTotalInvestment: number;
    /** 紧急停止 */
    emergencyStop: boolean;
    /** 干运行模式 */
    dryRun: boolean;
  };

  /** 风险管理 */
  riskManagement: {
    /** 最大单日亏损比例 */
    maxDailyLoss: number;
    /** 最大连续亏损次数 */
    maxConsecutiveLosses: number;
    /** 亏损后暂停时间 (秒) */
    pauseAfterLoss: number;
  };
}

export class TradingBot extends EventEmitter {
  private config: BotConfig;
  private httpClient: TradingProxyClient;
  private wsClient: EventSubscriber;
  private positionManager: PositionManager;
  private tradeExecutor: TradeExecutor;
  private strategies: Map<string, BaseStrategy> = new Map();
  private context: StrategyContext;
  private isRunning = false;
  private stats: TradingStats;

  constructor(config: BotConfig) {
    super();
    this.config = config;
    this.httpClient = new TradingProxyClient({ baseURL: config.httpUrl });
    this.wsClient = new EventSubscriber(config.wsUrl);
    this.positionManager = new PositionManager();
    this.tradeExecutor = new TradeExecutor(this.httpClient, config.global.dryRun);

    this.initializeStats();
    this.setupContext();
    this.setupEventListeners();
  }

  /** 初始化统计数据 */
  private initializeStats(): void {
    this.stats = {
      totalTrades: 0,
      successfulTrades: 0,
      totalPnl: 0,
      winRate: 0,
      avgHoldTime: 0,
      maxWin: 0,
      maxLoss: 0,
      currentPositions: 0,
      lastUpdate: Date.now(),
    };
  }

  /** 设置策略上下文 */
  private setupContext(): void {
    this.context = {
      positions: this.positionManager.getAllPositions(),
      priceHistory: new Map(),

      getPrice: (mint: string) => this.positionManager.getPrice(mint),

      getPriceHistory: (mint: string, length = 100) => {
        const history = this.context.priceHistory.get(mint) || [];
        return history.slice(-length);
      },

      getPriceChange: (mint: string, periods: number) => {
        const history = this.getPriceHistory(mint);
        if (history.length < periods + 1) return undefined;
        const current = history[history.length - 1];
        const previous = history[history.length - 1 - periods];
        return (current - previous) / previous;
      },

      hasPosition: (mint: string) => this.positionManager.hasPosition(mint),

      getPosition: (mint: string) => this.positionManager.getPosition(mint),

      getLatency: () => this.wsClient.getLastLatency?.(),
    };
  }

  /** 设置事件监听 */
  private setupEventListeners(): void {
    // WebSocket 事件
    this.wsClient.on('connected', () => {
      this.emit('ws:connected');
    });

    this.wsClient.on('disconnected', () => {
      this.emit('ws:disconnected');
    });

    this.wsClient.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.wsClient.on('event', (eventData: EventWithLatency) => {
      this.handleEvent(eventData.event, eventData.latency);
    });

    // 仓位管理事件
    this.positionManager.on('position:opened', (position: Position) => {
      this.emit('position:opened', position);
      this.updateStats();
    });

    this.positionManager.on('position:closed', (position: Position, pnl: number) => {
      this.emit('position:closed', position, pnl);
      this.updateStats();
    });
  }

  /** 添加策略 */
  addStrategy(strategy: BaseStrategy): void {
    const name = strategy.getConfig().name;
    strategy.setContext(this.context);
    this.strategies.set(name, strategy);
    this.emit('strategy:added', name);
  }

  /** 移除策略 */
  removeStrategy(name: string): void {
    const strategy = this.strategies.get(name);
    if (strategy) {
      strategy.destroy();
      this.strategies.delete(name);
      this.emit('strategy:removed', name);
    }
  }

  /** 启动机器人 */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bot is already running');
    }

    try {
      // 初始化所有策略
      for (const [name, strategy] of this.strategies) {
        await strategy.initialize();
        this.emit('strategy:initialized', name);
      }

      // 启动 WebSocket 连接
      this.wsClient.connect();

      // 启动定时任务
      this.startPeriodicTasks();

      this.isRunning = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /** 停止机器人 */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // 断开 WebSocket
      this.wsClient.disconnect();

      // 销毁所有策略
      for (const [name, strategy] of this.strategies) {
        await strategy.destroy();
        this.emit('strategy:destroyed', name);
      }

      // 停止定时任务
      this.stopPeriodicTasks();

      this.isRunning = false;
      this.emit('stopped');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /** 处理事件 */
  private async handleEvent(event: DexEvent, latency?: LatencyInfo): Promise<void> {
    if (!this.isRunning || this.config.global.emergencyStop) {
      return;
    }

    try {
      // 缓存事件数据用于后续交易
      this.tradeExecutor.cacheEventForTrading(event);

      // 更新价格历史
      this.updatePriceHistory(event);

      // 让所有启用的策略分析事件
      const allSignals: TradeSignal[] = [];

      for (const [name, strategy] of this.strategies) {
        if (!strategy.isEnabled()) continue;

        try {
          const signals = await strategy.analyzeEvent(event, latency);
          if (signals.length > 0) {
            signals.forEach(signal => {
              signal.strategy = name;
              // 将源事件数据附加到信号中，用于构建交易参数
              signal.params = { ...signal.params, sourceEvent: event };
            });
            allSignals.push(...signals);
          }
        } catch (error) {
          this.emit('strategy:error', name, error);
        }
      }

      // 执行交易信号
      if (allSignals.length > 0) {
        await this.executeSignals(allSignals, event);
      }

    } catch (error) {
      this.emit('error', error);
    }
  }

  /** 执行交易信号 */
  private async executeSignals(signals: TradeSignal[], sourceEvent?: DexEvent): Promise<void> {
    // 按优先级排序
    const sortedSignals = signals.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    for (const signal of sortedSignals) {
      try {
        // 风险检查
        if (!this.checkRiskLimits(signal)) {
          this.emit('signal:rejected', signal, 'risk limits');
          continue;
        }

        // 执行交易 - 传递源事件数据用于构建交易参数
        const result = await this.tradeExecutor.executeSignal(signal, sourceEvent);

        // 通知策略结果
        const strategy = this.strategies.get(signal.strategy || '');
        if (strategy) {
          await strategy.onTradeResult(signal, result);
        }

        // 更新仓位
        if (result.success) {
          if (signal.type === 'buy') {
            await this.positionManager.openPosition({
              mint: signal.mint,
              amount: result.executedAmount || signal.amount,
              entryPrice: result.executedPrice || 0,
              entryTime: Date.now(),
              entryTxSignature: result.signature || '',
              status: 'active',
              strategy: signal.strategy || 'unknown',
              investedSol: signal.amount,
              lastUpdate: Date.now(),
            });
          } else {
            await this.positionManager.closePosition(signal.mint, result);
          }
        }

        this.emit('signal:executed', signal, result);

      } catch (error) {
        this.emit('signal:error', signal, error);
      }
    }
  }

  /** 风险检查 */
  private checkRiskLimits(signal: TradeSignal): boolean {
    // 检查紧急停止
    if (this.config.global.emergencyStop) {
      return false;
    }

    // 检查最大仓位数
    if (signal.type === 'buy' &&
        this.positionManager.getPositionCount() >= this.config.global.maxTotalPositions) {
      return false;
    }

    // 检查最大投资金额
    const totalInvested = this.positionManager.getTotalInvested();
    if (signal.type === 'buy' &&
        totalInvested + signal.amount > this.config.global.maxTotalInvestment) {
      return false;
    }

    // 检查日亏损限制
    const dailyPnl = this.positionManager.getDailyPnl();
    if (dailyPnl < -this.config.riskManagement.maxDailyLoss) {
      return false;
    }

    return true;
  }

  /** 更新价格历史 */
  private updatePriceHistory(event: DexEvent): void {
    let mint: string | undefined;
    let price: number | undefined;

    if ('PumpSwap' in event) {
      mint = event.PumpSwap.mint;
      price = event.PumpSwap.amount_out / event.PumpSwap.amount_in;
    } else if ('PumpFunTrade' in event) {
      mint = event.PumpFunTrade.mint;
      price = event.PumpFunTrade.amount_sol / event.PumpFunTrade.amount_token;
    }

    if (mint && price) {
      if (!this.context.priceHistory.has(mint)) {
        this.context.priceHistory.set(mint, []);
      }
      const history = this.context.priceHistory.get(mint)!;
      history.push(price);

      // 限制历史长度
      if (history.length > 1000) {
        history.splice(0, history.length - 1000);
      }

      this.positionManager.updatePrice(mint, price);
    }
  }

  private periodicTaskInterval?: NodeJS.Timeout;

  /** 启动定时任务 */
  private startPeriodicTasks(): void {
    this.periodicTaskInterval = setInterval(async () => {
      await this.runPeriodicTasks();
    }, 5000); // 每5秒执行一次
  }

  /** 停止定时任务 */
  private stopPeriodicTasks(): void {
    if (this.periodicTaskInterval) {
      clearInterval(this.periodicTaskInterval);
    }
  }

  /** 执行定时任务 */
  private async runPeriodicTasks(): Promise<void> {
    try {
      // 检查所有持仓的止盈止损
      const positions = this.positionManager.getAllPositions();

      for (const [mint, position] of positions) {
        if (position.status !== 'active') continue;

        // 让策略检查退出条件
        for (const [name, strategy] of this.strategies) {
          if (!strategy.isEnabled() || strategy.getConfig().name !== position.strategy) {
            continue;
          }

          const exitSignal = await strategy.checkExitConditions(position);
          if (exitSignal) {
            await this.executeSignals([exitSignal]);
            break;
          }
        }
      }

      // 更新统计数据
      this.updateStats();

    } catch (error) {
      this.emit('error', error);
    }
  }

  /** 更新统计数据 */
  private updateStats(): void {
    const positions = this.positionManager.getAllPositions();
    this.stats.currentPositions = positions.size;
    this.stats.totalPnl = this.positionManager.getTotalPnl();
    this.stats.lastUpdate = Date.now();

    this.emit('stats:updated', this.stats);
  }

  /** 获取统计数据 */
  getStats(): TradingStats {
    return { ...this.stats };
  }

  /** 获取当前配置 */
  getConfig(): BotConfig {
    return { ...this.config };
  }

  /** 获取所有策略 */
  getStrategies(): Map<string, BaseStrategy> {
    return new Map(this.strategies);
  }

  /** 获取仓位管理器 */
  getPositionManager(): PositionManager {
    return this.positionManager;
  }

  /** 是否运行中 */
  isRunningBot(): boolean {
    return this.isRunning;
  }
}