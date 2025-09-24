# 交易机器人使用指南

## 🚀 快速开始

### 1. 生成配置文件

```bash
cd client
npm install
npm run generate-config
```

这会生成 `bot-config.example.json`，复制并修改：

```bash
cp bot-config.example.json bot-config.json
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# HTTP API 地址
HTTP_API_URL=http://localhost:3000

# WebSocket 地址
WS_URL=ws://127.0.0.1:9001

# 机器人配置
DRY_RUN=true                    # 干运行模式
EMERGENCY_STOP=false            # 紧急停止
MAX_TOTAL_POSITIONS=5           # 最大仓位数
MAX_TOTAL_INVESTMENT=0.5        # 最大投资金额 (SOL)

# 连续买入策略参数
CONSECUTIVE_BUY_COUNT=3         # 连续买入次数
TOTAL_AMOUNT_THRESHOLD=5.0      # 累计金额阈值 (SOL)
TARGET_PROFIT_RATIO=0.1         # 目标涨幅 (10%)
BUY_AMOUNT_SOL=0.01            # 单次买入金额 (SOL)
```

### 3. 启动机器人

```bash
# 开发模式
npm run bot

# 生产模式
npm run bot:prod
```

## 📊 内置策略: 连续买入跟单

### 策略逻辑

1. **监听条件**: 连续3笔买入交易，且累计金额大于5 SOL
2. **买入操作**: 自动买入 0.01 SOL 的代币
3. **卖出条件**: 涨幅达到10%时自动卖出全部持仓

### 策略参数

```typescript
interface ConsecutiveBuyConfig {
  consecutiveBuyCount: 3,        // 连续买入次数阈值
  totalAmountThreshold: 5.0,     // 累计金额阈值 (SOL)
  timeWindowSeconds: 300,        // 时间窗口 (5分钟)
  targetProfitRatio: 0.1,        // 目标涨幅 (10%)
  buyAmountSol: 0.01,           // 买入金额 (SOL)
}
```

### 金额处理机制

**买入时**:
- 用户只需填入 SOL 浮点数金额 (如 `0.01`)
- 系统自动处理 lamports 转换和 decimal 计算

**卖出时**:
- 系统自动卖出当前持仓的全部余额
- 不需要手动计算代币数量和 decimal

## 🛠️ 自定义策略

### 1. 创建策略类

```typescript
import { BaseStrategy, StrategyConfig } from '../core/strategy';
import { DexEvent, LatencyInfo } from '../types/events';
import { TradeSignal } from '../types/trading';

interface MyStrategyConfig extends StrategyConfig {
  // 自定义参数
  customParam: number;
}

export class MyStrategy extends BaseStrategy {
  protected config: MyStrategyConfig;

  constructor(config: MyStrategyConfig) {
    super(config);
  }

  async analyzeEvent(event: DexEvent, latency?: LatencyInfo): Promise<TradeSignal[]> {
    const signals: TradeSignal[] = [];

    // 分析逻辑
    if (this.shouldBuy(event)) {
      signals.push({
        type: 'buy',
        mint: 'token_address',
        amount: 0.01, // SOL 金额
        reason: '策略触发条件',
        priority: 'medium',
      });
    }

    return signals;
  }

  private shouldBuy(event: DexEvent): boolean {
    // 自定义买入逻辑
    return false;
  }
}
```

### 2. 使用自定义策略

```typescript
import { TradingBot } from './core/bot';
import { MyStrategy } from './strategies/my-strategy';

const bot = new TradingBot(config);

const strategy = new MyStrategy({
  name: 'MyStrategy',
  enabled: true,
  maxPositions: 3,
  maxTradeAmount: 0.1,
  minTradeAmount: 0.01,
  slippageBps: 500,
  // 自定义参数
  customParam: 100,
});

bot.addStrategy(strategy);
await bot.start();
```

## 📈 监控和管理

### 实时状态

机器人会每30秒显示一次状态：

```
📊 机器人状态
   总交易: 12 | 胜率: 75.0%
   总盈亏: 0.0234 SOL
   活跃仓位: 2/5
   已投资: 0.02 SOL
   今日盈亏: 0.0134 SOL

🎯 策略状态
   跟踪代币: 8
   已买入代币: 2

🔥 活跃代币:
   AbCdEfGh...: 4笔 / 6.50 SOL
   XyZ12345...: 3笔 / 5.20 SOL
```

### 事件日志

