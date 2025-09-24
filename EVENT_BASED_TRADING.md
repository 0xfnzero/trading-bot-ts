# 基于事件数据的交易参数构建

## 🎯 设计理念

参考 `sol-trade-sdk` 的 Rust 示例，我们的 TypeScript 客户端现在可以**直接从 WebSocket 事件数据构建交易参数**，无需手动填写复杂的 DEX 参数。

## 🔄 事件到交易的完整流程

### 1. 事件接收 (WebSocket)

```typescript
// 从 WebSocket 接收到的 PumpSwap 买入事件
const event: DexEvent = {
  PumpSwap: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    pool: '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj',
    trader: 'GFRFVcJuMl6kW9YqTd1CvjB6Q4V8Pz1zY6BhMzT4k5NN',
    amount_in: 50000000,  // 0.05 SOL
    amount_out: 125000000, // 代币数量
    is_buy: true,
  }
};
```

### 2. 策略分析事件

```typescript
// 连续买入策略分析事件
async analyzeEvent(event: DexEvent): Promise<TradeSignal[]> {
  const buyEvent = this.extractBuyEvent(event);
  if (!buyEvent) return [];

  // 检查连续买入条件
  if (this.checkConsecutiveBuyCondition(buyEvent.mint)) {
    return [{
      type: 'buy',
      mint: buyEvent.mint,
      amount: 0.01, // SOL 金额
      reason: '连续3笔买入触发',
      priority: 'medium',
      // 🔑 关键：将源事件附加到信号中
      params: { sourceEvent: event },
    }];
  }

  return [];
}
```

### 3. 自动构建交易参数

```typescript
// TradeExecutor 自动从事件构建 DEX 参数
async executeSignal(signal: TradeSignal, sourceEvent?: DexEvent): Promise<TradeResult> {
  // 🎯 核心：从事件数据构建交易参数（就像 Rust 示例）
  const dexParams = this.buildDexParamsFromEvent(signal, sourceEvent);

  // 执行交易
  const result = await this.client.buy(dexParams, {
    mint: signal.mint,
    amount_sol: signal.amount, // 用户只需要提供 SOL 金额
    slippage_bps: 500,
  });

  return result;
}
```

### 4. DexParamsBuilder (核心组件)

```typescript
export class DexParamsBuilder {
  static buildFromEvent(event: DexEvent, mint: string, forSell: boolean) {
    if ('PumpSwap' in event) {
      // 🚀 就像 Rust 中的 PumpSwapParams::from_buy_trade()
      return this.buildPumpSwapParams(event.PumpSwap, mint, forSell);
    } else if ('PumpFunTrade' in event) {
      // 🚀 就像 Rust 中的 PumpFunParams::from_trade()
      return this.buildPumpFunTradeParams(event.PumpFunTrade, forSell);
    }
  }
}
```

## 📊 Rust vs TypeScript 对比

### Rust 示例 (sol-trade-sdk)

```rust
// 从事件构建参数
let params = PumpSwapParams::from_buy_trade(&trade_info);

// 执行交易
let buy_params = TradeBuyParams {
    dex_type: DexType::PumpSwap,
    mint: mint_pubkey,
    input_token_amount: buy_sol_amount,
    extension_params: Box::new(params), // 🔑 使用事件数据
    // ... 其他参数
};
client.buy(buy_params).await?;
```

### TypeScript 实现

```typescript
// 从事件构建参数
const dexParams = DexParamsBuilder.buildFromEvent(sourceEvent, mint, false);

// 执行交易
const result = await this.client.buy(dexParams, {
  mint: signal.mint,
  amount_sol: signal.amount, // 🎯 用户只需提供简单参数
  slippage_bps: 500,
});
```

## 🎯 用户体验对比

### ❌ 之前：用户需要手动提供复杂参数

```typescript
// 用户需要自己查找和填写这些复杂参数
const dexParams: PumpSwapParams = {
  dex_type: 'PumpSwap',
  pool: '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj',
  base_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  quote_mint: 'So11111111111111111111111111111111111111112',
  pool_base_token_account: 'base_account_address', // 😰 用户如何获取？
  pool_quote_token_account: 'quote_account_address', // 😰 用户如何获取？
  pool_base_token_reserves: 1000000000, // 😰 用户如何获取？
  pool_quote_token_reserves: 500000000, // 😰 用户如何获取？
  coin_creator_vault_ata: 'creator_vault_address', // 😰 用户如何获取？
  coin_creator_vault_authority: 'creator_authority', // 😰 用户如何获取？
  base_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  quote_token_program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
};
```

