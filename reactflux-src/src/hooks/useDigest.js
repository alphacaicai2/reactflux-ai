/**
 * useDigest Custom Hook
 * Provides easy access to digest functionality with React integration
 */

import { useCallback } from "react"
import { useStore } from "@nanostores/react"

import {
  digestsState,
  currentDigestState,
  digestLoadingState,
  digestErrorState,
  digestGenerationState,
  scheduledTasksState,
  scheduledTasksLoadingState,
  digestPaginationState,
  digestFilterState,
  digestConfigState,
  setDigests,
  addDigest,
  updateDigestInList,
  removeDigest,
  setCurrentDigest,
  setDigestLoading,
  setDigestError,
  clearDigestError,
  startGeneration,
  updateGenerationProgress,
  completeGeneration,
  failGeneration,
  resetGeneration,
  setScheduledTasks,
  addScheduledTask,
  updateScheduledTaskInList,
  removeScheduledTask,
  setScheduledTasksLoading,
  setDigestPagination,
  updateDigestConfig,
} from "@/store/digestState"

import { authState } from "@/store/authState"

import {
  getDigests,
  getDigest,
  createDigest,
  updateDigest,
  deleteDigest,
  markDigestAsRead,
  markAllDigestsAsRead,
  generateDigest as generateDigestApi,
  getJobStatus,
  pushDigest,
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  enableScheduledTask,
  disableScheduledTask,
  runScheduledTask,
  processWebhookTemplate,
} from "@/services/digest-service"

/**
 * Custom hook for digest functionality
 * @returns {object} Digest utilities and state
 */
