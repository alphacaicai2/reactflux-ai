/**
 * Digest Service Module
 * Handles all digest-related API calls through backend
 */

import { ofetch } from "ofetch"

/**
 * API base URL for digest endpoints
 */
const DIGEST_API_BASE_URL = import.meta.env.VITE_DIGEST_API_BASE_URL || "/api/digests"

/**
 * Create digest API client instance
 */
const createDigestApiClient = () => {
  return ofetch.create({
    baseURL: DIGEST_API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
    onRequestError({ error }) {
      console.error("Digest API request error:", error)
      throw error
    },
    onResponseError({ response }) {
      const errorMessage = response._data?.error || response._data?.message || response.statusText
      console.error("Digest API response error:", errorMessage)
      throw new Error(errorMessage)
    },
  })
}

const digestClient = createDigestApiClient()

// Convenience methods
digestClient.get = (url, options) => digestClient(url, { ...options, method: "GET" })
digestClient.post = (url, body, options) => digestClient(url, { ...options, method: "POST", body })
digestClient.put = (url, body, options) => digestClient(url, { ...options, method: "PUT", body })
digestClient.delete = (url, options) => digestClient(url, { ...options, method: "DELETE" })

// ============================================
// Digest CRUD Operations
// ============================================

/**
 * Get digests list with pagination and filtering
 * @param {object} params - Query parameters
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.limit=20] - Items per page
 * @param {string} [params.scope] - Filter by scope (all, feed, group)
 * @param {number} [params.scopeId] - Filter by scope ID
 * @param {boolean} [params.isRead] - Filter by read status
 * @returns {Promise<object>} Digests list with pagination
 */
export const getDigests = async (params = {}) => {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set("page", params.page)
  if (params.limit) searchParams.set("limit", params.limit)
  if (params.scope) searchParams.set("scope", params.scope)
  if (params.scopeId) searchParams.set("scopeId", params.scopeId)
  if (params.isRead !== undefined) searchParams.set("isRead", params.isRead)

  const queryString = searchParams.toString()
  const url = queryString ? `?${queryString}` : ""

  const response = await digestClient.get(url)
  return response
}

/**
 * Get a single digest by ID
 * @param {number|string} id - Digest ID
 * @returns {Promise<object>} Digest data
 */
export const getDigest = async (id) => {
  const response = await digestClient.get(`/${id}`)
  return response
}

/**
 * Create a new digest (manual save)
 * @param {object} data - Digest data
 * @param {string} data.title - Digest title
 * @param {string} data.content - Digest content (markdown)
 * @param {string} [data.scope='all'] - Scope (all, feed, group)
 * @param {number} [data.scopeId] - Scope ID
 * @param {string} [data.scopeName] - Scope name for display
 * @param {number} [data.articleCount] - Number of articles included
 * @param {number} [data.hours] - Time range in hours
 * @param {string} [data.targetLang] - Target language
 * @returns {Promise<object>} Created digest
 */
export const createDigest = async (data) => {
  const response = await digestClient.post("/", data)
  return response
}

/**
 * Update an existing digest
 * @param {number|string} id - Digest ID
 * @param {object} data - Update data
 * @returns {Promise<object>} Update result
 */
export const updateDigest = async (id, data) => {
  const response = await digestClient.put(`/${id}`, data)
  return response
}

/**
 * Delete a digest
 * @param {number|string} id - Digest ID
 * @returns {Promise<object>} Delete result
 */
export const deleteDigest = async (id) => {
  const response = await digestClient.delete(`/${id}`)
  return response
}

/**
 * Mark a digest as read
 * @param {number|string} id - Digest ID
 * @returns {Promise<object>} Result
 */
export const markDigestAsRead = async (id) => {
  const response = await digestClient.post(`/${id}/read`)
  return response
}

/**
 * Mark all digests as read
 * @param {object} [options] - Options
 * @param {string} [options.scope] - Filter by scope
 * @param {number} [options.scopeId] - Filter by scope ID
 * @returns {Promise<object>} Result
 */
export const markAllDigestsAsRead = async (options = {}) => {
  const response = await digestClient.post("/read-all", options)
  return response
}

// ============================================
// Digest Generation
// ============================================

/**
 * Generate a new digest using AI
 * @param {object} options - Generation options
 * @param {string} [options.scope='all'] - Scope (all, feed, group)
 * @param {number} [options.feedId] - Feed ID (when scope='feed')
 * @param {number} [options.groupId] - Group/Category ID (when scope='group')
 * @param {number} [options.hours=24] - Time range in hours
 * @param {string} [options.targetLang='Simplified Chinese'] - Target language
 * @param {string} [options.prompt] - Custom prompt template
 * @param {boolean} [options.unreadOnly=true] - Only include unread articles
 * @param {object} [options.pushConfig] - Push notification config
 * @param {string} [options.timezone] - Timezone for date formatting
 * @returns {Promise<object>} Generated digest
 */
export const generateDigest = async (options = {}) => {
  const response = await digestClient.post("/generate", options)
  return response
}

/**
 * Push an existing digest to webhook
 * @param {number|string} id - Digest ID
 * @param {object} pushConfig - Push configuration
 * @param {string} pushConfig.method - HTTP method (POST, GET)
 * @param {string} pushConfig.url - Webhook URL
 * @param {string} [pushConfig.body] - Request body template
 * @param {object} [pushConfig.headers] - Additional headers
 * @returns {Promise<object>} Push result
 */
export const pushDigest = async (id, pushConfig) => {
  const response = await digestClient.post(`/${id}/push`, { pushConfig })
  return response
}

// ============================================
// Scheduled Tasks
// ============================================

