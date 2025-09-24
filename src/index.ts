// Main Clients
export { TradingProxyClient as default } from './client';
export { TradingProxyClient, ClientConfig } from './client';
export { EventSubscriber, SubscriberConfig } from './subscriber';
export { SimpleTradingSubscriber } from './simple-subscriber';

// Bot Framework
export { TradingBot, BotConfig } from './core/bot';
export { BaseStrategy, StrategyConfig, StrategyContext } from './core/strategy';
export { PositionManager } from './core/position-manager';
export { ConfigManager } from './core/config-manager';
export { TradeExecutor } from './core/trade-executor';

// Strategies
export { ConsecutiveBuyStrategy, ConsecutiveBuyConfig, createConsecutiveBuyConfig } from './strategies/consecutive-buy-strategy';

// Types - Core Trading
export {
  DexType,
  PumpFunParams,
  PumpSwapParams,
  DexParams,
  BuyRequest,
  SellRequest,
  TradeResponse,
  ErrorResponse,
  HealthResponse,
} from './types';

// Types - Events
export {
  EventMetadata,
  LatencyInfo,
  PumpSwapEvent,
  PumpFunTradeEvent,
  PumpFunCreateEvent,
  RaydiumSwapEvent,
  OrcaSwapEvent,
  DexEvent,
  EventWithLatency,
} from './types/events';

// Types - Positions
export {
  Position,
  PositionUpdate,
} from './types/position';

// Types - Trading Signals
export {
  TradeSignal,
  TradeRequest,
  TradeResult,
  TradingStats,
} from './types/trading';