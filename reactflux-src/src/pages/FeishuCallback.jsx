import { Message, Spin, Typography } from "@arco-design/web-react"
import { useStore } from "@nanostores/react"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"

import useLanguage, { polyglotState } from "@/hooks/useLanguage"
import useTheme from "@/hooks/useTheme"
import { settingsState } from "@/store/settingsState"
import { setAuth } from "@/store/authState"

const FeishuCallback = () => {
  useLanguage()
  useTheme()

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { polyglot } = useStore(polyglotState)
  const { homePage } = useStore(settingsState)
  const [error, setError] = useState(null)

  useEffect(() => {
    const code = searchParams.get("code")
    const stateParam = searchParams.get("state")
    if (!code) {
      setError("Missing authorization code")
      return
    }

    try {
      const savedState = sessionStorage.getItem("feishu_oauth_state")
      if (savedState && stateParam !== savedState) {
        setError("Invalid OAuth state — possible CSRF. Please try logging in again.")
        return
      }
      sessionStorage.removeItem("feishu_oauth_state")
    } catch {}

    let cancelled = false
    fetch("/api/auth/feishu/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          const { session, user, miniflux } = res.data
          setAuth({
            server: miniflux?.server ?? "",
            token: miniflux?.token ?? "",
            username: "",
            password: "",
            sessionToken: session?.token ?? "",
            feishuUser: user ? { name: user.name, avatar: user.avatar, openId: user.openId } : null,
          })
          navigate(`/${homePage}`, { replace: true })
        } else {
          const msg = res.error === "ORG_DENIED" ? polyglot?.t("login.feishu_org_denied") : res.error || "Login failed"
          setError(msg)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Request failed")
      })

    return () => { cancelled = true }
  }, [searchParams, navigate, homePage])

  if (error) {
    return (
      <div className="page-layout" style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Message type="error" content={error} style={{ marginBottom: 16 }} />
          <a href="/login">{polyglot?.t("login.back_to_login") ?? "Back to login"}</a>
        </div>
      </div>
    )
  }

  return (
    <div className="page-layout" style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <Spin size={40} />
        <Typography.Text block style={{ marginTop: 16 }}>
          {polyglot?.t("login.feishu_callback_processing") ?? "Processing login..."}
        </Typography.Text>
      </div>
    </div>
  )
}

export default FeishuCallback
