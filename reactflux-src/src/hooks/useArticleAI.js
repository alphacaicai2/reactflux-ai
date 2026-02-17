/**
 * useArticleAI Hook
 * Encapsulates article-related AI operations (summary, translation)
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { useStore } from "@nanostores/react"

import { polyglotState } from "@/hooks/useLanguage"
import { aiConfigState, isAIConfiguredState } from "@/store/aiState"
import {
  summarize,
  translate,
  createAbortController,
  cancelOperation,
} from "@/services/ai-service"

/**
 * Extract plain text from HTML content
 * @param {string} html - HTML content
 * @param {number} maxLength - Maximum length to extract
 * @returns {string} Plain text content
 */
const extractPlainText = (html, maxLength = 8000) => {
  if (!html) return ""

  const tempDiv = document.createElement("div")
  tempDiv.innerHTML = html
  const textContent = tempDiv.textContent || tempDiv.innerText || ""

  return textContent.slice(0, maxLength)
}

/**
 * Custom hook for article AI operations
 * @param {object} article - The article object
 * @returns {object} AI utilities and state for the article
 */
export function useArticleAI(article) {
  const { polyglot } = useStore(polyglotState)
  const config = useStore(aiConfigState)
  const isConfigured = useStore(isAIConfiguredState)

  // Summary state
  const [summary, setSummary] = useState("")
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const summaryAbortRef = useRef(null)

  // Translation state
  const [translatedContent, setTranslatedContent] = useState("")
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const translationAbortRef = useRef(null)

  // Reset state when article changes
  useEffect(() => {
    setSummary("")
    setSummaryError(null)
    setIsSummarizing(false)
    setTranslatedContent("")
    setTranslationError(null)
    setIsTranslating(false)
    setShowTranslation(false)

    // Cancel any ongoing operations
    if (summaryAbortRef.current) {
      cancelOperation(summaryAbortRef.current)
      summaryAbortRef.current = null
    }
    if (translationAbortRef.current) {
      cancelOperation(translationAbortRef.current)
      translationAbortRef.current = null
    }
  }, [article?.id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (summaryAbortRef.current) {
        cancelOperation(summaryAbortRef.current)
      }
      if (translationAbortRef.current) {
        cancelOperation(translationAbortRef.current)
      }
    }
  }, [])

  /**
   * Generate article summary
   */
  const summarizeArticle = useCallback(async () => {
    if (!isConfigured || !article?.content) {
      setSummaryError(polyglot.t("ai.not_configured"))
      return
    }

    setIsSummarizing(true)
    setSummaryError(null)
    setSummary("")

    try {
      summaryAbortRef.current = createAbortController()

      const textContent = extractPlainText(article.content)

      await summarize(
        textContent,
        config.targetLanguage || "zh-CN",
        (chunk, fullContent) => {
          setSummary(fullContent)
        },
        summaryAbortRef.current.signal
      )
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Summary generation failed:", err)
        setSummaryError(err.message || polyglot.t("ai.summary_error"))
      }
    } finally {
      setIsSummarizing(false)
      summaryAbortRef.current = null
    }
  }, [article, isConfigured, config.targetLanguage, polyglot])

  /**
   * Cancel summary generation
   */
  const cancelSummary = useCallback(() => {
    if (summaryAbortRef.current) {
      cancelOperation(summaryAbortRef.current)
      summaryAbortRef.current = null
    }
    setIsSummarizing(false)
  }, [])

  /**
   * Translate article content
   */
  const translateArticle = useCallback(async () => {
    if (!isConfigured || !article?.content) {
      setTranslationError(polyglot.t("ai.not_configured"))
      return
    }

    setIsTranslating(true)
    setTranslationError(null)
    setTranslatedContent("")

    try {
      translationAbortRef.current = createAbortController()

      const textContent = extractPlainText(article.content, 12000)

      await translate(
        textContent,
        config.targetLanguage || "zh-CN",
        (chunk, fullContent) => {
          setTranslatedContent(fullContent)
        },
        translationAbortRef.current.signal
      )

      setShowTranslation(true)
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Translation failed:", err)
        setTranslationError(err.message || polyglot.t("ai.translation_error"))
      }
    } finally {
      setIsTranslating(false)
      translationAbortRef.current = null
    }
  }, [article, isConfigured, config.targetLanguage, polyglot])

  /**
   * Cancel translation
   */
  const cancelTranslation = useCallback(() => {
    if (translationAbortRef.current) {
      cancelOperation(translationAbortRef.current)
      translationAbortRef.current = null
    }
    setIsTranslating(false)
  }, [])

  /**
   * Toggle translation view
   */
  const toggleTranslation = useCallback(() => {
    if (!translatedContent && !isTranslating) {
      translateArticle()
    } else {
      setShowTranslation((prev) => !prev)
    }
  }, [translatedContent, isTranslating, translateArticle])

  /**
   * Cancel all AI operations
   */
  const cancelAI = useCallback(() => {
    cancelSummary()
    cancelTranslation()
  }, [cancelSummary, cancelTranslation])

  /**
   * Reset all AI state
   */
  const resetAI = useCallback(() => {
    cancelAI()
    setSummary("")
    setSummaryError(null)
    setTranslatedContent("")
    setTranslationError(null)
    setShowTranslation(false)
  }, [cancelAI])

  return {
    // Summary
    summary,
    isSummarizing,
    summaryError,
    summarizeArticle,
    cancelSummary,

    // Translation
    translatedContent,
    isTranslating,
    translationError,
    showTranslation,
    translateArticle,
    cancelTranslation,
    toggleTranslation,

    // General
    isConfigured,
    cancelAI,
    resetAI,
  }
}

export default useArticleAI
