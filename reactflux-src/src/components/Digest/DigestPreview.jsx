import { Card, Typography, Tag, Space, Empty } from "@arco-design/web-react"
import { IconFile } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { polyglotState } from "@/hooks/useLanguage"

const { Title, Text, Paragraph } = Typography

/**
 * DigestPreview - Preview component for generated digest
 */
const DigestPreview = ({ digest }) => {
  const { polyglot } = useStore(polyglotState)

  if (!digest) {
    return <Empty description={polyglot.t("digest.no_preview")} />
  }

  // Get scope label
  const getScopeLabel = () => {
    switch (digest.scope) {
      case "all":
        return polyglot.t("digest.scope_all")
      case "group":
        return `${polyglot.t("digest.scope_group")}: ${digest.scopeName || ""}`
      case "feed":
        return `${polyglot.t("digest.scope_feed")}: ${digest.scopeName || ""}`
      default:
        return digest.scope
    }
  }

  // Get time range label
  const getTimeRangeLabel = () => {
    const hours = digest.hours
    if (hours <= 12) return polyglot.t("digest.time_12")
    if (hours <= 24) return polyglot.t("digest.time_24")
    if (hours <= 72) return polyglot.t("digest.time_72")
    return polyglot.t("digest.time_168")
  }

  return (
    <Card
      bordered
      style={{ backgroundColor: "var(--color-fill-1)" }}
      title={
        <Space>
          <IconFile />
          <Text>{polyglot.t("digest.preview")}</Text>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Title heading={5} style={{ marginBottom: 8 }}>
          {digest.title || polyglot.t("digest.untitled")}
        </Title>

        <Space wrap>
          <Tag color="arcoblue">{getScopeLabel()}</Tag>
          <Tag color="green">{getTimeRangeLabel()}</Tag>
          <Tag color="orange">
            {digest.articleCount || 0} {polyglot.t("digest.articles")}
          </Tag>
          <Tag color="purple">{digest.targetLang}</Tag>
        </Space>
      </div>

      <div
        style={{
          maxHeight: 300,
          overflow: "auto",
          padding: 12,
          backgroundColor: "var(--color-bg-2)",
          borderRadius: 4,
        }}
      >
        <div
          className="digest-content markdown-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(digest.content) }}
        />
      </div>
    </Card>
  )
}

/**
 * Simple markdown to HTML renderer
 * For full markdown support, use a library like marked or react-markdown
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

export default DigestPreview
