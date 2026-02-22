import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { decrypt, encrypt, maskApiKey } from '../utils/encryption.js';
import { getMinifluxCredentials } from '../utils/miniflux.js';
import { DigestService } from '../services/digest-service.js';
import { PushService } from '../services/push-service.js';
import { SchedulerService } from '../services/scheduler.js';

const digest = new Hono();

// In-memory job queue for async digest generation
const generationJobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of generationJobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      generationJobs.delete(id);
    }
  }
}

/**
 * 获取 AI 配置
 */
function getAIConfig() {
  const stmt = db.prepare('SELECT * FROM ai_config WHERE is_active = 1 LIMIT 1');
  const config = stmt.get();

  if (!config) return null;

  let maxTokens;
  if (config.extra_config) {
    try {
      const extra = JSON.parse(config.extra_config);
      maxTokens = extra.max_tokens ?? extra.maxTokens;
    } catch {
      maxTokens = undefined;
    }
  }

  return {
    provider: config.provider,
    apiUrl: config.api_url,
    apiKey: config.api_key_encrypted ? decrypt(config.api_key_encrypted) : null,
    model: config.model,
    maxTokens
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
// Miniflux 配置路由
// ============================================

/**
 * GET /api/digests/miniflux/config
 * 获取 Miniflux 配置（API Key 已遮罩）
 */
digest.get('/miniflux/config', (c) => {
  try {
    const config = db.prepare('SELECT id, name, api_url, api_key_encrypted, is_active, created_at, updated_at FROM miniflux_config WHERE is_active = 1 LIMIT 1').get();

    if (!config) {
      return c.json({
        success: true,
        data: {
          apiUrl: '',
          apiKey: null,
          isActive: false
        }
      });
    }

    return c.json({
      success: true,
      data: {
        id: config.id,
        name: config.name,
        apiUrl: config.api_url,
        apiKey: maskApiKey(config.api_key_encrypted),
        isActive: !!config.is_active
      }
    });
  } catch (error) {
    console.error('Error fetching Miniflux config:', error);
    return c.json({ success: false, error: 'Failed to fetch Miniflux configuration' }, 500);
  }
});

/**
 * POST /api/digests/miniflux/config
 * 保存 Miniflux 配置（API Key 加密存储）
 */
digest.post('/miniflux/config', async (c) => {
  try {
    const body = await c.req.json();
    const { apiUrl, apiKey, name = 'default' } = body;

    if (!apiUrl) {
      return c.json({ success: false, error: 'API URL is required' }, 400);
    }

    // Encrypt API key if provided
    const apiKeyEncrypted = apiKey ? encrypt(apiKey) : null;

    // Upsert configuration
    const stmt = db.prepare(`
      INSERT INTO miniflux_config (name, api_url, api_key_encrypted, is_active, updated_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        api_url = excluded.api_url,
        api_key_encrypted = COALESCE(excluded.api_key_encrypted, api_key_encrypted),
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(name, apiUrl, apiKeyEncrypted);

    return c.json({
      success: true,
      data: {
        name,
        apiUrl,
        apiKey: maskApiKey(apiKeyEncrypted),
        isActive: true
      }
    });
  } catch (error) {
    console.error('Error saving Miniflux config:', error);
    return c.json({ success: false, error: 'Failed to save Miniflux configuration' }, 500);
  }
});

/**
 * POST /api/digests/miniflux/test
 * 测试 Miniflux 连接
 */
digest.post('/miniflux/test', async (c) => {
  try {
    const body = await c.req.json();
    const { apiUrl, apiKey } = body;

    if (!apiUrl || !apiKey) {
      return c.json({ success: false, error: 'API URL and API Key are required' }, 400);
    }

    // Test connection by fetching feeds
    const baseUrl = apiUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/feeds`, {
      headers: {
        'X-Auth-Token': apiKey
      }
    });

    if (response.ok) {
      const feeds = await response.json();
      return c.json({
        success: true,
        message: 'Connection successful',
        feedCount: Array.isArray(feeds) ? feeds.length : 0
      });
    } else {
      const errorText = await response.text();
      return c.json({
        success: false,
        error: `Connection failed: HTTP ${response.status} - ${errorText}`
      });
    }
  } catch (error) {
    console.error('Miniflux connection test error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

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
 * GET /api/digests/prompt-default
 * 获取默认简报 prompt 模板（占位符 {{targetLang}}、{{content}}）
 */
digest.get('/prompt-default', (c) => {
  try {
    const template = DigestService.getDefaultPromptTemplate();
    return c.json({ success: true, data: { defaultPrompt: template } });
  } catch (error) {
    console.error('Error fetching default prompt:', error);
    return c.json({ success: false, error: 'Failed to fetch default prompt' }, 500);
  }
});

/**
 * POST /api/digests/preview
 * Get digest preview: article count and estimated input tokens (no LLM call).
 * Body: { scope, feedId, groupId, hours, unreadOnly }
 * Returns: { success, data: { articleCount, estimatedTokens, maxTokens? } }
 */
digest.post('/preview', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const {
      scope = 'all',
      feedId,
      groupId,
      groupIds,
      hours = 24,
      unreadOnly = true,
      minifluxApiUrl,
      minifluxApiKey
    } = body;

    let minifluxConfig = getMinifluxCredentials();
    if (!minifluxConfig && minifluxApiUrl && minifluxApiKey) {
      minifluxConfig = { apiUrl: minifluxApiUrl, apiKey: minifluxApiKey };
    }

    if (!minifluxConfig) {
      return c.json({ success: false, error: 'Miniflux not configured' }, 400);
    }

    const resolvedGroupIds = Array.isArray(groupIds) ? groupIds : (groupId ? [groupId] : undefined);
    const options = { scope, feedId, groupIds: resolvedGroupIds, hours, unreadOnly };
    const preview = await DigestService.getDigestPreview(minifluxConfig, options);

    const aiConfig = getAIConfig();
    const maxTokens = aiConfig?.maxTokens;

    return c.json({
      success: true,
      data: {
        articleCount: preview.articleCount,
        estimatedTokens: preview.estimatedTokens,
        ...(maxTokens != null && maxTokens !== '' && { maxTokens })
      }
    });
  } catch (error) {
    console.error('Error fetching digest preview:', error);
    return c.json({ success: false, error: error.message || 'Failed to fetch preview' }, 500);
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
 * Async digest generation — returns a jobId immediately, processes in background.
 */
digest.post('/generate', async (c) => {
  try {
    const body = await c.req.json();
    const {
      scope = 'all',
      feedId,
      groupId,
      groupIds,
      hours = 24,
      targetLang = 'Simplified Chinese',
      prompt: customPrompt,
      unreadOnly = true,
      pushConfig,
      timezone,
      scopeName: clientScopeName,
      minifluxApiUrl,
      minifluxApiKey
    } = body;

    const aiConfig = getAIConfig();
    if (!aiConfig || !aiConfig.apiKey) {
      return c.json({
        success: false,
        error: 'AI not configured. Please configure AI settings first.'
      }, 400);
    }

    let minifluxConfig = getMinifluxCredentials();
    if (!minifluxConfig && minifluxApiUrl && minifluxApiKey) {
      minifluxConfig = { apiUrl: minifluxApiUrl, apiKey: minifluxApiKey };
    }

    if (!minifluxConfig) {
      return c.json({
        success: false,
        error: 'Miniflux not configured. Please configure Miniflux settings first.'
      }, 400);
    }

    cleanupOldJobs();

    const jobId = randomUUID();
    generationJobs.set(jobId, {
      status: 'pending',
      progress: 0,
      digest: null,
      error: null,
      createdAt: Date.now()
    });

    // Fire-and-forget: process in background
    (async () => {
      const job = generationJobs.get(jobId);
      if (!job) return;
      try {
        job.status = 'generating';
        job.progress = 20;

        const resolvedGroupIds = Array.isArray(groupIds) ? groupIds : (groupId ? [groupId] : undefined);
        const result = await DigestService.generate(minifluxConfig, aiConfig, {
          scope, feedId, groupIds: resolvedGroupIds, hours, targetLang,
          prompt: customPrompt, unreadOnly, timezone, scopeName: clientScopeName
        });

        if (!result.success) {
          job.status = 'error';
          job.error = result.error || 'Failed to generate digest';
          return;
        }

        job.progress = 90;

        let pushResult = null;
        if (pushConfig && pushConfig.url) {
          try {
            pushResult = await PushService.send(pushConfig, result.digest.title, result.digest.content);
          } catch (pushErr) {
            console.error('Push notification failed:', pushErr);
            pushResult = { success: false, error: pushErr.message };
          }
        }

        job.status = 'completed';
        job.progress = 100;
        job.digest = result.digest;
        job.push = pushResult;
      } catch (err) {
        console.error('Background generation error:', err);
        job.status = 'error';
        job.error = err.message || 'Unexpected error during generation';
      }
    })();

    return c.json({
      success: true,
      data: { jobId, status: 'pending' }
    }, 202);

  } catch (error) {
    console.error('Error starting digest generation:', error);
    return c.json({ success: false, error: error.message || 'Failed to start generation' }, 500);
  }
});

/**
 * GET /api/digests/jobs/:jobId
 * Check async generation job status
 */
digest.get('/jobs/:jobId', (c) => {
  const jobId = c.req.param('jobId');
  const job = generationJobs.get(jobId);

  if (!job) {
    return c.json({ success: false, error: 'Job not found' }, 404);
  }

  const response = {
    success: true,
    data: {
      jobId,
      status: job.status,
      progress: job.progress,
      error: job.error
    }
  };

  if (job.status === 'completed' && job.digest) {
    response.data.digest = job.digest;
    response.data.push = job.push;
  }

  return c.json(response);
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
 *
 * 参数分为两个维度 + 定时：
 * 1) 订阅源范围：scope('all'|'group'|'feed') + scopeId + scopeName → 用哪些订阅源/分组
 * 2) 时间范围：hours → 取这些订阅源里「过去 N 小时」内的文章（如 24 = 最近 24 小时）
 * 3) 定时（执行频率）：cronExpression + timezone → 何时执行，例如 "0 9 * * *" 表示每天 9 点执行
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

// ============================================
// Parameterized catch-all routes (MUST be after all specific routes)
// ============================================

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

export default digest;
