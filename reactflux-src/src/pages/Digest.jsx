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

  // Load digests on mount so list is always populated (left panel)
  useEffect(() => {
    loadDigests()
  }, [loadDigests])

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

  return (
    <div
      className={`digest-page digest-page-split${digestId ? " digest-page-has-selection" : ""}`}
    >
      <div className="digest-page-list">
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

        {isLoading && digests.length === 0 && (
          <div className="digest-page-loading">
            <Spin size={40} />
            <Text type="secondary">{polyglot.t("digest.loading")}</Text>
          </div>
        )}

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

        {digests.length > 0 && <DigestList key={refreshKey} />}
      </div>

      <div className="digest-page-detail">
        {digestId ? (
          <DigestDetail />
        ) : (
          <div className="digest-page-welcome">
            <Empty description={polyglot.t("digest.select_prompt")} />
          </div>
        )}
      </div>

      <DigestGenerateModal
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onGenerate={handleGenerateComplete}
      />
    </div>
  )
}

export default Digest
