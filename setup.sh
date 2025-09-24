#!/bin/bash

echo "📦 安装依赖..."
npm install

echo ""
echo "🔨 编译 TypeScript..."
npm run build

echo ""
echo "✅ 设置完成！"
echo ""
echo "运行示例:"
echo "  npm run dev          # HTTP API 示例"
echo "  npm run subscribe    # WebSocket 订阅示例"
echo "  npm run auto-trade   # 自动交易示例"