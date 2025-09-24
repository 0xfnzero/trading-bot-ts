import { DexEvent, PumpSwapEvent, PumpFunTradeEvent, PumpFunCreateEvent } from '../types/events';
import { PumpSwapParams, PumpFunParams } from '../types';

export class DexParamsBuilder {
  /**
   * 从事件数据构建DEX参数
   * 这是跟单和狙击的核心 - 从链上事件提取交易所需的所有参数
   */
  static buildFromEvent(event: DexEvent, mint: string, forSell: boolean = false): PumpSwapParams | PumpFunParams {
    if ('PumpSwap' in event) {
      return this.buildPumpSwapParams(event.PumpSwap, mint, forSell);
    } else if ('PumpFunTrade' in event) {
      return this.buildPumpFunTradeParams(event.PumpFunTrade, forSell);
    } else if ('PumpFunCreate' in event) {
      return this.buildPumpFunCreateParams(event.PumpFunCreate, forSell);
    }

    throw new Error(`Unsupported event type for DEX params building`);
  }

  /**
   * 从PumpSwap事件构建参数
   */
  private static buildPumpSwapParams(event: PumpSwapEvent, mint: string, forSell: boolean): PumpSwapParams {
    // 从事件数据获取池子信息
    const poolInfo = this.extractPumpSwapPoolInfo(event, mint);

    return {
      dex_type: 'PumpSwap',
      pool: event.pool,
      base_mint: poolInfo.base_mint,
      quote_mint: poolInfo.quote_mint,
      pool_base_token_account: poolInfo.pool_base_token_account,
      pool_quote_token_account: poolInfo.pool_quote_token_account,
      pool_base_token_reserves: poolInfo.pool_base_token_reserves,
      pool_quote_token_reserves: poolInfo.pool_quote_token_reserves,
      coin_creator_vault_ata: poolInfo.coin_creator_vault_ata,
      coin_creator_vault_authority: poolInfo.coin_creator_vault_authority,
      base_token_program: poolInfo.base_token_program,
      quote_token_program: poolInfo.quote_token_program,
    };
  }

  /**
   * 从PumpFun交易事件构建参数
   */
  private static buildPumpFunTradeParams(event: PumpFunTradeEvent, forSell: boolean): PumpFunParams {
    // 从事件元数据提取bonding curve信息
    return {
      dex_type: 'PumpFun',
      bonding_curve_account: this.extractBondingCurveFromEvent(event),
      virtual_token_reserves: this.extractVirtualTokenReserves(event),
      virtual_sol_reserves: this.extractVirtualSolReserves(event),
      real_token_reserves: this.extractRealTokenReserves(event),
      real_sol_reserves: this.extractRealSolReserves(event),
      token_total_supply: this.extractTokenTotalSupply(event),
      complete: false, // 从交易事件推断
      creator: this.extractCreator(event),
      associated_bonding_curve: this.extractAssociatedBondingCurve(event),
      creator_vault: this.extractCreatorVault(event),
    };
  }

  /**
   * 从PumpFun创建事件构建参数
   */
  private static buildPumpFunCreateParams(event: PumpFunCreateEvent, forSell: boolean): PumpFunParams {
    return {
      dex_type: 'PumpFun',
      bonding_curve_account: this.extractBondingCurveFromCreateEvent(event),
      virtual_token_reserves: this.getInitialVirtualTokenReserves(),
      virtual_sol_reserves: this.getInitialVirtualSolReserves(),
      real_token_reserves: this.getInitialRealTokenReserves(),
      real_sol_reserves: this.getInitialRealSolReserves(),
      token_total_supply: this.getInitialTokenTotalSupply(),
      complete: false,
      creator: event.creator,
      associated_bonding_curve: this.deriveAssociatedBondingCurve(event.mint),
      creator_vault: this.deriveCreatorVault(event.mint, event.creator),
    };
  }