```
📡 WebSocket 已连接
✅ 策略已加载: ConsecutiveBuy

🟢 开仓: AbCdEfGhIjKlMnOpQrStUvWxYz
   金额: 0.01 SOL
   策略: ConsecutiveBuy
   价格: 0.000123

⚡ 交易执行: BUY AbCdEfGhIjKlMnOpQrStUvWxYz
   原因: 连续3笔买入，累计6.50 SOL
   签名: 5J7k8L9m...

🟢 平仓: AbCdEfGhIjKlMnOpQrStUvWxYz
   盈亏: 0.0012 SOL (12.00%)
   持仓时间: 45秒
```

## ⚙️ 配置详解

### 主配置文件 `bot-config.json`

```json
{
  "httpUrl": "http://localhost:3000",
  "wsUrl": "ws://127.0.0.1:9001",
  "global": {
    "maxTotalPositions": 5,
    "maxTotalInvestment": 0.5,
    "emergencyStop": false,
    "dryRun": true
  },
  "riskManagement": {
    "maxDailyLoss": 0.05,
    "maxConsecutiveLosses": 3,
    "pauseAfterLoss": 600
  }
}
```

### 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `maxTotalPositions` | 最大同时持仓数 | 5 |
| `maxTotalInvestment` | 最大总投资金额(SOL) | 0.5 |
| `dryRun` | 干运行模式(不实际交易) | true |
| `emergencyStop` | 紧急停止所有交易 | false |
| `maxDailyLoss` | 最大日亏损比例 | 0.05 (5%) |
| `maxConsecutiveLosses` | 最大连续亏损次数 | 3 |
| `pauseAfterLoss` | 亏损后暂停时间(秒) | 600 |

## 🔒 风险控制

### 内置风险控制

1. **仓位限制**: 最大同时持仓数控制
2. **资金限制**: 总投资金额上限
3. **止损机制**: 自动止盈止损
4. **日亏损限制**: 达到限制自动停止
5. **连续亏损保护**: 连续亏损后自动暂停

### 紧急操作

```bash
# 设置紧急停止
export EMERGENCY_STOP=true

# 或修改配置文件
# "emergencyStop": true
```

### 干运行模式

生产环境前建议先用干运行模式测试：

```bash
export DRY_RUN=true
npm run bot
```

干运行模式会：
- 模拟所有交易操作
- 显示完整交易日志
- 不实际花费资金
- 测试策略逻辑

## 📚 API 文档

### TradingBot

```typescript
const bot = new TradingBot(config);

// 添加策略
bot.addStrategy(strategy);

// 启动/停止
await bot.start();
await bot.stop();

// 获取状态
const stats = bot.getStats();
const positions = bot.getPositionManager().getStats();
```

### BaseStrategy

```typescript
class MyStrategy extends BaseStrategy {
  // 分析事件
  async analyzeEvent(event, latency): Promise<TradeSignal[]>

  // 检查退出条件
  async checkExitConditions(position): Promise<TradeSignal | null>

  // 初始化/销毁
  async initialize(): Promise<void>
  async destroy(): Promise<void>

  // 交易结果回调
  async onTradeResult(signal, result): Promise<void>
}
```

## 🐛 故障排除

### 常见问题

**1. WebSocket 连接失败**
```bash
# 检查 WebSocket 服务
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" ws://127.0.0.1:9001
```

**2. HTTP API 连接失败**
```bash
# 检查 HTTP 服务
curl http://localhost:3000/health
```

**3. 策略不触发**
- 检查策略配置参数
- 确认事件源正常
- 查看控制台日志

**4. 交易失败**
- 检查钱包余额
- 验证滑点设置
- 确认 DEX 参数正确

### 日志级别

```bash
# 详细日志
DEBUG=* npm run bot

# 错误日志
NODE_ENV=production npm run bot
```

## 🔄 更新和维护

### 更新代码

```bash
git pull origin main
npm install
npm run build
```

### 数据备份

机器人会自动保存：
- 仓位数据
- 交易历史
- 策略状态

数据文件位置：
- `positions.json` - 仓位数据
- `trade-history.json` - 交易历史
- `bot-config.json` - 配置文件

### 性能优化

1. **定期清理**: 机器人会自动清理7天前的历史数据
2. **内存管理**: 价格历史限制在1000条记录
3. **连接复用**: HTTP 客户端使用连接池

## 🤝 贡献策略

欢迎贡献新的交易策略！

1. 创建策略文件: `src/strategies/your-strategy.ts`
2. 继承 `BaseStrategy` 类
3. 实现 `analyzeEvent` 方法
4. 提交 Pull Request

## 📄 许可证

MIT License