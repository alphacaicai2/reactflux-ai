/**
 * Title Translation Cache Service
 * Uses localStorage to cache translated titles
 * Cache key: hash of (title + targetLanguage)
 * Cache expiry: 7 days
 */

const CACHE_PREFIX = "title-trans-cache-"
const CACHE_EXPIRY_DAYS = 7
const CACHE_EXPIRY_MS = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000

/**
 * Generate a simple hash for the cache key
 * Uses title + targetLanguage to create unique key
 * @param {string} title - Original title
 * @param {string} targetLang - Target language ID
 * @returns {string} Hash string for cache key
 */
const generateCacheKey = (title, targetLang) => {
  const input = `${title}:${targetLang}`
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return `${CACHE_PREFIX}${Math.abs(hash).toString(36)}`
}

/**
 * Get cached translation if exists and not expired
 * @param {string} title - Original title
 * @param {string} targetLang - Target language ID
 * @returns {string|null} Cached translation or null
 */
export const getCachedTranslation = (title, targetLang) => {
  try {
    const cacheKey = generateCacheKey(title, targetLang)
    const cached = localStorage.getItem(cacheKey)

    if (!cached) {
      return null
    }

    const { translatedTitle, timestamp } = JSON.parse(cached)
    const now = Date.now()

    // Check if cache is expired
    if (now - timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(cacheKey)
      return null
    }

    return translatedTitle
  } catch (error) {
    console.error("Error reading title cache:", error)
    return null
  }
}

/**
 * Save translation to cache
 * @param {string} title - Original title
 * @param {string} targetLang - Target language ID
 * @param {string} translatedTitle - Translated title
 */
export const setCachedTranslation = (title, targetLang, translatedTitle) => {
  try {
    const cacheKey = generateCacheKey(title, targetLang)
    const cacheData = {
      translatedTitle,
      timestamp: Date.now(),
      originalTitle: title, // Store original for debugging
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.error("Error saving title cache:", error)
    // If localStorage is full, try to clear old cache entries
    clearExpiredCache()
  }
}

/**
 * Clear expired cache entries
 */
export const clearExpiredCache = () => {
  try {
    const now = Date.now()
    const keysToRemove = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = JSON.parse(localStorage.getItem(key))
          if (cached && now - cached.timestamp > CACHE_EXPIRY_MS) {
            keysToRemove.push(key)
          }
        } catch {
          // Invalid cache entry, remove it
          keysToRemove.push(key)
        }
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key))

    if (keysToRemove.length > 0) {
      console.log(`Cleared ${keysToRemove.length} expired title cache entries`)
    }
  } catch (error) {
    console.error("Error clearing expired cache:", error)
  }
}

/**
 * Clear all title translation cache
 */
export const clearAllTitleCache = () => {
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
    console.log(`Cleared all ${keysToRemove.length} title cache entries`)
  } catch (error) {
    console.error("Error clearing all title cache:", error)
  }
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
export const getCacheStats = () => {
  let count = 0
  let totalSize = 0

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        count++
        const value = localStorage.getItem(key)
        if (value) {
          totalSize += key.length + value.length
        }
      }
    }
  } catch (error) {
    console.error("Error getting cache stats:", error)
  }

  return {
    count,
    totalSize,
    totalSizeKB: (totalSize / 1024).toFixed(2),
  }
}

// Initialize: clear expired cache on module load
if (typeof window !== "undefined") {
  // Run on next tick to not block initial load
  setTimeout(clearExpiredCache, 1000)
}
