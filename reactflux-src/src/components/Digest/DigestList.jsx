import {
  Button,
  Card,
  Empty,
  List,
  Message,
  Modal,
  Pagination,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
} from "@arco-design/web-react"
import {
  IconDelete,
  IconEye,
  IconFile,
  IconMore,
  IconPushpin,
  IconRefresh,
  IconSend,
} from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"

import useDigest from "@/hooks/useDigest"
import { polyglotState } from "@/hooks/useLanguage"
import { digestConfigState } from "@/store/digestState"

import "./DigestList.css"

const { Title, Text, Paragraph } = Typography

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
 * Format date for display
 */
const formatDate = (dateString) => {
  if (!dateString) return ""
  const date = new Date(dateString)
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * DigestCard - Single digest card component
 */
const DigestCard = ({ digest, selectedId, onView, onDelete, onPush }) => {
  const { polyglot } = useStore(polyglotState)
  const config = useStore(digestConfigState)
  const [isPushing, setIsPushing] = useState(false)

  const handlePush = async () => {
    if (onPush) {
      setIsPushing(true)
      try {
        await onPush(digest.id)
      } finally {
        setIsPushing(false)
      }
    }
  }

  const isActive = selectedId != null && String(digest.id) === String(selectedId)

  return (
    <Card
      className={`digest-card${isActive ? " digest-card-active" : ""}`}
      hoverable
      onClick={() => onView(digest)}
      actions={[
        <Button
          key="view"
          type="text"
          size="small"
          icon={<IconEye />}
          onClick={(e) => {
            e.stopPropagation()
            onView(digest)
          }}
        />,
        config.webhookUrl && (
          <Button
            key="push"
            type="text"
            size="small"
            icon={<IconSend />}
            loading={isPushing}
            onClick={(e) => {
              e.stopPropagation()
              handlePush()
            }}
          />
        ),
        <Popconfirm
          key="delete"
          title={polyglot.t("digest.delete_confirm_title")}
          content={polyglot.t("digest.delete_confirm_content")}
          onOk={() => onDelete(digest.id)}
          onCancel={(e) => e.stopPropagation()}
        >
          <Button
            type="text"
            size="small"
            status="danger"
            icon={<IconDelete />}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>,
      ].filter(Boolean)}
    >
      <div className="digest-card-header">
        <div className="digest-card-title">
          <IconFile className="digest-card-icon" />
          <Text bold ellipsis style={{ flex: 1 }}>
            {digest.title || polyglot.t("digest.untitled")}
          </Text>
          {!digest.is_read && <Tag color="arcoblue" size="small">New</Tag>}
        </div>
      </div>

      <div className="digest-card-meta">
        <Space size="small" wrap>
          <Tag color="gray" size="small">
            {getScopeLabel(digest.scope, digest.scope_name, polyglot)}
          </Tag>
          <Tag color="green" size="small">
            {getTimeRangeLabel(digest.hours, polyglot)}
          </Tag>
          <Tag color="orange" size="small">
            {digest.article_count || 0} {polyglot.t("digest.articles")}
          </Tag>
        </Space>
      </div>

      <div className="digest-card-time">
        <Text type="secondary" size="small">
          {formatDate(digest.created_at)}
        </Text>
      </div>
    </Card>
  )
}

/**
 * DigestList - List of digests with pagination
 */
const DigestList = () => {
  const { polyglot } = useStore(polyglotState)
  const navigate = useNavigate()
  const { id: selectedId } = useParams()

  const {
    digests,
    isLoading,
    pagination,
    loadDigests,
    deleteDigest,
    pushDigest,
    loadDigest,
    setCurrentDigest,
  } = useDigest()

  // Load digests on mount
  useEffect(() => {
    loadDigests()
  }, [loadDigests])

  // Handle view digest
  const handleView = useCallback(
    (digest) => {
      setCurrentDigest(digest)
      navigate(`/digest/${digest.id}`)
    },
    [navigate, setCurrentDigest],
  )

  // Handle delete digest
  const handleDelete = useCallback(
    async (id) => {
      try {
        await deleteDigest(id)
        Message.success(polyglot.t("digest.delete_success"))
      } catch (err) {
        Message.error(polyglot.t("digest.delete_failed"))
      }
    },
    [deleteDigest, polyglot],
  )

  // Handle push digest
  const handlePush = useCallback(
    async (id) => {
      try {
        await pushDigest(id)
        Message.success(polyglot.t("digest.push_success"))
      } catch (err) {
        Message.error(polyglot.t("digest.push_failed"))
      }
    },
    [pushDigest, polyglot],
  )

  // Handle page change
  const handlePageChange = useCallback(
    (page) => {
      loadDigests({ page })
    },
    [loadDigests],
  )

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadDigests()
  }, [loadDigests])

  if (isLoading && digests.length === 0) {
    return (
      <div className="digest-list-loading">
        <Spin size={40} />
        <Text type="secondary">{polyglot.t("digest.loading")}</Text>
      </div>
    )
  }

  if (digests.length === 0) {
    return (
      <div className="digest-list-empty">
        <Empty description={polyglot.t("digest.no_digests")} />
      </div>
    )
  }

  return (
    <div className="digest-list">
      <div className="digest-list-header">
        <Title heading={5} style={{ margin: 0 }}>
          {polyglot.t("digest.title")}
        </Title>
        <Button
          type="text"
          icon={<IconRefresh />}
          onClick={handleRefresh}
          loading={isLoading}
        />
      </div>

      <List
        dataSource={digests}
        render={(digest) => (
          <List.Item key={digest.id}>
            <DigestCard
              digest={digest}
              selectedId={selectedId}
              onView={handleView}
              onDelete={handleDelete}
              onPush={handlePush}
            />
          </List.Item>
        )}
      />

      {pagination.totalPages > 1 && (
        <div className="digest-list-pagination">
          <Pagination
            current={pagination.page}
            pageSize={pagination.limit}
            total={pagination.total}
            onChange={handlePageChange}
            showTotal
            size="small"
          />
        </div>
      )}
    </div>
  )
}

export default DigestList
