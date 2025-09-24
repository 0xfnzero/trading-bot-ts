export interface Position {
  /** 代币mint地址 */
  mint: string;

  /** 持仓数量 */
  amount: number;

  /** 入场价格 */
  entryPrice: number;

  /** 入场时间 */
  entryTime: number;

  /** 入场交易签名 */
  entryTxSignature: string;

  /** 仓位状态 */
  status: 'active' | 'closing' | 'closed';

  /** 策略名称 */
  strategy: string;

  /** 投入的SOL金额 */
  investedSol: number;

  /** 当前价值 (实时计算) */
  currentValue?: number;

  /** 盈亏比例 (实时计算) */
  pnlRatio?: number;

  /** 最后更新时间 */
  lastUpdate: number;

  /** 额外元数据 */
  metadata?: Record<string, any>;
}

export interface PositionUpdate {
  mint: string;
  amount?: number;
  currentValue?: number;
  pnlRatio?: number;
  status?: Position['status'];
  metadata?: Record<string, any>;
}