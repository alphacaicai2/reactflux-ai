/**
 * Digest Service - 简报生成服务
 *
 * 数据流：
 * 1. 从 Miniflux 获取文章列表（按时间范围、分组、订阅源筛选）
 * 2. 准备文章数据（去除 HTML 标签、截断内容）
 * 3. 构建 Prompt 并调用 AI 生成简报
 * 4. 保存简报到数据库
 */

import db from '../db/index.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { getProviderPreset } from '../utils/config.js';
import { proxyChatRequest } from './ai-service.js';

// 时间范围与小时的映射
const RANGE_HOURS = { 12: 12, 24: 24, 72: 72, 168: 168, 0: 0 };

/**
 * 截取文本辅助函数 - 按 Token 估算截取
 * 1 CJK char ≈ 1.6 token, 4 non-CJK chars ≈ 1 token
 */
function truncateByToken(text, maxTokens) {
  if (!text) return '';

  let accTokens = 0;
  let cutIndex = 0;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    // CJK 字符范围估算
    if (code >= 0x4E00 && code <= 0x9FFF) {
      accTokens += 1.6;
    } else {
      accTokens += 0.3;
    }

    if (accTokens >= maxTokens) {
      cutIndex = i;
      return text.substring(0, cutIndex) + '...';
    }
  }

  return text;
}

/**
 * Miniflux API Client
 * Supports both API Key (X-Auth-Token) and Basic Auth
 */
