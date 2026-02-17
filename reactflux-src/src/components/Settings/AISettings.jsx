import {
  Button,
  Checkbox,
  Collapse,
  Divider,
  Input,
  InputNumber,
  Message,
  Radio,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Typography,
} from "@arco-design/web-react"
import { IconCheck, IconClose, IconLoading, IconSend } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useState, useEffect, useCallback } from "react"

import SettingItem from "./SettingItem"

import { AI_PROVIDERS, getDefaultUrl, getProviderById } from "@/constants/ai-providers"
import { AI_LANGUAGES, DEFAULT_TARGET_LANGUAGE } from "@/constants/ai-languages"
import { polyglotState } from "@/hooks/useLanguage"
import { categoriesState } from "@/store/dataState"
import {
  aiConfigState,
  aiApiKeyState,
  aiLoadingState,
  updateAIConfig,
  setAIApiKey,
  isAIConfiguredState,
} from "@/store/aiState"
import {
  digestConfigState,
  updateDigestConfig,
} from "@/store/digestState"
import { testConnection } from "@/services/ai-service"
import { WEBHOOK_TEMPLATES } from "@/services/digest-service"

const { Title } = Typography
const CollapseItem = Collapse.Item

const AISettings = () => {
  const { polyglot } = useStore(polyglotState)
  const config = useStore(aiConfigState)
  const apiKey = useStore(aiApiKeyState)
  const isLoading = useStore(aiLoadingState)
  const isConfigured = useStore(isAIConfiguredState)
  const categories = useStore(categoriesState)
  const digestConfig = useStore(digestConfigState)

  const [localApiKey, setLocalApiKey] = useState(apiKey)
  const [testStatus, setTestStatus] = useState(null) // null, 'loading', 'success', 'error'
  const [testMessage, setTestMessage] = useState("")
  const [testWebhookStatus, setTestWebhookStatus] = useState(null)

  // Sync local API key with store
  useEffect(() => {
    setLocalApiKey(apiKey)
  }, [apiKey])

  // Get current provider config
  const currentProvider = getProviderById(config.provider)

  // Handle provider change
  const handleProviderChange = (value) => {
    const provider = getProviderById(value)
    const defaultUrl = getDefaultUrl(value)
    updateAIConfig({
      provider: value,
      apiUrl: defaultUrl,
      model: provider?.models?.[0] || "",
    })
  }

  // Handle API URL change
  const handleApiUrlChange = (value) => {
    updateAIConfig({ apiUrl: value })
  }

  // Handle API key change (local state)
  const handleApiKeyChange = (value) => {
    setLocalApiKey(value)
  }

  // Save API key to store on blur
  const handleApiKeyBlur = () => {
    setAIApiKey(localApiKey)
  }

  // Handle model change
  const handleModelChange = (value) => {
    updateAIConfig({ model: value })
  }

  // Handle target language change
  const handleTargetLanguageChange = (value) => {
    updateAIConfig({ targetLanguage: value })
  }

  // Handle auto summary toggle
  const handleAutoSummaryChange = (value) => {
    updateAIConfig({ autoSummary: value })
  }

  // Handle enable toggle
  const handleEnableChange = (value) => {
    updateAIConfig({ enabled: value })
  }

  // Handle temperature change
  const handleTemperatureChange = (value) => {
    updateAIConfig({ temperature: value })
  }

  // Handle max tokens change
  const handleMaxTokensChange = (value) => {
    updateAIConfig({ maxTokens: value })
  }

  // Handle title translation toggle
  const handleTitleTranslationChange = (value) => {
    updateAIConfig({ titleTranslation: value })
  }

  // Handle title translation mode change
  const handleTitleTranslationModeChange = (value) => {
    updateAIConfig({ titleTranslationMode: value })
  }

  // Handle title translation scope change
  const handleTitleTranslationScopeChange = (value) => {
    updateAIConfig({ titleTranslationScope: value, titleTranslationGroupIds: [] })
  }

  // Handle title translation group selection
  const handleTitleTranslationGroupChange = (checkedIds) => {
    updateAIConfig({ titleTranslationGroupIds: checkedIds })
  }

  // ============================================
  // Digest/Webhook Configuration Handlers
  // ============================================

  // Handle webhook enabled toggle
  const handleWebhookEnabledChange = (value) => {
    updateDigestConfig({ webhookEnabled: value })
  }

  // Handle webhook platform change
  const handleWebhookPlatformChange = (value) => {
    const template = WEBHOOK_TEMPLATES[value]
    updateDigestConfig({
      webhookPlatform: value,
      webhookMethod: template.method,
      webhookBodyTemplate: template.bodyTemplate,
    })
  }

  // Handle webhook URL change
  const handleWebhookUrlChange = (value) => {
    updateDigestConfig({ webhookUrl: value })
  }

  // Handle webhook method change
  const handleWebhookMethodChange = (value) => {
    updateDigestConfig({ webhookMethod: value })
  }

  // Handle webhook body template change
  const handleWebhookBodyTemplateChange = (value) => {
    updateDigestConfig({ webhookBodyTemplate: value })
  }

  // Test webhook
  const handleTestWebhook = useCallback(async () => {
    if (!digestConfig.webhookUrl) {
      Message.warning(polyglot.t("digest.webhook_url_required"))
      return
    }

    setTestWebhookStatus("loading")

    try {
      const response = await fetch(digestConfig.webhookUrl, {
        method: digestConfig.webhookMethod || "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: digestConfig.webhookMethod !== "GET" ? JSON.stringify({
          test: true,
          title: "Test Webhook",
          content: "This is a test message from ReactFlux",
          timestamp: new Date().toISOString(),
        }) : undefined,
      })

      if (response.ok) {
        setTestWebhookStatus("success")
        Message.success(polyglot.t("digest.webhook_test_success"))
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      setTestWebhookStatus("error")
      Message.error(polyglot.t("digest.webhook_test_failed"))
    }
  }, [digestConfig, polyglot])

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!config.provider || !config.model || !localApiKey) {
      Message.warning(polyglot.t("ai.fill_required_fields"))
      return
    }

    setTestStatus("loading")
    setTestMessage("")

    try {
      const testConfig = {
        ...config,
        apiKey: localApiKey,
      }
      await testConnection(testConfig)
      setTestStatus("success")
      setTestMessage(polyglot.t("ai.connection_success"))
      Message.success(polyglot.t("ai.connection_success"))
    } catch (error) {
      setTestStatus("error")
      setTestMessage(error.message || polyglot.t("ai.connection_failed"))
      Message.error(error.message || polyglot.t("ai.connection_failed"))
    }
  }, [config, localApiKey, polyglot])

  // Render test button status
  const renderTestButton = () => {
    if (testStatus === "loading") {
      return (
        <Button type="outline" loading>
          {polyglot.t("ai.testing")}
        </Button>
      )
    }

    if (testStatus === "success") {
      return (
        <Button type="outline" status="success" icon={<IconCheck />}>
          {polyglot.t("ai.connection_success")}
        </Button>
      )
    }

    if (testStatus === "error") {
      return (
        <Button type="outline" status="danger" icon={<IconClose />}>
          {polyglot.t("ai.connection_failed")}
        </Button>
      )
    }

    return (
      <Button type="outline" onClick={handleTestConnection}>
        {polyglot.t("ai.test_connection")}
      </Button>
    )
  }

  return (
    <div className="ai-settings">
      <SettingItem
        title={polyglot.t("ai.enable")}
        description={polyglot.t("ai.enable_description")}
      >
        <Switch
          checked={config.enabled}
          onChange={handleEnableChange}
        />
      </SettingItem>

      <Divider />

      <SettingItem
        title={polyglot.t("ai.provider")}
        description={polyglot.t("ai.provider_description")}
      >
        <Select
          className="input-select"
          placeholder={polyglot.t("ai.select_provider")}
          value={config.provider}
          onChange={handleProviderChange}
          style={{ width: 200 }}
        >
          {AI_PROVIDERS.map((provider) => (
            <Select.Option key={provider.id} value={provider.id}>
              {provider.name}
            </Select.Option>
          ))}
        </Select>
      </SettingItem>

      {config.provider && (
        <>
          <Divider />

          <SettingItem
            title={polyglot.t("ai.api_url")}
            description={polyglot.t("ai.api_url_description")}
          >
            <Input
              className="input-select"
              placeholder={polyglot.t("ai.api_url_placeholder")}
              value={config.apiUrl}
              onChange={handleApiUrlChange}
              style={{ width: 300 }}
            />
          </SettingItem>

          <Divider />

          <SettingItem
            title={polyglot.t("ai.api_key")}
            description={polyglot.t("ai.api_key_description")}
          >
            <Input.Password
              className="input-select"
              placeholder={polyglot.t("ai.api_key_placeholder")}
              value={localApiKey}
              onChange={handleApiKeyChange}
              onBlur={handleApiKeyBlur}
              style={{ width: 300 }}
            />
          </SettingItem>

          {currentProvider?.models && (
            <>
              <Divider />

              <SettingItem
                title={polyglot.t("ai.model")}
                description={polyglot.t("ai.model_description")}
              >
                <Select
                  className="input-select"
                  placeholder={polyglot.t("ai.select_model")}
                  value={config.model}
                  onChange={handleModelChange}
                  style={{ width: 200 }}
                >
                  {currentProvider.models.map((model) => (
                    <Select.Option key={model} value={model}>
                      {model}
                    </Select.Option>
                  ))}
                </Select>
              </SettingItem>
            </>
          )}

          {!currentProvider?.models && config.provider === "custom" && (
            <>
              <Divider />

              <SettingItem
                title={polyglot.t("ai.model")}
                description={polyglot.t("ai.model_custom_description")}
              >
                <Input
                  className="input-select"
                  placeholder={polyglot.t("ai.model_placeholder")}
                  value={config.model}
                  onChange={(value) => updateAIConfig({ model: value })}
                  style={{ width: 200 }}
                />
              </SettingItem>
            </>
          )}

          {!currentProvider?.models && config.provider === "openrouter" && (
            <>
              <Divider />

              <SettingItem
                title={polyglot.t("ai.model")}
                description={polyglot.t("ai.model_openrouter_description")}
              >
                <Input
                  className="input-select"
                  placeholder="openai/gpt-4o"
                  value={config.model}
                  onChange={(value) => updateAIConfig({ model: value })}
                  style={{ width: 250 }}
                />
              </SettingItem>
            </>
          )}

          <Divider />

          <SettingItem
            title={polyglot.t("ai.test_connection")}
            description={polyglot.t("ai.test_connection_description")}
          >
            <Space>{renderTestButton()}</Space>
          </SettingItem>
        </>
      )}

      {config.enabled && config.provider && (
        <>
          <Divider />

          <SettingItem
            title={polyglot.t("ai.target_language")}
            description={polyglot.t("ai.target_language_description")}
          >
            <Select
              className="input-select"
              value={config.targetLanguage || DEFAULT_TARGET_LANGUAGE}
              onChange={handleTargetLanguageChange}
              style={{ width: 150 }}
            >
              {AI_LANGUAGES.map((lang) => (
                <Select.Option key={lang.id} value={lang.id}>
                  {lang.name}
                </Select.Option>
              ))}
            </Select>
          </SettingItem>

          <Divider />

          <SettingItem
            title={polyglot.t("ai.auto_summary")}
            description={polyglot.t("ai.auto_summary_description")}
          >
            <Switch
              checked={config.autoSummary}
              onChange={handleAutoSummaryChange}
            />
          </SettingItem>

          <Divider />

          <SettingItem
            title={polyglot.t("ai.temperature")}
            description={polyglot.t("ai.temperature_description")}
          >
            <Slider
              className="input-slider"
              style={{ width: 200 }}
              min={0}
              max={2}
              step={0.1}
              value={config.temperature || 0.7}
              onChange={handleTemperatureChange}
            />
            <span style={{ marginLeft: 10 }}>{config.temperature || 0.7}</span>
          </SettingItem>

          <Divider />

          <SettingItem
            title={polyglot.t("ai.max_tokens")}
            description={polyglot.t("ai.max_tokens_description")}
          >
            <InputNumber
              className="input-select"
              min={256}
              max={32768}
              step={256}
              value={config.maxTokens || 4096}
              onChange={handleMaxTokensChange}
              style={{ width: 150 }}
            />
          </SettingItem>

          {/* Title Translation Settings */}
          <Divider />

          <SettingItem
            title={polyglot.t("ai.title_translation")}
            description={polyglot.t("ai.title_translation_description")}
          >
            <Switch
              checked={config.titleTranslation || false}
              onChange={handleTitleTranslationChange}
            />
          </SettingItem>

          {config.titleTranslation && (
            <>
              <Divider />

              <SettingItem
                title={polyglot.t("ai.title_translation_mode")}
                description={polyglot.t("ai.title_translation_mode_description")}
              >
                <Select
                  className="input-select"
                  value={config.titleTranslationMode || "chinese_only"}
                  onChange={handleTitleTranslationModeChange}
                  style={{ width: 150 }}
                >
                  <Select.Option value="chinese_only">
                    {polyglot.t("ai.title_translation_mode_chinese_only")}
                  </Select.Option>
                  <Select.Option value="bilingual">
                    {polyglot.t("ai.title_translation_mode_bilingual")}
                  </Select.Option>
                </Select>
              </SettingItem>

              <Divider />

              <SettingItem
                title={polyglot.t("ai.title_translation_scope")}
                description={polyglot.t("ai.title_translation_scope_description")}
              >
                <Select
                  className="input-select"
                  value={config.titleTranslationScope || "all"}
                  onChange={handleTitleTranslationScopeChange}
                  style={{ width: 150 }}
                >
                  <Select.Option value="all">
                    {polyglot.t("ai.title_translation_scope_all")}
                  </Select.Option>
                  <Select.Option value="groups">
                    {polyglot.t("ai.title_translation_scope_groups")}
                  </Select.Option>
                </Select>
              </SettingItem>

              {config.titleTranslationScope === "groups" && categories.length > 0 && (
                <>
                  <Divider />

                  <SettingItem
                    title={polyglot.t("ai.title_translation_select_groups")}
                    description={polyglot.t("ai.title_translation_select_groups_description")}
                  >
                    <Checkbox.Group
                      value={config.titleTranslationGroupIds || []}
                      onChange={handleTitleTranslationGroupChange}
                      style={{ width: 300 }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {categories.map((category) => (
                          <Checkbox key={category.id} value={category.id}>
                            {category.title}
                          </Checkbox>
                        ))}
                      </div>
                    </Checkbox.Group>
                  </SettingItem>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Digest/Webhook Configuration */}
      {config.enabled && config.provider && (
        <>
          <Divider />

          <div style={{ marginTop: 24, marginBottom: 16 }}>
            <Title heading={5} style={{ margin: 0 }}>
              {polyglot.t("digest.settings_section")}
            </Title>
          </div>

          <SettingItem
            title={polyglot.t("digest.webhook_enabled")}
            description={polyglot.t("digest.webhook_enabled_description")}
          >
            <Switch
              checked={digestConfig.webhookEnabled}
              onChange={handleWebhookEnabledChange}
            />
          </SettingItem>

          {digestConfig.webhookEnabled && (
            <>
              <Divider />

              <SettingItem
                title={polyglot.t("digest.webhook_platform")}
                description={polyglot.t("digest.webhook_platform_description")}
              >
                <Select
                  className="input-select"
                  value={digestConfig.webhookPlatform || "generic"}
                  onChange={handleWebhookPlatformChange}
                  style={{ width: 180 }}
                >
                  {Object.entries(WEBHOOK_TEMPLATES).map(([key, template]) => (
                    <Select.Option key={key} value={key}>
                      {template.name}
                    </Select.Option>
                  ))}
                </Select>
              </SettingItem>

              <Divider />

              <SettingItem
                title={polyglot.t("digest.webhook_url")}
                description={polyglot.t("digest.webhook_url_description")}
              >
                <Input
                  className="input-select"
                  placeholder={WEBHOOK_TEMPLATES[digestConfig.webhookPlatform || "generic"]?.placeholder}
                  value={digestConfig.webhookUrl}
                  onChange={handleWebhookUrlChange}
                  style={{ width: 350 }}
                />
              </SettingItem>

              <Divider />

              <SettingItem
                title={polyglot.t("digest.webhook_method")}
                description={polyglot.t("digest.webhook_method_description")}
              >
                <Radio.Group
                  value={digestConfig.webhookMethod || "POST"}
                  onChange={handleWebhookMethodChange}
                >
                  <Radio value="POST">POST</Radio>
                  <Radio value="GET">GET</Radio>
                </Radio.Group>
              </SettingItem>

              {digestConfig.webhookMethod !== "GET" && (
                <>
                  <Divider />

                  <SettingItem
                    title={polyglot.t("digest.webhook_body_template")}
                    description={polyglot.t("digest.webhook_body_template_description")}
                  >
                    <Input.TextArea
                      className="input-select"
                      placeholder='{"title": "{{title}}", "content": "{{content}}"}'
                      value={digestConfig.webhookBodyTemplate}
                      onChange={handleWebhookBodyTemplateChange}
                      style={{ width: 350, minHeight: 100 }}
                      autoSize={{ minRows: 4, maxRows: 10 }}
                    />
                  </SettingItem>
                </>
              )}

              <Divider />

              <SettingItem
                title={polyglot.t("digest.webhook_test")}
                description={polyglot.t("digest.webhook_test_description")}
              >
                <Space>
                  <Button
                    type="outline"
                    icon={<IconSend />}
                    loading={testWebhookStatus === "loading"}
                    onClick={handleTestWebhook}
                    disabled={!digestConfig.webhookUrl}
                  >
                    {polyglot.t("digest.webhook_test_button")}
                  </Button>
                  {testWebhookStatus === "success" && (
                    <span style={{ color: "rgb(var(--success-6))" }}>
                      <IconCheck /> {polyglot.t("digest.webhook_test_success")}
                    </span>
                  )}
                  {testWebhookStatus === "error" && (
                    <span style={{ color: "rgb(var(--danger-6))" }}>
                      <IconClose /> {polyglot.t("digest.webhook_test_failed")}
                    </span>
                  )}
                </Space>
              </SettingItem>
            </>
          )}
        </>
      )}

      <Divider />

      <div style={{ marginTop: 16, color: "var(--color-text-3)", fontSize: 12 }}>
        {polyglot.t("ai.status")}:{" "}
        {isConfigured ? (
          <span style={{ color: "rgb(var(--success-6))" }}>{polyglot.t("ai.configured")}</span>
        ) : (
          <span style={{ color: "rgb(var(--warning-6))" }}>{polyglot.t("ai.not_configured")}</span>
        )}
      </div>
    </div>
  )
}

export default AISettings
