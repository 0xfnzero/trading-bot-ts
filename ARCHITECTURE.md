# 交易机器人架构说明

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Trading Bot Framework                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   ConfigManager │    │  PositionManager │                │
│  │   - 配置管理     │    │   - 仓位管理     │                │
│  │   - 环境变量     │    │   - 盈亏计算     │                │
│  └─────────────────┘    └─────────────────┘                 │
│                                   │                         │
│  ┌─────────────────────────────────▼─────────────────────┐   │
│  │                TradingBot (核心引擎)                  │   │
│  │  - 事件处理                                          │   │
│  │  - 策略管理                                          │   │
│  │  - 风险控制                                          │   │
│  │  - 交易执行                                          │   │
│  └─────────────────────────────────┬─────────────────────┘   │
│                                   │                         │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │  EventSubscriber│    │   TradeExecutor │                 │
│  │  - WebSocket     │    │   - HTTP API    │                │
│  │  - 事件监听      │    │   - 交易执行     │                │
│  └─────────────────┘    └─────────────────┘                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    Strategy Layer                           │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   BaseStrategy  │    │ ConsecutiveBuy  │                 │
│  │   - 抽象基类     │    │  - 连续买入策略  │                │
│  │   - 公共逻辑     │    │  - 自动止盈      │                │
│  └─────────────────┘    └─────────────────┘                 │
│           │                       │                         │
│           └───────────────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📦 核心组件

### 1. TradingBot (核心引擎)

**职责**:
- 统一的事件处理中心
- 策略生命周期管理
- 风险控制和限额检查
- 交易信号处理和执行

**特性**:
- 事件驱动架构
- 多策略并行运行
- 实时风险监控
- 优雅关闭机制

### 2. BaseStrategy (策略基类)

**提供**:
- 策略接口规范
- 公共逻辑实现
- 止盈止损机制
- 仓位管理集成

**扩展点**:
- `analyzeEvent()` - 事件分析逻辑
- `checkExitConditions()` - 退出条件检查
- `onTradeResult()` - 交易结果回调

### 3. PositionManager (仓位管理)

**功能**:
- 仓位生命周期管理
- 实时盈亏计算
- 统计数据生成
- 数据持久化

**数据结构**:
```typescript
Position {
  mint: string,           // 代币地址
  amount: number,         // 持仓数量
  entryPrice: number,     // 入场价格
  entryTime: number,      // 入场时间
  investedSol: number,    // 投入SOL
  currentValue: number,   // 当前价值
  pnlRatio: number,       // 盈亏比例
}
```

### 4. EventSubscriber (事件订阅)

**特性**:
- WebSocket 长连接
- 自动重连机制
- 延迟计算
- 事件类型转换

**支持事件**:
- PumpSwap 交易
- PumpFun 交易/创建
- Raydium AMM/CLMM
- Orca Whirlpool

### 5. TradeExecutor (交易执行)

**金额处理**:
- **买入**: SOL 浮点数金额 → 自动转换为 lamports
- **卖出**: -1 (全部余额) → 自动获取代币数量

**模式**:
- 干运行模式 (测试)
- 实际交易模式

## 🎯 策略开发

### 连续买入策略 (ConsecutiveBuyStrategy)

```typescript
// 触发条件
连续3笔买入 + 累计金额 > 5 SOL

// 执行动作
买入 0.01 SOL 代币

// 退出条件
涨幅达到 10% → 自动卖出全部
```

**核心逻辑**:
1. 监听所有交易事件
2. 记录买入事件历史
3. 检查连续买入条件
4. 生成交易信号
5. 自动止盈管理

### 自定义策略开发

```typescript
export class MyStrategy extends BaseStrategy {
  async analyzeEvent(event: DexEvent): Promise<TradeSignal[]> {
    // 1. 分析事件
    // 2. 检查条件
    // 3. 生成信号
    return signals;
  }

  async checkExitConditions(position: Position): Promise<TradeSignal | null> {
    // 1. 获取当前价格
    // 2. 计算盈亏比例
    // 3. 检查退出条件
    return exitSignal;
  }
}
```

## 🔄 数据流

### 事件处理流程

