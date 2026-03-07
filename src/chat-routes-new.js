/**
 * 聊天系统路由 - 重构版
 * 使用单一监听器架构，避免多个监听器冲突
 */

function registerChatRoutes(server, pool, agents) {
  // ──────────────────────────────────────────────
  // 辅助函数
  // ──────────────────────────────────────────────
  
  function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
  }
  
  async function parseMentions(pool, content, conversationId) {
    const mentions = [];
    let mentionAll = false;
    
    // @所有人
    if (content.includes('@所有人') || content.includes('@all')) {
      mentionAll = true;
    }
    
    // @特定用户
    const mentionRegex = /@([^\s@]+)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1];
      if (username === '所有人' || username === 'all') continue;
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE username = ? AND is_active = TRUE',
        [username]
      );
      if (users.length > 0 && !mentions.includes(users[0].user_id)) {
        mentions.push(users[0].user_id);
      }
    }
    
    return { mentions, mentionAll };
  }
  
  function broadcastChatMessage(conversationId, message) {
    if (global.broadcastChatMessage) {
      global.broadcastChatMessage(conversationId, message);
    }
  }
  
  // ──────────────────────────────────────────────
  // 路由处理函数
  // ──────────────────────────────────────────────
  
  // POST /api/chat/conversation - 创建会话
  async function handleCreateConversation(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { participantId, botId, type = 'direct' } = JSON.parse(body);
        const campKey = req.headers['x-camp-key'];
        
        const [users] = await pool.query(
          'SELECT user_id, username FROM users WHERE camp_key = ? AND is_active = TRUE',
          [campKey]
        );
        if (!users.length) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '未授权' }));
        }
        const userId = users[0].user_id;
        
        let conversationId;
        
        if (botId) {
          // 机器人聊天
          conversationId = `${userId}:bot:${botId}`;
          
          const [existing] = await pool.query(
            'SELECT * FROM conversations WHERE conversation_id = ?',
            [conversationId]
          );
          
          if (existing.length === 0) {
            await pool.query(
              'INSERT INTO conversations (conversation_id, type, name, bot_id, created_by) VALUES (?, ?, ?, ?, ?)',
              [conversationId, 'bot', `Bot ${botId}`, botId, userId]
            );
            await pool.query(
              'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
              [conversationId, userId, 'owner']
            );
          }
        } else if (participantId) {
          // 用户直聊
          const ids = [userId, participantId].sort();
          conversationId = `direct:${ids[0]}:${ids[1]}`;
          
          const [existing] = await pool.query(
            'SELECT * FROM conversations WHERE conversation_id = ?',
            [conversationId]
          );
          
          if (existing.length === 0) {
            const [[participant]] = await pool.query(
              'SELECT username FROM users WHERE user_id = ?',
              [participantId]
            );
            
            await pool.query(
              'INSERT INTO conversations (conversation_id, type, name, created_by) VALUES (?, ?, ?, ?)',
              [conversationId, 'direct', `与 ${participant?.username || participantId} 的对话`, userId]
            );
            
            await pool.query(
              'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?), (?, ?, ?)',
              [conversationId, userId, 'owner', conversationId, participantId, 'member']
            );
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '缺少 participantId 或 botId' }));
        }
        
        const [[conversation]] = await pool.query(
          'SELECT * FROM conversations WHERE conversation_id = ?',
          [conversationId]
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, conversation }));
        
      } catch (e) {
        console.error('[Chat] 创建会话失败:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '创建会话失败' }));
      }
    });
  }
  
  // GET /api/chat/conversations - 获取会话列表
  async function handleGetConversations(req, res) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      const userId = users[0].user_id;
      
      const [conversations] = await pool.query(`
        SELECT c.*, 
               cm.role,
               (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.conversation_id AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')) as unread_count,
               (SELECT content FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages m WHERE m.conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) as last_message_at
        FROM conversations c
        JOIN conversation_members cm ON c.conversation_id = cm.conversation_id
        WHERE cm.user_id = ? AND c.is_active = TRUE
        ORDER BY COALESCE(last_message_at, c.created_at) DESC
      `, [userId]);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, conversations }));
      
    } catch (e) {
      console.error('[Chat] 获取会话列表失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取会话列表失败' }));
    }
  }
  
  // POST /api/chat/message - 发送消息
  async function handleSendMessage(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { conversationId, content, messageType = 'text', replyTo, mentions: inputMentions, mentionAll: inputMentionAll } = JSON.parse(body);
        const campKey = req.headers['x-camp-key'];
        
        const [users] = await pool.query(
          'SELECT user_id, username FROM users WHERE camp_key = ? AND is_active = TRUE',
          [campKey]
        );
        if (!users.length) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '未授权' }));
        }
        const userId = users[0].user_id;
        const username = users[0].username;
        
        const [memberCheck] = await pool.query(
          'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
          [conversationId, userId]
        );
        if (!memberCheck.length) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '无权发送消息' }));
        }
        
        let mentions = inputMentions || [];
        let mentionAll = inputMentionAll || false;
        
        if (mentions.length === 0 && !mentionAll) {
          const parsed = await parseMentions(pool, content, conversationId);
          mentions = parsed.mentions;
          mentionAll = parsed.mentionAll;
        }
        
        const messageId = generateId('msg');
        await pool.query(
          'INSERT INTO messages (message_id, conversation_id, sender_id, sender_type, content, message_type, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [messageId, conversationId, userId, 'user', content, messageType, replyTo || null]
        );
        
        const [messages] = await pool.query(
          'SELECT * FROM messages WHERE message_id = ?',
          [messageId]
        );
        const message = messages[0];
        
        // @ 提及
        if (mentions.length > 0) {
          for (const mentionedUserId of mentions) {
            await pool.query(
              'INSERT INTO message_mentions (mention_id, message_id, user_id, mentioned_by) VALUES (?, ?, ?, ?)',
              [generateId('mention'), messageId, mentionedUserId, userId]
            );
          }
        }
        
        if (mentionAll) {
          await pool.query(
            'INSERT INTO message_mentions (mention_id, message_id, user_id, mention_all, mentioned_by) VALUES (?, ?, ?, ?, ?)',
            [generateId('mention'), messageId, 'all', TRUE, userId]
          );
        }
        
        // 获取完整消息信息
        const [[fullMessage]] = await pool.query(`
          SELECT m.*, u.username as sender_name
          FROM messages m
          LEFT JOIN users u ON m.sender_id = u.user_id
          WHERE m.message_id = ?
        `, [messageId]);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: fullMessage }));
        
        broadcastChatMessage(conversationId, fullMessage);
        
        // Bot 自动回复
        const [[conversation]] = await pool.query(
          'SELECT * FROM conversations WHERE conversation_id = ?',
          [conversationId]
        );
        
        if (conversation && conversation.bot_id) {
          const agent = agents.get(conversation.bot_id);
          if (agent && agent.ws && agent.ws.readyState === 1) {
            setTimeout(async () => {
              try {
                agent.ws.send(JSON.stringify({
                  type: 'chat-message',
                  payload: {
                    conversationId,
                    message: fullMessage,
                    sessionId: conversationId
                  }
                }));
              } catch (e) {
                console.error('[Chat] Bot 回复失败:', e.message);
              }
            }, 500);
          }
        }
        
      } catch (e) {
        console.error('[Chat] 发送消息失败:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '发送消息失败' }));
      }
    });
  }
  
  // GET /api/chat/messages/:conversationId - 获取消息列表
  async function handleGetMessages(req, res, conversationId) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      const userId = users[0].user_id;
      
      const [memberCheck] = await pool.query(
        'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
      if (!memberCheck.length) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '无权访问' }));
      }
      
      const [messages] = await pool.query(`
        SELECT m.*, u.username as sender_name,
               (SELECT COUNT(*) FROM message_reads mr WHERE mr.message_id = m.message_id) as read_count
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.user_id
        WHERE m.conversation_id = ? AND m.recalled_at IS NULL
        ORDER BY m.created_at ASC
        LIMIT 100
      `, [conversationId]);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, messages }));
      
    } catch (e) {
      console.error('[Chat] 获取消息列表失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取消息列表失败' }));
    }
  }
  
  // POST /api/chat/group - 创建群组
  async function handleCreateGroup(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { name, memberIds = [] } = JSON.parse(body);
        const campKey = req.headers['x-camp-key'];
        
        const [users] = await pool.query(
          'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
          [campKey]
        );
        if (!users.length) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '未授权' }));
        }
        const userId = users[0].user_id;
        
        const groupId = generateId('group');
        await pool.query(
          'INSERT INTO conversations (conversation_id, type, name, created_by) VALUES (?, ?, ?, ?)',
          [groupId, 'group', name, userId]
        );
        
        await pool.query(
          'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
          [groupId, userId, 'owner']
        );
        
        for (const memberId of memberIds) {
          await pool.query(
            'INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
            [groupId, memberId, 'member']
          );
        }
        
        const [[group]] = await pool.query(
          'SELECT * FROM conversations WHERE conversation_id = ?',
          [groupId]
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, group }));
        
      } catch (e) {
        console.error('[Chat] 创建群组失败:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '创建群组失败' }));
      }
    });
  }
  
  // POST /api/chat/group/:groupId/members - 添加群成员
  async function handleAddGroupMembers(req, res, groupId) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { memberIds } = JSON.parse(body);
        const campKey = req.headers['x-camp-key'];
        
        const [users] = await pool.query(
          'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
          [campKey]
        );
        if (!users.length) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '未授权' }));
        }
        const userId = users[0].user_id;
        
        const [memberCheck] = await pool.query(
          'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND role IN (?, ?)',
          [groupId, userId, 'owner', 'admin']
        );
        if (!memberCheck.length) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: '无权添加成员' }));
        }
        
        for (const memberId of memberIds) {
          await pool.query(
            'INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
            [groupId, memberId, 'member']
          );
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        
      } catch (e) {
        console.error('[Chat] 添加群成员失败:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '添加群成员失败' }));
      }
    });
  }
  
  // GET /api/chat/conversation/:conversationId/members - 获取会话成员
  async function handleGetMembers(req, res, conversationId) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      const userId = users[0].user_id;
      
      const [memberCheck] = await pool.query(
        'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversationId, userId]
      );
      if (!memberCheck.length) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '无权访问' }));
      }
      
      const [members] = await pool.query(`
        SELECT cm.*, u.username, u.created_at as user_created_at
        FROM conversation_members cm
        JOIN users u ON cm.user_id = u.user_id
        WHERE cm.conversation_id = ?
        ORDER BY cm.role DESC, u.username ASC
      `, [conversationId]);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, members }));
      
    } catch (e) {
      console.error('[Chat] 获取成员列表失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取成员列表失败' }));
    }
  }
  
  // POST /api/chat/message/:messageId/read - 标记已读
  async function handleMarkRead(req, res, messageId) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      const userId = users[0].user_id;
      
      const [[message]] = await pool.query(
        'SELECT conversation_id FROM messages WHERE message_id = ?',
        [messageId]
      );
      if (!message) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '消息不存在' }));
      }
      
      await pool.query(
        'INSERT IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)',
        [messageId, userId]
      );
      
      await pool.query(
        'UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
        [message.conversation_id, userId]
      );
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      
    } catch (e) {
      console.error('[Chat] 标记已读失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '标记已读失败' }));
    }
  }
  
  // GET /api/chat/message/:messageId/reads - 获取已读列表
  async function handleGetReads(req, res, messageId) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      
      const [reads] = await pool.query(`
        SELECT mr.*, u.username
        FROM message_reads mr
        JOIN users u ON mr.user_id = u.user_id
        WHERE mr.message_id = ?
        ORDER BY mr.read_at ASC
      `, [messageId]);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, reads }));
      
    } catch (e) {
      console.error('[Chat] 获取已读列表失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取已读列表失败' }));
    }
  }
  
  // GET /api/chat/mentions - 获取@提及列表
  async function handleGetMentions(req, res) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      const userId = users[0].user_id;
      
      const [mentions] = await pool.query(`
        SELECT mm.*, m.content, m.created_at, u.username as sender_name, c.name as conversation_name
        FROM message_mentions mm
        JOIN messages m ON mm.message_id = m.message_id
        LEFT JOIN users u ON m.sender_id = u.user_id
        LEFT JOIN conversations c ON m.conversation_id = c.conversation_id
        WHERE mm.user_id = ? OR mm.mention_all = TRUE
        ORDER BY mm.created_at DESC
        LIMIT 50
      `, [userId]);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, mentions }));
      
    } catch (e) {
      console.error('[Chat] 获取@列表失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '获取@列表失败' }));
    }
  }
  
  // DELETE /api/chat/message/:messageId - 撤回消息
  async function handleRecallMessage(req, res, messageId) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      const userId = users[0].user_id;
      
      const [[message]] = await pool.query(
        'SELECT * FROM messages WHERE message_id = ?',
        [messageId]
      );
      if (!message) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '消息不存在' }));
      }
      
      // 检查权限：发送者或管理员
      const [memberCheck] = await pool.query(
        'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [message.conversation_id, userId]
      );
      
      const isSender = message.sender_id === userId;
      const isAdmin = memberCheck.length > 0 && ['owner', 'admin'].includes(memberCheck[0].role);
      
      if (!isSender && !isAdmin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '无权撤回' }));
      }
      
      // 检查时间：2分钟内
      const messageTime = new Date(message.created_at).getTime();
      const now = Date.now();
      if (now - messageTime > 2 * 60 * 1000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '超过撤回时限' }));
      }
      
      await pool.query(
        'UPDATE messages SET recalled_at = NOW() WHERE message_id = ?',
        [messageId]
      );
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      
      // 广播撤回通知
      broadcastChatMessage(message.conversation_id, { type: 'recall', messageId });
      
    } catch (e) {
      console.error('[Chat] 撤回消息失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '撤回消息失败' }));
    }
  }
  
  // POST /api/chat/upload - 上传文件
  async function handleUpload(req, res) {
    try {
      const campKey = req.headers['x-camp-key'];
      
      const [users] = await pool.query(
        'SELECT user_id FROM users WHERE camp_key = ? AND is_active = TRUE',
        [campKey]
      );
      if (!users.length) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '未授权' }));
      }
      
      // TODO: 实现文件上传逻辑
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '文件上传功能尚未实现' }));
      
    } catch (e) {
      console.error('[Chat] 上传文件失败:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '上传文件失败' }));
    }
  }
  
  // ──────────────────────────────────────────────
  // 主路由分发器（单一监听器）
  // ──────────────────────────────────────────────
  
  server.on('request', async (req, res) => {
    // 只处理 /api/chat/ 开头的请求
    if (!req.url.startsWith('/api/chat/')) return;
    
    try {
      const url = req.url;
      const method = req.method;
      
      // 路由匹配
      if (url === '/api/chat/conversation' && method === 'POST') {
        return await handleCreateConversation(req, res);
      }
      
      if (url.startsWith('/api/chat/conversations') && method === 'GET') {
        return await handleGetConversations(req, res);
      }
      
      if (url === '/api/chat/message' && method === 'POST') {
        return await handleSendMessage(req, res);
      }
      
      const messagesMatch = url.match(/^\/api\/chat\/messages\/([^/]+)$/);
      if (messagesMatch && method === 'GET') {
        return await handleGetMessages(req, res, messagesMatch[1]);
      }
      
      if (url === '/api/chat/group' && method === 'POST') {
        return await handleCreateGroup(req, res);
      }
      
      const groupMembersMatch = url.match(/^\/api\/chat\/group\/([^/]+)\/members$/);
      if (groupMembersMatch && method === 'POST') {
        return await handleAddGroupMembers(req, res, groupMembersMatch[1]);
      }
      
      const conversationMembersMatch = url.match(/^\/api\/chat\/conversation\/([^/]+)\/members$/);
      if (conversationMembersMatch && method === 'GET') {
        return await handleGetMembers(req, res, conversationMembersMatch[1]);
      }
      
      const messageReadMatch = url.match(/^\/api\/chat\/message\/([^/]+)\/read$/);
      if (messageReadMatch && method === 'POST') {
        return await handleMarkRead(req, res, messageReadMatch[1]);
      }
      
      const messageReadsMatch = url.match(/^\/api\/chat\/message\/([^/]+)\/reads$/);
      if (messageReadsMatch && method === 'GET') {
        return await handleGetReads(req, res, messageReadsMatch[1]);
      }
      
      if (url === '/api/chat/mentions' && method === 'GET') {
        return await handleGetMentions(req, res);
      }
      
      const messageDeleteMatch = url.match(/^\/api\/chat\/message\/([^/]+)$/);
      if (messageDeleteMatch && method === 'DELETE') {
        return await handleRecallMessage(req, res, messageDeleteMatch[1]);
      }
      
      if (url === '/api/chat/upload' && method === 'POST') {
        return await handleUpload(req, res);
      }
      
      // 未匹配的路由
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API not found' }));
      
    } catch (e) {
      console.error('[Chat] 路由处理异常:', e.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '服务器内部错误' }));
      }
    }
  });
  
  console.log('[Chat] 聊天路由已注册');
}

module.exports = { registerChatRoutes };
