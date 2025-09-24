# Solana DEX Trading Proxy Client

TypeScript/Node.js 客户端库，用于与 Solana DEX 交易代理服务 (trading-proxy-http) 进行交互。

支持通过 HTTP API 执行交易，以及通过 WebSocket 实时订阅链上 DEX 交易事件数据。

## 安装

```bash
cd client
npm install
```

## 构建

```bash
npm run build
```

## 主要功能

- **HTTP API 交易**：通过 HTTP 接口执行 Solana DEX 买入/卖出交易
- **实时数据订阅**：通过 WebSocket 订阅链上 DEX 交易事件
- **多 DEX 支持**：支持 PumpFun、PumpSwap、Raydium、Orca 等主流 DEX
- **低延迟监控**：提供微秒级延迟监控
- **错误重试**：自动重试和容错机制

## 使用场景

- 构建 Solana DEX 交易应用
- 开发链上数据监控工具
- 实现交易策略和算法交易
- 集成到现有的 DeFi 应用中

## 使用

### HTTP 交易示例

```typescript
import { TradingProxyClient, ClientConfig } from 'trading-proxy-client';

const client = new TradingProxyClient({
  baseURL: 'http://localhost:3000',
  timeout: 30000,
  retries: 3
});

// 健康检查
const health = await client.health();
console.log(health);

// 买入交易
const pumpSwapParams: PumpSwapParams = {
  dex_type: 'PumpSwap',
  pool: '你的池子地址',
  base_mint: '代币mint地址',
  quote_mint: 'So11111111111111111111111111111111111111112',
  pool_base_token_account: '池子基础代币账户',
  pool_quote_token_account: '池子报价代币账户',
  pool_base_token_reserves: 1000000,
  pool_quote_token_reserves: 1000000,
  coin_creator_vault_ata: 'creator vault ata',
  coin_creator_vault_authority: 'creator vault authority',
  base_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  quote_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
};

const buyResult = await client.buy(pumpSwapParams, {
  mint: '代币mint地址',
  amount_sol: 0.01,
  slippage_bps: 500, // 5% 滑点
});

console.log('买入结果:', buyResult);

// 卖出交易
const sellResult = await client.sell(pumpSwapParams, {
  mint: '代币mint地址',
  amount_tokens: 1000000,
  slippage_bps: 500,
});

console.log('卖出结果:', sellResult);
```

### 实时数据订阅

```typescript
import { SimpleTradingSubscriber } from 'trading-proxy-client';

const subscriber = new SimpleTradingSubscriber(
  'ws://127.0.0.1:9001',    // WebSocket URL
  'http://localhost:3000'    // HTTP URL
);

subscriber.start();
```

### 运行示例

```bash
# 订阅链上交易数据
npm run subscribe

# 运行交易机器人
npm run bot

# 构建项目
npm run build
```

## API

### TradingProxyClient

#### constructor(config?: ClientConfig)

创建客户端实例。

```typescript
interface ClientConfig {
  baseURL?: string;      // 服务器地址，默认 'http://localhost:3000'
  timeout?: number;      // 请求超时时间，默认 30000ms
  retries?: number;      // 重试次数，默认 3
  retryDelay?: number;   // 重试延迟，默认 1000ms
}
```

#### health(): Promise<HealthResponse>

健康检查。

#### buy(dexParams: DexParams, request: BuyRequest): Promise<TradeResponse>

执行买入交易。

- `dexParams`: DEX 参数（PumpFun 或 PumpSwap）
- `request.mint`: 代币 mint 地址
- `request.amount_sol`: 买入金额（SOL）
- `request.slippage_bps`: 滑点（基点，可选）

#### sell(dexParams: DexParams, request: SellRequest): Promise<TradeResponse>

执行卖出交易。

- `dexParams`: DEX 参数（PumpFun 或 PumpSwap）
- `request.mint`: 代币 mint 地址
- `request.amount_tokens`: 卖出数量（代币）
- `request.slippage_bps`: 滑点（基点，可选）

## 类型定义

### DexParams

支持两种 DEX：

- `PumpFunParams`: PumpFun DEX 参数
- `PumpSwapParams`: PumpSwap DEX 参数

### TradeResponse

```typescript
interface TradeResponse {
  success: boolean;
  signature?: string;
  message: string;
}
```

### ErrorResponse

```typescript
interface ErrorResponse {
  success: false;
  error: string;
}
```

## 错误处理

客户端会自动处理错误并抛出有意义的异常：

```typescript
try {
  const result = await client.buy(params, request);
  console.log('成功:', result);
} catch (error) {
  console.error('失败:', error.message);
}
```

## WebSocket 订阅

### EventSubscriber

实时订阅 Solana DEX 事件流，获取链上交易数据。

