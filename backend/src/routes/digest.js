import { Hono } from 'hono';
import db from '../db/index.js';
import { decrypt } from '../utils/encryption.js';
import { DigestService } from '../services/digest-service.js';
import { PushService } from '../services/push-service.js';
import { SchedulerService } from '../services/scheduler.js';

const digest = new Hono();

/**
 * 获取 AI 配置
 */
function getAIConfig() {
  const stmt = db.prepare('SELECT * FROM ai_config WHERE is_active = 1 LIMIT 1');
  const config = stmt.get();

  if (!config) return null;

  return {
    provider: config.provider,
    apiUrl: config.api_url,
    apiKey: config.api_key_encrypted ? decrypt(config.api_key_encrypted) : null,
    model: config.model
  };
}

/**
 * 获取 Miniflux 配置
 */
function getMinifluxConfig() {
  const stmt = db.prepare('SELECT * FROM miniflux_config WHERE is_active = 1 LIMIT 1');
  const config = stmt.get();

  if (!config) return null;

  return {
    apiUrl: config.api_url,
    apiKeyEncrypted: config.api_key_encrypted
  };
}

// ============================================
// 简报相关路由
// ============================================

/**
 * GET /api/digests
 * 获取简报列表（支持分页、筛选）
 * Query params: page, limit, scope, scopeId, isRead
 */
digest.get('/', (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const scope = c.req.query('scope');
    const scopeId = c.req.query('scopeId');
    const isRead = c.req.query('isRead');

    const result = DigestService.getDigests({
      page,
      limit,
      scope,
      scopeId: scopeId ? parseInt(scopeId) : undefined,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined
    });

    return c.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching digests:', error);
    return c.json({ success: false, error: 'Failed to fetch digests' }, 500);
  }
});

/**
 * GET /api/digests/:id
 * 获取单个简报
 */
digest.get('/:id', (c) => {
  try {
    const id = c.req.param('id');
    const digestItem = DigestService.getDigest(id);

    if (!digestItem) {
      return c.json({ success: false, error: 'Digest not found' }, 404);
    }

    return c.json({
      success: true,
      data: digestItem
    });
  } catch (error) {
    console.error('Error fetching digest:', error);
    return c.json({ success: false, error: 'Failed to fetch digest' }, 500);
  }
});

/**
 * POST /api/digests
 * 创建简报（手动保存）
 */
