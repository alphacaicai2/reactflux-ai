/**
 * useTitleTranslation Hook
 * Handles title translation with Intersection Observer for lazy loading
 * Features:
 * - Lazy translation: only translates titles when they enter viewport
 * - Batch optimization: collects titles and translates in batches
 * - Caching: uses localStorage to cache translated titles
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useStore } from "@nanostores/react"

import {
  aiConfigState,
  isAIConfiguredState,
} from "@/store/aiState"
import { translateTitlesBatch } from "@/services/ai-service"
import {
  getCachedTranslation,
  setCachedTranslation,
} from "@/services/title-cache"

// Batch collection timing (ms)
const BATCH_DELAY = 100

/**
 * Custom hook for title translation
 * @returns {object} Title translation utilities
 */
export function useTitleTranslation() {
  const config = useStore(aiConfigState)
  const isConfigured = useStore(isAIConfiguredState)

  // Translation state
  const [translatedTitles, setTranslatedTitles] = useState(new Map())
  const [isTranslating, setIsTranslating] = useState(new Set())

  // Batch queue for collecting titles
  const batchQueueRef = useRef([])
  const batchTimeoutRef = useRef(null)
  const observerRef = useRef(null)
  const observedElementsRef = useRef(new Map())

  // Check if title translation is enabled and configured
  const isTitleTranslationEnabled = config.enabled && config.titleTranslation && isConfigured

  // Check if a feed should be translated based on scope settings
  const shouldTranslateFeed = useCallback(
    (feedCategoryId) => {
      if (!isTitleTranslationEnabled) {
        return false
      }

      // If scope is 'all', translate everything
      if (config.titleTranslationScope === "all") {
        return true
      }

      // If scope is 'groups', check if the feed's category is in the list
      if (config.titleTranslationScope === "groups") {
        const groupIds = config.titleTranslationGroupIds || []
        return groupIds.includes(feedCategoryId)
      }

      return false
    },
    [isTitleTranslationEnabled, config.titleTranslationScope, config.titleTranslationGroupIds]
  )

  // Process batch of titles
  const processBatch = useCallback(async () => {
    const batch = batchQueueRef.current
    batchQueueRef.current = []

    if (batch.length === 0) return

    // Filter out already cached or translating items
    const itemsToTranslate = batch.filter(
      (item) =>
        !translatedTitles.has(item.id) &&
        !isTranslating.has(item.id) &&
        !getCachedTranslation(item.title, config.targetLanguage)
    )

    if (itemsToTranslate.length === 0) return

    // Mark as translating
    setIsTranslating((prev) => {
      const next = new Set(prev)
      itemsToTranslate.forEach((item) => next.add(item.id))
      return next
    })

    try {
      const results = await translateTitlesBatch(
        itemsToTranslate.map((item) => ({ id: item.id, title: item.title })),
        config.targetLanguage
      )

      // Update state and cache
      const newTranslations = new Map()

      results.forEach((result) => {
        // Cache the translation
        const originalItem = itemsToTranslate.find((item) => item.id === result.id)
        if (originalItem && result.translatedTitle) {
          setCachedTranslation(originalItem.title, config.targetLanguage, result.translatedTitle)
        }
        newTranslations.set(result.id, result.translatedTitle || result.error ? null : result.translatedTitle)
      })

      setTranslatedTitles((prev) => {
        const next = new Map(prev)
        results.forEach((result) => {
          if (result.translatedTitle && !result.error) {
            next.set(result.id, result.translatedTitle)
          }
        })
        return next
      })
    } catch (error) {
      console.error("Batch title translation failed:", error)
    } finally {
      // Remove from translating set
      setIsTranslating((prev) => {
        const next = new Set(prev)
        itemsToTranslate.forEach((item) => next.delete(item.id))
        return next
      })
    }
  }, [config.targetLanguage, translatedTitles, isTranslating])

  // Queue title for batch translation
  const queueForTranslation = useCallback(
    (id, title) => {
      // Check cache first
      const cached = getCachedTranslation(title, config.targetLanguage)
      if (cached) {
        setTranslatedTitles((prev) => {
          if (prev.has(id)) return prev
          const next = new Map(prev)
          next.set(id, cached)
          return next
        })
        return
      }

      // Add to batch queue
      batchQueueRef.current.push({ id, title })

      // Schedule batch processing
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }
      batchTimeoutRef.current = setTimeout(processBatch, BATCH_DELAY)
    },
    [config.targetLanguage, processBatch]
  )

  // Set up Intersection Observer
  useEffect(() => {
    if (!isTitleTranslationEnabled) {
      return
    }

    const observerOptions = {
      root: document.querySelector(".entry-list"),
      rootMargin: "100px", // Start loading 100px before visible
      threshold: 0.1,
    }

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const { articleId, articleTitle } = entry.target.dataset
          if (articleId && articleTitle) {
            queueForTranslation(articleId, articleTitle)
            // Unobserve after triggering translation
            observerRef.current.unobserve(entry.target)
            observedElementsRef.current.delete(articleId)
          }
        }
      })
    }, observerOptions)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }
    }
  }, [isTitleTranslationEnabled, queueForTranslation])

  // Observe an element for title translation
  const observeElement = useCallback(
    (element, articleId, articleTitle, feedCategoryId) => {
      if (!isTitleTranslationEnabled || !element) return
      if (!shouldTranslateFeed(feedCategoryId)) return

      // Check if already has translation (cached or in state)
      const cached = getCachedTranslation(articleTitle, config.targetLanguage)
      if (cached) {
        setTranslatedTitles((prev) => {
          if (prev.has(articleId)) return prev
          const next = new Map(prev)
          next.set(articleId, cached)
          return next
        })
        return
      }

      // Store element data
      element.dataset.articleId = articleId
      element.dataset.articleTitle = articleTitle

      // Observe element
      if (observerRef.current && !observedElementsRef.current.has(articleId)) {
        observerRef.current.observe(element)
        observedElementsRef.current.set(articleId, element)
      }
    },
    [isTitleTranslationEnabled, shouldTranslateFeed, config.targetLanguage]
  )

  // Unobserve an element
  const unobserveElement = useCallback((articleId) => {
    const element = observedElementsRef.current.get(articleId)
    if (element && observerRef.current) {
      observerRef.current.unobserve(element)
      observedElementsRef.current.delete(articleId)
    }
  }, [])

  // Get display title info
  const getTitleDisplay = useCallback(
    (id, originalTitle) => {
      const translated = translatedTitles.get(id)
      const translating = isTranslating.has(id)

      // If translation is not enabled or not available
      if (!isTitleTranslationEnabled) {
        return {
          displayTitle: originalTitle,
          showOriginal: false,
          originalTitle: null,
          isTranslating: false,
        }
      }

      // If currently translating
      if (translating && !translated) {
        return {
          displayTitle: originalTitle,
          showOriginal: false,
          originalTitle: null,
          isTranslating: true,
        }
      }

      // If translation is available
      if (translated) {
        const mode = config.titleTranslationMode || "chinese_only"
        return {
          displayTitle: translated,
          showOriginal: mode === "bilingual",
          originalTitle: mode === "bilingual" ? originalTitle : null,
          isTranslating: false,
        }
      }

      // No translation yet
      return {
        displayTitle: originalTitle,
        showOriginal: false,
        originalTitle: null,
        isTranslating: false,
      }
    },
    [isTitleTranslationEnabled, translatedTitles, isTranslating, config.titleTranslationMode]
  )

  // Manually trigger translation (for immediate needs)
  const translateTitle = useCallback(
    async (id, title) => {
      if (!isTitleTranslationEnabled) return null

      // Check cache first
      const cached = getCachedTranslation(title, config.targetLanguage)
      if (cached) {
        setTranslatedTitles((prev) => {
          const next = new Map(prev)
          next.set(id, cached)
          return next
        })
        return cached
      }

      // Mark as translating
      setIsTranslating((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })

      try {
        const results = await translateTitlesBatch(
          [{ id, title }],
          config.targetLanguage
        )

        if (results.length > 0 && results[0].translatedTitle) {
          setCachedTranslation(title, config.targetLanguage, results[0].translatedTitle)
          setTranslatedTitles((prev) => {
            const next = new Map(prev)
            next.set(id, results[0].translatedTitle)
            return next
          })
          return results[0].translatedTitle
        }
      } catch (error) {
        console.error("Title translation failed:", error)
      } finally {
        setIsTranslating((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }

      return null
    },
    [isTitleTranslationEnabled, config.targetLanguage]
  )

  // Clear all cached translations
  const clearCache = useCallback(() => {
    setTranslatedTitles(new Map())
    // Also clear localStorage cache
    import("@/services/title-cache").then(({ clearAllTitleCache }) => {
      clearAllTitleCache()
    })
  }, [])

  return {
    // State
    translatedTitles,
    isTranslating,
    isTitleTranslationEnabled,

    // Methods
    observeElement,
    unobserveElement,
    getTitleDisplay,
    translateTitle,
    shouldTranslateFeed,
    clearCache,
  }
}

export default useTitleTranslation
