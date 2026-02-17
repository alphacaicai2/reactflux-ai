/**
 * Push Service - 推送服务
 *
 * 支持多平台推送：
 * - Discord (content limit: 2000)
 * - Telegram (text limit: 4096)
 * - 企业微信 (text.content limit: 2048)
 * - 飞书/Lark (text limit: 30720)
 * - 通用 Webhook
 */

/**
 * 将文本按段落/换行边界拆分为不超过 maxLen 的块
 */
function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // 优先在段落边界 (\n\n) 处拆分
    let splitPos = remaining.lastIndexOf('\n\n', maxLen);
    if (splitPos < maxLen * 0.3) {
      // 段落边界太靠前，尝试在单个换行处拆分
      splitPos = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitPos < maxLen * 0.3) {
      // 最后兜底：硬切
      splitPos = maxLen;
    }

    chunks.push(remaining.substring(0, splitPos));
    remaining = remaining.substring(splitPos).replace(/^\n+/, '');
  }

  return chunks;
}

/**
 * 根据推送 URL 检测平台类型
 */
function detectPlatform(url) {
  const lowerUrl = (url || '').toLowerCase();

  if (lowerUrl.includes('discord.com') || lowerUrl.includes('discordapp.com')) {
    return 'discord';
  }

  if (lowerUrl.includes('api.telegram.org')) {
    return 'telegram';
  }

  if (lowerUrl.includes('qyapi.weixin.qq.com')) {
    return 'wecom'; // 企业微信
  }

  if (lowerUrl.includes('open.feishu.cn') || lowerUrl.includes('open.larksuite.com')) {
    return 'feishu'; // 飞书/Lark
  }

  if (lowerUrl.includes('oapi.dingtalk.com')) {
    return 'dingtalk'; // 钉钉
  }

  if (lowerUrl.includes('slack.com')) {
    return 'slack';
  }

  return 'generic';
}

/**
 * 获取平台的内容长度限制
 */
function getPlatformLimits(platform) {
  const limits = {
    discord: { content: 2000, embedDescription: 4096 },
    telegram: { text: 4096 },
    wecom: { textContent: 2048, markdownContent: 4096 },
    feishu: { text: 30720, postContent: 10000 },
    dingtalk: { text: 20000, markdown: 20000 },
    slack: { text: 40000 },
    generic: { content: 8000 } // 保守默认值
  };

  return limits[platform] || limits.generic;
}

/**
 * 自动生成适合平台的请求体模板
 */
function autoGenerateBodyTemplate(platform, url) {
  const templates = {
    discord: '{"content": "{{title}}\\n\\n{{digest_content}}"}',
    telegram: '{"chat_id": "YOUR_CHAT_ID", "text": "{{title}}\\n\\n{{digest_content}}", "parse_mode": "Markdown"}',
    wecom: '{"msgtype": "markdown", "markdown": {"content": "{{title}}\\n\\n{{digest_content}}"}}',
    feishu: '{"msg_type": "interactive", "card": {"elements": [{"tag": "markdown", "content": "{{digest_content}}"}], "header": {"title": {"tag": "plain_text", "content": "{{title}}"}}}}',
    dingtalk: '{"msgtype": "markdown", "markdown": {"title": "{{title}}", "text": "{{title}}\\n\\n{{digest_content}}"}}',
    slack: '{"text": "{{title}}\\n\\n{{digest_content}}"}',
    generic: '{"title": "{{title}}", "content": "{{digest_content}}"}'
  };

  return templates[platform] || templates.generic;
}

/**
 * 发送推送通知
 * @param {object} pushConfig - 推送配置 { url, method, body, headers }
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @returns {Promise<object>} - 发送结果 { success, status, error }
 */
