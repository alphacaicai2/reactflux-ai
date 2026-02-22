import {
  Button,
  Divider,
  Form,
  Input,
  Link,
  Message,
  Notification,
  Spin,
  Typography,
} from "@arco-design/web-react"
import useForm from "@arco-design/web-react/es/Form/useForm"
import { IconHome, IconLock, IconUser } from "@arco-design/web-react/icon"
import { useStore } from "@nanostores/react"
import { ofetch } from "ofetch"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router"

import useLanguage, { polyglotState } from "@/hooks/useLanguage"
import useTheme from "@/hooks/useTheme"
import { authState, setAuth } from "@/store/authState"
import { settingsState } from "@/store/settingsState"
import isValidAuth from "@/utils/auth"
import { handleEnterKeyToSubmit, validateAndFormatFormFields } from "@/utils/form"
import hideSpinner from "@/utils/loading"
import "./Login.css"

const FEISHU_QR_CONTAINER_ID = "feishu-qr-container"

const Login = () => {
  useLanguage()
  useTheme()

  const auth = useStore(authState)
  const { homePage } = useStore(settingsState)
  const { polyglot } = useStore(polyglotState)

  const [loginForm] = useForm()
  const [loading, setLoading] = useState(false)
  const [feishuConfig, setFeishuConfig] = useState(null)
  const [feishuConfigLoading, setFeishuConfigLoading] = useState(true)
  const [showMinifluxForm, setShowMinifluxForm] = useState(false)
  const qrLoginRef = useRef(null)
  const gotoUrlRef = useRef(null)

  const [searchParams] = useSearchParams()
  const urlParamsObj = useMemo(() => Object.fromEntries(searchParams), [])
  const [authMethod, setAuthMethod] = useState(urlParamsObj.username ? "user" : "token")
  const location = useLocation()
  const navigate = useNavigate()

  const [redirectTo] = useState(() => location.state?.from)

  useEffect(() => {
    hideSpinner()
  }, [])

  useEffect(() => {
    let cancelled = false
    setFeishuConfigLoading(true)
    fetch("/api/auth/feishu/config")
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res?.success && res?.data?.appId && res?.data?.redirectUri) {
          setFeishuConfig(res.data)
        } else {
          setFeishuConfig(null)
        }
      })
      .catch(() => {
        if (!cancelled) setFeishuConfig(null)
      })
      .finally(() => {
        if (!cancelled) setFeishuConfigLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!feishuConfig) return

    let cleanedUp = false

    const initQR = () => {
      if (cleanedUp) return
      const container = document.getElementById(FEISHU_QR_CONTAINER_ID)
      if (!container || container.children.length > 0) return

      const redirectUri = encodeURIComponent(feishuConfig.redirectUri)
      const state = Math.random().toString(36).slice(2)
      try { sessionStorage.setItem("feishu_oauth_state", state) } catch {}
      const goto = `https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=${feishuConfig.appId}&redirect_uri=${redirectUri}&response_type=code&state=${state}`
      gotoUrlRef.current = goto

      try {
        const qrLogin = window.QRLogin({
          id: FEISHU_QR_CONTAINER_ID,
          goto,
          width: "260",
          height: "260",
        })
        qrLoginRef.current = qrLogin
      } catch (e) {
        console.error("Feishu QR init error:", e)
      }
    }

    if (window.QRLogin) {
      initQR()
    } else {
      const script = document.createElement("script")
      script.src = "https://sf3-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.2.js"
      script.onload = initQR
      document.head.appendChild(script)
    }

    const handleMessage = (event) => {
      if (!qrLoginRef.current?.matchOrigin?.(event.origin)) return
      const tmpCode = event.data
      if (tmpCode && gotoUrlRef.current) {
        window.location.href = `${gotoUrlRef.current}&tmp_code=${encodeURIComponent(tmpCode)}`
      }
    }
    window.addEventListener("message", handleMessage, false)
    return () => {
      cleanedUp = true
      window.removeEventListener("message", handleMessage)
    }
  }, [feishuConfig])

  const performHealthCheck = useCallback(async (auth) => {
    setLoading(true)
    const { server, token, username, password } = auth
    try {
      const response = await ofetch.raw("v1/me", {
        baseURL: server,
        headers: token
          ? { "X-Auth-Token": token }
          : { Authorization: `Basic ${btoa(`${username}:${password}`)}` },
      })
      if (response.status === 200) {
        Notification.success({ title: polyglot.t("login.success") })
        setAuth({ server, token, username, password })
        navigate(redirectTo || `/${homePage}`, { replace: true })
      }
    } catch (error) {
      console.error(error)
      Notification.error({ title: polyglot.t("login.error"), content: error.message })
    }
    setLoading(false)
  }, [polyglot, navigate, redirectTo, homePage])

  const handleLogin = useCallback(async (auth) => {
    if (!isValidAuth(auth)) {
      Message.error(polyglot.t("login.auth_error"))
      return
    }
    await performHealthCheck(auth)
  }, [polyglot, performHealthCheck])

  useEffect(() => {
    const url = new URL(globalThis.location.href)
    const { server, token, username, password } = Object.fromEntries(url.searchParams)
    if (server) {
      loginForm.setFieldsValue({ server, token, username, password })
      loginForm.submit()
    }
  }, [loginForm, polyglot])

  if (!polyglot) return null

  if (isValidAuth(auth)) {
    return <Navigate to={redirectTo || `/${homePage}`} />
  }

  const minifluxFormBlock = (
    <>
      <Form
        autoComplete="off"
        form={loginForm}
        layout="vertical"
        onSubmit={async () => {
          if (validateAndFormatFormFields(loginForm)) {
            history.replaceState(history.state, "", "/login")
            await handleLogin(loginForm.getFieldsValue())
          } else {
            Message.error(polyglot.t("login.submit_error"))
          }
        }}
      >
        <Form.Item
          field="server"
          label={polyglot.t("login.server_label")}
          rules={[{ required: true }]}
          onKeyDown={(e) => handleEnterKeyToSubmit(e, loginForm)}
        >
          <Input
            disabled={loading}
            placeholder={polyglot.t("login.server_placeholder")}
            prefix={<IconHome />}
          />
        </Form.Item>
        {authMethod === "token" && (
          <Form.Item
            field="token"
            label={polyglot.t("login.token_label")}
            rules={[{ required: true }]}
            onKeyDown={(e) => handleEnterKeyToSubmit(e, loginForm)}
          >
            <Input.Password
              disabled={loading}
              placeholder={polyglot.t("login.token_placeholder")}
              prefix={<IconLock />}
            />
          </Form.Item>
        )}
        {authMethod === "user" && (
          <>
            <Form.Item
              field="username"
              label={polyglot.t("login.username_label")}
              rules={[{ required: true }]}
              onKeyDown={(e) => handleEnterKeyToSubmit(e, loginForm)}
            >
              <Input
                disabled={loading}
                placeholder={polyglot.t("login.username_placeholder")}
                prefix={<IconUser />}
              />
            </Form.Item>
            <Form.Item
              field="password"
              label={polyglot.t("login.password_label")}
              rules={[{ required: true }]}
              onKeyDown={(e) => handleEnterKeyToSubmit(e, loginForm)}
            >
              <Input.Password
                disabled={loading}
                placeholder={polyglot.t("login.password_placeholder")}
                prefix={<IconLock />}
              />
            </Form.Item>
          </>
        )}
      </Form>
      <Button
        loading={loading}
        long
        style={{ marginTop: 20 }}
        type="primary"
        onClick={() => loginForm.submit()}
      >
        {polyglot.t("login.login_button")}
      </Button>
      <Button
        long
        style={{ marginTop: 12 }}
        type="secondary"
        onClick={() => setAuthMethod(authMethod === "token" ? "user" : "token")}
      >
        {authMethod === "token" ? polyglot.t("login.another_login_button") : polyglot.t("login.token_label")}
      </Button>
    </>
  )

  return (
    polyglot && (
      <div className="page-layout">
        <div className="form-panel">
          <div className="login-form">
            <Typography.Title heading={3}>
              {polyglot.t("login.login_to_your_server")}
            </Typography.Title>

            {feishuConfigLoading && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <Spin size={40} />
                <div style={{ marginTop: 16 }}>{polyglot.t("login.feishu_loading")}</div>
              </div>
            )}

            {!feishuConfigLoading && feishuConfig && !showMinifluxForm && (
              <>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <Typography.Text type="secondary">{polyglot.t("login.feishu_scan")}</Typography.Text>
                </div>
                <div
                  id={FEISHU_QR_CONTAINER_ID}
                  style={{ display: "flex", justifyContent: "center", minHeight: 260 }}
                />
                <Divider>{polyglot.t("login.another_login_method")}</Divider>
                <Button long type="secondary" onClick={() => setShowMinifluxForm(true)}>
                  {polyglot.t("login.miniflux_login_fallback")}
                </Button>
              </>
            )}

            {(!feishuConfig || showMinifluxForm) && !feishuConfigLoading && (
              <>
                {showMinifluxForm && (
                  <Button
                    long
                    type="text"
                    style={{ marginBottom: 12 }}
                    onClick={() => setShowMinifluxForm(false)}
                  >
                    ← {polyglot.t("login.back_to_feishu")}
                  </Button>
                )}
                {minifluxFormBlock}
              </>
            )}

            <div style={{ display: "flex", marginTop: 40 }}>
              <Typography.Text disabled>{polyglot.t("login.need_help")}</Typography.Text>
              <Link href="https://miniflux.app/docs/api.html#authentication" style={{ fontWeight: 500 }}>
                {polyglot.t("login.miniflux_official_website")}
              </Link>
            </div>
          </div>
        </div>
        <div className="background" />
      </div>
    )
  )
}

export default Login
