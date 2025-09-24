import { TradingProxyClient } from '../client';
import { TradeSignal, TradeResult } from '../types/trading';
import { PumpSwapParams, PumpFunParams } from '../types';
import { DexParamsBuilder } from './dex-params-builder';
import { DexEvent } from '../types/events';

export class TradeExecutor {
  private client: TradingProxyClient;
  private dryRun: boolean;
  // 缓存最近的事件，用于构建交易参数
  private recentEvents: Map<string, { event: DexEvent; timestamp: number }> = new Map();

  constructor(client: TradingProxyClient, dryRun = false) {
    this.client = client;
    this.dryRun = dryRun;

    // 定期清理过期的事件缓存
    setInterval(() => {
      this.cleanupOldEvents();
    }, 60000); // 每分钟清理一次
  }

  /** 缓存事件数据用于后续交易 */
  cacheEventForTrading(event: DexEvent): void {
    const mint = DexParamsBuilder.extractMintFromEvent(event);
    if (mint && DexParamsBuilder.hasCompleteTradeInfo(event)) {
      this.recentEvents.set(mint, {
        event,
        timestamp: Date.now(),
      });
    }
  }

  /** 清理1小时前的事件 */
  private cleanupOldEvents(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [mint, data] of this.recentEvents.entries()) {
      if (data.timestamp < oneHourAgo) {
        this.recentEvents.delete(mint);
      }
    }
  }

  /** 执行交易信号 */
  async executeSignal(signal: TradeSignal, sourceEvent?: DexEvent): Promise<TradeResult> {
    if (this.dryRun) {
      return this.simulateExecution(signal);
    }

    try {
      // 从事件数据构建DEX参数（就像Rust示例那样）
      const dexParams = this.buildDexParamsFromEvent(signal, sourceEvent);

      if (signal.type === 'buy') {
        // 买入：signal.amount 是 SOL 金额（浮点数）
        const result = await this.client.buy(dexParams, {
          mint: signal.mint,
          amount_sol: signal.amount,
          slippage_bps: signal.slippageBps || 500,
        });

        return {
          success: result.success,
          signature: result.signature,
          error: result.success ? undefined : result.message,
          executedAmount: signal.amount, // SOL 金额
          executedPrice: 0, // 需要从结果中解析实际代币数量
          executedAt: Date.now(),
        };
      } else {
        // 卖出：signal.amount 是代币数量（整数，包含decimal）
        // 如果 signal.amount 是 -1，表示卖出全部余额
        let tokenAmount = signal.amount;

        if (tokenAmount === -1) {
          // 获取当前余额，卖出全部
          const position = signal.params?.position;
          if (position) {
            tokenAmount = position.amount;
          } else {
            throw new Error('无法获取代币余额信息');
          }
        }

        const result = await this.client.sell(dexParams, {
          mint: signal.mint,
          amount_tokens: tokenAmount,
          slippage_bps: signal.slippageBps || 500,
        });

        return {
          success: result.success,
          signature: result.signature,
          error: result.success ? undefined : result.message,
          executedAmount: tokenAmount, // 代币数量
          executedPrice: 0, // 需要从结果中解析实际SOL金额
          executedAt: Date.now(),
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executedAt: Date.now(),
      };
    }
  }

  /**
   * 从事件数据构建DEX参数
   * 就像Rust示例中的 PumpSwapParams::from_buy_trade() 和 PumpFunParams::from_trade()
   */
  private buildDexParamsFromEvent(signal: TradeSignal, sourceEvent?: DexEvent): PumpSwapParams | PumpFunParams {
    // 1. 优先使用传入的源事件
    if (sourceEvent) {
      return DexParamsBuilder.buildFromEvent(sourceEvent, signal.mint, signal.type === 'sell');
    }

    // 2. 从缓存的事件数据构建
    const cachedEventData = this.recentEvents.get(signal.mint);
    if (cachedEventData) {
      return DexParamsBuilder.buildFromEvent(cachedEventData.event, signal.mint, signal.type === 'sell');
    }

    // 3. 如果signal中包含事件数据
    if (signal.params?.sourceEvent) {
      return DexParamsBuilder.buildFromEvent(signal.params.sourceEvent, signal.mint, signal.type === 'sell');
    }

    // 4. 兜底：抛出错误，要求提供事件数据
    throw new Error(`无法构建DEX参数: 缺少源事件数据 for mint ${signal.mint}`);
  }

  /** 模拟执行 */
  private simulateExecution(signal: TradeSignal): TradeResult {
    console.log(`[DRY RUN] ${signal.type.toUpperCase()}: ${signal.mint} - ${signal.amount} - ${signal.reason}`);

    return {
      success: true,
      signature: 'dry_run_' + Date.now(),
      executedAmount: signal.amount,
      executedPrice: Math.random() * 0.001, // 模拟价格
      executedAt: Date.now(),
    };
  }
}