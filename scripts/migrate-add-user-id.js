/**
 * 数据库迁移：添加 user_id 字段
 */

const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '10.0.100.9',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'claude',
    password: process.env.DB_PASSWORD || 'claude_code_666',
    database: process.env.DB_NAME || 'claw_camp',
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    console.log('[Migration] 开始迁移...');

    // 检查字段是否已存在
    const [columns] = await pool.query('SHOW COLUMNS FROM users LIKE "user_id"');
    
    if (columns.length === 0) {
      console.log('[Migration] 添加 user_id 字段...');
      
      // 添加 user_id 字段
      await pool.query('ALTER TABLE users ADD COLUMN user_id VARCHAR(32) UNIQUE AFTER id');
      
      // 为现有用户生成 user_id
      const [users] = await pool.query('SELECT id FROM users WHERE user_id IS NULL');
      
      for (const user of users) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let randomStr = '';
        for (let i = 0; i < 16; i++) {
          randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const userId = `uid_${randomStr}`;
        
        await pool.query('UPDATE users SET user_id = ? WHERE id = ?', [userId, user.id]);
        console.log(`[Migration] 用户 ${user.id} -> ${userId}`);
      }
      
      // 添加索引
      await pool.query('ALTER TABLE users ADD INDEX idx_user_id (user_id)');
      
      console.log('[Migration] ✅ 迁移完成');
    } else {
      console.log('[Migration] user_id 字段已存在，跳过迁移');
    }

    // 显示结果
    const [result] = await pool.query('SELECT id, user_id, username FROM users');
    console.log('[Migration] 当前用户:');
    result.forEach(row => {
      console.log(`  - ${row.username}: ${row.user_id || 'NULL'}`);
    });

  } catch (e) {
    console.error('[Migration] ❌ 迁移失败:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
