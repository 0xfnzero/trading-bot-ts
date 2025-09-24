# 快速开始指南

## 安装

```bash
cd client
npm install
```

## 使用场景

### 1. HTTP API - 手动交易

适合需要精确控制的场景。

```bash
npm run dev
```

```typescript
import { TradingProxyClient } from 'trading-proxy-client';

const client = new TradingProxyClient('http://localhost:3000');

// 买入
await client.buy(dexParams, {
  mint: '代币地址',
  amount_sol: 0.01,
  slippage_bps: 500,
});

// 卖出
await client.sell(dexParams, {
  mint: '代币地址',
  amount_tokens: 1000000,
  slippage_bps: 500,
});
```

### 2. WebSocket 订阅 - 实时监控

适合监控市场、分析数据的场景。

```bash
npm run subscribe
```

```typescript
import { EventSubscriber } from 'trading-proxy-client';

const subscriber = new EventSubscriber('ws://127.0.0.1:9001');

// 监听所有交易
subscriber.on('event', (eventData) => {
  console.log('Event:', eventData.event);
  console.log('Latency:', eventData.latency?.latency_ms, 'ms');
});

// 监听 PumpSwap 交易
subscriber.on('pumpswap', (event, latency) => {
  console.log(`${event.is_buy ? 'BUY' : 'SELL'}: ${event.mint}`);
  console.log(`Amount: ${event.amount_in} -> ${event.amount_out}`);
});

subscriber.connect();
```

### 3. 自动交易策略 - HTTP + WebSocket

适合自动化交易、跟单策略。

```bash
npm run auto-trade
```

```typescript
import { TradingProxyClient, EventSubscriber } from 'trading-proxy-client';

const client = new TradingProxyClient('http://localhost:3000');
const subscriber = new EventSubscriber('ws://127.0.0.1:9001');

// 策略：监听大额买入并跟单
subscriber.on('pumpswap', async (event, latency) => {
  // 检测大额买入（>5 SOL）
  if (event.is_buy && event.amount_in > 5.0) {
    console.log('🎯 大额买入检测！');

    // 延迟信息
    if (latency) {
      console.log(`⚡ Latency: ${latency.latency_ms}ms`);
    }

    // 执行跟单
    try {
      const result = await client.buy(dexParams, {
        mint: event.mint,
        amount_sol: 0.01,
        slippage_bps: 500,
      });

      console.log('✅ 跟单成功:', result.signature);
    } catch (error) {
      console.error('❌ 跟单失败:', error);
    }
  }
});

subscriber.connect();
```

## 常见策略示例

### 策略 1: 大额跟单

监听大额交易并跟单：

```typescript
subscriber.on('pumpswap', async (event) => {
  if (event.is_buy && event.amount_in >= 5.0) {
    await client.buy(params, {
      mint: event.mint,
      amount_sol: 0.01,
    });
  }
});
```

### 策略 2: 延迟套利

利用延迟差异进行套利：

```typescript
subscriber.on('event', async (eventData) => {
  if (eventData.latency && eventData.latency.latency_ms < 50) {
    // 低延迟，可能有套利机会
    console.log('⚡ 超低延迟事件');
  }
});
```

### 策略 3: 新币监控

监控新创建的代币：

```typescript
subscriber.on('pumpfun:create', async (event) => {
  console.log('🆕 新币创建:');
  console.log(`  名称: ${event.name}`);
  console.log(`  符号: ${event.symbol}`);
  console.log(`  Mint: ${event.mint}`);

  // 可以在这里决定是否买入
});
```

### 策略 4: 止盈止损

结合仓位管理：

```typescript
const positions = new Map();

subscriber.on('pumpswap', async (event) => {
  const position = positions.get(event.mint);

  if (position) {
    const currentPrice = event.amount_out / event.amount_in;
    const pnl = (currentPrice - position.entryPrice) / position.entryPrice;

    // 止盈 20%
    if (pnl >= 0.2) {
      await client.sell(params, {
        mint: event.mint,
        amount_tokens: position.amount,
      });
      positions.delete(event.mint);
      console.log('✅ 止盈卖出');
    }

    // 止损 -10%
    if (pnl <= -0.1) {
      await client.sell(params, {
        mint: event.mint,
        amount_tokens: position.amount,
      });
      positions.delete(event.mint);
      console.log('🛑 止损卖出');
    }
  }
});
```

## 性能优化建议

### 1. 使用连接池

HTTP 客户端会自动复用连接（Keep-Alive）。

### 2. 批量处理

将多个交易请求批量处理：

```typescript
const trades = [];

subscriber.on('pumpswap', (event) => {
  if (shouldTrade(event)) {
    trades.push(event);
  }
});

// 每秒批量处理
setInterval(async () => {
  if (trades.length > 0) {
    await Promise.all(
      trades.map(trade => executeTrade(trade))
    );
    trades.length = 0;
  }
}, 1000);
```

### 3. 错误处理

实现完善的错误处理和重试机制：

```typescript
async function executeTrade(event, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.buy(params, request);
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * Math.pow(2, i));
    }
  }
}
```

## 调试技巧

### 查看延迟信息

```typescript
subscriber.on('event', (eventData) => {
  if (eventData.latency) {
    const { latency_ms, latency_us } = eventData.latency;
    console.log(`⏱️ Latency: ${latency_ms}ms (${latency_us}μs)`);
  }
});
```

### 统计交易量

```typescript
let buyCount = 0;
let sellCount = 0;

subscriber.on('pumpswap', (event) => {
  if (event.is_buy) buyCount++;
  else sellCount++;
});

setInterval(() => {
  console.log(`📊 Stats: ${buyCount} buys, ${sellCount} sells`);
}, 10000);
```

## 注意事项

1. **测试先行**: 先在测试网测试所有策略
2. **资金控制**: 设置最大交易金额和总仓位限制
3. **错误处理**: 处理所有可能的错误情况
4. **监控日志**: 记录所有交易和错误
5. **延迟监控**: 关注延迟，高延迟可能导致策略失效

## 环境变量

创建 `.env` 文件：

```env
HTTP_API_URL=http://localhost:3000
WS_URL=ws://127.0.0.1:9001
PAYER_PRIVATE_KEY=your_key_here
```

## 故障排查

### WebSocket 连接失败

```bash
# 检查 WebSocket 服务是否运行
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://127.0.0.1:9001
```

### HTTP API 连接失败

```bash
# 检查 HTTP 服务
curl http://localhost:3000/health
```

### 交易失败

1. 检查钱包余额
2. 检查滑点设置
3. 查看日志错误信息
4. 验证 DEX 参数正确性

## 更多资源

- [完整 API 文档](./README.md)
- [示例代码](./src/)
- [问题反馈](https://github.com/your-repo/issues)