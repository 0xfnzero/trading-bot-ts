export enum DexType {
  PumpFun = 'PumpFun',
  PumpSwap = 'PumpSwap',
}

export interface PumpFunParams {
  dex_type: 'PumpFun';
  bonding_curve_account: string;
  virtual_token_reserves: number;
  virtual_sol_reserves: number;
  real_token_reserves: number;
  real_sol_reserves: number;
  token_total_supply: number;
  complete: boolean;
  creator: string;
  associated_bonding_curve: string;
  creator_vault: string;
}

export interface PumpSwapParams {
  dex_type: 'PumpSwap';
  pool: string;
  base_mint: string;
  quote_mint: string;
  pool_base_token_account: string;
  pool_quote_token_account: string;
  pool_base_token_reserves: number;
  pool_quote_token_reserves: number;
  coin_creator_vault_ata: string;
  coin_creator_vault_authority: string;
  base_token_program: string;
  quote_token_program: string;
}

export type DexParams = PumpFunParams | PumpSwapParams;

export interface BuyRequest {
  mint: string;
  amount_sol: number;
  slippage_bps?: number;
}

export interface SellRequest {
  mint: string;
  amount_tokens: number;
  slippage_bps?: number;
}

export interface TradeResponse {
  success: boolean;
  signature?: string;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}