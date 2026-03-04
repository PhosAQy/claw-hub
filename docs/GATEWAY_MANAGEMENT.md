# Gateway 管理功能 - 使用指南

## ✨ 新功能

龙虾营地监控面板现在支持远程管理 Gateway！

### 📋 功能列表

#### 1. **查看 Gateway 状态**
- 实时显示 Gateway 运行状态（运行中/已停止）
- 显示 Gateway 端口号
- 自动刷新状态

#### 2. **远程启动 Gateway**
- 点击 "▶ 启动" 按钮
- Hub 发送启动命令到 Agent
- Agent 执行 `openclaw gateway start`
- 自动刷新状态

#### 3. **远程停止 Gateway**
- 点击 "⏹ 停止" 按钮
- Hub 发送停止命令到 Agent
- Agent 执行 `openclaw gateway stop`
- 自动刷新状态

#### 4. **刷新状态**
- 点击 "🔄 刷新" 按钮
- 手动刷新 Gateway 状态

---

## 🚀 使用方法

### 1. 访问监控面板

```
https://camp.aigc.sx.cn
```

### 2. 展开 Agent 详情

1. 点击 Agent 卡片（🦞 大龙虾）
2. 向下滚动到 "Gateway 管理" 部分
3. 查看当前状态

### 3. 管理操作

#### **启动 Gateway**
```
[Gateway 管理]
状态: ⚫ 已停止
[▶ 启动] [🔄 刷新]
```

点击 "▶ 启动" 按钮 → Gateway 将在几秒内启动

#### **停止 Gateway**
```
[Gateway 管理]
状态: 🟢 运行中 (端口: 18789)
[⏹ 停止] [🔄 刷新]
```

点击 "⏹ 停止" 按钮 → Gateway 将在几秒内停止

---

## 🔧 技术实现

### 架构

```
前端 (camp.aigc.sx.cn)
    ↓ HTTP POST /api/gateway/start
Hub (server.aigc.sx.cn:8889)
    ↓ WebSocket {type: 'gateway-start'}
Agent (本地 Mac)
    ↓ exec('openclaw gateway start')
Gateway 进程启动
```

### API 接口

#### **启动 Gateway**
```bash
POST /api/gateway/start?agent=main&token=xxx

Response:
{
  "success": true,
  "message": "Gateway start command sent"
}
```

#### **停止 Gateway**
```bash
POST /api/gateway/stop?agent=main&token=xxx

Response:
{
  "success": true,
  "message": "Gateway stop command sent"
}
```

### WebSocket 消息

#### **启动命令**
```json
{
  "type": "gateway-start",
  "payload": {
    "token": "claw-hub-2026"
  }
}
```

#### **停止命令**
```json
{
  "type": "gateway-stop",
  "payload": {
    "token": "claw-hub-2026"
  }
}
```

---

## 🎯 匉钮说明

| 按钮 | 颜色 | 功能 | 确认 |
|------|------|------|------|
| **▶ 启动** | 绿色 | 启动 Gateway | ✅ 需要确认 |
| **⏹ 停止** | 红色 | 停止 Gateway | ✅ 需要确认 |
| **🔄 刷新** | 蓝色 | 刷新状态 | ❌ 无需确认 |

---

## 🔒 安全机制

### Token 验证

所有操作都需要 token 验证：

```javascript
// 前端获取 token
const tokenRes = await fetch('/api/token');
const tokenData = await tokenRes.json();
const token = tokenData.token;

// 发送请求时携带 token
fetch(`/api/gateway/start?agent=main&token=${token}`);
```

### Agent 验证

Agent 也会验证 token（如果配置了 `updateToken`）:

```javascript
// agent.js
if (CONFIG.updateToken && token !== CONFIG.updateToken) {
  console.log('[Agent] Gateway 启动令牌无效');
  return;
}
```

---

## 📊 状态显示

### 运行中
```
🟢 运行中 (端口: 18789)
[⏹ 停止] [🔄 刷新]
```

### 已停止
```
⚫ 已停止
[▶ 启动] [🔄 刷新]
```

### 未知
```
⚪ 未知
[▶ 启动] [🔄 刷新]
```

---

## 🐛 故障排查

### 问题 1: 点击按钮无反应

**检查**:
1. 打开浏览器控制台（F12）
2. 查看是否有错误
3. 检查网络请求是否发送

**解决**:
```bash
# 检查 Hub 日志
ssh phosa_claw@server.aigc.sx.cn 'tail -20 ~/claw-hub/hub.log'

# 检查 Agent 日志
tail -20 /tmp/agent.log
```

### 问题 2: Gateway 启动失败

**检查**:
```bash
# 手动测试启动命令
openclaw gateway start

# 查看错误日志
tail -50 /tmp/agent.log | grep -i "gateway"
```

**解决**:
- 检查 OpenClaw 是否正确安装
- 检查 Gateway 配置文件
- 检查端口是否被占用

### 问题 3: 状态不更新

**检查**:
```bash
# 手动刷新 Agent 状态
pkill -f "node.*agent.js"
cd ~/.openclaw/extensions/claw-camp-agent
nohup node src/agent.js > /tmp/agent.log 2>&1 &
```

---

## 📚 相关文档

- **监控面板**: https://camp.aigc.sx.cn
- **GitHub**: https://github.com/PhosAQy/claw-hub
- **API 文档**: `/docs/API.md`
- **插件文档**: `~/.openclaw/extensions/claw-camp-agent/README.md`

---

## 🎉 总结

Gateway 管理功能已完全集成到龙虾营地监控面板！

- ✅ **实时监控** - 查看 Gateway 运行状态
- ✅ **远程启动** - 一键启动 Gateway
- ✅ **远程停止** - 一键停止 Gateway
- ✅ **状态刷新** - 手动刷新状态
- ✅ **安全验证** - Token 验证机制
- ✅ **用户友好** - 确认对话框，- ✅ **错误处理** - 完善的错误提示

**现在就访问 https://camp.aigc.sx.cn 试试吧！** 🦞✨
