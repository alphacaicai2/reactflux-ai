import {
  Button,
  Card,
  Divider,
  Empty,
  Message,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
} from "@arco-design/web-react"
import {
  IconCopy,
  IconDelete,
  IconLeft,
  IconSend,
  IconShareExternal,
} from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"

import useDigest from "@/hooks/useDigest"
import { polyglotState } from "@/hooks/useLanguage"
import { digestConfigState, setCurrentDigest } from "@/store/digestState"

import "./DigestDetail.css"

const { Title, Text, Paragraph } = Typography

/**
 * Format date for display
 */
const formatDate = (dateString) => {
  if (!dateString) return ""
  const date = new Date(dateString)
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Get scope label by scope type
 */
const getScopeLabel = (scope, scopeName, polyglot) => {
  switch (scope) {
    case "all":
      return polyglot.t("digest.scope_all")
    case "group":
      return scopeName || polyglot.t("digest.scope_group")
    case "feed":
      return scopeName || polyglot.t("digest.scope_feed")
    default:
      return scope
  }
}

/**
 * Get time range label
 */
const getTimeRangeLabel = (hours, polyglot) => {
  switch (hours) {
    case 12:
      return polyglot.t("digest.time_12")
    case 24:
      return polyglot.t("digest.time_24")
    case 72:
      return polyglot.t("digest.time_72")
    case 168:
      return polyglot.t("digest.time_168")
    default:
      return `${hours}h`
  }
}

/**
 * Simple markdown to HTML renderer
 */
const renderMarkdown = (content) => {
  if (!content) return ""

  let html = content
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Line breaks
    .replace(/\n/g, "<br>")
    // Lists
    .replace(/^\- (.*$)/gim, "<li>$1</li>")
    // Numbers
    .replace(/^\d+\. (.*$)/gim, "<li>$1</li>")

  return html
}

/**
 * DigestDetail - Full digest view component
 */
const DigestDetail = () => {
  const { polyglot } = useStore(polyglotState)
  const config = useStore(digestConfigState)
  const navigate = useNavigate()
  const { id } = useParams()

  const {
    currentDigest,
    isLoading,
    loadDigest,
    deleteDigest,
    pushDigest,
    markAsRead,
  } = useDigest()

  const [isPushing, setIsPushing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load digest on mount
  useEffect(() => {
    if (id) {
      loadDigest(id)
    }
    return () => {
      setCurrentDigest(null)
    }
  }, [id, loadDigest])

  // Mark as read when viewed
  useEffect(() => {
    if (currentDigest && !currentDigest.is_read) {
      markAsRead(currentDigest.id)
    }
  }, [currentDigest, markAsRead])

  // Handle back navigation
  const handleBack = useCallback(() => {
    navigate("/digest")
  }, [navigate])

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!currentDigest) return

    try {
      setIsDeleting(true)
      await deleteDigest(currentDigest.id)
      Message.success(polyglot.t("digest.delete_success"))
      navigate("/digest")
    } catch (err) {
      Message.error(polyglot.t("digest.delete_failed"))
    } finally {
      setIsDeleting(false)
    }
  }, [currentDigest, deleteDigest, navigate, polyglot])

  // Handle push
  const handlePush = useCallback(async () => {
    if (!currentDigest) return

    try {
      setIsPushing(true)
      await pushDigest(currentDigest.id)
      Message.success(polyglot.t("digest.push_success"))
    } catch (err) {
      Message.error(polyglot.t("digest.push_failed"))
    } finally {
      setIsPushing(false)
    }
  }, [currentDigest, pushDigest, polyglot])

  // Handle copy
  const handleCopy = useCallback(async () => {
    if (!currentDigest) return

    try {
      await navigator.clipboard.writeText(currentDigest.content)
      Message.success(polyglot.t("actions.copied"))
    } catch (err) {
      Message.error(polyglot.t("actions.copy_failed"))
    }
  }, [currentDigest, polyglot])

  // Handle share
  const handleShare = useCallback(async () => {
    if (!currentDigest) return

    const shareData = {
      title: currentDigest.title,
      text: currentDigest.content.substring(0, 200) + "...",
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        // User cancelled or error
        if (err.name !== "AbortError") {
          handleCopy()
        }
      }
    } else {
      handleCopy()
    }
  }, [currentDigest, handleCopy])

  if (isLoading && !currentDigest) {
    return (
      <div className="digest-detail-loading">
        <Spin size={40} />
        <Text type="secondary">{polyglot.t("digest.loading")}</Text>
      </div>
    )
  }

  if (!currentDigest) {
    return (
      <div className="digest-detail-empty">
        <Empty description={polyglot.t("digest.not_found")} />
        <Button type="primary" onClick={handleBack}>
          {polyglot.t("digest.back_to_list")}
        </Button>
      </div>
    )
  }

  return (
    <div className="digest-detail">
      {/* Header */}
      <div className="digest-detail-header">
        <Button
          type="text"
          icon={<IconLeft />}
          onClick={handleBack}
        >
          {polyglot.t("digest.back")}
        </Button>

        <Space>
          <Button
            type="text"
            icon={<IconCopy />}
            onClick={handleCopy}
          >
            {polyglot.t("digest.copy")}
          </Button>

          <Button
            type="text"
            icon={<IconShareExternal />}
            onClick={handleShare}
          >
            {polyglot.t("digest.share")}
          </Button>

          {config.webhookUrl && (
            <Button
              type="text"
              icon={<IconSend />}
              loading={isPushing}
              onClick={handlePush}
            >
              {polyglot.t("digest.push")}
            </Button>
          )}

          <Popconfirm
            title={polyglot.t("digest.delete_confirm_title")}
            content={polyglot.t("digest.delete_confirm_content")}
            onOk={handleDelete}
          >
            <Button
              type="text"
              status="danger"
              icon={<IconDelete />}
              loading={isDeleting}
            >
              {polyglot.t("digest.delete")}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* Content */}
      <Card className="digest-detail-content">
        {/* Title */}
        <Title heading={4} style={{ marginBottom: 16 }}>
          {currentDigest.title || polyglot.t("digest.untitled")}
        </Title>

        {/* Meta info */}
        <div className="digest-detail-meta">
          <Space size="small" wrap>
            <Tag color="arcoblue">
              {getScopeLabel(currentDigest.scope, currentDigest.scope_name, polyglot)}
            </Tag>
            <Tag color="green">
              {getTimeRangeLabel(currentDigest.hours, polyglot)}
            </Tag>
            <Tag color="orange">
              {currentDigest.article_count || 0} {polyglot.t("digest.articles")}
            </Tag>
            <Tag color="purple">
              {currentDigest.target_lang}
            </Tag>
          </Space>
        </div>

        <Text type="secondary" size="small">
          {formatDate(currentDigest.created_at)}
        </Text>

        <Divider />

        {/* Content */}
        <div
          className="digest-content markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(currentDigest.content) }}
        />
      </Card>
    </div>
  )
}

export default DigestDetail
