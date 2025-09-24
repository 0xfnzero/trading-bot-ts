#!/bin/bash

echo "🤖 交易机器人启动脚本"
echo "================================"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查配置文件
if [ ! -f "bot-config.json" ]; then
    echo "⚙️ 生成配置文件..."
    npm run generate-config
    echo ""
    echo "📋 请按以下步骤配置："
    echo "   1. cp bot-config.example.json bot-config.json"
    echo "   2. 编辑 bot-config.json"
    echo "   3. 设置环境变量 PAYER_PRIVATE_KEY"
    echo "   4. 再次运行此脚本"
    exit 1
fi

# 检查环境变量
if [ -z "$PAYER_PRIVATE_KEY" ]; then
    echo "❌ 请设置环境变量 PAYER_PRIVATE_KEY"
    echo "   export PAYER_PRIVATE_KEY=your_private_key"
    exit 1
fi

# 显示当前配置
echo "📊 当前配置:"
echo "   干运行模式: ${DRY_RUN:-true}"
echo "   最大仓位: ${MAX_TOTAL_POSITIONS:-5}"
echo "   最大投资: ${MAX_TOTAL_INVESTMENT:-0.5} SOL"
echo "   连续买入次数: ${CONSECUTIVE_BUY_COUNT:-3}"
echo "   金额阈值: ${TOTAL_AMOUNT_THRESHOLD:-5.0} SOL"
echo "   目标涨幅: ${TARGET_PROFIT_RATIO:-0.1} (10%)"
echo ""

# 确认启动
echo "🚀 准备启动机器人..."
echo "   按 Ctrl+C 停止"
echo "   日志会实时显示"
echo ""
read -p "按回车键继续..." -r

# 启动机器人
npm run bot