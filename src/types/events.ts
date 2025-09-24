export interface EventMetadata {
  grpc_recv_us?: number;
  slot?: number;
  signature?: string;
}

export interface LatencyInfo {
  grpc_recv_us: number;
  client_recv_us: number;
  latency_us: number;
  latency_ms: number;
}

export interface PumpSwapEvent {
  mint: string;
  pool: string;
  trader: string;
  amount_in: number;
  amount_out: number;
  is_buy: boolean;
  metadata?: EventMetadata;
}

export interface PumpFunTradeEvent {
  mint: string;
  trader: string;
  amount_sol: number;
  amount_token: number;
  is_buy: boolean;
  metadata?: EventMetadata;
}

export interface PumpFunCreateEvent {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  metadata?: EventMetadata;
}

export interface RaydiumSwapEvent {
  pool: string;
  trader: string;
  amount_in: number;
  amount_out: number;
  token_in: string;
  token_out: string;
  metadata?: EventMetadata;
}

export interface OrcaSwapEvent {
  pool: string;
  trader: string;
  amount_in: number;
  amount_out: number;
  token_a: string;
  token_b: string;
  metadata?: EventMetadata;
}

export type DexEvent =
  | { PumpSwap: PumpSwapEvent }
  | { PumpFunTrade: PumpFunTradeEvent }
  | { PumpFunCreate: PumpFunCreateEvent }
  | { RaydiumAmmV4Swap: RaydiumSwapEvent }
  | { RaydiumClmmSwap: RaydiumSwapEvent }
  | { OrcaWhirlpoolSwap: OrcaSwapEvent };

export interface EventWithLatency {
  event: DexEvent;
  latency?: LatencyInfo;
  timestamp: Date;
}