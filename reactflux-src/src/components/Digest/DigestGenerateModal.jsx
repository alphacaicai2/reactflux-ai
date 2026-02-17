import {
  Button,
  Divider,
  Form,
  Message,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Typography,
} from "@arco-design/web-react"
import { IconCheck, IconClose, IconLoading, IconSend } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useCallback, useEffect, useState } from "react"

import useDigest from "@/hooks/useDigest"
import { polyglotState } from "@/hooks/useLanguage"
import { categoriesState, feedsState } from "@/store/dataState"
import { isAIConfiguredState } from "@/store/aiState"
import { digestConfigState } from "@/store/digestState"
import { WEBHOOK_TEMPLATES } from "@/services/digest-service"

import DigestPreview from "./DigestPreview"

const FormItem = Form.Item
const { Text, Title } = Typography

/**
 * Time range options for digest generation
 */
const TIME_RANGE_OPTIONS = [
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
  { label: "3 days", value: 72 },
  { label: "7 days", value: 168 },
]

/**
 * Target language options
 */
const TARGET_LANG_OPTIONS = [
  { label: "Simplified Chinese", value: "Simplified Chinese" },
  { label: "Traditional Chinese", value: "Traditional Chinese" },
  { label: "English", value: "English" },
  { label: "Japanese", value: "Japanese" },
]

/**
 * DigestGenerateModal - Modal for generating AI digests
 */