export function useDigest() {
  // Nanostores state with React integration
  const digests = useStore(digestsState)
  const currentDigest = useStore(currentDigestState)
  const isLoading = useStore(digestLoadingState)
  const error = useStore(digestErrorState)
  const generation = useStore(digestGenerationState)
  const scheduledTasks = useStore(scheduledTasksState)
  const tasksLoading = useStore(scheduledTasksLoadingState)
  const pagination = useStore(digestPaginationState)
  const filter = useStore(digestFilterState)
  const config = useStore(digestConfigState)

  // ============================================
  // Digest CRUD Operations
  // ============================================

  /**
   * Load digests list
   * @param {object} [params] - Query parameters
   */
  const loadDigests = useCallback(async (params = {}) => {
    try {
      setDigestLoading(true)
      clearDigestError()

      const queryParams = {
        page: params.page || pagination.page,
        limit: params.limit || pagination.limit,
        ...filter,
        ...params,
      }

      const response = await getDigests(queryParams)

      if (response.success) {
        setDigests(response.data)
        if (response.pagination) {
          setDigestPagination(response.pagination)
        }
      }

      return response
    } catch (err) {
      console.error("Failed to load digests:", err)
      setDigestError(err.message)
      throw err
    } finally {
      setDigestLoading(false)
    }
  }, [filter, pagination.page, pagination.limit])

  /**
   * Load a single digest
   * @param {number|string} id - Digest ID
   */
  const loadDigest = useCallback(async (id) => {
    try {
      setDigestLoading(true)
      clearDigestError()

      const response = await getDigest(id)

      if (response.success) {
        setCurrentDigest(response.data)
      }

      return response
    } catch (err) {
      console.error("Failed to load digest:", err)
      setDigestError(err.message)
      throw err
    } finally {
      setDigestLoading(false)
    }
  }, [])

  /**
   * Save a new digest
   * @param {object} data - Digest data
   */
  const saveDigest = useCallback(async (data) => {
    try {
      setDigestLoading(true)
      clearDigestError()

      const response = await createDigest(data)

      if (response.success) {
        addDigest(response.data)
      }

      return response
    } catch (err) {
      console.error("Failed to save digest:", err)
      setDigestError(err.message)
      throw err
    } finally {
      setDigestLoading(false)
    }
  }, [])

  /**
   * Update a digest
   * @param {number|string} id - Digest ID
   * @param {object} data - Update data
   */
  const updateDigestItem = useCallback(async (id, data) => {
    try {
      setDigestLoading(true)
      clearDigestError()

      const response = await updateDigest(id, data)

      if (response.success) {
        updateDigestInList(id, data)
        if (currentDigest?.id === id) {
          setCurrentDigest({ ...currentDigest, ...data })
        }
      }

      return response
    } catch (err) {
      console.error("Failed to update digest:", err)
      setDigestError(err.message)
      throw err
    } finally {
      setDigestLoading(false)
    }
  }, [currentDigest])

  /**
   * Delete a digest
   * @param {number|string} id - Digest ID
   */
  const deleteDigestItem = useCallback(async (id) => {
    try {
      setDigestLoading(true)
      clearDigestError()

      const response = await deleteDigest(id)

      if (response.success) {
        removeDigest(id)
        if (currentDigest?.id === id) {
          setCurrentDigest(null)
        }
      }

      return response
    } catch (err) {
      console.error("Failed to delete digest:", err)
      setDigestError(err.message)
      throw err
    } finally {
      setDigestLoading(false)
    }
  }, [currentDigest])

  /**
   * Mark a digest as read
   * @param {number|string} id - Digest ID
   */
  const markAsRead = useCallback(async (id) => {
    try {
      const response = await markDigestAsRead(id)

      if (response.success) {
        updateDigestInList(id, { is_read: true })
        if (currentDigest?.id === id) {
          setCurrentDigest({ ...currentDigest, is_read: true })
        }
      }

      return response
    } catch (err) {
      console.error("Failed to mark digest as read:", err)
      throw err
    }
  }, [currentDigest])

  /**
   * Mark all digests as read
   * @param {object} [options] - Filter options
   */
  const markAllAsRead = useCallback(async (options = {}) => {
    try {
      const response = await markAllDigestsAsRead(options)

      if (response.success) {
        // Reload digests to reflect changes
        await loadDigests()
      }

      return response
    } catch (err) {
      console.error("Failed to mark all digests as read:", err)
      throw err
    }
  }, [loadDigests])

  // ============================================
  // Digest Generation
  // ============================================

  /**
   * Generate a new digest
   * @param {object} options - Generation options
   */
  const generateDigestItem = useCallback(async (options = {}) => {
    try {
      startGeneration()
      clearDigestError()

      updateGenerationProgress(10, "fetching")

      const auth = authState.get()
      let minifluxApiKey = auth?.token || ""
      if (!minifluxApiKey && auth?.username && auth?.password) {
        try {
          minifluxApiKey = globalThis.btoa(`${auth.username}:${auth.password}`)
        } catch {
          minifluxApiKey = globalThis.btoa(
            unescape(encodeURIComponent(`${auth.username}:${auth.password}`)),
          )
        }
      }
      const minifluxCredentials =
        auth?.server && minifluxApiKey
          ? { minifluxApiUrl: auth.server, minifluxApiKey }
          : null

      const optionsWithCredentials = {
        ...options,
        ...(minifluxCredentials || {}),
      }

      const response = await generateDigestApi(optionsWithCredentials)

      if (!response.success || !response.data?.jobId) {
        throw new Error(response.error || "Failed to start generation")
      }

      const { jobId } = response.data
      updateGenerationProgress(20, "generating")

      // Poll job status in background
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await getJobStatus(jobId)
          const job = statusRes?.data

          if (!job) {
            clearInterval(pollInterval)
            failGeneration("Job lost")
            return
          }

          if (job.status === "generating") {
            updateGenerationProgress(job.progress || 50, "generating")
          } else if (job.status === "completed") {
            clearInterval(pollInterval)
            updateGenerationProgress(100, "completed")
            completeGeneration(job.digest)
            if (job.digest) {
              addDigest(job.digest)
            }
          } else if (job.status === "error") {
            clearInterval(pollInterval)
            failGeneration(job.error || "Generation failed")
          }
        } catch (pollErr) {
          console.error("Job polling error:", pollErr)
          clearInterval(pollInterval)
          const msg = pollErr?.message || ""
          const isNotFound = msg.includes("not found") || msg.includes("Job not found")
          failGeneration(isNotFound ? "Job expired or server was restarted. Please try again." : msg || "Polling failed")
        }
      }, 3000)

      return { success: true, data: { jobId } }
    } catch (err) {
      console.error("Failed to generate digest:", err)
      failGeneration(err.message)
      throw err
    }
  }, [])

  /**
   * Push a digest to webhook
   * @param {number|string} id - Digest ID
   * @param {object} [pushConfig] - Push configuration (uses config if not provided)
   */
  const pushDigestItem = useCallback(async (id, pushConfig = null) => {
    try {
      const configToUse = pushConfig || {
        method: config.webhookMethod,
        url: config.webhookUrl,
        body: config.webhookBodyTemplate,
        headers: config.webhookHeaders,
      }

      if (!configToUse.url) {
        throw new Error("Webhook URL not configured")
      }

      const response = await pushDigest(id, configToUse)
      return response
    } catch (err) {
      console.error("Failed to push digest:", err)
      throw err
    }
  }, [config])

  /**
   * Push the currently generated digest
   * @param {object} [pushConfig] - Push configuration
   */
  const pushGeneratedDigest = useCallback(async (pushConfig = null) => {
    const generated = generation.generatedDigest
    if (!generated) {
      throw new Error("No digest to push")
    }

    // Save the digest first, then push
    const saveResponse = await saveDigest({
      title: generated.title,
      content: generated.content,
      scope: generated.scope,
      scopeId: generated.scopeId,
      scopeName: generated.scopeName,
      articleCount: generated.articleCount,
      hours: generated.hours,
      targetLang: generated.targetLang,
    })

    if (saveResponse.success) {
      return pushDigestItem(saveResponse.data.id, pushConfig)
    }

    throw new Error("Failed to save digest before pushing")
  }, [generation.generatedDigest, saveDigest, pushDigestItem])

  /**
   * Reset generation state
   */
  const resetGenerationState = useCallback(() => {
    resetGeneration()
  }, [])

  // ============================================
  // Scheduled Tasks
  // ============================================

  /**
   * Load scheduled tasks
   */
  const loadScheduledTasks = useCallback(async () => {
    try {
      setScheduledTasksLoading(true)

      const response = await getScheduledTasks()

      if (response.success) {
        setScheduledTasks(response.data)
      }

      return response
    } catch (err) {
      console.error("Failed to load scheduled tasks:", err)
      throw err
    } finally {
      setScheduledTasksLoading(false)
    }
  }, [])

  /**
   * Create a scheduled task
   * @param {object} data - Task data
   */
  const createTask = useCallback(async (data) => {
    try {
      setScheduledTasksLoading(true)

      const response = await createScheduledTask(data)

      if (response.success) {
        // Reload tasks
        await loadScheduledTasks()
      }

      return response
    } catch (err) {
      console.error("Failed to create scheduled task:", err)
      throw err
    } finally {
      setScheduledTasksLoading(false)
    }
  }, [loadScheduledTasks])

  /**
   * Update a scheduled task
   * @param {number|string} id - Task ID
   * @param {object} data - Update data
   */
  const updateTask = useCallback(async (id, data) => {
    try {
      setScheduledTasksLoading(true)

      const response = await updateScheduledTask(id, data)

      if (response.success) {
        updateScheduledTaskInList(id, data)
      }

      return response
    } catch (err) {
      console.error("Failed to update scheduled task:", err)
      throw err
    } finally {
      setScheduledTasksLoading(false)
    }
  }, [])

  /**
   * Delete a scheduled task
   * @param {number|string} id - Task ID
   */
  const deleteTask = useCallback(async (id) => {
    try {
      setScheduledTasksLoading(true)

      const response = await deleteScheduledTask(id)

      if (response.success) {
        removeScheduledTask(id)
      }

      return response
    } catch (err) {
      console.error("Failed to delete scheduled task:", err)
      throw err
    } finally {
      setScheduledTasksLoading(false)
    }
  }, [])

  /**
   * Toggle a scheduled task enabled state
   * @param {number|string} id - Task ID
   * @param {boolean} enabled - Enabled state
   */
  const toggleTask = useCallback(async (id, enabled) => {
    try {
      const response = enabled ? await enableScheduledTask(id) : await disableScheduledTask(id)

      if (response.success) {
        updateScheduledTaskInList(id, { is_active: enabled })
      }

      return response
    } catch (err) {
      console.error("Failed to toggle scheduled task:", err)
      throw err
    }
  }, [])

  /**
   * Run a scheduled task manually
   * @param {number|string} id - Task ID
   */
  const runTask = useCallback(async (id) => {
    try {
      const response = await runScheduledTask(id)

      if (response.success && response.data?.digest) {
        addDigest(response.data.digest)
      }

      return response
    } catch (err) {
      console.error("Failed to run scheduled task:", err)
      throw err
    }
  }, [])

  // ============================================
  // Configuration
  // ============================================

  /**
   * Update digest configuration
   * @param {object} updates - Configuration updates
   */
  const updateConfig = useCallback((updates) => {
    updateDigestConfig(updates)
  }, [])

  return {
    // State
    digests,
    currentDigest,
    isLoading,
    error,
    generation,
    scheduledTasks,
    tasksLoading,
    pagination,
    filter,
    config,

    // Digest CRUD
    loadDigests,
    loadDigest,
    saveDigest,
    setCurrentDigest,
    updateDigest: updateDigestItem,
    deleteDigest: deleteDigestItem,
    markAsRead,
    markAllAsRead,

    // Generation
    generateDigest: generateDigestItem,
    pushDigest: pushDigestItem,
    pushGeneratedDigest,
    resetGeneration: resetGenerationState,

    // Scheduled Tasks
    loadScheduledTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleTask,
    runTask,

    // Configuration
    updateConfig,

    // Utilities
    clearError: clearDigestError,
    processWebhookTemplate,
  }
}

export default useDigest
