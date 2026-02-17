/**
 * AI State Management using Nanostores
 * Manages AI configuration, loading states, and errors
 */

import { atom, computed } from "nanostores"
import { persistentAtom } from "@nanostores/persistent"

import { DEFAULT_TARGET_LANGUAGE } from "@/constants/ai-languages"

/**
 * Default AI configuration
 */
const defaultConfig = {
  enabled: false, // Enable/disable AI features
  provider: "", // Provider ID (e.g., 'openai', 'anthropic')
  apiUrl: "", // Custom API URL (optional, uses default if empty)
  apiKey: "", // API key (stored securely, not persisted to localStorage by default)
  model: "", // Model name (e.g., 'gpt-4o')
  region: "", // Region for providers that support it (e.g., '国内', '国外')
  targetLanguage: DEFAULT_TARGET_LANGUAGE, // Default target language for translation
  autoSummary: false, // Auto-generate summary for articles
  maxTokens: 4096, // Maximum tokens for responses
  temperature: 0.7, // Temperature for AI responses
  // Title translation settings
  titleTranslation: false, // Enable title translation
  titleTranslationMode: "chinese_only", // 'chinese_only' | 'bilingual'
  titleTranslationScope: "all", // 'all' | 'groups'
  titleTranslationGroupIds: [], // Array of category/group IDs to translate
}

/**
 * Persistent AI configuration store (without sensitive data)
 * Note: API key is handled separately for security
 */
export const aiConfigState = persistentAtom("ai-config", defaultConfig, {
  encode: (value) => {
    // Don't persist API key to localStorage for security
    const { apiKey: _, ...safeConfig } = value
    return JSON.stringify(safeConfig)
  },
  decode: (str) => {
    try {
      const storedValue = JSON.parse(str)
      return { ...defaultConfig, ...storedValue, apiKey: "" }
    } catch {
      return defaultConfig
    }
  },
})

/**
 * In-memory API key store (not persisted)
 * Should be set on app load from secure storage or user input
 */
export const aiApiKeyState = atom("")

/**
 * AI loading state
 */
export const aiLoadingState = atom(false)

/**
 * AI error state
 */
export const aiErrorState = atom(null)

/**
 * Computed: Whether AI is configured (has provider, API key, and model)
 */
export const isAIConfiguredState = computed(
  [aiConfigState, aiApiKeyState],
  (config, apiKey) => {
    return !!(config.enabled && config.provider && config.model && apiKey)
  },
)

/**
 * Get current AI configuration
 * @returns {object} Current configuration including API key
 */
export const getAIConfig = () => {
  const config = aiConfigState.get()
  const apiKey = aiApiKeyState.get()
  return { ...config, apiKey }
}

/**
 * Update AI configuration
 * @param {Partial<typeof defaultConfig>} updates - Configuration updates
 */
export const updateAIConfig = (updates) => {
  const currentConfig = aiConfigState.get()

  // Handle API key separately
  if ("apiKey" in updates) {
    aiApiKeyState.set(updates.apiKey)
    delete updates.apiKey
  }

  aiConfigState.set({ ...currentConfig, ...updates })
}

/**
 * Set AI API key
 * @param {string} apiKey - The API key
 */
export const setAIApiKey = (apiKey) => {
  aiApiKeyState.set(apiKey)
}

/**
 * Set AI loading state
 * @param {boolean} isLoading - Loading state
 */
export const setAILoading = (isLoading) => {
  aiLoadingState.set(isLoading)
}

/**
 * Set AI error state
 * @param {string|null} error - Error message or null to clear
 */
export const setAIError = (error) => {
  aiErrorState.set(error)
}

/**
 * Clear AI error
 */
export const clearAIError = () => {
  aiErrorState.set(null)
}

/**
 * Reset AI configuration to defaults
 */
export const resetAIConfig = () => {
  aiConfigState.set(defaultConfig)
  aiApiKeyState.set("")
  aiErrorState.set(null)
}

/**
 * Check if AI is configured
 * @returns {boolean} Whether AI is ready to use
 */
export const isAIConfigured = () => {
  return isAIConfiguredState.get()
}
