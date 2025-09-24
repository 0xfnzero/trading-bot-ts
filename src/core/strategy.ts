import { DexEvent, LatencyInfo } from '../types/events';
import { Position } from '../types/position';
import { TradeSignal, TradeResult } from '../types/trading';

export interface StrategyContext {
  /** 当前持仓 */
  positions: Map<string, Position>;

  /** 价格历史缓存 */
  priceHistory: Map<string, number[]>;

  /** 获取代币当前价格 */
  getPrice(mint: string): number | undefined;

  /** 获取代币价格历史 */
  getPriceHistory(mint: string, length?: number): number[];

  /** 计算价格变化百分比 */
  getPriceChange(mint: string, periods: number): number | undefined;

  /** 检查是否已持仓 */
  hasPosition(mint: string): boolean;

  /** 获取持仓信息 */
  getPosition(mint: string): Position | undefined;

  /** 获取延迟信息 */
  getLatency(): LatencyInfo | undefined;
}

export interface StrategyConfig {
  /** 策略名称 */
  name: string;

  /** 策略描述 */
  description?: string;

  /** 是否启用 */
  enabled: boolean;

  /** 最大同时持仓数 */
  maxPositions: number;

  /** 单次最大交易金额 (SOL) */
  maxTradeAmount: number;

  /** 最小交易金额 (SOL) */
  minTradeAmount: number;

  /** 滑点容忍度 (基点) */
  slippageBps: number;

  /** 止盈比例 */
  takeProfitRatio?: number;

  /** 止损比例 */
  stopLossRatio?: number;

  /** 最小持仓时间 (秒) */
  minHoldTime?: number;

  /** 策略特定配置 */
  params?: Record<string, any>;
}

export abstract class BaseStrategy {
  protected config: StrategyConfig;
  protected context: StrategyContext;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  /** 设置策略上下文 */
  setContext(context: StrategyContext): void {
    this.context = context;
  }

  /** 获取策略配置 */
  getConfig(): StrategyConfig {
    return this.config;
  }

  /** 策略是否启用 */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** 分析事件并生成交易信号 */
  abstract analyzeEvent(event: DexEvent, latency?: LatencyInfo): Promise<TradeSignal[]>;

  /** 检查止盈止损条件 */
  async checkExitConditions(position: Position): Promise<TradeSignal | null> {
    const currentPrice = this.context.getPrice(position.mint);
    if (!currentPrice) return null;

    const pnlRatio = (currentPrice - position.entryPrice) / position.entryPrice;

    // 检查止盈
    if (this.config.takeProfitRatio && pnlRatio >= this.config.takeProfitRatio) {
      return {
        type: 'sell',
        mint: position.mint,
        amount: -1, // -1 表示卖出全部余额
        reason: `止盈 (+${(pnlRatio * 100).toFixed(2)}%)`,
        priority: 'high',
        params: { position }, // 传递仓位信息
      };
    }

    // 检查止损
    if (this.config.stopLossRatio && pnlRatio <= this.config.stopLossRatio) {
      return {
        type: 'sell',
        mint: position.mint,
        amount: -1, // -1 表示卖出全部余额
        reason: `止损 (${(pnlRatio * 100).toFixed(2)}%)`,
        priority: 'high',
        params: { position }, // 传递仓位信息
      };
    }

    // 检查最小持仓时间
    if (this.config.minHoldTime) {
      const holdTime = Date.now() - position.entryTime;
      if (holdTime < this.config.minHoldTime * 1000) {
        return null; // 未达到最小持仓时间
      }
    }

    return null;
  }

  /** 策略初始化 */
  async initialize(): Promise<void> {
    // 子类可以重写
  }

  /** 策略销毁 */
  async destroy(): Promise<void> {
    // 子类可以重写
  }

  /** 交易结果回调 */
  async onTradeResult(signal: TradeSignal, result: TradeResult): Promise<void> {
    // 子类可以重写
  }
}