import { BaseStrategy, StrategyConfig } from '../core/strategy';
import { DexEvent, LatencyInfo, PumpSwapEvent, PumpFunTradeEvent } from '../types/events';
import { TradeSignal } from '../types/trading';
import { Position } from '../types/position';

interface BuyEvent {
  mint: string;
  amount: number;
  timestamp: number;
  trader: string;
}

export interface ConsecutiveBuyConfig extends StrategyConfig {
  /** 连续买入次数阈值 */
  consecutiveBuyCount: number;
  /** 累计金额阈值 (SOL) */
  totalAmountThreshold: number;
  /** 时间窗口 (秒) */
  timeWindowSeconds: number;
  /** 目标涨幅 (小数) */
  targetProfitRatio: number;
  /** 买入金额 (SOL) */
  buyAmountSol: number;
}

export class ConsecutiveBuyStrategy extends BaseStrategy {
  protected config: ConsecutiveBuyConfig;

  // 存储买入事件历史
  private buyHistory: Map<string, BuyEvent[]> = new Map();

  // 已经买入的代币，避免重复买入
  private boughtTokens: Set<string> = new Set();

  constructor(config: ConsecutiveBuyConfig) {
    super(config);
  }

  async analyzeEvent(event: DexEvent, latency?: LatencyInfo): Promise<TradeSignal[]> {
    const signals: TradeSignal[] = [];

    // 只处理买入事件
    const buyEvent = this.extractBuyEvent(event);
    if (!buyEvent) {
      return signals;
    }

    // 记录买入事件
    this.recordBuyEvent(buyEvent);

    // 检查是否满足连续买入条件
    if (this.checkConsecutiveBuyCondition(buyEvent.mint)) {
      // 检查是否已经买入过
      if (!this.boughtTokens.has(buyEvent.mint) && !this.context.hasPosition(buyEvent.mint)) {
        signals.push({
          type: 'buy',
          mint: buyEvent.mint,
          amount: this.config.buyAmountSol,
          reason: `连续${this.config.consecutiveBuyCount}笔买入，累计${this.getTotalBuyAmount(buyEvent.mint).toFixed(2)} SOL`,
          priority: 'medium',
          strategy: this.config.name,
          // 将源事件附加到信号中，用于构建交易参数
          params: { sourceEvent: event },
        });

        // 标记已买入
        this.boughtTokens.add(buyEvent.mint);
      }
    }

    return signals;
  }

  /** 从事件中提取买入信息 */
  private extractBuyEvent(event: DexEvent): BuyEvent | null {
    if ('PumpSwap' in event) {
      const pumpSwap = event.PumpSwap;
      if (pumpSwap.is_buy) {
        return {
          mint: pumpSwap.mint,
          amount: pumpSwap.amount_in,
          timestamp: Date.now(),
          trader: pumpSwap.trader,
        };
      }
    } else if ('PumpFunTrade' in event) {
      const pumpFun = event.PumpFunTrade;
      if (pumpFun.is_buy) {
        return {
          mint: pumpFun.mint,
          amount: pumpFun.amount_sol,
          timestamp: Date.now(),
          trader: pumpFun.trader,
        };
      }
    }

    return null;
  }

  /** 记录买入事件 */
  private recordBuyEvent(buyEvent: BuyEvent): void {
    if (!this.buyHistory.has(buyEvent.mint)) {
      this.buyHistory.set(buyEvent.mint, []);
    }

    const history = this.buyHistory.get(buyEvent.mint)!;
    history.push(buyEvent);

    // 清理过期事件
    const cutoffTime = Date.now() - (this.config.timeWindowSeconds * 1000);
    const filteredHistory = history.filter(event => event.timestamp > cutoffTime);
    this.buyHistory.set(buyEvent.mint, filteredHistory);

    // 如果历史为空，删除记录
    if (filteredHistory.length === 0) {
      this.buyHistory.delete(buyEvent.mint);
    }
  }

