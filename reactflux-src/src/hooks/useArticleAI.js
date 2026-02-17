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

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "table", "ul", "ol"])

/**
 * Extract block-level elements from HTML in document order.
 * Paragraphs (<p>) get { type: 'p', html, text } for translation; others get { type: 'other', html }.
 * @param {string} html - HTML content
 * @returns {{ type: string, html: string, text?: string }[]}
 */
function extractBlocks(html) {
  if (!html || typeof document === "undefined") return []

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  const blocks = []

  function walk(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName.toLowerCase()
    if (tag === "p") {
      const text = (node.textContent || "").trim()
      if (text) blocks.push({ type: "p", html: node.outerHTML, text })
      return
    }
    if (BLOCK_TAGS.has(tag)) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i])
      }
      return
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i])
    }
  }

  if (doc.body) {
    for (let i = 0; i < doc.body.childNodes.length; i++) {
      walk(doc.body.childNodes[i])
    }
  }
  return blocks
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

  // Translation state: blocks from HTML, and per-paragraph translations (same length as translatable blocks)
  const [blocks, setBlocks] = useState([])
  const [paragraphTranslations, setParagraphTranslations] = useState([])
  const [translatedContent, setTranslatedContent] = useState("")
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const translationAbortRef = useRef(null)

  // Reset state when article changes; (re)compute blocks from content
  useEffect(() => {
    setSummary("")
    setSummaryError(null)
    setIsSummarizing(false)
    setTranslatedContent("")
    setParagraphTranslations([])
    setTranslationError(null)
    setIsTranslating(false)
    setShowTranslation(false)
    setBlocks(article?.content ? extractBlocks(article.content) : [])

    // Cancel any ongoing operations
    if (summaryAbortRef.current) {
      cancelOperation(summaryAbortRef.current)
      summaryAbortRef.current = null
    }
    if (translationAbortRef.current) {
      cancelOperation(translationAbortRef.current)
      translationAbortRef.current = null
    }
  }, [article?.id, article?.content])

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
   * Translate article content: translate each paragraph and show below original (uses AI settings).
   */
  const translateArticle = useCallback(async () => {
    if (!isConfigured || !article?.content) {
      setTranslationError(polyglot.t("ai.not_configured"))
      return
    }

    const list = article.content ? extractBlocks(article.content) : []
    const translatable = list.filter((b) => b.type === "p" && b.text)
    if (translatable.length === 0) {
      setTranslationError(polyglot.t("ai.translation_error"))
      return
    }

    setIsTranslating(true)
    setTranslationError(null)
    setParagraphTranslations([])
    setBlocks(list)

    try {
      translationAbortRef.current = createAbortController()
      const targetLang = config.targetLanguage || "Simplified Chinese"
      const results = []

      for (let i = 0; i < translatable.length; i++) {
        if (translationAbortRef.current?.signal?.aborted) break
        const { text } = translatable[i]
        const translated = await translate(
          text,
          targetLang,
          null,
          translationAbortRef.current?.signal
        )
        results.push(translated || "")
        setParagraphTranslations([...results])
      }

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
    setParagraphTranslations([])
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

    // Translation (paragraph-level: blocks + paragraphTranslations for "translation below each paragraph")
    blocks,
    paragraphTranslations,
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