digest.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { title, content, scope, scopeId, scopeName, articleCount, hours, targetLang } = body;

    if (!title || !content) {
      return c.json({ success: false, error: 'Title and content are required' }, 400);
    }

    const stmt = db.prepare(`
      INSERT INTO digests (title, content, scope, scope_id, scope_name, article_count, hours, target_lang, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const result = stmt.run(
      title,
      content,
      scope || 'all',
      scopeId || null,
      scopeName || '',
      articleCount || 0,
      hours || 24,
      targetLang || 'zh-CN'
    );

    return c.json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        title,
        content,
        scope,
        scopeId,
        scopeName,
        articleCount,
        hours,
        targetLang
      }
    }, 201);
  } catch (error) {
    console.error('Error creating digest:', error);
    return c.json({ success: false, error: 'Failed to create digest' }, 500);
  }
});

/**
 * PUT /api/digests/:id
 * 更新简报（如标记已读）
 */
digest.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const result = DigestService.updateDigest(id, body);

    if (result.changes === 0) {
      return c.json({ success: false, error: 'Digest not found' }, 404);
    }

    return c.json({ success: true, message: 'Digest updated' });
  } catch (error) {
    console.error('Error updating digest:', error);
    return c.json({ success: false, error: 'Failed to update digest' }, 500);
  }
});

/**
 * DELETE /api/digests/:id
 * 删除简报
 */
digest.delete('/:id', (c) => {
  try {
    const id = c.req.param('id');
    const result = DigestService.deleteDigest(id);

    if (result.changes === 0) {
      return c.json({ success: false, error: 'Digest not found' }, 404);
    }

    return c.json({ success: true, message: 'Digest deleted' });
  } catch (error) {
    console.error('Error deleting digest:', error);
    return c.json({ success: false, error: 'Failed to delete digest' }, 500);
  }
});

/**
 * POST /api/digests/:id/read
 * 标记简报为已读
 */
digest.post('/:id/read', (c) => {
  try {
    const id = c.req.param('id');
    const result = DigestService.markAsRead(id);

    if (result.changes === 0) {
      return c.json({ success: false, error: 'Digest not found' }, 404);
    }

    return c.json({ success: true, message: 'Digest marked as read' });
  } catch (error) {
    console.error('Error marking digest as read:', error);
    return c.json({ success: false, error: 'Failed to mark digest as read' }, 500);
  }
});

/**
 * POST /api/digests/read-all
 * 批量标记所有简报为已读
 */
digest.post('/read-all', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { scope, scopeId } = body;

    const result = DigestService.markAllAsRead(scope, scopeId);

    return c.json({
      success: true,
      message: `Marked ${result.changes} digest(s) as read`
    });
  } catch (error) {
    console.error('Error marking all digests as read:', error);
    return c.json({ success: false, error: 'Failed to mark all digests as read' }, 500);
  }
});

/**
 * POST /api/digests/generate
 * 手动生成简报（调用 AI）
 */
digest.post('/generate', async (c) => {
  try {
    const body = await c.req.json();
    const {
      scope = 'all',
      feedId,
      groupId,
      hours = 24,
      targetLang = 'Simplified Chinese',
      prompt: customPrompt,
      unreadOnly = true,
      pushConfig,
      timezone
    } = body;

    // 获取配置
    const aiConfig = getAIConfig();
    if (!aiConfig || !aiConfig.apiKey) {
      return c.json({
        success: false,
        error: 'AI not configured. Please configure AI settings first.'
      }, 400);
    }

    const minifluxConfig = getMinifluxConfig();
    if (!minifluxConfig) {
      return c.json({
        success: false,
        error: 'Miniflux not configured. Please configure Miniflux settings first.'
      }, 400);
    }

    // 生成简报
    const result = await DigestService.generate(minifluxConfig, aiConfig, {
      scope,
      feedId,
      groupId,
      hours,
      targetLang,
      prompt: customPrompt,
      unreadOnly,
      timezone
    });

    if (!result.success) {
      return c.json({
        success: false,
        error: result.error || 'Failed to generate digest'
      }, 500);
    }

    // 推送通知（如果配置了）
    let pushResult = null;
    if (pushConfig && pushConfig.url) {
      try {
        pushResult = await PushService.send(
          pushConfig,
          result.digest.title,
          result.digest.content
        );
      } catch (pushErr) {
        console.error('Push notification failed:', pushErr);
        pushResult = { success: false, error: pushErr.message };
      }
    }

    return c.json({
      success: true,
      data: {
        digest: result.digest,
        push: pushResult
      }
    });

  } catch (error) {
    console.error('Error generating digest:', error);
    return c.json({ success: false, error: error.message || 'Failed to generate digest' }, 500);
  }
});

/**
 * POST /api/digests/:id/push
 * 推送已有简报
 */
digest.post('/:id/push', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { pushConfig } = body;

    if (!pushConfig || !pushConfig.url) {
      return c.json({ success: false, error: 'Push configuration is required' }, 400);
    }

    const digestItem = DigestService.getDigest(id);
    if (!digestItem) {
      return c.json({ success: false, error: 'Digest not found' }, 404);
    }

    const pushResult = await PushService.send(
      pushConfig,
      digestItem.title,
      digestItem.content
    );

    return c.json({
      success: pushResult.success,
      data: pushResult
    });

  } catch (error) {
    console.error('Error pushing digest:', error);
    return c.json({ success: false, error: error.message || 'Failed to push digest' }, 500);
  }
});

// ============================================
// 定时任务相关路由
// ============================================

/**
 * GET /api/digests/schedule
 * 获取定时任务列表
 */
digest.get('/schedule', (c) => {
  try {
    const tasks = SchedulerService.getAllTasks();

    // 隐藏敏感的 push_config 中的敏感信息
    const safeTasks = tasks.map(task => ({
      ...task,
      push_config: task.push_config ? 'configured' : null
    }));

    return c.json({
      success: true,
      data: safeTasks
    });
  } catch (error) {
    console.error('Error fetching scheduled tasks:', error);
    return c.json({ success: false, error: 'Failed to fetch scheduled tasks' }, 500);
  }
});

/**
 * GET /api/digests/schedule/:id
 * 获取单个定时任务
 */
digest.get('/schedule/:id', (c) => {
  try {
    const id = c.req.param('id');
    const task = SchedulerService.getTask(id);

    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }

    // 隐藏敏感信息
    const safeTask = {
      ...task,
      push_config: task.push_config ? 'configured' : null
    };

    return c.json({
      success: true,
      data: safeTask
    });
  } catch (error) {
    console.error('Error fetching scheduled task:', error);
    return c.json({ success: false, error: 'Failed to fetch scheduled task' }, 500);
  }
});

/**
 * POST /api/digests/schedule
 * 创建定时简报任务
 */
digest.post('/schedule', async (c) => {
  try {
    const body = await c.req.json();
    const {
      name,
      scope = 'all',
      scopeId,
      scopeName,
      hours = 24,
      targetLang = 'Simplified Chinese',
      unreadOnly = true,
      pushEnabled = false,
      pushConfig,
      cronExpression,
      timezone = 'Asia/Shanghai',
      isActive = true
    } = body;

    if (!name) {
      return c.json({ success: false, error: 'Task name is required' }, 400);
    }

    if (!cronExpression) {
      return c.json({ success: false, error: 'Cron expression is required' }, 400);
    }

    const result = SchedulerService.createTask({
      name,
      scope,
      scopeId,
      scopeName,
      hours,
      targetLang,
      unreadOnly,
      pushEnabled,
      pushConfig,
      cronExpression,
      timezone,
      isActive
    });

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({
      success: true,
      data: {
        taskId: result.taskId,
        nextRun: result.nextRun
      }
    }, 201);

  } catch (error) {
    console.error('Error creating scheduled task:', error);
    return c.json({ success: false, error: error.message || 'Failed to create scheduled task' }, 500);
  }
});

/**
 * PUT /api/digests/schedule/:id
 * 更新定时任务
 */
digest.put('/schedule/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const result = SchedulerService.updateTask(id, body);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, message: 'Task updated' });

  } catch (error) {
    console.error('Error updating scheduled task:', error);
    return c.json({ success: false, error: error.message || 'Failed to update scheduled task' }, 500);
  }
});

/**
 * DELETE /api/digests/schedule/:id
 * 删除定时任务
 */
digest.delete('/schedule/:id', (c) => {
  try {
    const id = c.req.param('id');
    const result = SchedulerService.deleteTask(id);

    if (!result.success) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }

    return c.json({ success: true, message: 'Task deleted' });

  } catch (error) {
    console.error('Error deleting scheduled task:', error);
    return c.json({ success: false, error: 'Failed to delete scheduled task' }, 500);
  }
});

/**
 * POST /api/digests/schedule/:id/enable
 * 启用定时任务
 */
digest.post('/schedule/:id/enable', (c) => {
  try {
    const id = c.req.param('id');
    SchedulerService.enableTask(id);

    return c.json({ success: true, message: 'Task enabled' });

  } catch (error) {
    console.error('Error enabling scheduled task:', error);
    return c.json({ success: false, error: 'Failed to enable scheduled task' }, 500);
  }
});

/**
 * POST /api/digests/schedule/:id/disable
 * 禁用定时任务
 */
digest.post('/schedule/:id/disable', (c) => {
  try {
    const id = c.req.param('id');
    SchedulerService.disableTask(id);

    return c.json({ success: true, message: 'Task disabled' });

  } catch (error) {
    console.error('Error disabling scheduled task:', error);
    return c.json({ success: false, error: 'Failed to disable scheduled task' }, 500);
  }
});

/**
 * POST /api/digests/schedule/:id/run
 * 手动触发定时任务
 */
digest.post('/schedule/:id/run', async (c) => {
  try {
    const id = c.req.param('id');
    const result = await SchedulerService.runTaskNow(id);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 500);
    }

    return c.json({
      success: true,
      data: {
        digest: result.digest,
        push: result.push
      }
    });

  } catch (error) {
    console.error('Error running scheduled task:', error);
    return c.json({ success: false, error: error.message || 'Failed to run scheduled task' }, 500);
  }
});

export default digest;