class MinifluxClient {
  constructor(config) {
    this.baseUrl = config.apiUrl?.replace(/\/$/, '') || '';
    this.apiKey = config.apiKey;
    this.authMode = 'token'; // 'token' or 'basic'

    // Detect if the apiKey looks like a Basic Auth credential (base64 encoded username:password)
    // Miniflux API keys are in format: username:uuid (e.g., "admin:A4B34621-8059-4CC7-948C-4EF017594B38")
    // Basic Auth credentials are base64 encoded: base64(username:password)
    if (this.apiKey) {
      try {
        const decoded = Buffer.from(this.apiKey, 'base64').toString('utf-8');
        // If decoded contains a colon but not a UUID pattern, it's likely Basic Auth
        if (decoded.includes(':') && !decoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)) {
          this.authMode = 'basic';
        }
      } catch (e) {
        // Not valid base64, use as API key
      }
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/v1${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Set auth header based on mode
    if (this.authMode === 'basic') {
      headers['Authorization'] = `Basic ${this.apiKey}`;
    } else {
      headers['X-Auth-Token'] = this.apiKey;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Miniflux API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getFeeds() {
    return this.request('/feeds');
  }

  async getCategories() {
    return this.request('/categories');
  }

  async getFeed(feedId) {
    return this.request(`/feeds/${feedId}`);
  }

  async getEntries(options = {}) {
    const params = new URLSearchParams();

    // Build query parameters
    if (options.order) params.set('order', options.order);
    if (options.direction) params.set('direction', options.direction);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.status) params.set('status', options.status);
    if (options.after) params.set('after', options.after.toString());
    if (options.before) params.set('before', options.before.toString());
    if (options.feed_id) params.set('feed_id', options.feed_id.toString());
    if (options.category_id) params.set('category_id', options.category_id.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/entries?${queryString}` : '/entries';

    return this.request(endpoint);
  }

  /**
   * Get entries for a category (GET /v1/categories/:id/entries).
   * Use this when filtering by category to avoid compatibility issues with older Miniflux.
   */
  async getCategoryEntries(categoryId, options = {}) {
    const params = new URLSearchParams();
    if (options.order) params.set('order', options.order);
    if (options.direction) params.set('direction', options.direction);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.status) params.set('status', options.status);
    if (options.after) params.set('after', options.after.toString());
    if (options.before) params.set('before', options.before.toString());

    const queryString = params.toString();
    const endpoint = queryString
      ? `/categories/${categoryId}/entries?${queryString}`
      : `/categories/${categoryId}/entries`;

    return this.request(endpoint);
  }
}

/**
 * 获取最近文章（可选仅未读）
 */
async function getRecentArticles(minifluxClient, options) {
  const { hours = 24, limit = 500, feedId, groupId, unreadOnly = true } = options;

  const effectiveHours = typeof hours === 'number' ? hours : RANGE_HOURS[hours] ?? 24;

  const entriesOptions = {
    order: 'published_at',
    direction: 'desc',
    limit
  };

  if (effectiveHours > 0) {
    const afterDate = new Date();
    afterDate.setHours(afterDate.getHours() - effectiveHours);
    entriesOptions.after = Math.floor(afterDate.getTime() / 1000);
  }

  if (unreadOnly) {
    entriesOptions.status = 'unread';
  }

  if (feedId) entriesOptions.feed_id = parseInt(feedId);

  console.log(`[DigestService] Fetching articles: hours=${effectiveHours}, feedId=${feedId || 'none'}, groupId=${groupId || 'none'}, unreadOnly=${unreadOnly}`);

  try {
    let response;
    if (groupId) {
      const categoryId = parseInt(groupId);
      response = await minifluxClient.getCategoryEntries(categoryId, entriesOptions);
    } else {
      response = await minifluxClient.getEntries(entriesOptions);
    }
    return response.entries || [];
  } catch (error) {
    console.error('[DigestService] Fetch entries error:', error);
    throw error;
  }
}

/**
 * 准备文章数据（异步分批处理，避免阻塞事件循环）
 */
async function prepareArticlesForDigest(articles) {
  const BATCH_SIZE = 20;
  const results = [];
  const maxTokens = 1000;
  const SAFE_CONTENT_LENGTH = 50000;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const processedBatch = batch.map((article, batchIndex) => {
      let content = article.content || '';

      // 预先截断：防止超大字符串导致后续正则卡死
      if (content.length > SAFE_CONTENT_LENGTH) {
        content = content.substring(0, SAFE_CONTENT_LENGTH);
      }

      // 去除 HTML 标签
      content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      return {
        index: i + batchIndex + 1,
        title: article.title,
        feedTitle: article.feed?.title || '',
        feedId: article.feed_id ?? article.feed?.id ?? null,
        categoryName: article.feed?.category?.title || '',
        publishedAt: article.published_at,
        summary: truncateByToken(content, maxTokens),
        url: article.url
      };
    });

    results.push(...processedBatch);

    // 让出事件循环
    if (i + BATCH_SIZE < articles.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * 构建简报生成的 Prompt
 */
function buildDigestPrompt(articles, options = {}) {
  let { targetLang = 'Simplified Chinese', scope = 'subscription', customPrompt } = options;

  // 迁移旧占位符
  if (customPrompt && customPrompt.trim()) {
    if (customPrompt.includes('{content}') && !customPrompt.includes('{{content}}')) {
      customPrompt = customPrompt.replace(/\{content\}/g, '{{content}}');
    }
    if (customPrompt.includes('{targetLang}') && !customPrompt.includes('{{targetLang}}')) {
      customPrompt = customPrompt.replace(/\{targetLang\}/g, '{{targetLang}}');
    }
    if (!customPrompt.includes('{{content}}')) {
      customPrompt = customPrompt.trim() + '\n\n{{content}}';
    }
  }

  const articlesList = articles.map(a =>
    `### ${a.index}. ${a.title}\n` +
    `- Source: ${a.feedTitle}\n` +
    (a.categoryName ? `- Category: ${a.categoryName}\n` : '') +
    `- Date: ${a.publishedAt}\n` +
    (a.url ? `- Link: ${a.url}\n` : '') +
    `- Summary: ${a.summary}\n`
  ).join('\n');

  const contentBlock = `## CRITICAL: Use ONLY the information from the article list below. Do not add any facts or details from outside these articles.

## Article List (Total ${articles.length} articles):

${articlesList}`;

  if (customPrompt && customPrompt.trim()) {
    return customPrompt
      .replace(/\{\{targetLang\}\}/g, targetLang)
      .replace(/\{\{content\}\}/g, contentBlock);
  }

  // 默认提示词（与 getDefaultPromptTemplate 保持一致，此处内联 targetLang/scope/content）
  return `You are a professional news editor. Generate a concise digest based ONLY on the following list of recent ${scope} articles.

## CRITICAL CONSTRAINT:
- Use ONLY information from the article list below. Do not add any facts, events, or details from your training data or external knowledge.
- Every claim in your digest must be traceable to one of the listed articles. If something is not in the list, do not include it.

## Output Requirements:
1. Output in ${targetLang}
2. Start with a 2-3 sentence overview of the key content from these articles only
3. Categorize by topic or importance, listing key information in concise bullet points
4. If multiple articles relate to the same topic, combine them
5. Keep the format concise and compact, using Markdown
6. Output the content directly, no opening remarks like "Here is the digest"

## Article List (Total ${articles.length} articles):

${articlesList}`;
}

/** 默认 prompt 模板（占位符 {{targetLang}}、{{content}}），供前端展示/编辑用 */
const DEFAULT_PROMPT_TEMPLATE = `You are a professional news editor. Generate a concise digest based ONLY on the following list of recent articles.

## CRITICAL CONSTRAINT:
- Use ONLY information from the article list below. Do not add any facts, events, or details from your training data or external knowledge.
- Every claim in your digest must be traceable to one of the listed articles. If something is not in the list, do not include it.

## Output Requirements:
1. Output in {{targetLang}}
2. Start with a 2-3 sentence overview of the key content from these articles only
3. Categorize by topic or importance, listing key information in concise bullet points
4. If multiple articles relate to the same topic, combine them
5. Keep the format concise and compact, using Markdown
6. Output the content directly, no opening remarks like "Here is the digest"

{{content}}`;

/**
 * 调用 AI API 生成简报
 */
async function callAIForDigest(prompt, aiConfig) {
  if (!aiConfig || !aiConfig.provider || !aiConfig.apiUrl || !aiConfig.apiKey) {
    throw new Error('AI 未配置，请先在设置中配置 AI API');
  }

  const providerPreset = getProviderPreset(aiConfig.provider);
  const model = aiConfig.model || providerPreset?.defaultModel || 'gpt-4o-mini';
  const decoder = new TextDecoder();
  const chunks = [];
  const mockController = {
    enqueue(data) {
      chunks.push(typeof data === 'string' ? data : decoder.decode(data, { stream: true }));
    }
  };

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('AI 请求超时，请稍后重试')), 600000);
  });

  try {
    const requestPromise = proxyChatRequest(
      {
        provider: aiConfig.provider,
        api_url: aiConfig.apiUrl,
        api_key_encrypted: encrypt(aiConfig.apiKey),
        model
      },
      {
        model,
        temperature: aiConfig.temperature ?? 0.7,
        messages: [
          { role: 'user', content: prompt }
        ],
        // Stream mode lets the shared proxy layer normalize provider-specific chunk formats.
        stream: true
      },
      mockController
    );

    await Promise.race([requestPromise, timeoutPromise]);

    let content = '';
    const streamText = chunks.join('');
    const lines = streamText.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      const piece =
        parsed.choices?.[0]?.delta?.content ||
        parsed.choices?.[0]?.message?.content ||
        parsed.content ||
        '';

      if (piece) {
        content += piece;
      }
    }

    const result = content.trim();
    if (!result) {
      throw new Error('AI 返回为空，请检查模型配置后重试');
    }

    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 保存简报到数据库
 */