#### 构造函数

```typescript
// 简单使用
const subscriber = new EventSubscriber('ws://127.0.0.1:9001');

// 带配置使用
const subscriber = new EventSubscriber({
  wsUrl: 'ws://127.0.0.1:9001',
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  messageBufferSize: 100
});
```

#### 事件监听

**通用事件:**
- `connected`: 连接成功
- `disconnected`: 连接断开
- `reconnecting`: 正在重连
- `error`: 发生错误
- `event`: 任何事件（带延迟信息）

**DEX 特定事件:**
- `pumpswap`: PumpSwap 交易事件
- `pumpfun:trade`: PumpFun 交易事件
- `pumpfun:create`: PumpFun 代币创建事件
- `raydium:ammv4`: Raydium AMM V4 流动性池交易
- `raydium:clmm`: Raydium CLMM 集中流动性交易
- `orca:whirlpool`: Orca Whirlpool 交易事件

#### 基础使用

```typescript
import { EventSubscriber } from 'trading-proxy-client';

const subscriber = new EventSubscriber('ws://127.0.0.1:9001');

subscriber.on('connected', () => {
  console.log('✅ Connected');
});

subscriber.on('pumpswap', (event, latency) => {
  console.log('PumpSwap Event:', event);
  console.log('Latency:', latency?.latency_ms, 'ms');
});

subscriber.on('event', (eventData) => {
  console.log('Event:', eventData.event);
  console.log('Timestamp:', eventData.timestamp);
  console.log('Latency:', eventData.latency?.latency_ms, 'ms');
});

subscriber.connect();

// 断开连接
subscriber.disconnect();
```

#### 延迟信息

每个事件都包含延迟信息（如果可用）：

```typescript
interface LatencyInfo {
  grpc_recv_us: number;      // gRPC 接收时间（微秒）
  client_recv_us: number;     // 客户端接收时间（微秒）
  latency_us: number;         // 延迟（微秒）
  latency_ms: number;         // 延迟（毫秒）
}
```

#### 自动重连

客户端支持自动重连，最多尝试 5 次，使用指数退避策略。

### 结合 HTTP + WebSocket

监控链上交易并执行策略：

```typescript
import { TradingProxyClient, EventSubscriber } from 'trading-proxy-client';

const httpClient = new TradingProxyClient({ baseURL: 'http://localhost:3000' });
const subscriber = new EventSubscriber('ws://127.0.0.1:9001');

// 监听 PumpSwap 大额买入交易
subscriber.on('pumpswap', async (event, latency) => {
  console.log(`交易延迟: ${latency?.latency_ms}ms`);

  if (event.is_buy && event.amount_in > 50000000) { // > 0.05 SOL
    console.log('🎯 检测到大额买入交易');
    console.log(`代币: ${event.mint}`);
    console.log(`金额: ${event.amount_in / 1e9} SOL`);

    // 这里可以实现你的交易策略
    // const result = await httpClient.buy(...);
  }
});

subscriber.connect();
```

## 事件类型

### PumpSwapEvent

```typescript
interface PumpSwapEvent {
  mint: string;
  pool: string;
  trader: string;
  amount_in: number;
  amount_out: number;
  is_buy: boolean;
  metadata?: EventMetadata;
}
```

### PumpFunTradeEvent

```typescript
interface PumpFunTradeEvent {
  mint: string;
  trader: string;
  amount_sol: number;
  amount_token: number;
  is_buy: boolean;
  metadata?: EventMetadata;
}
```

### RaydiumSwapEvent

```typescript
interface RaydiumSwapEvent {
  pool: string;
  trader: string;
  amount_in: number;
  amount_out: number;
  token_in: string;
  token_out: string;
  metadata?: EventMetadata;
}
```

## 简化使用

使用 `SimpleTradingSubscriber` 快速开始：

```typescript
import { SimpleTradingSubscriber } from 'trading-proxy-client';

const subscriber = new SimpleTradingSubscriber();
subscriber.start();

// 会自动显示所有 DEX 交易事件，包括：
// - PumpSwap 交易
// - PumpFun 交易和代币创建
// - Raydium AMM V4 和 CLMM 交易
// - Orca Whirlpool 交易
```

## 开发和部署

```bash
# 安装依赖
npm install

# 开发模式运行
npm run subscribe

# 构建生产版本
npm run build

# 运行生产版本
npm run subscribe:prod
```

## 注意事项

1. **网络连接**：确保交易代理服务正在运行
2. **WebSocket 稳定性**：客户端会自动重连，但建议监控连接状态
3. **错误处理**：所有 API 调用都应该包装在 try-catch 中
4. **延迟监控**：利用延迟信息优化交易时机

## License

MIT