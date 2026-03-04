#!/bin/bash
# 龙虾营地 Agent 安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/PhosAQy/claw-hub/main/scripts/install-agent.sh | bash

set -e

AGENT_VERSION="1.0.0"
INSTALL_DIR="$HOME/.openclaw/agents/camp-agent"
REPO_URL="https://github.com/PhosAQy/claw-hub.git"

echo ""
echo "🦞 龙虾营地 Agent 安装器"
echo "   版本: v$AGENT_VERSION"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ Node.js: $(node -v)"
echo ""

# 创建安装目录
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 克隆或更新仓库
if [ -d ".git" ]; then
    echo "📦 更新现有安装..."
    git pull
else
    echo "📦 克隆仓库..."
    git clone "$REPO_URL" .
fi

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 创建启动脚本
cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# 环境变量（可选）
export CLAW_HUB_URL="${CLAW_HUB_URL:-ws://server.aigc.sx.cn:8889}"
export CLAW_AGENT_ID="${CLAW_AGENT_ID:-main}"
export CLAW_AGENT_NAME="${CLAW_AGENT_NAME:-大龙虾}"

echo "🦞 启动龙虾营地 Agent..."
node src/agent.js
EOF

chmod +x start.sh

echo ""
echo "✅ 安装完成！"
echo ""
echo "使用方法："
echo "  cd $INSTALL_DIR"
echo "  ./start.sh"
echo ""
echo "或配置环境变量后启动："
echo "  export CLAW_HUB_URL=ws://your-server:8889"
echo "  export CLAW_AGENT_ID=my-agent"
echo "  export CLAW_AGENT_NAME=我的Agent"
echo "  ./start.sh"
echo ""
