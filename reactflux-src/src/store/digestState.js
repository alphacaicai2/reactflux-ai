/**
 * Digest State Management using Nanostores
 * Manages digests, scheduled tasks, and generation states
 */

import { atom, map, computed } from "nanostores"
import { persistentAtom } from "@nanostores/persistent"

/**
 * Default digest configuration
 */
const defaultDigestConfig = {
  // Webhook configuration
  webhookEnabled: false,
  webhookPlatform: "generic",
  webhookMethod: "POST",
  webhookUrl: "",
  webhookBodyTemplate: "",
  webhookHeaders: {},

  // Schedule defaults
  scheduleEnabled: false,
  scheduleCron: "0 9 * * *", // Daily at 9 AM
  scheduleTimezone: "Asia/Shanghai",
  scheduleScope: "all",
  scheduleHours: 24,
  scheduleTargetLang: "Simplified Chinese",
  autoPush: false,
}

/**
 * Digest configuration store (persisted)
 */
export const digestConfigState = persistentAtom("digest-config", defaultDigestConfig, {
  encode: (value) => JSON.stringify(value),
  decode: (str) => {
    try {
      const storedValue = JSON.parse(str)
      return { ...defaultDigestConfig, ...storedValue }
    } catch {
      return defaultDigestConfig
    }
  },
})

/**
 * Digests list state
 */
export const digestsState = atom([])

/**
 * Current digest being viewed
 */
export const currentDigestState = atom(null)

/**
 * Digest loading state
 */
export const digestLoadingState = atom(false)

/**
 * Digest error state
 */
export const digestErrorState = atom(null)

/**
 * Digest generation state
 */
export const digestGenerationState = map({
  isGenerating: false,
  progress: 0,
  status: "", // 'idle', 'fetching', 'generating', 'completed', 'error'
  generatedDigest: null,
  error: null,
})

/**
 * Scheduled tasks state
 */
export const scheduledTasksState = atom([])

/**
 * Scheduled tasks loading state
 */
export const scheduledTasksLoadingState = atom(false)

/**
 * Pagination state for digests list
 */
export const digestPaginationState = atom({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
})

/**
 * Filter state for digests list
 */
export const digestFilterState = atom({
  scope: null,
  scopeId: null,
  isRead: null,
})

/**
 * Computed: Has digests
 */
export const hasDigestsState = computed([digestsState], (digests) => digests.length > 0)

/**
 * Computed: Unread digests count
 */
export const unreadDigestsCountState = computed([digestsState], (digests) =>
  digests.filter((d) => !d.is_read).length,
)

// ============================================
// Actions
// ============================================

/**
 * Update digest configuration
 * @param {Partial<typeof defaultDigestConfig>} updates - Configuration updates
 */
export const updateDigestConfig = (updates) => {
  const currentConfig = digestConfigState.get()
  digestConfigState.set({ ...currentConfig, ...updates })
}

/**
 * Set digests list
 * @param {Array} digests - Digests array
 */
export const setDigests = (digests) => {
  digestsState.set(digests)
}

/**
 * Add a digest to the list
 * @param {object} digest - Digest to add
 */
export const addDigest = (digest) => {
  const current = digestsState.get()
  digestsState.set([digest, ...current])
}

/**
 * Update a digest in the list
 * @param {number|string} id - Digest ID
 * @param {object} updates - Updates to apply
 */
export const updateDigestInList = (id, updates) => {
  const current = digestsState.get()
  const updated = current.map((d) => (d.id === id ? { ...d, ...updates } : d))
  digestsState.set(updated)
}

/**
 * Remove a digest from the list
 * @param {number|string} id - Digest ID
 */
export const removeDigest = (id) => {
  const current = digestsState.get()
  digestsState.set(current.filter((d) => d.id !== id))
}

/**
 * Set current digest
 * @param {object|null} digest - Current digest
 */
export const setCurrentDigest = (digest) => {
  currentDigestState.set(digest)
}

/**
 * Set loading state
 * @param {boolean} isLoading - Loading state
 */
export const setDigestLoading = (isLoading) => {
  digestLoadingState.set(isLoading)
}

/**
 * Set error state
 * @param {string|null} error - Error message
 */
