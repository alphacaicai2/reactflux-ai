/**
 * AI Module Index
 * Central export point for all AI-related functionality
 */

// Constants
export { AI_PROVIDERS, getProviderById, getDefaultUrl, hasRegionalEndpoints, getRegionOptions } from "./constants/ai-providers"

export {
  AI_LANGUAGES,
  DEFAULT_TARGET_LANGUAGE,
  getLanguageById,
  getLanguageName,
} from "./constants/ai-languages"

// State Management
export {
  aiConfigState,
  aiApiKeyState,
  aiLoadingState,
  aiErrorState,
  isAIConfiguredState,
  getAIConfig,
  updateAIConfig,
  setAIApiKey,
  setAILoading,
  setAIError,
  clearAIError,
  resetAIConfig,
  isAIConfigured,
} from "./stores/aiState"

// Services
export {
  DEFAULT_PROMPTS,
  loadConfig,
  saveConfig,
  getConfig,
  isConfigured,
  isLoading,
  getError,
  testConnection,
  chat,
  translate,
  summarize,
  translateTitle,
  translateTitlesBatch,
  cancelOperation,
  createAbortController,
  aiClient,
} from "./services/ai-service"

// Hooks
export { useAI } from "./hooks/useAI"