function saveDigest(digestData) {
  const stmt = db.prepare(`
    INSERT INTO digests (title, content, scope, scope_id, scope_name, article_count, hours, target_lang, is_read, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
  `);

  const result = stmt.run(
    digestData.title,
    digestData.content,
    digestData.scope || 'all',
    digestData.scopeId || null,
    digestData.scopeName || '',
    digestData.articleCount || 0,
    digestData.hours || 24,
    digestData.targetLang || 'zh-CN'
  );

  return {
    id: result.lastInsertRowid,
    ...digestData,
    generatedAt: new Date().toISOString()
  };
}

/**
 * DigestService 主对象
 */
export const DigestService = {
  /**
   * 返回默认 prompt 模板（占位符 {{targetLang}}、{{content}}），供前端展示
   */
  getDefaultPromptTemplate() {
    return DEFAULT_PROMPT_TEMPLATE;
  },

  /**
   * 创建 Miniflux 客户端
   */
  createMinifluxClient(minifluxConfig) {
    const apiKey = minifluxConfig.apiKeyEncrypted
      ? decrypt(minifluxConfig.apiKeyEncrypted)
      : minifluxConfig.apiKey;

    return new MinifluxClient({
      apiUrl: minifluxConfig.apiUrl,
      apiKey
    });
  },

  /**
   * 获取文章用于简报
   */
  async fetchArticlesForDigest(minifluxConfig, options) {
    const client = this.createMinifluxClient(minifluxConfig);
    return getRecentArticles(client, options);
  },

  /**
   * 生成简报
   * @param {object} minifluxConfig - Miniflux 配置 { apiUrl, apiKeyEncrypted }
   * @param {object} aiConfig - AI 配置 { apiUrl, apiKey, model, temperature }
   * @param {object} options - 选项 { scope, feedId, groupId, hours, targetLang, prompt, unreadOnly, timezone }
   */
  async generate(minifluxConfig, aiConfig, options) {
    const {
      scope = 'all',
      feedId,
      groupId,
      hours = 24,
      targetLang = 'Simplified Chinese',
      prompt: customPrompt,
      unreadOnly = true,
      timezone = ''
    } = options;

    const isEn = targetLang && (targetLang.toLowerCase().includes('english') || targetLang.toLowerCase().includes('en'));

    // 创建 Miniflux 客户端
    const minifluxClient = this.createMinifluxClient(minifluxConfig);

    // 获取 Scope 名称
    let scopeName = isEn ? 'All Subscriptions' : '全部订阅';
    let scopeId = null;

    if (scope === 'feed' && feedId) {
      scopeId = parseInt(feedId);
      try {
        const feed = await minifluxClient.getFeed(parseInt(feedId));
        scopeName = feed?.title || (isEn ? 'Feed' : '订阅源');
      } catch (e) {
        console.warn(`[DigestService] Feed ${feedId} not found`);
        scopeName = isEn ? 'Feed' : '订阅源';
      }
    } else if (scope === 'group' && groupId) {
      scopeId = parseInt(groupId);
      try {
        const categories = await minifluxClient.getCategories();
        const category = categories.find(c => c.id === parseInt(groupId));
        scopeName = category?.title || (isEn ? 'Group' : '分组');
      } catch (e) {
        console.warn(`[DigestService] Category ${groupId} not found`);
        scopeName = isEn ? 'Group' : '分组';
      }
    }

    // 获取文章
    const fetchOptions = { hours, feedId, groupId, unreadOnly };
    const articles = await getRecentArticles(minifluxClient, fetchOptions);

    if (articles.length === 0) {
      const timeDesc = hours > 0
        ? (isEn ? `in the past ${hours} hours` : `在过去 ${hours} 小时内`)
        : (isEn ? 'in scope' : '范围内');
      const noArticlesMsg = isEn
        ? `No ${unreadOnly ? 'unread ' : ''}articles ${timeDesc}.`
        : `${timeDesc}没有${unreadOnly ? '未读' : ''}文章。`;

      return {
        success: true,
        digest: {
          id: null,
          title: `${scopeName} - ${isEn ? 'No Articles' : '无文章'}`,
          content: noArticlesMsg,
          articleCount: 0,
          scope,
          scopeId,
          scopeName,
          hours,
          generatedAt: new Date().toISOString()
        }
      };
    }

    // 准备文章数据
    const preparedArticles = await prepareArticlesForDigest(articles);

    // 构建 prompt
    const prompt = buildDigestPrompt(preparedArticles, {
      targetLang,
      scope: scopeName,
      customPrompt
    });

    // 调用 AI
    let digestContent = await callAIForDigest(prompt, aiConfig);

    // 添加订阅源清单
    const feedMap = new Map();
    for (const a of preparedArticles) {
      const id = a.feedId != null ? a.feedId : a.feedTitle;
      if (id != null && id !== '' && !feedMap.has(id)) {
        feedMap.set(id, { title: a.feedTitle || (isEn ? 'Feed' : '订阅源'), feedId: a.feedId });
      }
    }

    const feedList = Array.from(feedMap.values());
    if (feedList.length > 0) {
      const sectionTitle = isEn ? '## Feed Sources' : '## 订阅源清单';
      const lines = feedList
        .filter(f => f.feedId != null)
        .map(f => `- [${f.title.replace(/\]/g, '\\]')}](#/feed/${f.feedId})`)
        .join('\n');
      const fallbackLines = feedList
        .filter(f => f.feedId == null)
        .map(f => `- ${f.title}`)
        .join('\n');
      const appendix = lines
        ? (fallbackLines ? `${sectionTitle}\n\n${lines}\n${fallbackLines}` : `${sectionTitle}\n\n${lines}`)
        : (fallbackLines ? `${sectionTitle}\n\n${fallbackLines}` : '');

      if (appendix) {
        digestContent = (digestContent.trimEnd() + '\n\n---\n\n' + appendix).trim();
      }
    }

    // 生成标题
    const now = new Date();
    let month, day, hh, mm;

    if (timezone) {
      try {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        });
        const parts = Object.fromEntries(
          fmt.formatToParts(now).map(p => [p.type, p.value])
        );
        month = parts.month;
        day = parts.day;
        hh = parts.hour.padStart(2, '0');
        mm = parts.minute.padStart(2, '0');
      } catch {
        // fallback
      }
    }

    if (!month) {
      month = String(now.getMonth() + 1).padStart(2, '0');
      day = String(now.getDate()).padStart(2, '0');
      hh = String(now.getHours()).padStart(2, '0');
      mm = String(now.getMinutes()).padStart(2, '0');
    }

    const timeStr = `${month}-${day}-${hh}:${mm}`;

    const rangeLabelsEn = { 12: 'Last 12h', 24: 'Last 24h', 72: 'Past 3d', 168: 'Past 7d', 0: 'All' };
    const rangeLabelsZh = { 12: '最近12小时', 24: '最近24小时', 72: '过去三天', 168: '过去7天', 0: '全部' };
    const h = hours === 0 || [12, 24, 72, 168].includes(hours) ? hours : 24;
    const rangeLabel = isEn ? (rangeLabelsEn[h] || `${h}h`) : (rangeLabelsZh[h] || `${h}小时`);

    const digestWord = isEn ? 'Digest' : '简报';
    const title = `${scopeName} · ${rangeLabel} · ${digestWord} ${timeStr}`;

    // 保存简报
    const saved = saveDigest({
      scope,
      scopeId,
      scopeName,
      title,
      content: digestContent,
      articleCount: preparedArticles.length,
      hours,
      targetLang
    });

    return {
      success: true,
      digest: saved
    };
  },

  /**
   * 获取简报列表
   */
  getDigests(options = {}) {
    const { page = 1, limit = 20, scope, scopeId, isRead } = options;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (scope) {
      whereClause += ' AND scope = ?';
      params.push(scope);
    }

    if (scopeId !== undefined && scopeId !== null) {
      whereClause += ' AND scope_id = ?';
      params.push(scopeId);
    }

    if (isRead !== undefined && isRead !== null) {
      whereClause += ' AND is_read = ?';
      params.push(isRead ? 1 : 0);
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM digests WHERE ${whereClause}`);
    const total = countStmt.get(...params).count;

    const stmt = db.prepare(`
      SELECT id, title, content, scope, scope_id, scope_name, article_count, hours, target_lang, is_read, generated_at, created_at
      FROM digests
      WHERE ${whereClause}
      ORDER BY generated_at DESC
      LIMIT ? OFFSET ?
    `);

    const digests = stmt.all(...params, limit, offset);

    return {
      data: digests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * 获取单个简报
   */
  getDigest(id) {
    const stmt = db.prepare(`
      SELECT id, title, content, scope, scope_id, scope_name, article_count, hours, target_lang, is_read, generated_at, created_at, updated_at
      FROM digests
      WHERE id = ?
    `);
    return stmt.get(id);
  },

  /**
   * 更新简报
   */
  updateDigest(id, updates) {
    const fields = [];
    const params = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      params.push(updates.title);
    }

    if (updates.content !== undefined) {
      fields.push('content = ?');
      params.push(updates.content);
    }

    if (updates.isRead !== undefined) {
      fields.push('is_read = ?');
      params.push(updates.isRead ? 1 : 0);
    }

    if (fields.length === 0) {
      return { changes: 0 };
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const stmt = db.prepare(`UPDATE digests SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...params);
  },

  /**
   * 删除简报
   */
  deleteDigest(id) {
    const stmt = db.prepare('DELETE FROM digests WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * 标记简报为已读
   */
  markAsRead(id) {
    const stmt = db.prepare('UPDATE digests SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(id);
  },

  /**
   * 批量标记简报为已读
   */
  markAllAsRead(scope, scopeId) {
    let whereClause = 'is_read = 0';
    const params = [];

    if (scope) {
      whereClause += ' AND scope = ?';
      params.push(scope);
    }

    if (scopeId !== undefined && scopeId !== null) {
      whereClause += ' AND scope_id = ?';
      params.push(scopeId);
    }

    const stmt = db.prepare(`UPDATE digests SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE ${whereClause}`);
    return stmt.run(...params);
  }
};

export default DigestService;
