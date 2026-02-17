import { Button, Empty, Space, Spin, Typography } from "@arco-design/web-react"
import { IconPlus, IconRefresh } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useCallback, useState, useEffect } from "react"
import { useParams } from "react-router"

import { DigestDetail, DigestGenerateModal, DigestList } from "@/components/Digest"
import { polyglotState } from "@/hooks/useLanguage"
import { isAIConfiguredState } from "@/store/aiState"
import useDigest from "@/hooks/useDigest"

import "./Digest.css"

const { Title, Text } = Typography

/**
 * Digest page - Main page for viewing digests
 */
const Digest = () => {
  const { polyglot } = useStore(polyglotState)
  const isAIConfigured = useStore(isAIConfiguredState)
  const { id: digestId } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalVisible, setModalVisible] = useState(false)

  const { digests, isLoading, loadDigests } = useDigest()

  // Load digests on mount
  useEffect(() => {
    if (!digestId) {
      loadDigests()
    }
  }, [loadDigests, digestId])

  // Handle generation complete
  const handleGenerateComplete = useCallback(() => {
    setModalVisible(false)
    setRefreshKey((prev) => prev + 1)
    loadDigests()
  }, [loadDigests])

  // Handle refresh
  const handleRefresh = useCallback(() => {
    loadDigests()
  }, [loadDigests])

  if (digestId) {
    return <DigestDetail />
  }

  return (
    <div className="digest-page">
      {/* Header with generate button */}
      <div className="digest-page-header">
        <Title heading={4} style={{ margin: 0 }}>
          {polyglot.t("digest.page_title")}
        </Title>
        <Space>
          <Button
            type="text"
            icon={<IconRefresh />}
            onClick={handleRefresh}
            loading={isLoading}
          />
          {isAIConfigured && (
            <Button
              type="primary"
              icon={<IconPlus />}
              onClick={() => setModalVisible(true)}
            >
              {polyglot.t("digest.generate")}
            </Button>
          )}
        </Space>
      </div>

      {/* Loading state */}
      {isLoading && digests.length === 0 && (
        <div className="digest-page-loading">
          <Spin size={40} />
          <Text type="secondary">{polyglot.t("digest.loading")}</Text>
        </div>
      )}

      {/* Empty state with generate button */}
      {!isLoading && digests.length === 0 && (
        <div className="digest-page-empty">
          <Empty description={polyglot.t("digest.no_digests")} />
          {isAIConfigured && (
            <Button
              type="primary"
              icon={<IconPlus />}
              onClick={() => setModalVisible(true)}
              style={{ marginTop: 16 }}
            >
              {polyglot.t("digest.generate_first")}
            </Button>
          )}
          {!isAIConfigured && (
            <Text type="secondary" style={{ marginTop: 16 }}>
              {polyglot.t("digest.configure_ai_first")}
            </Text>
          )}
        </div>
      )}

      {/* Digest list */}
      {digests.length > 0 && <DigestList key={refreshKey} />}

      {/* Generate modal */}
      <DigestGenerateModal
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onGenerate={handleGenerateComplete}
      />
    </div>
  )
}

export default Digest
