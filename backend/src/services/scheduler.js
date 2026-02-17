/**
 * Scheduler Service - 定时任务调度服务
 *
 * 使用 node-cron 实现定时任务调度，用于自动生成简报
 */

import { CronJob } from 'cron';
import db from '../db/index.js';
import { DigestService } from './digest-service.js';
import { PushService } from './push-service.js';
import { decrypt } from '../utils/encryption.js';
import { getProviderPreset } from '../utils/config.js';

// 存储活跃的定时任务
const activeJobs = new Map();

/**
 * 从数据库获取 AI 配置
 */
function getAIConfig() {
  const stmt = db.prepare('SELECT * FROM ai_config WHERE is_active = 1 LIMIT 1');
  const config = stmt.get();

  if (!config) return null;

  return {
    provider: config.provider,
    apiUrl: config.api_url,
    apiKey: config.api_key_encrypted ? decrypt(config.api_key_encrypted) : null,
    model: config.model,
    ...parseExtraConfig(config.extra_config)
  };
}

/**
 * 从数据库获取 Miniflux 配置
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

/**
 * 解析额外配置
 */
function parseExtraConfig(extraConfig) {
  if (!extraConfig) return {};

  try {
    return JSON.parse(extraConfig);
  } catch {
    return {};
  }
}

/**
 * 计算下次运行时间
 */
function getNextRunTime(cronExpression, timezone) {
  try {
    const job = new CronJob(cronExpression, () => {}, () => {}, false, timezone);
    const nextDate = job.nextDate();
    job.stop();
    return nextDate?.toJSDate()?.toISOString() || null;
  } catch (e) {
    console.error('[Scheduler] Invalid cron expression:', cronExpression, e);
    return null;
  }
}

/**
 * 执行单个简报任务
 */
async function executeTask(task) {
  console.log(`[Scheduler] Executing task ${task.id}: ${task.name}`);

  // 更新任务状态
  const updateRunning = db.prepare(`
    UPDATE scheduled_tasks
    SET last_run_at = CURRENT_TIMESTAMP, last_error = NULL
    WHERE id = ?
  `);
  updateRunning.run(task.id);

  try {
    // 获取配置
    const aiConfig = getAIConfig();
    if (!aiConfig || !aiConfig.apiKey) {
      throw new Error('AI not configured');
    }

    const minifluxConfig = getMinifluxConfig();
    if (!minifluxConfig) {
      throw new Error('Miniflux not configured');
    }

    // 准备简报选项
    const options = {
      scope: task.scope || 'all',
      feedId: task.scope === 'feed' ? task.scope_id : undefined,
      groupId: task.scope === 'group' ? task.scope_id : undefined,
      hours: task.hours || 24,
      targetLang: task.target_lang || 'Simplified Chinese',
      unreadOnly: task.unread_only === 1,
      timezone: task.timezone || 'Asia/Shanghai'
    };

    // 生成简报
    const result = await DigestService.generate(minifluxConfig, aiConfig, options);

    if (!result.success) {
      throw new Error(result.error || 'Digest generation failed');
    }

    console.log(`[Scheduler] Digest generated: ${result.digest.id} - ${result.digest.title}`);

    // 推送通知
    let pushResult = { attempted: false };

    if (task.push_enabled === 1 && task.push_config) {
      pushResult.attempted = true;

      try {
        const pushConfig = JSON.parse(task.push_config);
        pushResult.result = await PushService.send(
          pushConfig,
          result.digest.title,
          result.digest.content
        );
        pushResult.success = pushResult.result?.success;
      } catch (pushErr) {
        console.error(`[Scheduler] Push failed for task ${task.id}:`, pushErr);
        pushResult.success = false;
        pushResult.error = pushErr.message;
      }
    }

    // 更新下次运行时间
    const nextRun = getNextRunTime(task.cron_expression, task.timezone);
    const updateNext = db.prepare(`
      UPDATE scheduled_tasks
      SET next_run_at = ?, last_error = NULL
      WHERE id = ?
    `);
    updateNext.run(nextRun, task.id);

    return { success: true, digest: result.digest, push: pushResult };

  } catch (error) {
    console.error(`[Scheduler] Task ${task.id} failed:`, error);

    // 记录错误
    const updateError = db.prepare(`
      UPDATE scheduled_tasks
      SET last_error = ?
      WHERE id = ?
    `);
    updateError.run(error.message, task.id);

    return { success: false, error: error.message };
  }
}

/**
 * SchedulerService 主对象
 */