/**
 * Get all scheduled digest tasks
 * @returns {Promise<object>} List of scheduled tasks
 */
export const getScheduledTasks = async () => {
  const response = await digestClient.get("/schedule")
  return response
}

/**
 * Get a single scheduled task
 * @param {number|string} id - Task ID
 * @returns {Promise<object>} Task data
 */
export const getScheduledTask = async (id) => {
  const response = await digestClient.get(`/schedule/${id}`)
  return response
}

/**
 * Create a new scheduled digest task
 * @param {object} data - Task configuration
 * @param {string} data.name - Task name
 * @param {string} [data.scope='all'] - Scope (all, feed, group)
 * @param {number} [data.scopeId] - Scope ID
 * @param {string} [data.scopeName] - Scope name for display
 * @param {number} [data.hours=24] - Time range in hours
 * @param {string} [data.targetLang='Simplified Chinese'] - Target language
 * @param {boolean} [data.unreadOnly=true] - Only include unread articles
 * @param {boolean} [data.pushEnabled=false] - Enable push notification
 * @param {object} [data.pushConfig] - Push notification config
 * @param {string} data.cronExpression - Cron expression for schedule
 * @param {string} [data.timezone='Asia/Shanghai'] - Timezone
 * @param {boolean} [data.isActive=true] - Task is active
 * @returns {Promise<object>} Created task
 */
export const createScheduledTask = async (data) => {
  const response = await digestClient.post("/schedule", data)
  return response
}

/**
 * Update a scheduled task
 * @param {number|string} id - Task ID
 * @param {object} data - Update data
 * @returns {Promise<object>} Update result
 */
export const updateScheduledTask = async (id, data) => {
  const response = await digestClient.put(`/schedule/${id}`, data)
  return response
}

/**
 * Delete a scheduled task
 * @param {number|string} id - Task ID
 * @returns {Promise<object>} Delete result
 */
export const deleteScheduledTask = async (id) => {
  const response = await digestClient.delete(`/schedule/${id}`)
  return response
}

/**
 * Enable a scheduled task
 * @param {number|string} id - Task ID
 * @returns {Promise<object>} Result
 */
export const enableScheduledTask = async (id) => {
  const response = await digestClient.post(`/schedule/${id}/enable`)
  return response
}

/**
 * Disable a scheduled task
 * @param {number|string} id - Task ID
 * @returns {Promise<object>} Result
 */
export const disableScheduledTask = async (id) => {
  const response = await digestClient.post(`/schedule/${id}/disable`)
  return response
}

/**
 * Manually run a scheduled task
 * @param {number|string} id - Task ID
 * @returns {Promise<object>} Execution result
 */
export const runScheduledTask = async (id) => {
  const response = await digestClient.post(`/schedule/${id}/run`)
  return response
}

// ============================================
// Webhook Templates
// ============================================

/**
 * Predefined webhook templates for different platforms
 */
export const WEBHOOK_TEMPLATES = {
  discord: {
    name: "Discord",
    method: "POST",
    bodyTemplate: JSON.stringify(
      {
        content: null,
        embeds: [
          {
            title: "{{title}}",
            description: "{{content}}",
            color: 5814783,
            timestamp: "{{timestamp}}",
          },
        ],
      },
      null,
      2,
    ),
    placeholder: "https://discord.com/api/webhooks/...",
  },
  telegram: {
    name: "Telegram",
    method: "POST",
    bodyTemplate: JSON.stringify(
      {
        chat_id: "{{chatId}}",
        text: "*{{title}}*\n\n{{content}}",
        parse_mode: "Markdown",
      },
      null,
      2,
    ),
    placeholder: "https://api.telegram.org/bot<token>/sendMessage",
  },
  wecom: {
    name: "Enterprise WeChat",
    method: "POST",
    bodyTemplate: JSON.stringify(
      {
        msgtype: "markdown",
        markdown: {
          content: "# {{title}}\n\n{{content}}",
        },
      },
      null,
      2,
    ),
    placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
  },
  feishu: {
    name: "Feishu/Lark",
    method: "POST",
    bodyTemplate: JSON.stringify(
      {
        msg_type: "interactive",
        card: {
          header: {
            title: {
              tag: "plain_text",
              content: "{{title}}",
            },
            template: "blue",
          },
          elements: [
            {
              tag: "markdown",
              content: "{{content}}",
            },
          ],
        },
      },
      null,
      2,
    ),
    placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
  },
  slack: {
    name: "Slack",
    method: "POST",
    bodyTemplate: JSON.stringify(
      {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "{{title}}",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "{{content}}",
            },
          },
        ],
      },
      null,
      2,
    ),
    placeholder: "https://hooks.slack.com/services/...",
  },
  generic: {
    name: "Generic Webhook",
    method: "POST",
    bodyTemplate: JSON.stringify(
      {
        title: "{{title}}",
        content: "{{content}}",
        timestamp: "{{timestamp}}",
      },
      null,
      2,
    ),
    placeholder: "https://your-webhook-url.com/...",
  },
}

/**
 * Get webhook template by platform
 * @param {string} platform - Platform name
 * @returns {object} Template configuration
 */
export const getWebhookTemplate = (platform) => {
  return WEBHOOK_TEMPLATES[platform] || WEBHOOK_TEMPLATES.generic
}

/**
 * Replace template variables in webhook body
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {object} data - Data to replace
 * @returns {string} Processed template
 */
export const processWebhookTemplate = (template, data) => {
  let result = template
  const variables = {
    title: data.title || "",
    content: data.content || "",
    timestamp: new Date().toISOString(),
    chatId: data.chatId || "",
    ...data,
  }

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
  }

  return result
}

// Export the client for advanced usage
export { digestClient }
