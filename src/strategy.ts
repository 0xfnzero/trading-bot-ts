import { EventEmitter } from 'events';
import { TradingProxyClient } from './client';
import { PumpSwapEvent, DexParams } from './types';

export interface StrategyConfig {
  // 连续买入策略配置
  consecutiveBuys: number;         // 连续买入次数 (默认3次)
  totalAmountThreshold: number;    // 总买入金额阈值 (SOL, 默认5.0)
  timeWindowMinutes: number;       // 时间窗口 (分钟, 默认5分钟)

  // 买入参数
  buyAmountSOL: number;            // 我们的买入金额 (SOL)
  slippageBps: number;             // 滑点保护 (基点)

  // 止盈止损
  takeProfitPercent: number;       // 止盈百分比 (默认15%)
  stopLossPercent: number;         // 止损百分比 (默认-10%)
  checkIntervalSeconds: number;    // 止盈止损检查间隔 (秒)

  // 风险控制
  maxPositions: number;            // 最大同时持仓数
  cooldownMinutes: number;         // 同一代币冷却时间 (分钟)

  // 数据清理
  priceHistoryLimit: number;       // 价格历史保留数量
  dataMaxAgeHours: number;         // 数据最大保存时间 (小时)
}

export interface Position {
  mint: string;
  buyPrice: number;
  buyAmount: number;
  buyTime: number;
  txSignature: string;
  currentPrice?: number;
  pnlPercent?: number;
}

interface BuyEvent {
  mint: string;
  amount: number;
  time: number;
  trader: string;
}

export class TradingStrategy extends EventEmitter {
  private client: TradingProxyClient;
  private config: StrategyConfig;
  private positions: Map<string, Position> = new Map();
  private buyEvents: Map<string, BuyEvent[]> = new Map(); // 跟踪每个代币的买入事件
  private priceHistory: Map<string, { price: number; time: number }[]> = new Map();
  private lastBuyTime: Map<string, number> = new Map();

  constructor(client: TradingProxyClient, config: StrategyConfig) {
    super();
    this.client = client;
    this.config = config;

    // 定期检查止盈止损
    setInterval(() => {
      this.checkProfitLoss();
    }, this.config.checkIntervalSeconds * 1000);
  }

  // 分析PumpSwap事件，判断是否符合连续买入条件
  async analyzeEvent(event: PumpSwapEvent): Promise<void> {
    try {
      // 更新价格历史
      this.updatePriceHistory(event);

      // 只关注买入事件
      if (!event.is_buy) return;

      const buyAmountSOL = event.amount_in / 1e9;
      const mintShort = event.mint.substring(0, 8);

      console.log(`📊 分析买入事件: ${mintShort}... Amount: ${buyAmountSOL.toFixed(4)} SOL`);

      // 检查基本条件
      if (!this.checkBasicConditions(event)) {
        return;
      }

      // 记录买入事件
      this.recordBuyEvent(event, buyAmountSOL);

      // 检查是否满足连续买入条件
      const consecutivePattern = this.checkConsecutiveBuyPattern(event.mint);
      if (consecutivePattern) {
        console.log(`🎯 检测到连续买入模式!`);
        console.log(`   代币: ${event.mint}`);
        console.log(`   连续买入: ${consecutivePattern.count}次`);
        console.log(`   总金额: ${consecutivePattern.totalAmount.toFixed(4)} SOL`);

        await this.executeBuy(event, consecutivePattern);
      }

    } catch (error) {
      console.error('分析事件失败:', error);
      this.emit('error', error);
    }
  }

  private checkBasicConditions(event: PumpSwapEvent): boolean {
    // 检查最大持仓数
    if (this.positions.size >= this.config.maxPositions) {
      console.log(`   ❌ 已达最大持仓数: ${this.positions.size}`);
      return false;
    }

    // 检查是否已持有该代币
    if (this.positions.has(event.mint)) {
      console.log(`   ❌ 已持有该代币`);
      return false;
    }

    // 检查冷却时间
    const lastBuyTime = this.lastBuyTime.get(event.mint);
    if (lastBuyTime) {
      const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastBuyTime < cooldownMs) {
        console.log(`   ❌ 冷却时间未到`);
        return false;
      }
    }

