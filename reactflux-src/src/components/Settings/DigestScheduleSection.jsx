import {
  Button,
  Empty,
  Form,
  Input,
  Message,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Typography,
} from "@arco-design/web-react"
import { IconPlayArrow, IconPlus, IconDelete } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { useCallback, useEffect, useState } from "react"

import useDigest from "@/hooks/useDigest"
import { polyglotState } from "@/hooks/useLanguage"
import { categoriesState } from "@/store/dataState"
import { digestConfigState } from "@/store/digestState"

const FormItem = Form.Item
const { Text } = Typography

const TIME_RANGE_OPTIONS = [
  { label: "12h", value: 12 },
  { label: "24h", value: 24 },
  { label: "3d", value: 72 },
  { label: "7d", value: 168 },
]

const TARGET_LANG_OPTIONS = [
  { label: "Simplified Chinese", value: "Simplified Chinese" },
  { label: "Traditional Chinese", value: "Traditional Chinese" },
  { label: "English", value: "English" },
  { label: "Japanese", value: "Japanese" },
]

function formatDateTime(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * 定时简报任务区块：列表 + 添加任务弹窗
 * 入口：设置 -> AI -> 下方「定时简报任务」
 */
const DigestScheduleSection = () => {
  const { polyglot } = useStore(polyglotState)
  const categories = useStore(categoriesState)
  const digestConfig = useStore(digestConfigState)

  const {
    scheduledTasks,
    tasksLoading,
    loadScheduledTasks,
    createTask,
    deleteTask,
    toggleTask,
    runTask,
  } = useDigest()

  const [modalVisible, setModalVisible] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [runLoadingId, setRunLoadingId] = useState(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadScheduledTasks().catch(() => {})
  }, [loadScheduledTasks])

  const handleAdd = useCallback(() => {
    form.resetFields()
    form.setFieldsValue({
      name: "",
      scope: "all",
      scopeId: undefined,
      hours: 24,
      targetLang: "Simplified Chinese",
      unreadOnly: true,
      cronExpression: "0 9 * * *",
      timezone: "Asia/Shanghai",
      pushEnabled: false,
    })
    setModalVisible(true)
  }, [form])

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validate()
      setSubmitLoading(true)

      const payload = {
        name: values.name.trim(),
        scope: values.scope,
        scopeId: values.scope === "group" ? values.scopeId : undefined,
        scopeName:
          values.scope === "group" && values.scopeId
            ? categories.find((c) => c.id === values.scopeId)?.title || ""
            : "",
        hours: values.hours,
        targetLang: values.targetLang,
        unreadOnly: values.unreadOnly,
        cronExpression: values.cronExpression.trim(),
        timezone: values.timezone || "Asia/Shanghai",
        pushEnabled: !!values.pushEnabled,
        pushConfig:
          values.pushEnabled && digestConfig.webhookUrl
            ? {
                method: digestConfig.webhookMethod || "POST",
                url: digestConfig.webhookUrl,
                body: digestConfig.webhookBodyTemplate,
              }
            : undefined,
        isActive: true,
      }

      await createTask(payload)
      Message.success(polyglot.t("ai.save_success"))
      setModalVisible(false)
    } catch (e) {
      if (e?.message) Message.error(e.message)
    } finally {
      setSubmitLoading(false)
    }
  }, [form, categories, digestConfig, createTask, polyglot])

  const handleRunNow = useCallback(
    async (id) => {
      setRunLoadingId(id)
      try {
        await runTask(id)
        Message.success(polyglot.t("digest.status_completed"))
      } catch (e) {
        Message.error(e?.message || polyglot.t("digest.status_error"))
      } finally {
        setRunLoadingId(null)
      }
    },
    [runTask, polyglot]
  )

  const scopeLabel = (scope, scopeName) => {
    if (scope === "all") return polyglot.t("digest.scope_all")
    if (scope === "group") return scopeName || polyglot.t("digest.scope_group")
    return scopeName || scope
  }

  const columns = [
    {
      title: polyglot.t("digest.schedule_task_name"),
      dataIndex: "name",
      render: (name, row) => (
        <Space direction="vertical" size={0}>
          <Text bold>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {scopeLabel(row.scope, row.scope_name)} · {row.hours}h · {row.cron_expression}
          </Text>
        </Space>
      ),
    },
    {
      title: polyglot.t("digest.schedule_next_run"),
      dataIndex: "next_run_at",
      render: (v) => formatDateTime(v),
      width: 140,
    },
    {
      title: polyglot.t("digest.schedule_last_run"),
      dataIndex: "last_run_at",
      render: (v) => formatDateTime(v),
      width: 140,
    },
    {
      title: polyglot.t("digest.schedule_push_after"),
      dataIndex: "push_enabled",
      render: (v) => (v ? "✓" : "—"),
      width: 80,
    },
    {
      title: "",
      dataIndex: "is_active",
      render: (isActive, row) => (
        <Space>
          <Switch
            size="small"
            checked={!!isActive}
            onChange={(checked) => toggleTask(row.id, checked)}
          />
          <Button
            type="text"
            size="small"
            icon={<IconPlayArrow />}
            loading={runLoadingId === row.id}
            onClick={() => handleRunNow(row.id)}
          >
            {polyglot.t("digest.schedule_run_now")}
          </Button>
          <Popconfirm
            title={polyglot.t("digest.delete_confirm_title")}
            content={polyglot.t("digest.delete_confirm_content")}
            onOk={() => deleteTask(row.id)}
          >
            <Button type="text" size="small" status="danger" icon={<IconDelete />} />
          </Popconfirm>
        </Space>
      ),
      width: 220,
    },
  ]

  return (
    <>
      <div style={{ marginTop: 24, marginBottom: 16 }}>
        <Text bold style={{ fontSize: 14 }}>
          {polyglot.t("digest.schedule_section_title")}
        </Text>
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {polyglot.t("digest.schedule_section_description")}
          </Text>
        </div>
      </div>

      <Button type="outline" icon={<IconPlus />} onClick={handleAdd} style={{ marginBottom: 12 }}>
        {polyglot.t("digest.schedule_add_task")}
      </Button>

      {tasksLoading ? (
        <Spin />
      ) : !scheduledTasks || scheduledTasks.length === 0 ? (
        <Empty description={polyglot.t("digest.schedule_no_tasks")} style={{ marginTop: 24 }} />
      ) : (
        <Table
          size="small"
          border={{ wrapper: true, cell: false }}
          columns={columns}
          data={scheduledTasks}
          rowKey="id"
          pagination={false}
        />
      )}

      <Modal
        title={polyglot.t("digest.schedule_add_task")}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        okLoading={submitLoading}
        autoFocus={false}
        focusLock
        style={{ width: 480 }}
      >
        <Form form={form} layout="vertical" autoComplete="off" style={{ marginTop: 8 }}>
          <FormItem
            label={polyglot.t("digest.schedule_task_name")}
            field="name"
            rules={[{ required: true }]}
          >
            <Input placeholder={polyglot.t("digest.schedule_task_name_placeholder")} />
          </FormItem>

          <FormItem label={polyglot.t("digest.schedule_scope")} field="scope" initialValue="all">
            <Radio.Group>
              <Radio value="all">{polyglot.t("digest.scope_all")}</Radio>
              <Radio value="group">{polyglot.t("digest.scope_group")}</Radio>
            </Radio.Group>
          </FormItem>

          <FormItem noStyle shouldUpdate>
            {() => {
              const scope = form.getFieldValue("scope")
              if (scope !== "group") return null
              return (
                <FormItem
                  label={polyglot.t("digest.select_group")}
                  field="scopeId"
                  rules={[{ required: true }]}
                >
                  <Select placeholder={polyglot.t("digest.select_placeholder")}>
                    {categories.map((c) => (
                      <Select.Option key={c.id} value={c.id}>
                        {c.title}
                      </Select.Option>
                    ))}
                  </Select>
                </FormItem>
              )
            }}
          </FormItem>

          <FormItem
            label={polyglot.t("digest.schedule_hours")}
            field="hours"
            initialValue={24}
            extra={polyglot.t("digest.schedule_hours_desc")}
          >
            <Radio.Group options={TIME_RANGE_OPTIONS} />
          </FormItem>

          <FormItem
            label={polyglot.t("digest.target_language")}
            field="targetLang"
            initialValue="Simplified Chinese"
          >
            <Select options={TARGET_LANG_OPTIONS} />
          </FormItem>

          <FormItem
            label={polyglot.t("digest.unread_only")}
            field="unreadOnly"
            initialValue={true}
            triggerPropName="checked"
          >
            <Switch />
          </FormItem>

          <FormItem
            label={polyglot.t("digest.schedule_cron")}
            field="cronExpression"
            initialValue="0 9 * * *"
            rules={[{ required: true }]}
            extra={polyglot.t("digest.schedule_cron_description")}
          >
            <Input placeholder={polyglot.t("digest.schedule_cron_placeholder")} />
          </FormItem>

          <FormItem
            label={polyglot.t("digest.schedule_timezone")}
            field="timezone"
            initialValue="Asia/Shanghai"
          >
            <Input />
          </FormItem>

          <FormItem
            label={polyglot.t("digest.schedule_push_after")}
            field="pushEnabled"
            initialValue={false}
            triggerPropName="checked"
          >
            <Switch disabled={!digestConfig.webhookUrl} />
          </FormItem>
          {!digestConfig.webhookUrl && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {polyglot.t("digest.webhook_url_required")}
            </Text>
          )}
        </Form>
      </Modal>
    </>
  )
}

export default DigestScheduleSection
