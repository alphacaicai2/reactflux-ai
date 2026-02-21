/**
 * AI Service Module
 * Handles all AI-related API calls through backend proxy
 */

import { ofetch } from "ofetch"

import {
  aiConfigState,
  aiApiKeyState,
  aiLoadingState,
  aiErrorState,
  isAIConfiguredState,
  setAILoading,
  setAIError,
  clearAIError,
} from "@/store/aiState"
import { getLanguageName } from "@/constants/ai-languages"
import { getDefaultUrl, getProviderById } from "@/constants/ai-providers"

/**
 * API base URL for AI endpoints
 * Can be configured via environment variable or defaults to /api/ai
 */
const AI_API_BASE_URL = import.meta.env.VITE_AI_API_BASE_URL || "/api/ai"

/**
 * Default prompts for AI operations
 */
export const DEFAULT_PROMPTS = {
  translate: `Please translate the following text into {{targetLang}}. Only output the translated text without any explanations or additional content.

Text to translate:
{{content}}`,

  summarize: `Please summarize the following content in {{targetLang}}. Keep the summary concise and capture the main points. Only output the summary without any explanations.

Content to summarize:
{{content}}`,

  titleTranslate: `Please translate the following title into {{targetLang}}. Only output the translated title without any explanations or additional content.

Title to translate:
{{title}}`,
}

/**
 * Create AI API client instance
 */
const createAIApiClient = () => {
  return ofetch.create({
    baseURL: AI_API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
    onRequestError({ error }) {
      console.error("AI API request error:", error)
      throw error
    },
    onResponseError({ response }) {
      const errorMessage = response._data?.error || response._data?.message || response.statusText
      console.error("AI API response error:", errorMessage)
      throw new Error(errorMessage)
    },
  })
}

const aiClient = createAIApiClient()

// Convenience methods
aiClient.get = (url, options) => aiClient(url, { ...options, method: "GET" })
aiClient.post = (url, body, options) => aiClient(url, { ...options, method: "POST", body })
aiClient.put = (url, body, options) => aiClient(url, { ...options, method: "PUT", body })
aiClient.delete = (url, options) => aiClient(url, { ...options, method: "DELETE" })

/**
 * Build prompt from template
 * @param {string} template - Prompt template
 * @param {object} variables - Variables to replace
 * @returns {string} Processed prompt
 */
const buildPrompt = (template, variables) => {
  let prompt = template
  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
  }
  return prompt
}

/**
 * Load AI configuration from backend
 * @returns {Promise<object>} Configuration object
 */
