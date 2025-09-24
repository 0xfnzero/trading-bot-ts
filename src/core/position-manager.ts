import { EventEmitter } from 'events';
import { Position, PositionUpdate } from '../types/position';
import { TradeResult } from '../types/trading';

export class PositionManager extends EventEmitter {
  private positions: Map<string, Position> = new Map();
  private prices: Map<string, number> = new Map();
  private closedPositions: Position[] = [];

  /** 开仓 */
  async openPosition(position: Position): Promise<void> {
    this.positions.set(position.mint, position);
    this.emit('position:opened', position);
  }

  /** 平仓 */
  async closePosition(mint: string, result: TradeResult): Promise<void> {
    const position = this.positions.get(mint);
    if (!position) {
      throw new Error(`Position not found: ${mint}`);
    }

    // 计算盈亏
    const currentPrice = this.prices.get(mint) || 0;
    const pnl = (currentPrice - position.entryPrice) * position.amount;
    const pnlRatio = (currentPrice - position.entryPrice) / position.entryPrice;

    // 更新仓位状态
    position.status = 'closed';
    position.lastUpdate = Date.now();
    position.currentValue = result.executedAmount;
    position.pnlRatio = pnlRatio;

    // 移动到已平仓列表
    this.closedPositions.push(position);
    this.positions.delete(mint);

    this.emit('position:closed', position, pnl);
  }

  /** 更新仓位 */
  updatePosition(mint: string, update: PositionUpdate): void {
    const position = this.positions.get(mint);
    if (!position) return;

    Object.assign(position, update, { lastUpdate: Date.now() });
    this.emit('position:updated', position);
  }

  /** 更新价格 */
  updatePrice(mint: string, price: number): void {
    this.prices.set(mint, price);

    // 更新相关仓位的价值
    const position = this.positions.get(mint);
    if (position) {
      const currentValue = position.amount * price;
      const pnlRatio = (price - position.entryPrice) / position.entryPrice;

      this.updatePosition(mint, {
        mint,
        currentValue,
        pnlRatio,
      });
    }
  }

  /** 获取仓位 */
  getPosition(mint: string): Position | undefined {
    return this.positions.get(mint);
  }

  /** 检查是否持仓 */
  hasPosition(mint: string): boolean {
    return this.positions.has(mint);
  }

  /** 获取所有仓位 */
  getAllPositions(): Map<string, Position> {
    return new Map(this.positions);
  }

  /** 获取活跃仓位数量 */
  getPositionCount(): number {
    return this.positions.size;
  }

  /** 获取当前价格 */
  getPrice(mint: string): number | undefined {
    return this.prices.get(mint);
  }

  /** 获取总投资金额 */
  getTotalInvested(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.investedSol;
    }
    return total;
  }

  /** 获取总当前价值 */
  getTotalValue(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.currentValue || 0;
    }
    return total;
  }

  /** 获取总盈亏 */
  getTotalPnl(): number {
    let totalPnl = 0;

    // 活跃仓位盈亏
    for (const position of this.positions.values()) {
      if (position.currentValue) {
        totalPnl += position.currentValue - position.investedSol;
      }
    }

    // 已平仓盈亏
    for (const position of this.closedPositions) {
      if (position.currentValue) {
        totalPnl += position.currentValue - position.investedSol;
      }
    }

    return totalPnl;
  }

  /** 获取今日盈亏 */
  getDailyPnl(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    let dailyPnl = 0;

    // 今日开仓的活跃仓位
    for (const position of this.positions.values()) {
      if (position.entryTime >= todayTimestamp && position.currentValue) {
        dailyPnl += position.currentValue - position.investedSol;
      }
    }

    // 今日平仓的仓位
    for (const position of this.closedPositions) {
      if (position.lastUpdate >= todayTimestamp && position.currentValue) {
        dailyPnl += position.currentValue - position.investedSol;
      }
    }

    return dailyPnl;
  }

  /** 获取胜率 */
  getWinRate(): number {
    if (this.closedPositions.length === 0) return 0;

    const wins = this.closedPositions.filter(p => {
      return p.currentValue && p.currentValue > p.investedSol;
    }).length;

    return wins / this.closedPositions.length;
  }

  /** 获取平均持仓时间 */
  getAverageHoldTime(): number {
    if (this.closedPositions.length === 0) return 0;

    const totalTime = this.closedPositions.reduce((sum, position) => {
      return sum + (position.lastUpdate - position.entryTime);
    }, 0);

    return totalTime / this.closedPositions.length / 1000; // 转换为秒
  }

  /** 获取统计信息 */
  getStats(): {
    activePositions: number;
    closedPositions: number;
    totalInvested: number;
    totalValue: number;
    totalPnl: number;
    dailyPnl: number;
    winRate: number;
    avgHoldTime: number;
  } {
    return {
      activePositions: this.positions.size,
      closedPositions: this.closedPositions.length,
      totalInvested: this.getTotalInvested(),
      totalValue: this.getTotalValue(),
      totalPnl: this.getTotalPnl(),
      dailyPnl: this.getDailyPnl(),
      winRate: this.getWinRate(),
      avgHoldTime: this.getAverageHoldTime(),
    };
  }

  /** 清理旧的已平仓记录 */
  cleanupClosedPositions(olderThanDays: number = 7): void {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    this.closedPositions = this.closedPositions.filter(
      position => position.lastUpdate > cutoffTime
    );
  }

  /** 导出数据 */
  exportData(): {
    active: Position[];
    closed: Position[];
    prices: Record<string, number>;
  } {
    return {
      active: Array.from(this.positions.values()),
      closed: [...this.closedPositions],
      prices: Object.fromEntries(this.prices),
    };
  }

  /** 导入数据 */
  importData(data: {
    active: Position[];
    closed: Position[];
    prices: Record<string, number>;
  }): void {
    this.positions.clear();
    this.prices.clear();
    this.closedPositions = [];

    // 导入活跃仓位
    for (const position of data.active) {
      this.positions.set(position.mint, position);
    }

    // 导入已平仓
    this.closedPositions = [...data.closed];

    // 导入价格
    this.prices = new Map(Object.entries(data.prices));
  }
}