export const setDigestError = (error) => {
  digestErrorState.set(error)
}

/**
 * Clear error
 */
export const clearDigestError = () => {
  digestErrorState.set(null)
}

// ============================================
// Generation State Actions
// ============================================

/**
 * Start generation
 */
export const startGeneration = () => {
  digestGenerationState.setKey("isGenerating", true)
  digestGenerationState.setKey("progress", 0)
  digestGenerationState.setKey("status", "fetching")
  digestGenerationState.setKey("error", null)
  digestGenerationState.setKey("generatedDigest", null)
}

/**
 * Update generation progress
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} status - Status message
 */
export const updateGenerationProgress = (progress, status) => {
  digestGenerationState.setKey("progress", progress)
  if (status) digestGenerationState.setKey("status", status)
}

/**
 * Complete generation
 * @param {object} digest - Generated digest
 */
export const completeGeneration = (digest) => {
  digestGenerationState.setKey("isGenerating", false)
  digestGenerationState.setKey("progress", 100)
  digestGenerationState.setKey("status", "completed")
  digestGenerationState.setKey("generatedDigest", digest)
}

/**
 * Fail generation
 * @param {string} error - Error message
 */
export const failGeneration = (error) => {
  digestGenerationState.setKey("isGenerating", false)
  digestGenerationState.setKey("status", "error")
  digestGenerationState.setKey("error", error)
}

/**
 * Reset generation state
 */
export const resetGeneration = () => {
  digestGenerationState.set({
    isGenerating: false,
    progress: 0,
    status: "idle",
    generatedDigest: null,
    error: null,
  })
}

// ============================================
// Scheduled Tasks Actions
// ============================================

/**
 * Set scheduled tasks
 * @param {Array} tasks - Tasks array
 */
export const setScheduledTasks = (tasks) => {
  scheduledTasksState.set(tasks)
}

/**
 * Add a scheduled task
 * @param {object} task - Task to add
 */
export const addScheduledTask = (task) => {
  const current = scheduledTasksState.get()
  scheduledTasksState.set([...current, task])
}

/**
 * Update a scheduled task
 * @param {number|string} id - Task ID
 * @param {object} updates - Updates to apply
 */
export const updateScheduledTaskInList = (id, updates) => {
  const current = scheduledTasksState.get()
  const updated = current.map((t) => (t.id === id ? { ...t, ...updates } : t))
  scheduledTasksState.set(updated)
}

/**
 * Remove a scheduled task
 * @param {number|string} id - Task ID
 */
export const removeScheduledTask = (id) => {
  const current = scheduledTasksState.get()
  scheduledTasksState.set(current.filter((t) => t.id !== id))
}

/**
 * Set scheduled tasks loading state
 * @param {boolean} isLoading - Loading state
 */
export const setScheduledTasksLoading = (isLoading) => {
  scheduledTasksLoadingState.set(isLoading)
}

// ============================================
// Pagination Actions
// ============================================

/**
 * Set pagination
 * @param {object} pagination - Pagination data
 */
export const setDigestPagination = (pagination) => {
  digestPaginationState.set(pagination)
}

/**
 * Go to page
 * @param {number} page - Page number
 */
export const goToDigestPage = (page) => {
  const current = digestPaginationState.get()
  digestPaginationState.set({ ...current, page })
}

// ============================================
// Filter Actions
// ============================================

/**
 * Set filter
 * @param {object} filter - Filter data
 */
export const setDigestFilter = (filter) => {
  digestFilterState.set(filter)
}

/**
 * Clear filter
 */
export const clearDigestFilter = () => {
  digestFilterState.set({
    scope: null,
    scopeId: null,
    isRead: null,
  })
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get digest configuration
 * @returns {object} Current configuration
 */
export const getDigestConfig = () => {
  return digestConfigState.get()
}

/**
 * Check if webhook is configured
 * @returns {boolean} Whether webhook is configured
 */
export const isWebhookConfigured = () => {
  const config = digestConfigState.get()
  return config.webhookEnabled && config.webhookUrl
}

/**
 * Reset digest configuration
 */
export const resetDigestConfig = () => {
  digestConfigState.set(defaultDigestConfig)
}
