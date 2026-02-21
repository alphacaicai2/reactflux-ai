import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import useDigest from "@/hooks/useDigest"
import { polyglotState } from "@/hooks/useLanguage"
import { categoriesState } from "@/store/dataState"
import { isAIConfiguredState } from "@/store/aiState"
import { digestConfigState } from "@/store/digestState"
import { getDefaultPrompt, previewDigest, WEBHOOK_TEMPLATES } from "@/services/digest-service"

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
  const scope = Form.useWatch("scope", form) ?? "all"
  const scopeId = Form.useWatch("scopeId", form)
  const hours = Form.useWatch("hours", form) ?? 24
  const unreadOnly = Form.useWatch("unreadOnly", form) ?? true

  const [isGenerating, setIsGenerating] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [generatedDigest, setGeneratedDigest] = useState(null)
  const [showPushConfig, setShowPushConfig] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const previewDebounceRef = useRef(null)

  // Debounced digest preview when scope, groupId, hours, or unreadOnly change
  useEffect(() => {
    if (!visible || generatedDigest) {
      setPreviewData(null)
      return
    }
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current)
    }
    previewDebounceRef.current = setTimeout(async () => {
      previewDebounceRef.current = null
      try {
        const options = {
          scope,
          hours,
          unreadOnly,
        }
        if (scope === "group" && scopeId != null && scopeId !== "") {
          options.groupId = Number(scopeId)
        }
        const res = await previewDigest(options)
        if (res?.data) {
          setPreviewData(res.data)
        } else {
          setPreviewData(null)
        }
      } catch {
        setPreviewData(null)
      }
    }, 300)
    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current)
      }
    }
  }, [visible, generatedDigest, scope, scopeId, hours, unreadOnly])

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      resetGeneration()
      setGeneratedDigest(null)
      setPreviewData(null)
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

  // 指定分组时的分组选项
  const groupOptions = useMemo(
    () =>
      categories.map((cat) => ({
        label: cat.title,
        value: cat.id,
      })),
    [categories]
  )

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
      if (values.customPrompt && String(values.customPrompt).trim()) {
        options.prompt = values.customPrompt.trim()
      }

      // 指定分组时传分组 ID 与名称（确保为数字）
      if (values.scope === "group") {
        const scopeId = values.scopeId ?? values.groupId
        if (scopeId == null || scopeId === "") {
          Message.warning(polyglot.t("digest.select_group"))
          return
        }
        options.groupId = Number(scopeId)
        const category = categories.find((c) => Number(c.id) === Number(scopeId))
        if (category) {
          options.scopeName = category.title
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

      {generation.status === "error" && generation.error && (
        <Alert
          type="error"
          content={generation.error}
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      {renderProgress()}

      {!generatedDigest ? (
        <>
          {previewData && (
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {previewData.articleCount} articles, ~{previewData.estimatedTokens} tokens estimated
                {previewData.maxTokens != null && previewData.maxTokens !== "" && (
                  <>
                    {" "}
                    · Response limited to {previewData.maxTokens} tokens (settings).
                  </>
                )}
              </Text>
            </div>
          )}
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
            </Radio.Group>
          </FormItem>

          {scope === "group" && (
            <FormItem
              label={polyglot.t("digest.select_group")}
              field="scopeId"
              rules={[{ required: true, message: polyglot.t("digest.select_group") }]}
            >
              <Select
                placeholder={polyglot.t("digest.select_placeholder")}
                disabled={isGenerating}
                showSearch
                filterOption={(inputValue, option) =>
                  (option?.props?.children ?? "")
                    .toString()
                    .toLowerCase()
                    .includes(inputValue.toLowerCase())
                }
              >
                {groupOptions.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>
          )}

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

          <FormItem
            label={
              <Space>
                <span>{polyglot.t("digest.custom_prompt")}</span>
                <Button
                  type="text"
                  size="mini"
                  onClick={async () => {
                    try {
                      const res = await getDefaultPrompt()
                      const text = res?.data?.defaultPrompt
                      if (text) form.setFieldValue("customPrompt", text)
                    } catch (e) {
                      Message.error(e?.message || "Failed to load default prompt")
                    }
                  }}
                  disabled={isGenerating}
                >
                  {polyglot.t("digest.load_default_prompt")}
                </Button>
              </Space>
            }
            field="customPrompt"
            extra={polyglot.t("digest.custom_prompt_placeholder")}
          >
            <Input.TextArea
              placeholder={polyglot.t("digest.custom_prompt_placeholder")}
              disabled={isGenerating}
              autoSize={{ minRows: 3, maxRows: 8 }}
              maxLength={8000}
              showWordLimit
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
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
        </>
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