### ✅ 现在：用户只需要编写策略逻辑

```typescript
export class MyStrategy extends BaseStrategy {
  async analyzeEvent(event: DexEvent): Promise<TradeSignal[]> {
    // 用户只需要关心策略逻辑
    if (this.shouldBuy(event)) {
      return [{
        type: 'buy',
        mint: 'token_address',
        amount: 0.01, // 简单：SOL 金额
        reason: '我的策略条件满足',
        priority: 'medium',
        // 🎯 系统自动处理复杂的 DEX 参数
      }];
    }
    return [];
  }
}
```

## 🚀 实际使用示例

### 运行演示

```bash
cd client
npm install
npm run demo
```

### 演示输出

```
🎯 演示基于事件数据的交易流程

📨 接收到PumpSwap买入事件:
  代币: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  池子: 8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj
  买入金额: 0.05 SOL
  获得代币: 125000000

✅ 机器人配置完成
  策略: 连续2笔买入
  阈值: 0.08 SOL
  干运行模式: true

🎬 开始模拟连续买入事件...

📥 处理事件:
  交易者: trader1...
  买入: 0.03 SOL

⏳ 等待1秒...

📥 处理事件:
  交易者: trader2...
  买入: 0.06 SOL

⚡ 交易信号执行:
  类型: BUY
  代币: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  金额: 0.01
  原因: 连续2笔买入，累计0.09 SOL
  结果: 成功

📊 策略状态:
  跟踪代币: 1
  已买入代币: 1

✅ 演示完成
```

## 🏗️ 架构优势

### 1. 自动化程度高
- ✅ 用户无需了解 DEX 内部机制
- ✅ 自动从事件提取交易参数
- ✅ 自动处理不同 DEX 的参数格式

### 2. 参考 Rust 最佳实践
- ✅ 直接复用 sol-trade-sdk 的参数构建逻辑
- ✅ 保持与 Rust 版本的一致性
- ✅ 利用链上事件的完整信息

### 3. 用户友好
- ✅ 只需要填写简单的金额参数
- ✅ 专注策略逻辑，不用关心技术细节
- ✅ 类型安全的 TypeScript 接口

### 4. 性能优化
- ✅ 事件缓存机制避免重复查询
- ✅ 自动清理过期事件数据
- ✅ 批量处理多个交易信号

## 🎯 策略开发最佳实践

### 1. 事件分析

```typescript
async analyzeEvent(event: DexEvent): Promise<TradeSignal[]> {
  // ✅ 提取关键信息
  const mint = DexParamsBuilder.extractMintFromEvent(event);
  if (!mint) return [];

  // ✅ 检查事件完整性
  if (!DexParamsBuilder.hasCompleteTradeInfo(event)) {
    return [];
  }

  // ✅ 实现策略逻辑
  if (this.myStrategyCondition(event)) {
    return [{
      type: 'buy',
      mint,
      amount: 0.01, // SOL 金额
      reason: '策略条件满足',
      priority: 'medium',
      // ✅ 让系统自动处理 DEX 参数
    }];
  }

  return [];
}
```

### 2. 错误处理

```typescript
// ✅ 系统会自动处理以下错误:
// - 缺少事件数据
// - DEX 参数构建失败
// - 网络请求失败
// - 交易执行失败

// 用户只需要处理策略逻辑错误
```

### 3. 性能考虑

```typescript
class MyStrategy extends BaseStrategy {
  // ✅ 缓存计算结果
  private calculations = new Map();

  // ✅ 批量处理事件
  async analyzeEvent(event: DexEvent): Promise<TradeSignal[]> {
    // 高效的事件分析逻辑
  }
}
```

## 📝 总结

通过参考 `sol-trade-sdk` 的 Rust 示例，我们实现了：

1. **🎯 事件驱动**: 直接从 WebSocket 事件构建交易参数
2. **🚀 用户友好**: 用户只需要关注策略逻辑和简单金额
3. **⚡ 性能优化**: 事件缓存和批量处理
4. **🛡️ 类型安全**: 完整的 TypeScript 类型定义
5. **🔄 参考最佳实践**: 复用成熟的 Rust 实现逻辑

现在用户可以像编写 Rust 代码一样简单地创建 TypeScript 交易策略，系统会自动处理所有复杂的链交互细节！