export const loadConfig = async () => {
  try {
    setAILoading(true)
    clearAIError()

    const response = await aiClient.get("/config")
    const backendConfigs = Array.isArray(response?.data) ? response.data : []
    const activeConfig =
      backendConfigs.find((config) => config?.is_active === 1 || config?.isActive) || backendConfigs[0]

    if (!activeConfig) {
      return {}
    }

    const currentConfig = aiConfigState.get()
    // Backend returns apiKey as masked string (e.g. "sk-****xxxx") when a key is stored, or null otherwise
    const hasStoredApiKey = Boolean(activeConfig?.apiKey ?? activeConfig?.api_key)

    const mappedConfig = {
      ...currentConfig,
      enabled:
        activeConfig?.is_active !== undefined
          ? Boolean(activeConfig.is_active)
          : activeConfig?.isActive !== undefined
            ? Boolean(activeConfig.isActive)
            : currentConfig.enabled,
      provider: activeConfig?.provider || currentConfig.provider,
      apiUrl: activeConfig?.api_url || activeConfig?.apiUrl || currentConfig.apiUrl,
      model: activeConfig?.model || currentConfig.model,
      hasStoredApiKey,
    }

    aiConfigState.set(mappedConfig)
    return mappedConfig
  } catch (error) {
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Save AI configuration to backend
 * @param {object} config - Configuration to save
 * @returns {Promise<object>} Saved configuration
 */
export const saveConfig = async (config) => {
  try {
    setAILoading(true)
    clearAIError()

    const response = await aiClient.post("/config", config)
    return response
  } catch (error) {
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Get current AI configuration
 * @returns {object} Current configuration
 */
export const getConfig = () => {
  const config = aiConfigState.get()
  const apiKey = aiApiKeyState.get()
  return { ...config, apiKey }
}

const buildAIRequestPayload = (config) => {
  if (config?.apiKey) {
    return { config }
  }

  if (config?.provider) {
    return { provider: config.provider }
  }

  return {}
}

/**
 * Check if AI is configured
 * @returns {boolean} Whether AI is ready to use
 */
export const isConfigured = () => {
  return isAIConfiguredState.get()
}

/**
 * Get loading state
 * @returns {boolean} Loading state
 */
export const isLoading = () => {
  return aiLoadingState.get()
}

/**
 * Get error state
 * @returns {string|null} Error message
 */
export const getError = () => {
  return aiErrorState.get()
}

/**
 * Test AI connection
 * @param {object} config - Configuration to test (optional, uses current config if not provided)
 * @returns {Promise<object>} Test result
 */
export const testConnection = async (config = null) => {
  try {
    setAILoading(true)
    clearAIError()

    const testConfig = config || getConfig()

    if (!testConfig.provider || !testConfig.model || !testConfig.apiKey) {
      throw new Error("Missing required configuration: provider, model, or API key")
    }

    const response = await aiClient.post("/test", testConfig)
    return response
  } catch (error) {
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Chat with AI (supports streaming)
 * @param {Array} messages - Array of message objects [{role: 'user'|'assistant'|'system', content: string}]
 * @param {function} [onChunk] - Callback for streaming chunks
 * @param {AbortSignal} [signal] - Abort signal for cancellation
 * @returns {Promise<string>} AI response
 */
export const chat = async (messages, onChunk, signal) => {
  try {
    setAILoading(true)
    clearAIError()

    const config = getConfig()

    if (!isConfigured()) {
      throw new Error("AI is not configured. Please set up your AI provider first.")
    }

    // If streaming callback provided, use streaming API
    if (onChunk) {
      return await streamChat(config, messages, onChunk, signal)
    }

    // Otherwise use regular API
    const requestPayload = buildAIRequestPayload(config)
    const response = await aiClient.post("/chat", {
      ...requestPayload,
      messages,
      stream: false,
    })

    return response.content || response.message || ""
  } catch (error) {
    if (error.name === "AbortError") {
      throw error
    }
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Stream chat response
 * @param {object} config - AI configuration
 * @param {Array} messages - Chat messages
 * @param {function} onChunk - Chunk callback
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<string>} Full response
 */
const streamChat = async (config, messages, onChunk, signal) => {
  const requestPayload = buildAIRequestPayload(config)
  const response = await fetch(`${AI_API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...requestPayload,
      messages,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || error.error || "Stream request failed")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split("\n")

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6)
        if (data === "[DONE]") continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content || parsed.content || ""
          if (content) {
            fullContent += content
            onChunk(content, fullContent)
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullContent
}

/**
 * Translate content using AI
 * @param {string} content - Content to translate
 * @param {string} targetLang - Target language ID
 * @param {function} [onChunk] - Callback for streaming chunks
 * @param {AbortSignal} [signal] - Abort signal for cancellation
 * @returns {Promise<string>} Translated content
 */
export const translate = async (content, targetLang, onChunk, signal) => {
  try {
    setAILoading(true)
    clearAIError()

    if (!isConfigured()) {
      throw new Error("AI is not configured. Please set up your AI provider first.")
    }

    const config = getConfig()
    const targetLanguage = getLanguageName(targetLang)
    const prompt = buildPrompt(DEFAULT_PROMPTS.translate, {
      targetLang: targetLanguage,
      content,
    })

    const messages = [{ role: "user", content: prompt }]

    if (onChunk) {
      return await streamChat(config, messages, onChunk, signal)
    }

    const requestPayload = buildAIRequestPayload(config)
    const response = await aiClient.post("/translate", {
      ...requestPayload,
      content,
      targetLang,
      stream: false,
    })

    return response.translation || response.content || ""
  } catch (error) {
    if (error.name === "AbortError") {
      throw error
    }
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Summarize content using AI
 * @param {string} content - Content to summarize
 * @param {string} targetLang - Target language ID for summary
 * @param {function} [onChunk] - Callback for streaming chunks
 * @param {AbortSignal} [signal] - Abort signal for cancellation
 * @returns {Promise<string>} Summary
 */
export const summarize = async (content, targetLang, onChunk, signal) => {
  try {
    setAILoading(true)
    clearAIError()

    if (!isConfigured()) {
      throw new Error("AI is not configured. Please set up your AI provider first.")
    }

    const config = getConfig()
    const targetLanguage = getLanguageName(targetLang)
    const prompt = buildPrompt(DEFAULT_PROMPTS.summarize, {
      targetLang: targetLanguage,
      content,
    })

    const messages = [{ role: "user", content: prompt }]

    if (onChunk) {
      return await streamChat(config, messages, onChunk, signal)
    }

    const requestPayload = buildAIRequestPayload(config)
    const response = await aiClient.post("/summarize", {
      ...requestPayload,
      content,
      targetLang,
      stream: false,
    })

    return response.summary || response.content || ""
  } catch (error) {
    if (error.name === "AbortError") {
      throw error
    }
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Translate a single title using AI
 * @param {string} title - Title to translate
 * @param {string} targetLang - Target language ID
 * @returns {Promise<string>} Translated title
 */
export const translateTitle = async (title, targetLang) => {
  try {
    setAILoading(true)
    clearAIError()

    if (!isConfigured()) {
      throw new Error("AI is not configured. Please set up your AI provider first.")
    }

    const config = getConfig()
    const targetLanguage = getLanguageName(targetLang)
    const prompt = buildPrompt(DEFAULT_PROMPTS.titleTranslate, {
      targetLang: targetLanguage,
      title,
    })

    const messages = [{ role: "user", content: prompt }]

    const requestPayload = buildAIRequestPayload(config)
    const response = await aiClient.post("/translate/title", {
      ...requestPayload,
      title,
      targetLang,
      stream: false,
    })

    return response.translation || response.content || ""
  } catch (error) {
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Translate multiple titles in batch
 * @param {Array<{id: string|number, title: string}>} items - Items with id and title
 * @param {string} targetLang - Target language ID
 * @param {function} [onProgress] - Progress callback (completed, total)
 * @returns {Promise<Array<{id: string|number, translatedTitle: string}>>}
 */
export const translateTitlesBatch = async (items, targetLang, onProgress) => {
  try {
    setAILoading(true)
    clearAIError()

    if (!isConfigured()) {
      throw new Error("AI is not configured. Please set up your AI provider first.")
    }

    const config = getConfig()
    const results = []
    const total = items.length

    // Process in batches of 5 to avoid rate limits
    const BATCH_SIZE = 5

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)

      const batchPromises = batch.map(async (item) => {
        try {
          const translatedTitle = await translateTitle(item.title, targetLang)
          return { id: item.id, translatedTitle }
        } catch (error) {
          console.error(`Failed to translate title ${item.id}:`, error)
          return { id: item.id, translatedTitle: item.title, error: error.message }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      if (onProgress) {
        onProgress(results.length, total)
      }

      // Add small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    return results
  } catch (error) {
    setAIError(error.message)
    throw error
  } finally {
    setAILoading(false)
  }
}

/**
 * Cancel ongoing AI operation
 * @param {AbortController} controller - Abort controller
 */
export const cancelOperation = (controller) => {
  if (controller && !controller.signal.aborted) {
    controller.abort()
    setAILoading(false)
  }
}

/**
 * Create a new AbortController for AI operations
 * @returns {AbortController}
 */
export const createAbortController = () => {
  return new AbortController()
}

// Export the API client for advanced usage
export { aiClient }
