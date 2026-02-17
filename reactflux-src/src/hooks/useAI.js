/**
 * useAI Custom Hook
 * Provides easy access to AI functionality with React integration
 */

import { useCallback, useRef, useState } from "react"
import { useStore } from "@nanostores/react"

import {
  aiConfigState,
  aiLoadingState,
  aiErrorState,
  isAIConfiguredState,
  updateAIConfig,
  setAIApiKey,
  setAIError,
  clearAIError,
  resetAIConfig,
} from "@/store/aiState"

import {
  loadConfig,
  saveConfig,
  testConnection,
  chat,
  translate,
  summarize,
  translateTitle,
  translateTitlesBatch,
  createAbortController,
  cancelOperation,
} from "@/services/ai-service"

/**
 * Custom hook for AI functionality
 * @returns {object} AI utilities and state
 */
export function useAI() {
  // React state for local component usage
  const [localLoading, setLocalLoading] = useState(false)
  const abortControllerRef = useRef(null)

  // Nanostores state with React integration
  const config = useStore(aiConfigState)
  const isLoading = useStore(aiLoadingState)
  const error = useStore(aiErrorState)
  const isConfigured = useStore(isAIConfiguredState)

  /**
   * Load configuration from backend
   */
  const handleLoadConfig = useCallback(async () => {
    try {
      setLocalLoading(true)
      const loadedConfig = await loadConfig()
      return loadedConfig
    } catch (err) {
      console.error("Failed to load AI config:", err)
      throw err
    } finally {
      setLocalLoading(false)
    }
  }, [])

  /**
   * Save configuration to backend
   */
  const handleSaveConfig = useCallback(async (newConfig) => {
    try {
      setLocalLoading(true)
      const result = await saveConfig(newConfig)

      // Update local state
      if (newConfig.apiKey) {
        setAIApiKey(newConfig.apiKey)
      }
      updateAIConfig({
        ...newConfig,
        hasStoredApiKey: Boolean(newConfig.apiKey || newConfig.hasStoredApiKey),
      })

      return result
    } catch (err) {
      console.error("Failed to save AI config:", err)
      throw err
    } finally {
      setLocalLoading(false)
    }
  }, [])

  /**
   * Test AI connection
   */
  const handleTestConnection = useCallback(
    async (testConfig = null) => {
      try {
        setLocalLoading(true)
        clearAIError()
        const result = await testConnection(testConfig || { ...config })
        return result
      } catch (err) {
        console.error("AI connection test failed:", err)
        throw err
      } finally {
        setLocalLoading(false)
      }
    },
    [config],
  )

  /**
   * Translate content with streaming support
   */
  const handleTranslate = useCallback(async (content, targetLang, onChunk) => {
    try {
      setLocalLoading(true)
      clearAIError()

      // Create abort controller for cancellation
      abortControllerRef.current = createAbortController()

      const result = await translate(content, targetLang, onChunk, abortControllerRef.current.signal)
      return result
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Translation failed:", err)
      }
      throw err
    } finally {
      setLocalLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  /**
   * Summarize content with streaming support
   */
  const handleSummarize = useCallback(async (content, targetLang, onChunk) => {
    try {
      setLocalLoading(true)
      clearAIError()

      abortControllerRef.current = createAbortController()

      const result = await summarize(content, targetLang, onChunk, abortControllerRef.current.signal)
      return result
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Summarization failed:", err)
      }
      throw err
    } finally {
      setLocalLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  /**
   * Translate a single title
   */
  const handleTranslateTitle = useCallback(async (title, targetLang) => {
    try {
      setLocalLoading(true)
      clearAIError()

      const result = await translateTitle(title, targetLang)
      return result
    } catch (err) {
      console.error("Title translation failed:", err)
      throw err
    } finally {
      setLocalLoading(false)
    }
  }, [])

  /**
   * Translate multiple titles in batch
   */
  const handleTranslateTitlesBatch = useCallback(async (items, targetLang, onProgress) => {
    try {
      setLocalLoading(true)
      clearAIError()

      const results = await translateTitlesBatch(items, targetLang, onProgress)
      return results
    } catch (err) {
      console.error("Batch title translation failed:", err)
      throw err
    } finally {
      setLocalLoading(false)
    }
  }, [])

  /**
   * Chat with AI
   */
  const handleChat = useCallback(async (messages, onChunk) => {
    try {
      setLocalLoading(true)
      clearAIError()

      abortControllerRef.current = createAbortController()

      const result = await chat(messages, onChunk, abortControllerRef.current.signal)
      return result
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Chat failed:", err)
      }
      throw err
    } finally {
      setLocalLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  /**
   * Cancel ongoing operation
   */
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      cancelOperation(abortControllerRef.current)
      abortControllerRef.current = null
    }
  }, [])

  /**
   * Clear any errors
   */
  const handleClearError = useCallback(() => {
    clearAIError()
  }, [])

  /**
   * Reset AI configuration
   */
  const handleReset = useCallback(() => {
    handleCancel()
    resetAIConfig()
  }, [handleCancel])

  /**
   * Update configuration partially
   */
  const handleUpdateConfig = useCallback((updates) => {
    if (updates.apiKey) {
      setAIApiKey(updates.apiKey)
    }
    updateAIConfig(updates)
  }, [])

  return {
    // State
    config,
    isLoading: isLoading || localLoading,
    error,
    isConfigured,

    // Configuration management
    loadConfig: handleLoadConfig,
    saveConfig: handleSaveConfig,
    updateConfig: handleUpdateConfig,
    resetConfig: handleReset,

    // AI operations
    translate: handleTranslate,
    summarize: handleSummarize,
    translateTitle: handleTranslateTitle,
    translateTitlesBatch: handleTranslateTitlesBatch,
    chat: handleChat,

    // Connection
    testConnection: handleTestConnection,

    // Utilities
    cancel: handleCancel,
    clearError: handleClearError,
  }
}

export default useAI