    return true;
  }

  private recordBuyEvent(event: PumpSwapEvent, amountSOL: number): void {
    const mint = event.mint;
    const now = Date.now();

    if (!this.buyEvents.has(mint)) {
      this.buyEvents.set(mint, []);
    }

    const events = this.buyEvents.get(mint)!;
    events.push({
      mint: event.mint,
      amount: amountSOL,
      time: now,
      trader: event.trader
    });

    // 清理过期事件（超出时间窗口）
    const timeWindowMs = this.config.timeWindowMinutes * 60 * 1000;
    const validEvents = events.filter(e => now - e.time <= timeWindowMs);
    this.buyEvents.set(mint, validEvents);
  }

  private checkConsecutiveBuyPattern(mint: string): { count: number; totalAmount: number } | null {
    const events = this.buyEvents.get(mint);
    if (!events || events.length < this.config.consecutiveBuys) {
      return null;
    }

    // 检查最近的连续买入
    const recentEvents = events.slice(-this.config.consecutiveBuys);

    // 确保这些事件是连续的（来自不同的交易者更好）
    const totalAmount = recentEvents.reduce((sum, event) => sum + event.amount, 0);

    if (totalAmount >= this.config.totalAmountThreshold) {
      return {
        count: recentEvents.length,
        totalAmount
      };
    }

    return null;
  }

  private async executeBuy(event: PumpSwapEvent, pattern: any): Promise<void> {
    console.log(`🚀 执行跟单买入!`);
    console.log(`   代币: ${event.mint}`);
    console.log(`   连续买入: ${pattern.count}次`);
    console.log(`   总金额: ${pattern.totalAmount.toFixed(4)} SOL`);
    console.log(`   我们买入: ${this.config.buyAmountSOL} SOL`);

    try {
      // 构建DexParams
      const dexParams: DexParams = this.buildDexParams(event);

      // 执行买入
      const result = await this.client.buy(dexParams, {
        mint: event.mint,
        amount_sol: this.config.buyAmountSOL,
        slippage_bps: this.config.slippageBps
      });

      if (result.success && result.signature) {
        // 获取当前价格
        const currentPrice = this.getCurrentPrice(event.mint);

        // 记录仓位
        const position: Position = {
          mint: event.mint,
          buyPrice: currentPrice,
          buyAmount: this.config.buyAmountSOL,
          buyTime: Date.now(),
          txSignature: result.signature,
          currentPrice: currentPrice,
          pnlPercent: 0
        };

        this.positions.set(event.mint, position);
        this.lastBuyTime.set(event.mint, Date.now());

        console.log(`✅ 买入成功: ${result.signature}`);
        console.log(`   买入价格: ${currentPrice.toFixed(8)}`);
        console.log(`   当前持仓数: ${this.positions.size}`);

        this.emit('buy-success', { position, event, pattern, result });

      } else {
        console.log(`❌ 买入失败: ${result.message}`);
        this.emit('buy-failed', { event, result });
      }

    } catch (error) {
      console.error(`💥 买入执行失败:`, error);
      this.emit('buy-error', { event, error });
    }
  }

  private checkProfitLoss(): void {
    for (const [mint, position] of this.positions) {
      const currentPrice = this.getCurrentPrice(mint);
      if (!currentPrice) continue;

      const pnlPercent = ((currentPrice - position.buyPrice) / position.buyPrice) * 100;

      // 更新仓位信息
      position.currentPrice = currentPrice;
      position.pnlPercent = pnlPercent;

      console.log(`📈 ${mint.substring(0, 8)}... PnL: ${pnlPercent.toFixed(2)}%`);

      // 检查止盈
      if (pnlPercent >= this.config.takeProfitPercent) {
        console.log(`🎯 触发止盈: ${pnlPercent.toFixed(2)}% >= ${this.config.takeProfitPercent}%`);
        this.executeSell(position, '止盈');
      }
      // 检查止损
      else if (pnlPercent <= this.config.stopLossPercent) {
        console.log(`🛑 触发止损: ${pnlPercent.toFixed(2)}% <= ${this.config.stopLossPercent}%`);
        this.executeSell(position, '止损');
      }
    }
  }

  private async executeSell(position: Position, reason: string): Promise<void> {
    console.log(`📤 执行${reason}卖出: ${position.mint}`);

    try {
      const dexParams: DexParams = this.buildDexParams({
        mint: position.mint,
        pool: '', // 需要从某处获取
        trader: '',
        amount_in: 0,
        amount_out: 0,
        is_buy: false
      } as PumpSwapEvent);

      // 这里需要计算要卖出的代币数量
      // 简化实现，实际需要根据当前余额决定
      const result = await this.client.sell(dexParams, {
        mint: position.mint,
        amount_tokens: 1000000, // 需要计算实际代币数量
        slippage_bps: this.config.slippageBps
      });

      if (result.success) {
        const profit = (position.currentPrice! - position.buyPrice) * position.buyAmount / position.buyPrice;

        console.log(`✅ ${reason}成功: ${result.signature}`);
        console.log(`   盈亏: ${position.pnlPercent!.toFixed(2)}% (${profit.toFixed(6)} SOL)`);

        // 移除仓位
        this.positions.delete(position.mint);

        this.emit('sell-success', { position, reason, profit, result });
      } else {
        console.log(`❌ ${reason}失败: ${result.message}`);
      }

    } catch (error) {
      console.error(`💥 ${reason}失败:`, error);
    }
  }

  private updatePriceHistory(event: PumpSwapEvent): void {
    const mint = event.mint;
    const price = event.amount_out / event.amount_in;
    const time = Date.now();

    if (!this.priceHistory.has(mint)) {
      this.priceHistory.set(mint, []);
    }

    const history = this.priceHistory.get(mint)!;
    history.push({ price, time });

    if (history.length > this.config.priceHistoryLimit) {
      history.shift();
    }
  }

  private getCurrentPrice(mint: string): number {
    const history = this.priceHistory.get(mint);
    if (!history || history.length === 0) return 0;
    return history[history.length - 1].price;
  }

  private buildDexParams(event: PumpSwapEvent): DexParams {
    return {
      dex_type: 'PumpSwap',
      pool: event.pool || '',
      base_mint: event.mint,
      quote_mint: 'So11111111111111111111111111111111111111112',
      pool_base_token_account: '',
      pool_quote_token_account: '',
      pool_base_token_reserves: 0,
      pool_quote_token_reserves: 0,
      coin_creator_vault_ata: '',
      coin_creator_vault_authority: '',
      base_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      quote_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    } as DexParams;
  }

  // 获取当前持仓
  getPositions(): Map<string, Position> {
    return new Map(this.positions);
  }

  // 获取持仓统计
  getStats() {
    const positions = Array.from(this.positions.values());
    const totalInvested = positions.reduce((sum, pos) => sum + pos.buyAmount, 0);
    const totalPnL = positions.reduce((sum, pos) => {
      if (pos.pnlPercent) {
        return sum + (pos.buyAmount * pos.pnlPercent / 100);
      }
      return sum;
    }, 0);

    return {
      totalPositions: this.positions.size,
      totalInvested,
      totalPnL,
      avgPnL: positions.length > 0 ? totalPnL / positions.length : 0
    };
  }

  // 清理过期数据
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.dataMaxAgeHours * 60 * 60 * 1000;

    // 清理买入事件记录
    for (const [mint, events] of this.buyEvents) {
      const validEvents = events.filter(event => now - event.time < maxAge);
      if (validEvents.length === 0) {
        this.buyEvents.delete(mint);
      } else {
        this.buyEvents.set(mint, validEvents);
      }
    }

    // 清理价格历史
    for (const [mint, history] of this.priceHistory) {
      const filtered = history.filter(item => now - item.time < maxAge);
      if (filtered.length === 0) {
        this.priceHistory.delete(mint);
      } else {
        this.priceHistory.set(mint, filtered);
      }
    }

    // 清理冷却时间记录
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
    for (const [mint, time] of this.lastBuyTime) {
      if (now - time > cooldownMs * 2) {
        this.lastBuyTime.delete(mint);
      }
    }
  }
}