export async function sendPushNotification(pushConfig, title, content) {
  const pushMethod = (pushConfig.method || 'POST').toUpperCase();
  const platform = detectPlatform(pushConfig.url);

  console.log(`[PushService] Sending notification via ${platform} (${pushMethod})`);

  // ---- GET 模式：URL 编码，单条发送 ----
  if (pushMethod === 'GET') {
    try {
      const pushUrl = pushConfig.url
        .replace(/\{\{title\}\}/g, encodeURIComponent(title || ''))
        .replace(/\{\{digest_content\}\}/g, encodeURIComponent(content || ''));

      const resp = await fetch(pushUrl, { method: 'GET' });

      console.log(`[PushService] GET ${pushConfig.url}: ${resp.status}`);

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[PushService] Push failed:`, errBody);
        return { success: false, status: resp.status, error: errBody };
      }

      return { success: true, status: resp.status };
    } catch (e) {
      console.error(`[PushService] Network error:`, e);
      return { success: false, status: 'ERR', error: e.message };
    }
  }

  // ---- POST 模式：检测限制 & 自动分段 ----
  let bodyTemplate = pushConfig.body || '';

  // 智能自动填充
  if (!bodyTemplate.trim()) {
    bodyTemplate = autoGenerateBodyTemplate(platform, pushConfig.url);
    console.log(`[PushService] Auto-generated body template for ${platform}`);
  }

  // 移除模板中的换行符（保持 JSON 格式正确）
  bodyTemplate = bodyTemplate.replace(/[\r\n]+/g, '');

  let contentChunks = [content];
  const limits = getPlatformLimits(platform);

  // 获取主要内容字段限制
  let fieldLimit = limits.content || limits.text || limits.textContent || 8000;

  // 特殊处理各平台
  if (platform === 'discord') {
    fieldLimit = limits.content; // 2000
  } else if (platform === 'telegram') {
    fieldLimit = limits.text; // 4096
  } else if (platform === 'wecom') {
    fieldLimit = limits.markdownContent; // 4096 for markdown
  }

  if (fieldLimit > 0 && content && content.length > fieldLimit) {
    // 计算模板开销
    const templateOverhead = bodyTemplate
      .replace(/\{\{title\}\}/g, title || '')
      .replace(/\{\{digest_content\}\}/g, '').length;

    const availablePerChunk = fieldLimit - Math.min(templateOverhead, fieldLimit * 0.3);

    if (availablePerChunk > 100) {
      contentChunks = splitText(content, availablePerChunk);
      console.log(`[PushService] Content split into ${contentChunks.length} chunk(s) (limit: ${fieldLimit})`);
    }
  }

  // 逐条发送
  const results = [];

  for (let i = 0; i < contentChunks.length; i++) {
    const chunkTitle = i === 0 ? (title || '') : '';
    const suffix = contentChunks.length > 1 ? ` (${i + 1}/${contentChunks.length})` : '';

    // 安全转义 JSON 字符串
    const chunkSafeTitle = JSON.stringify(chunkTitle).slice(1, -1);
    const chunkSafeContent = JSON.stringify(contentChunks[i]).slice(1, -1);

    const body = bodyTemplate
      .replace(/\{\{title\}\}/g, chunkSafeTitle + suffix)
      .replace(/\{\{digest_content\}\}/g, chunkSafeContent);

    // 添加 Telegram 分段标记
    if (platform === 'telegram' && contentChunks.length > 1) {
      // 在 body JSON 中添加标记
      try {
        const bodyObj = JSON.parse(body);
        if (bodyObj.text) {
          bodyObj.text = `[${i + 1}/${contentChunks.length}]\n\n` + bodyObj.text;
        }
        body = JSON.stringify(bodyObj);
      } catch {
        // 忽略 JSON 解析错误
      }
    }

    console.log(`[PushService] Sending chunk ${i + 1}/${contentChunks.length} (body_length: ${body.length})`);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(pushConfig.headers || {})
      };

      const resp = await fetch(pushConfig.url, {
        method: 'POST',
        headers,
        body
      });

      console.log(`[PushService] Chunk ${i + 1}/${contentChunks.length} sent: ${resp.status}`);

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error(`[PushService] Chunk failed:`, errBody);
        results.push({ success: false, status: resp.status, error: errBody, chunk: i + 1 });
      } else {
        // Discord 可能返回 204 No Content
        if (platform === 'discord' && resp.status === 204) {
          console.log(`[PushService] Discord verified success (204)`);
        }
        results.push({ success: true, status: resp.status, chunk: i + 1 });
      }
    } catch (e) {
      console.error(`[PushService] Network error on chunk ${i + 1}:`, e);
      results.push({ success: false, status: 'ERR', error: e.message, chunk: i + 1 });
    }

    // 多条之间加延迟，保证按顺序接收
    if (i < contentChunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 汇总结果
  const allSuccess = results.every(r => r.success);
  const lastResult = results[results.length - 1];

  return {
    success: allSuccess,
    status: lastResult?.status,
    error: allSuccess ? undefined : lastResult?.error,
    chunks: results.length,
    details: results
  };
}

/**
 * 测试推送配置
 * @param {object} pushConfig - 推送配置
 * @returns {Promise<object>} - 测试结果
 */
export async function testPushNotification(pushConfig) {
  const testTitle = 'ReactFlux AI - Test Notification';
  const testContent = 'This is a test notification from ReactFlux AI.\n\nIf you see this message, your push notification is configured correctly!';

  return sendPushNotification(pushConfig, testTitle, testContent);
}

/**
 * PushService 主对象
 */
export const PushService = {
  send: sendPushNotification,
  test: testPushNotification,
  detectPlatform,
  getPlatformLimits
};

export default PushService;