const DigestGenerateModal = ({ visible, onCancel, onGenerate }) => {
  const { polyglot } = useStore(polyglotState)
  const categories = useStore(categoriesState)
  const feeds = useStore(feedsState)
  const isAIConfigured = useStore(isAIConfiguredState)
  const config = useStore(digestConfigState)

  const {
    generateDigest,
    generation,
    pushGeneratedDigest,
    saveDigest,
    resetGeneration,
    clearError,
  } = useDigest()

  const [form] = Form.useForm()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [generatedDigest, setGeneratedDigest] = useState(null)
  const [showPushConfig, setShowPushConfig] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      resetGeneration()
      setGeneratedDigest(null)
      form.resetFields()
      form.setFieldsValue({
        scope: "all",
        hours: 24,
        targetLang: "Simplified Chinese",
        unreadOnly: true,
      })
    }
  }, [visible, form, resetGeneration])

  // Update generated digest when generation completes
  useEffect(() => {
    if (generation.status === "completed" && generation.generatedDigest) {
      setGeneratedDigest(generation.generatedDigest)
    }
  }, [generation.status, generation.generatedDigest])

  // Get scope options based on current selection
  const getScopeOptions = useCallback(() => {
    const scope = form.getFieldValue("scope")
    if (scope === "group") {
      return categories.map((cat) => ({
        label: cat.title,
        value: cat.id,
      }))
    }
    if (scope === "feed") {
      return feeds.map((feed) => ({
        label: feed.title,
        value: feed.id,
      }))
    }
    return []
  }, [categories, feeds, form])

  // Handle form submission
  const handleGenerate = useCallback(async () => {
    if (!isAIConfigured) {
      Message.warning(polyglot.t("ai.not_configured"))
      return
    }

    try {
      setIsGenerating(true)
      clearError()

      const values = await form.validate()
      const options = {
        scope: values.scope,
        hours: values.hours,
        targetLang: values.targetLang,
        unreadOnly: values.unreadOnly,
      }

      // Add scope ID based on scope type
      if (values.scope === "group" && values.scopeId) {
        options.groupId = values.scopeId
        const category = categories.find((c) => c.id === values.scopeId)
        if (category) {
          options.scopeName = category.title
        }
      } else if (values.scope === "feed" && values.scopeId) {
        options.feedId = values.scopeId
        const feed = feeds.find((f) => f.id === values.scopeId)
        if (feed) {
          options.scopeName = feed.title
        }
      }

      // Add push config if enabled
      if (showPushConfig && config.webhookUrl) {
        options.pushConfig = {
          method: config.webhookMethod,
          url: config.webhookUrl,
          body: config.webhookBodyTemplate,
        }
      }

      await generateDigest(options)

      if (onGenerate) {
        onGenerate()
      }
    } catch (err) {
      console.error("Generation error:", err)
      Message.error(err.message || polyglot.t("digest.generate_error"))
    } finally {
      setIsGenerating(false)
    }
  }, [
    isAIConfigured,
    form,
    showPushConfig,
    config,
    categories,
    feeds,
    generateDigest,
    clearError,
    polyglot,
    onGenerate,
  ])

  // Handle push
  const handlePush = useCallback(async () => {
    if (!generatedDigest) return

    try {
      setIsPushing(true)
      await pushGeneratedDigest()
      Message.success(polyglot.t("digest.push_success"))
    } catch (err) {
      console.error("Push error:", err)
      Message.error(polyglot.t("digest.push_failed"))
    } finally {
      setIsPushing(false)
    }
  }, [generatedDigest, pushGeneratedDigest, polyglot])

  // Handle save
  const handleSave = useCallback(async () => {
    if (!generatedDigest) return

    try {
      setIsSaving(true)
      await saveDigest({
        title: generatedDigest.title,
        content: generatedDigest.content,
        scope: generatedDigest.scope,
        scopeId: generatedDigest.scopeId,
        scopeName: generatedDigest.scopeName,
        articleCount: generatedDigest.articleCount,
        hours: generatedDigest.hours,
        targetLang: generatedDigest.targetLang,
      })
      Message.success(polyglot.t("digest.save_success"))

      if (onCancel) {
        onCancel()
      }
    } catch (err) {
      console.error("Save error:", err)
      Message.error(polyglot.t("digest.save_failed"))
    } finally {
      setIsSaving(false)
    }
  }, [generatedDigest, saveDigest, onCancel, polyglot])

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (isGenerating) {
      Modal.confirm({
        title: polyglot.t("digest.cancel_generation_title"),
        content: polyglot.t("digest.cancel_generation_content"),
        onOk: () => {
          resetGeneration()
          if (onCancel) onCancel()
        },
      })
    } else {
      if (onCancel) onCancel()
    }
  }, [isGenerating, resetGeneration, onCancel, polyglot])

  // Render generation progress
  const renderProgress = () => {
    if (!isGenerating && generation.status !== "completed") return null

    const status = generation.status
    const progress = generation.progress

    let statusText = ""
    switch (status) {
      case "fetching":
        statusText = polyglot.t("digest.status_fetching")
        break
      case "generating":
        statusText = polyglot.t("digest.status_generating")
        break
      case "completed":
        statusText = polyglot.t("digest.status_completed")
        break
      case "error":
        statusText = polyglot.t("digest.status_error")
        break
      default:
        statusText = ""
    }

    return (
      <div style={{ marginBottom: 20 }}>
        <Progress
          percent={progress}
          status={status === "error" ? "danger" : status === "completed" ? "success" : "loading"}
          style={{ marginBottom: 8 }}
        />
        <Text type="secondary">{statusText}</Text>
      </div>
    )
  }

  // Render generated digest preview
  const renderPreview = () => {
    if (!generatedDigest) return null

    return (
      <div style={{ marginTop: 20 }}>
        <Divider />
        <DigestPreview digest={generatedDigest} />
      </div>
    )
  }

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{polyglot.t("digest.generate_title")}</span>
          {isGenerating && <Spin size={20} />}
        </div>
      }
      visible={visible}
      onCancel={handleCancel}
      footer={null}
      style={{ width: 600, maxWidth: "95vw" }}
      unmountOnExit={false}
    >
      {!isAIConfigured && (
        <Message type="warning" style={{ marginBottom: 16 }}>
          {polyglot.t("ai.not_configured")}
        </Message>
      )}

      {renderProgress()}

      {!generatedDigest ? (
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          style={{ opacity: isGenerating ? 0.6 : 1 }}
        >
          <FormItem
            label={polyglot.t("digest.scope")}
            field="scope"
            initialValue="all"
            rules={[{ required: true }]}
          >
            <Radio.Group disabled={isGenerating}>
              <Radio value="all">{polyglot.t("digest.scope_all")}</Radio>
              <Radio value="group">{polyglot.t("digest.scope_group")}</Radio>
              <Radio value="feed">{polyglot.t("digest.scope_feed")}</Radio>
            </Radio.Group>
          </FormItem>

          <FormItem shouldUpdate noStyle>
            {(field, formState) => {
              const scope = formState.scope
              if (scope === "group" || scope === "feed") {
                return (
                  <FormItem
                    label={scope === "group" ? polyglot.t("digest.select_group") : polyglot.t("digest.select_feed")}
                    field="scopeId"
                    rules={[{ required: true }]}
                  >
                    <Select
                      placeholder={polyglot.t("digest.select_placeholder")}
                      disabled={isGenerating}
                      showSearch
                      filterOption={(inputValue, option) =>
                        option.props.children.toLowerCase().includes(inputValue.toLowerCase())
                      }
                    >
                      {getScopeOptions().map((opt) => (
                        <Select.Option key={opt.value} value={opt.value}>
                          {opt.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </FormItem>
                )
              }
              return null
            }}
          </FormItem>

          <FormItem
            label={polyglot.t("digest.time_range")}
            field="hours"
            initialValue={24}
            rules={[{ required: true }]}
          >
            <Radio.Group disabled={isGenerating}>
              {TIME_RANGE_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>
                  {polyglot.t(`digest.time_${opt.value}`)}
                </Radio>
              ))}
            </Radio.Group>
          </FormItem>

          <FormItem
            label={polyglot.t("digest.target_language")}
            field="targetLang"
            initialValue="Simplified Chinese"
            rules={[{ required: true }]}
          >
            <Select disabled={isGenerating}>
              {TARGET_LANG_OPTIONS.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </FormItem>

          <FormItem
            label={polyglot.t("digest.unread_only")}
            field="unreadOnly"
            initialValue={true}
            triggerPropName="checked"
          >
            <Switch disabled={isGenerating} />
          </FormItem>

          {config.webhookUrl && (
            <FormItem label={polyglot.t("digest.auto_push")}>
              <Switch
                checked={showPushConfig}
                onChange={setShowPushConfig}
                disabled={isGenerating}
              />
            </FormItem>
          )}

          <FormItem>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={handleCancel} disabled={isGenerating}>
                {polyglot.t("digest.cancel")}
              </Button>
              <Button
                type="primary"
                loading={isGenerating}
                onClick={handleGenerate}
                disabled={!isAIConfigured}
              >
                {isGenerating ? polyglot.t("digest.generating") : polyglot.t("digest.generate")}
              </Button>
            </Space>
          </FormItem>
        </Form>
      ) : (
        <>
          {renderPreview()}

          <div style={{ marginTop: 20 }}>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={handleCancel}>{polyglot.t("digest.close")}</Button>
              {config.webhookUrl && (
                <Button
                  type="outline"
                  icon={<IconSend />}
                  loading={isPushing}
                  onClick={handlePush}
                >
                  {polyglot.t("digest.push")}
                </Button>
              )}
              <Button type="primary" loading={isSaving} onClick={handleSave}>
                {polyglot.t("digest.save")}
              </Button>
            </Space>
          </div>
        </>
      )}
    </Modal>
  )
}

export default DigestGenerateModal
