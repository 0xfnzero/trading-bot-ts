export interface TradeSignal {
  /** 交易类型 */
  type: 'buy' | 'sell';

  /** 代币地址 */
  mint: string;

  /**
   * 交易数量
   * - 买入时: SOL 金额 (浮点数，如 0.01)
   * - 卖出时: 代币数量 (整数，包含decimal) 或 -1 (表示全部余额)
   */
  amount: number;

  /** 触发原因 */
  reason: string;

  /** 优先级 */
  priority: 'low' | 'medium' | 'high';

  /** 滑点容忍度 (基点) */
  slippageBps?: number;

  /** 策略名称 */
  strategy?: string;

  /** 额外参数 */
  params?: Record<string, any>;
}

export interface TradeRequest {
  /** 交易类型 */
  type: 'buy' | 'sell';

  /** 代币地址 */
  mint: string;

  /** SOL金额 (买入时) 或 代币数量 (卖出时) */
  amount: number;

  /** 滑点容忍度 (基点) */
  slippageBps: number;

  /** DEX参数 */
  dexParams: any;
}

export interface TradeResult {
  /** 是否成功 */
  success: boolean;

  /** 交易签名 */
  signature?: string;

  /** 错误信息 */
  error?: string;

  /** 实际执行金额 */
  executedAmount?: number;

  /** 实际价格 */
  executedPrice?: number;

  /** 执行时间 */
  executedAt: number;

  /** 手续费 */
  fee?: number;
}

export interface TradingStats {
  /** 总交易次数 */
  totalTrades: number;

  /** 成功交易次数 */
  successfulTrades: number;

  /** 总盈利 (SOL) */
  totalPnl: number;

  /** 胜率 */
  winRate: number;

  /** 平均持仓时间 (秒) */
  avgHoldTime: number;

  /** 最大单笔盈利 */
  maxWin: number;

  /** 最大单笔亏损 */
  maxLoss: number;

  /** 当前持仓数 */
  currentPositions: number;

  /** 最后更新时间 */
  lastUpdate: number;
}