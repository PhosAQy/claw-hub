# 龙虾营地聊天功能清单

## ✅ 已实现

### 1. 会话管理
- [x] 创建私聊会话（direct）
- [x] 创建群聊会话（group）
- [x] 创建机器人会话（bot）
- [x] 自动复用现有私聊会话
- [x] 获取会话列表
- [x] 获取会话成员列表
- [x] 群聊添加成员

### 2. 消息管理
- [x] 发送文本消息
- [x] 获取消息历史（分页）
- [x] 消息回复（reply_to）
- [x] 未读消息计数
- [x] 已读时间戳（last_read_at）
- [x] **实时消息推送**（刚刚修复 ✅）

### 3. 权限控制
- [x] 用户认证（x-camp-key）
- [x] 会话成员验证
- [x] 群聊角色管理（owner/admin/member）

### 4. 数据持久化
- [x] MySQL 存储
- [x] 消息索引优化
- [x] 软删除支持

## 🚧 待实现

### 1. 消息增强
- [ ] 图片消息
- [ ] 文件消息
- [ ] 语音消息
- [ ] 富文本消息
- [ ] 消息撤回
- [ ] 消息编辑

### 2. 已读回执
- [ ] 实时已读通知
- [ ] 已读状态显示（✓✓）
- [ ] 群聊已读列表

### 3. @ 提及
- [ ] 群聊 @ 某人
- [ ] @ 全体成员
- [ ] 提及通知

### 4. 消息搜索
- [ ] 全文搜索
- [ ] 按时间范围搜索
- [ ] 按发送者搜索

### 5. 群聊管理
- [ ] 移除成员
- [ ] 设置管理员
- [ ] 转让群主
- [ ] 群公告
- [ ] 群头像

### 6. 消息通知
- [ ] 浏览器推送
- [ ] 邮件通知
- [ ] 短信通知（重要消息）

### 7. 安全增强
- [ ] 消息加密
- [ ] 敏感词过滤
- [ ] 防刷屏机制
- [ ] 消息审核

## 📊 功能对比

| 功能 | 微信 | 飞书 | 龙虾营地 |
|------|------|------|----------|
| 私聊 | ✅ | ✅ | ✅ |
| 群聊 | ✅ | ✅ | ✅ |
| 机器人 | ❌ | ✅ | ✅ |
| 实时推送 | ✅ | ✅ | ✅ |
| 图片消息 | ✅ | ✅ | ❌ |
| 文件消息 | ✅ | ✅ | ❌ |
| 消息撤回 | ✅ | ✅ | ❌ |
| 已读回执 | ✅ | ✅ | ⚠️ 部分 |
| @ 提及 | ✅ | ✅ | ❌ |
| 消息搜索 | ✅ | ✅ | ❌ |

## 🎯 优先级建议

### P0（核心功能）
1. ✅ 实时消息推送（已完成）
2. 消息撤回
3. 图片消息

### P1（重要功能）
4. 已读回执
5. @ 提及
6. 消息搜索

### P2（增强功能）
7. 文件消息
8. 群聊管理
9. 消息通知

### P3（锦上添花）
10. 语音消息
11. 富文本消息
12. 消息加密

## 📝 使用示例

### 私聊
```bash
# 1. 创建私聊
curl -X POST http://localhost:8889/api/chat/conversation \
  -H "Content-Type: application/json" \
  -H "x-camp-key: user1-key" \
  -d '{"type":"direct","targetUserId":"uid_002"}'

# 2. 发送消息
curl -X POST http://localhost:8889/api/chat/message \
  -H "Content-Type: application/json" \
  -H "x-camp-key: user1-key" \
  -d '{"conversationId":"conv_xxx","content":"你好"}'

# 3. 实时接收（WebSocket）
const ws = new WebSocket('ws://localhost:8889');
ws.send(JSON.stringify({type:'subscribe'}));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### 群聊
```bash
# 1. 创建群聊
curl -X POST http://localhost:8889/api/chat/group \
  -H "Content-Type: application/json" \
  -H "x-camp-key: user1-key" \
  -d '{"name":"技术群","memberIds":["uid_002","uid_003"]}'

# 2. 添加成员
curl -X POST http://localhost:8889/api/chat/group/conv_xxx/members \
  -H "Content-Type: application/json" \
  -H "x-camp-key: user1-key" \
  -d '{"memberIds":["uid_004"]}'
```

### Bot 聊天
```bash
# 1. 创建 Bot 会话
curl -X POST http://localhost:8889/api/chat/conversation \
  -H "Content-Type: application/json" \
  -H "x-camp-key: user1-key" \
  -d '{"type":"bot","botId":"bot_main"}'

# 2. 发送消息（自动触发 Agent 回复）
curl -X POST http://localhost:8889/api/chat/message \
  -H "Content-Type: application/json" \
  -H "x-camp-key: user1-key" \
  -d '{"conversationId":"conv_xxx","content":"你好，大龙虾"}'
```

## 🔧 技术实现

### 实时推送原理
```javascript
// Hub 广播消息
function broadcastChatMessage(conversationId, message) {
  const data = JSON.stringify({
    type: 'chat-message',
    payload: { conversationId, ...message }
  });
  
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
```

### 未读消息计数
```sql
SELECT COUNT(*) as unread_count
FROM messages
WHERE conversation_id = ?
  AND created_at > COALESCE(
    (SELECT last_read_at FROM conversation_members 
     WHERE conversation_id = ? AND user_id = ?),
    '1970-01-01'
  )
```

---

**下一步计划**：实现消息撤回和图片消息功能。