```
WebSocket Event
      ↓
EventSubscriber.handleMessage()
      ↓
TradingBot.handleEvent()
      ↓
Strategy.analyzeEvent()
      ↓
TradeSignal[]
      ↓
TradingBot.executeSignals()
      ↓
TradeExecutor.executeSignal()
      ↓
HTTP API Call
      ↓
PositionManager.updatePosition()
      ↓
Strategy.onTradeResult()
```

### 配置加载流程

```
环境变量
      ↓
ConfigManager.loadConfig()
      ↓
配置文件 (bot-config.json)
      ↓
默认配置合并
      ↓
配置验证
      ↓
TradingBot 初始化
```

## 🛡️ 风险控制

### 多层风险控制

**1. 全局限制**:
- 最大仓位数 (maxTotalPositions)
- 最大投资金额 (maxTotalInvestment)
- 紧急停止 (emergencyStop)

**2. 策略限制**:
- 单策略最大仓位 (maxPositions)
- 单笔交易限额 (maxTradeAmount)
- 最小交易金额 (minTradeAmount)

**3. 风险管理**:
- 日亏损限制 (maxDailyLoss)
- 连续亏损保护 (maxConsecutiveLosses)
- 亏损暂停机制 (pauseAfterLoss)

**4. 仓位管理**:
- 自动止盈 (takeProfitRatio)
- 自动止损 (stopLossRatio)
- 最小持仓时间 (minHoldTime)

### 风险检查流程

```typescript
function checkRiskLimits(signal: TradeSignal): boolean {
  // 1. 检查紧急停止
  if (emergencyStop) return false;

  // 2. 检查最大仓位数
  if (positionCount >= maxTotalPositions) return false;

  // 3. 检查最大投资金额
  if (totalInvested + signal.amount > maxTotalInvestment) return false;

  // 4. 检查日亏损限制
  if (dailyPnl < -maxDailyLoss) return false;

  return true;
}
```

## 📊 监控和状态

### 实时状态监控

**机器人状态**:
- 总交易次数和胜率
- 总盈亏和今日盈亏
- 活跃仓位数/最大限制
- 已投资金额

**策略状态**:
- 跟踪代币数量
- 已买入代币数量
- 活跃代币排行

**系统状态**:
- WebSocket 连接状态
- 延迟统计
- 错误率统计

### 事件日志

```
[时间] [类型] [描述]
10:30:15 📡 WebSocket 已连接
10:30:16 ✅ 策略已加载: ConsecutiveBuy
10:30:45 🟢 开仓: AbCdEf... (0.01 SOL)
10:31:30 🟢 平仓: AbCdEf... (+0.0012 SOL, 12%)
```

## 🚀 部署和运维

### 开发环境

```bash
# 安装依赖
npm install

# 生成配置
npm run generate-config

# 启动 (干运行模式)
npm run bot
```

### 生产环境

```bash
# 构建
npm run build

# 配置环境变量
export DRY_RUN=false
export PAYER_PRIVATE_KEY=your_key

# 启动
npm run start
```

### 监控脚本

```bash
# 使用启动脚本 (推荐)
./start-bot.sh

# 后台运行
nohup npm run start > bot.log 2>&1 &

# 查看日志
tail -f bot.log
```

## 🔧 扩展性设计

### 策略扩展

1. **继承 BaseStrategy**
2. **实现必要方法**
3. **注册到机器人**
4. **配置参数**

### 事件源扩展

1. **实现 EventEmitter 接口**
2. **统一事件格式**
3. **集成到 TradingBot**

### 交易所扩展

1. **实现 TradeExecutor 接口**
2. **处理不同 DEX 参数**
3. **统一响应格式**

## 📈 性能优化

### 内存管理

- 价格历史限制在1000条
- 定期清理过期数据
- 仓位数据持久化

### 网络优化

- HTTP 连接复用
- WebSocket 自动重连
- 请求失败重试

### 计算优化

- 事件批量处理
- 异步并发执行
- 缓存频繁计算

## 📚 最佳实践

### 策略开发

1. **先测试后部署**
2. **合理设置参数**
3. **实现完善日志**
4. **处理异常情况**

### 风险管理

1. **小金额测试**
2. **设置止损线**
3. **分散投资**
4. **定期检查**

### 运维管理

1. **监控日志**
2. **备份配置**
3. **定期更新**
4. **性能调优**