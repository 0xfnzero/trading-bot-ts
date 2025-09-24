import { TradingBot } from './core/bot';
import { ConfigManager } from './core/config-manager';
import { ConsecutiveBuyStrategy, createConsecutiveBuyConfig } from './strategies/consecutive-buy-strategy';

async function main() {
  console.log('🚀 启动交易机器人...\n');

  try {
    // 1. 加载配置
    const configManager = new ConfigManager();
    const botConfig = configManager.getConfig();

    // 验证配置
    const configErrors = configManager.validateConfig();
    if (configErrors.length > 0) {
      console.error('❌ 配置错误:');
      configErrors.forEach(error => console.error(`   - ${error}`));
      process.exit(1);
    }

    console.log('✅ 配置加载完成');
    console.log(`   - HTTP: ${botConfig.httpUrl}`);
    console.log(`   - WebSocket: ${botConfig.wsUrl}`);
    console.log(`   - 干运行模式: ${botConfig.global.dryRun ? '是' : '否'}`);
    console.log(`   - 最大仓位数: ${botConfig.global.maxTotalPositions}`);
    console.log(`   - 最大投资: ${botConfig.global.maxTotalInvestment} SOL\n`);

    // 2. 创建机器人
    const bot = new TradingBot(botConfig);

    // 3. 创建并添加策略
    const strategyConfig = createConsecutiveBuyConfig();

    // 可以通过环境变量覆盖策略参数
    if (process.env.CONSECUTIVE_BUY_COUNT) {
      strategyConfig.consecutiveBuyCount = parseInt(process.env.CONSECUTIVE_BUY_COUNT);
    }
    if (process.env.TOTAL_AMOUNT_THRESHOLD) {
      strategyConfig.totalAmountThreshold = parseFloat(process.env.TOTAL_AMOUNT_THRESHOLD);
    }
    if (process.env.TARGET_PROFIT_RATIO) {
      strategyConfig.targetProfitRatio = parseFloat(process.env.TARGET_PROFIT_RATIO);
    }
    if (process.env.BUY_AMOUNT_SOL) {
      strategyConfig.buyAmountSol = parseFloat(process.env.BUY_AMOUNT_SOL);
    }

    const strategy = new ConsecutiveBuyStrategy(strategyConfig);
    bot.addStrategy(strategy);

    // 4. 设置事件监听
    setupEventListeners(bot, strategy);

    // 5. 启动机器人
    await bot.start();

    console.log('🎯 机器人已启动，等待交易信号...\n');

    // 6. 定期显示状态
    const statusInterval = setInterval(() => {
      showStatus(bot, strategy);
    }, 30000); // 每30秒显示一次

    // 7. 优雅关闭
    process.on('SIGINT', async () => {
      console.log('\n🛑 正在关闭机器人...');
      clearInterval(statusInterval);
      await bot.stop();
      console.log('👋 机器人已关闭');
      process.exit(0);
    });

  } catch (error: any) {
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

function setupEventListeners(bot: TradingBot, strategy: ConsecutiveBuyStrategy) {
  // WebSocket 连接事件
  bot.on('ws:connected', () => {
    console.log('📡 WebSocket 已连接');
  });

  bot.on('ws:disconnected', () => {
    console.log('🔌 WebSocket 连接断开');
  });

  // 策略事件
  bot.on('strategy:added', (name: string) => {
    console.log(`✅ 策略已加载: ${name}`);
  });

  // 仓位事件
  bot.on('position:opened', (position: any) => {
    console.log(`\n🟢 开仓: ${position.mint}`);
    console.log(`   金额: ${position.investedSol} SOL`);
    console.log(`   策略: ${position.strategy}`);
    console.log(`   价格: ${position.entryPrice}`);
  });

  bot.on('position:closed', (position: any, pnl: number) => {
    const pnlPercent = (pnl / position.investedSol * 100).toFixed(2);
    const color = pnl > 0 ? '🟢' : '🔴';
    console.log(`\n${color} 平仓: ${position.mint}`);
    console.log(`   盈亏: ${pnl.toFixed(4)} SOL (${pnlPercent}%)`);
    console.log(`   持仓时间: ${Math.floor((position.lastUpdate - position.entryTime) / 1000)}秒`);
  });

  // 交易信号事件
  bot.on('signal:executed', (signal: any, result: any) => {
    if (result.success) {
      console.log(`\n⚡ 交易执行: ${signal.type.toUpperCase()} ${signal.mint}`);
      console.log(`   原因: ${signal.reason}`);
      console.log(`   签名: ${result.signature}`);
    } else {
      console.log(`\n❌ 交易失败: ${signal.type.toUpperCase()} ${signal.mint}`);
      console.log(`   错误: ${result.error}`);
    }
  });

  // 错误事件
  bot.on('error', (error: Error) => {
    console.error(`❌ 错误: ${error.message}`);
  });

  bot.on('strategy:error', (strategyName: string, error: Error) => {
    console.error(`❌ 策略错误 [${strategyName}]: ${error.message}`);
  });
}

function showStatus(bot: TradingBot, strategy: ConsecutiveBuyStrategy) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 机器人状态');

  const stats = bot.getStats();
  const positionStats = bot.getPositionManager().getStats();
  const strategyStatus = strategy.getStatus();

  console.log(`   总交易: ${stats.totalTrades} | 胜率: ${(stats.winRate * 100).toFixed(1)}%`);
  console.log(`   总盈亏: ${stats.totalPnl.toFixed(4)} SOL`);
  console.log(`   活跃仓位: ${stats.currentPositions}/${bot.getConfig().global.maxTotalPositions}`);
  console.log(`   已投资: ${positionStats.totalInvested.toFixed(4)} SOL`);
  console.log(`   今日盈亏: ${positionStats.dailyPnl.toFixed(4)} SOL`);

  console.log('\n🎯 策略状态');
  console.log(`   跟踪代币: ${strategyStatus.trackedTokens}`);
  console.log(`   已买入代币: ${strategyStatus.boughtTokens}`);

  // 显示最活跃的代币
  const buyHistory = strategyStatus.buyHistory;
  const sortedTokens = Object.entries(buyHistory)
    .map(([mint, events]) => ({
      mint: mint.slice(0, 8) + '...',
      count: events.length,
      total: events.reduce((sum, e) => sum + e.amount, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  if (sortedTokens.length > 0) {
    console.log('\n🔥 活跃代币:');
    sortedTokens.forEach(token => {
      console.log(`   ${token.mint}: ${token.count}笔 / ${token.total.toFixed(2)} SOL`);
    });
  }

  console.log('='.repeat(60));
}

// 生成示例配置文件
function generateConfigs() {
  console.log('生成示例配置文件...');

  // 生成机器人配置
  ConfigManager.generateExample();

  console.log('✅ 示例配置已生成');
  console.log('   - bot-config.example.json: 机器人主配置');
  console.log('\n请复制并修改配置文件:');
  console.log('   cp bot-config.example.json bot-config.json');
}

// 命令行参数处理
if (process.argv.includes('--generate-config')) {
  generateConfigs();
} else {
  main();
}