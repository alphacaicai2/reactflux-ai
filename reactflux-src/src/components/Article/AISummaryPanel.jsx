import { Button, Card, Space, Spin, Typography } from "@arco-design/web-react"
import { IconClose, IconRefresh, IconRobot } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useState, useEffect, useCallback, useRef } from "react"

import { polyglotState } from "@/hooks/useLanguage"
import { aiConfigState, isAIConfiguredState } from "@/store/aiState"
import { summarize, createAbortController, cancelOperation } from "@/services/ai-service"

import "./AISummaryPanel.css"

const { Text } = Typography

/**
 * AI Summary Panel Component
 * Displays AI-generated summary for articles
 */
const AISummaryPanel = ({
  article,
  visible = true,
  autoGenerate = false,
  onClose,
}) => {
  const { polyglot } = useStore(polyglotState)
  const config = useStore(aiConfigState)
  const isConfigured = useStore(isAIConfiguredState)

  const [summary, setSummary] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const abortControllerRef = useRef(null)

  // Generate summary
  const generateSummary = useCallback(async () => {
    if (!isConfigured || !article?.content) {
      return
    }

    setIsStreaming(true)
    setError(null)
    setSummary("")

    try {
      abortControllerRef.current = createAbortController()

      // Extract text content from HTML
      const tempDiv = document.createElement("div")
      tempDiv.innerHTML = article.content
      const textContent = tempDiv.textContent || tempDiv.innerText || ""

      // Limit content length to avoid token limits
      const maxContentLength = 8000
      const contentToSummarize = textContent.slice(0, maxContentLength)

      await summarize(
        contentToSummarize,
        config.targetLanguage || "zh-CN",
        (chunk, fullContent) => {
          setSummary(fullContent)
        },
        abortControllerRef.current.signal
      )
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Summary generation failed:", err)
        setError(err.message || polyglot.t("ai.summary_error"))
      }
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [article, isConfigured, config.targetLanguage, polyglot])

  // Cancel summary generation
  const cancelSummary = useCallback(() => {
    if (abortControllerRef.current) {
      cancelOperation(abortControllerRef.current)
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }, [])

  // Auto-generate on mount if enabled
  useEffect(() => {
    if (visible && autoGenerate && isConfigured && !summary && !isStreaming) {
      generateSummary()
    }
  }, [visible, autoGenerate, isConfigured, summary, isStreaming, generateSummary])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        cancelOperation(abortControllerRef.current)
      }
    }
  }, [])

  // Handle close
  const handleClose = () => {
    cancelSummary()
    onClose?.()
  }

  // Don't render if not visible or AI not configured
  if (!visible) {
    return null
  }

  // Not configured state
  if (!isConfigured) {
    return (
      <Card className="ai-summary-panel ai-summary-panel--not-configured" size="small">
        <div className="ai-summary-header">
          <Space>
            <IconRobot />
            <Text type="secondary">{polyglot.t("ai.summary")}</Text>
          </Space>
        </div>
        <div className="ai-summary-content">
          <Text type="secondary">{polyglot.t("ai.not_configured")}</Text>
        </div>
      </Card>
    )
  }

  return (
    <Card
      className={`ai-summary-panel ${isStreaming ? "ai-summary-panel--streaming" : ""}`}
      size="small"
    >
      <div className="ai-summary-header">
        <Space>
          <IconRobot />
          <Text bold>{polyglot.t("ai.summary")}</Text>
          {isStreaming && (
            <Text type="secondary" size="small">
              {polyglot.t("ai.summarizing")}
            </Text>
          )}
        </Space>
        <Space size="small">
          {!isStreaming && summary && (
            <Button
              size="mini"
              type="text"
              icon={<IconRefresh />}
              onClick={generateSummary}
            />
          )}
          {isStreaming && (
            <Button
              size="mini"
              type="text"
              status="warning"
              onClick={cancelSummary}
            >
              {polyglot.t("ai.cancel")}
            </Button>
          )}
          <Button
            size="mini"
            type="text"
            icon={<IconClose />}
            onClick={handleClose}
          />
        </Space>
      </div>
      <div className="ai-summary-content">
        {isStreaming && !summary && (
          <div className="ai-summary-loading">
            <Spin size={16} />
            <Text type="secondary">{polyglot.t("ai.summarizing")}</Text>
          </div>
        )}
        {summary && (
          <Text className="ai-summary-text">{summary}</Text>
        )}
        {error && (
          <Text type="error" size="small">
            {error}
          </Text>
        )}
        {!isStreaming && !summary && !error && (
          <div className="ai-summary-empty">
            <Button
              size="small"
              type="outline"
              icon={<IconRobot />}
              onClick={generateSummary}
            >
              {polyglot.t("ai.generate_summary")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

export default AISummaryPanel