  /**
   * 从PumpSwap事件中提取池子信息
   * 基于sol-trade-sdk中PumpSwapParams::from_buy_trade()的逻辑
   */
  private static extractPumpSwapPoolInfo(event: PumpSwapEvent, mint: string) {
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';

    // 直接使用事件中的数据，就像Rust示例一样
    // PumpSwap事件应该包含完整的池子信息
    return {
      base_mint: mint,  // 从参数传入的mint就是代币地址
      quote_mint: WSOL_MINT, // PumpSwap总是用SOL作为报价币

      // 从事件中获取池子账户信息
      // 注意：这些字段需要根据实际的WebSocket事件数据结构调整
      pool_base_token_account: (event as any).pool_base_token_account || event.pool + '_base',
      pool_quote_token_account: (event as any).pool_quote_token_account || event.pool + '_quote',

      // 储备量信息
      pool_base_token_reserves: (event as any).pool_base_token_reserves || event.amount_out || 0,
      pool_quote_token_reserves: (event as any).pool_quote_token_reserves || event.amount_in || 0,

      // Creator vault信息
      coin_creator_vault_ata: (event as any).coin_creator_vault_ata || 'derived_from_mint',
      coin_creator_vault_authority: (event as any).coin_creator_vault_authority || 'derived_authority',

      // Token程序
      base_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      quote_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    };
  }

  // PumpFun参数提取方法 - 这些方法需要根据实际的事件数据结构实现
  private static extractBondingCurveFromEvent(event: PumpFunTradeEvent): string {
    return event.metadata?.bonding_curve || 'placeholder';
  }

  private static extractVirtualTokenReserves(event: PumpFunTradeEvent): number {
    return event.metadata?.virtual_token_reserves || 1073000000000000;
  }

  private static extractVirtualSolReserves(event: PumpFunTradeEvent): number {
    return event.metadata?.virtual_sol_reserves || 30000000000;
  }

  private static extractRealTokenReserves(event: PumpFunTradeEvent): number {
    return event.metadata?.real_token_reserves || 793100000000000;
  }

  private static extractRealSolReserves(event: PumpFunTradeEvent): number {
    return event.metadata?.real_sol_reserves || 0;
  }

  private static extractTokenTotalSupply(event: PumpFunTradeEvent): number {
    return event.metadata?.token_total_supply || 1000000000000000;
  }

  private static extractCreator(event: PumpFunTradeEvent): string {
    return event.metadata?.creator || event.trader;
  }

  private static extractAssociatedBondingCurve(event: PumpFunTradeEvent): string {
    return event.metadata?.associated_bonding_curve || 'placeholder';
  }

  private static extractCreatorVault(event: PumpFunTradeEvent): string {
    return event.metadata?.creator_vault || 'placeholder';
  }

  // PumpFun创建事件的参数提取
  private static extractBondingCurveFromCreateEvent(event: PumpFunCreateEvent): string {
    return event.metadata?.bonding_curve || 'placeholder';
  }

  private static getInitialVirtualTokenReserves(): number {
    return 1073000000000000; // PumpFun初始值
  }

  private static getInitialVirtualSolReserves(): number {
    return 30000000000; // PumpFun初始值
  }

  private static getInitialRealTokenReserves(): number {
    return 1073000000000000; // PumpFun初始值
  }

  private static getInitialRealSolReserves(): number {
    return 0; // 新创建的代币初始SOL储备为0
  }

  private static getInitialTokenTotalSupply(): number {
    return 1000000000000000; // PumpFun标准总供应量
  }

  private static deriveAssociatedBondingCurve(mint: string): string {
    // 这里应该使用Solana的PDA推导逻辑
    // 暂时返回placeholder，实际使用时需要实现正确的PDA计算
    return 'placeholder';
  }

  private static deriveCreatorVault(mint: string, creator: string): string {
    // 这里应该使用Solana的PDA推导逻辑
    return 'placeholder';
  }

  /**
   * 检查事件是否包含足够的交易信息
   */
  static hasCompleteTradeInfo(event: DexEvent): boolean {
    if ('PumpSwap' in event) {
      return !!(event.PumpSwap.pool && event.PumpSwap.mint);
    } else if ('PumpFunTrade' in event) {
      return !!(event.PumpFunTrade.mint && event.PumpFunTrade.trader);
    } else if ('PumpFunCreate' in event) {
      return !!(event.PumpFunCreate.mint && event.PumpFunCreate.creator);
    }

    return false;
  }

  /**
   * 从事件中提取代币mint地址
   */
  static extractMintFromEvent(event: DexEvent): string | null {
    if ('PumpSwap' in event) {
      return event.PumpSwap.mint;
    } else if ('PumpFunTrade' in event) {
      return event.PumpFunTrade.mint;
    } else if ('PumpFunCreate' in event) {
      return event.PumpFunCreate.mint;
    }

    return null;
  }
}