export const SchedulerService = {
  /**
   * 初始化调度器（加载所有活跃任务）
   */
  initialize() {
    console.log('[Scheduler] Initializing scheduler...');

    // 获取所有活跃任务
    const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE is_active = 1');
    const tasks = stmt.all();

    console.log(`[Scheduler] Found ${tasks.length} active task(s)`);

    for (const task of tasks) {
      this.addTask(task);
    }

    console.log('[Scheduler] Scheduler initialized');
  },

  /**
   * 添加定时任务
   */
  addTask(taskConfig) {
    const {
      id,
      name,
      cronExpression,
      timezone = 'Asia/Shanghai'
    } = taskConfig;

    // 如果任务已存在，先移除
    if (activeJobs.has(id)) {
      this.removeTask(id);
    }

    try {
      const job = new CronJob(
        cronExpression,
        () => {
          // 获取最新的任务配置
          const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
          const task = stmt.get(id);

          if (task && task.is_active === 1) {
            executeTask(task);
          } else {
            console.log(`[Scheduler] Task ${id} is no longer active, stopping`);
            this.removeTask(id);
          }
        },
        null,
        true, // start
        timezone
      );

      activeJobs.set(id, job);

      // 更新下次运行时间
      const nextRun = getNextRunTime(cronExpression, timezone);
      if (nextRun) {
        const updateStmt = db.prepare('UPDATE scheduled_tasks SET next_run_at = ? WHERE id = ?');
        updateStmt.run(nextRun, id);
      }

      console.log(`[Scheduler] Task ${id} (${name}) added, next run: ${nextRun}`);
      return { success: true, nextRun };

    } catch (error) {
      console.error(`[Scheduler] Failed to add task ${id}:`, error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 移除定时任务
   */
  removeTask(taskId) {
    const job = activeJobs.get(taskId);

    if (job) {
      job.stop();
      activeJobs.delete(taskId);
      console.log(`[Scheduler] Task ${taskId} removed`);
      return true;
    }

    return false;
  },

  /**
   * 获取所有活跃任务
   */
  getActiveTasks() {
    return Array.from(activeJobs.keys());
  },

  /**
   * 获取所有任务（从数据库）
   */
  getAllTasks() {
    const stmt = db.prepare(`
      SELECT id, name, scope, scope_id, scope_name, hours, target_lang, unread_only,
             push_enabled, cron_expression, timezone, is_active, last_run_at, next_run_at, last_error,
             created_at, updated_at
      FROM scheduled_tasks
      ORDER BY created_at DESC
    `);
    return stmt.all();
  },

  /**
   * 获取单个任务
   */
  getTask(taskId) {
    const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
    return stmt.get(taskId);
  },

  /**
   * 创建新任务
   */
  createTask(taskData) {
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
    } = taskData;

    // 验证 cron 表达式
    const nextRun = getNextRunTime(cronExpression, timezone);
    if (!nextRun) {
      return { success: false, error: 'Invalid cron expression' };
    }

    const stmt = db.prepare(`
      INSERT INTO scheduled_tasks (
        name, scope, scope_id, scope_name, hours, target_lang, unread_only,
        push_enabled, push_config, cron_expression, timezone, is_active, next_run_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      scope,
      scopeId || null,
      scopeName || '',
      hours,
      targetLang,
      unreadOnly ? 1 : 0,
      pushEnabled ? 1 : 0,
      pushConfig ? JSON.stringify(pushConfig) : null,
      cronExpression,
      timezone,
      isActive ? 1 : 0,
      nextRun
    );

    const taskId = result.lastInsertRowid;

    // 如果任务是活跃的，添加到调度器
    if (isActive) {
      const task = this.getTask(taskId);
      this.addTask(task);
    }

    return { success: true, taskId, nextRun };
  },

  /**
   * 更新任务
   */
  updateTask(taskId, updates) {
    const fields = [];
    const params = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }

    if (updates.scope !== undefined) {
      fields.push('scope = ?');
      params.push(updates.scope);
    }

    if (updates.scopeId !== undefined) {
      fields.push('scope_id = ?');
      params.push(updates.scopeId);
    }

    if (updates.scopeName !== undefined) {
      fields.push('scope_name = ?');
      params.push(updates.scopeName);
    }

    if (updates.hours !== undefined) {
      fields.push('hours = ?');
      params.push(updates.hours);
    }

    if (updates.targetLang !== undefined) {
      fields.push('target_lang = ?');
      params.push(updates.targetLang);
    }

    if (updates.unreadOnly !== undefined) {
      fields.push('unread_only = ?');
      params.push(updates.unreadOnly ? 1 : 0);
    }

    if (updates.pushEnabled !== undefined) {
      fields.push('push_enabled = ?');
      params.push(updates.pushEnabled ? 1 : 0);
    }

    if (updates.pushConfig !== undefined) {
      fields.push('push_config = ?');
      params.push(JSON.stringify(updates.pushConfig));
    }

    if (updates.cronExpression !== undefined) {
      fields.push('cron_expression = ?');
      params.push(updates.cronExpression);
    }

    if (updates.timezone !== undefined) {
      fields.push('timezone = ?');
      params.push(updates.timezone);
    }

    if (updates.isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }

    if (fields.length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(taskId);

    const stmt = db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...params);

    // 如果任务活跃，重新加载
    const task = this.getTask(taskId);
    if (task && task.is_active === 1) {
      this.addTask(task);
    } else {
      this.removeTask(taskId);
    }

    return { success: true };
  },

  /**
   * 删除任务
   */
  deleteTask(taskId) {
    // 先从调度器移除
    this.removeTask(taskId);

    // 从数据库删除
    const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
    const result = stmt.run(taskId);

    return { success: result.changes > 0 };
  },

  /**
   * 启用任务
   */
  enableTask(taskId) {
    const stmt = db.prepare('UPDATE scheduled_tasks SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(taskId);

    const task = this.getTask(taskId);
    if (task) {
      this.addTask(task);
    }

    return { success: true };
  },

  /**
   * 禁用任务
   */
  disableTask(taskId) {
    this.removeTask(taskId);

    const stmt = db.prepare('UPDATE scheduled_tasks SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(taskId);

    return { success: true };
  },

  /**
   * 手动触发任务
   */
  async runTaskNow(taskId) {
    const task = this.getTask(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    return executeTask(task);
  },

  /**
   * 停止所有任务
   */
  stopAll() {
    console.log('[Scheduler] Stopping all tasks...');

    for (const [id, job] of activeJobs) {
      job.stop();
    }

    activeJobs.clear();
    console.log('[Scheduler] All tasks stopped');
  },

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      activeTasks: activeJobs.size,
      taskIds: Array.from(activeJobs.keys()),
      initialized: true
    };
  }
};

export default SchedulerService;