  /** 检查连续买入条件 */
  private checkConsecutiveBuyCondition(mint: string): boolean {
    const history = this.buyHistory.get(mint);
    if (!history || history.length < this.config.consecutiveBuyCount) {
      return false;
    }

    // 获取最近的连续买入
    const recentBuys = history.slice(-this.config.consecutiveBuyCount);

    // 检查是否是连续的（时间顺序）
    for (let i = 1; i < recentBuys.length; i++) {
      const timeDiff = recentBuys[i].timestamp - recentBuys[i-1].timestamp;
      // 如果间隔超过时间窗口，不算连续
      if (timeDiff > this.config.timeWindowSeconds * 1000) {
        return false;
      }
    }

    // 计算累计金额
    const totalAmount = recentBuys.reduce((sum, buy) => sum + buy.amount, 0);

    return totalAmount >= this.config.totalAmountThreshold;
  }

  /** 获取总买入金额 */
  private getTotalBuyAmount(mint: string): number {
    const history = this.buyHistory.get(mint);
    if (!history) return 0;

    return history.reduce((sum, buy) => sum + buy.amount, 0);
  }

  /** 检查止盈条件 */
  async checkExitConditions(position: Position): Promise<TradeSignal | null> {
    const currentPrice = this.context.getPrice(position.mint);
    if (!currentPrice) return null;

    const pnlRatio = (currentPrice - position.entryPrice) / position.entryPrice;

    // 检查目标涨幅
    if (pnlRatio >= this.config.targetProfitRatio) {
      // 移除已买入标记，允许再次买入
      this.boughtTokens.delete(position.mint);

      return {
        type: 'sell',
        mint: position.mint,
        amount: -1, // -1 表示卖出全部余额
        reason: `达到目标涨幅 ${(pnlRatio * 100).toFixed(2)}%`,
        priority: 'high',
        strategy: this.config.name,
        params: { position }, // 传递仓位信息用于获取余额
      };
    }

    // 调用基类的止损逻辑
    const baseSignal = await super.checkExitConditions(position);
    if (baseSignal) {
      // 移除已买入标记
      this.boughtTokens.delete(position.mint);
    }

    return baseSignal;
  }

  /** 策略初始化 */
  async initialize(): Promise<void> {
    console.log(`🎯 连续买入策略已启动:`);
    console.log(`   - 连续买入次数: ${this.config.consecutiveBuyCount}`);
    console.log(`   - 累计金额阈值: ${this.config.totalAmountThreshold} SOL`);
    console.log(`   - 时间窗口: ${this.config.timeWindowSeconds} 秒`);
    console.log(`   - 目标涨幅: ${(this.config.targetProfitRatio * 100).toFixed(1)}%`);
    console.log(`   - 买入金额: ${this.config.buyAmountSol} SOL`);
  }

  /** 策略销毁 */
  async destroy(): Promise<void> {
    this.buyHistory.clear();
    this.boughtTokens.clear();
    console.log('🔄 连续买入策略已停止');
  }

  /** 获取策略状态 */
  getStatus(): {
    trackedTokens: number;
    boughtTokens: number;
    buyHistory: Record<string, BuyEvent[]>;
  } {
    return {
      trackedTokens: this.buyHistory.size,
      boughtTokens: this.boughtTokens.size,
      buyHistory: Object.fromEntries(this.buyHistory),
    };
  }

  /** 清理过期数据 */
  cleanup(): void {
    const cutoffTime = Date.now() - (this.config.timeWindowSeconds * 1000);

    // 清理买入历史
    for (const [mint, history] of this.buyHistory.entries()) {
      const filteredHistory = history.filter(event => event.timestamp > cutoffTime);
      if (filteredHistory.length === 0) {
        this.buyHistory.delete(mint);
        // 如果没有活跃仓位，也清理已买入标记
        if (!this.context.hasPosition(mint)) {
          this.boughtTokens.delete(mint);
        }
      } else {
        this.buyHistory.set(mint, filteredHistory);
      }
    }
  }
}

/** 创建默认配置 */
export function createConsecutiveBuyConfig(): ConsecutiveBuyConfig {
  return {
    name: 'ConsecutiveBuy',
    description: '连续买入跟单策略',
    enabled: true,
    maxPositions: 5,
    maxTradeAmount: 0.1,
    minTradeAmount: 0.01,
    slippageBps: 500,
    takeProfitRatio: 0.1, // 10%
    stopLossRatio: -0.05, // -5%
    minHoldTime: 10, // 10秒

    // 策略特定参数
    consecutiveBuyCount: 3,
    totalAmountThreshold: 5.0,
    timeWindowSeconds: 300, // 5分钟
    targetProfitRatio: 0.1, // 10%
    buyAmountSol: 0.01,
  };
}