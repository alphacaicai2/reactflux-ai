# Feishu QR Code Login Setup

This app supports Feishu (Lark) QR code login. Only users in the configured organization can log in.

## 1. Create a Feishu App

1. Go to [Feishu Open Platform](https://open.feishu.cn/app/) and create a **custom app** (自建应用).
2. Note your **App ID** and **App Secret** (under "Credentials & Basic Info").
3. Under **Security Settings** (安全设置), add a **Redirect URL**:
   - Production: `https://news.vibexcap.com/login/feishu/callback`
   - Local dev: `http://localhost:5173/login/feishu/callback` (or your dev origin).
4. Under **Permissions** (权限管理), add at least:
   - `contact:user.base:readonly` (to get user name, avatar, etc.).
5. Publish the app within your organization (only members of that org can log in).

## 2. Get Your Tenant Key (Organization ID)

- In the Feishu admin console, or after the first successful login, you can see the `tenant_key` in the backend response. Use it to restrict login to that organization only.

## 3. Configure Environment Variables

Set these for the **backend** (e.g. in `.env` or Docker environment):

| Variable | Description |
|----------|-------------|
| `FEISHU_APP_ID` | Your app's App ID (e.g. `cli_xxxxx`) |
| `FEISHU_APP_SECRET` | Your app's App Secret |
| `FEISHU_REDIRECT_URI` | Exact redirect URL (must match the one in Feishu console), e.g. `https://news.vibexcap.com/login/feishu/callback` |
| `FEISHU_ALLOWED_TENANT_KEYS` | Comma-separated tenant keys; only users from these orgs can log in. Leave empty to allow any Feishu user. |

Example (Docker env or host `.env` used by `docker compose`):

```bash
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
FEISHU_REDIRECT_URI=https://news.vibexcap.com/login/feishu/callback
FEISHU_ALLOWED_TENANT_KEYS=your_tenant_key_here
```

## 4. Miniflux Configuration

Feishu login uses a **shared** Miniflux backend. Ensure Miniflux is configured in the app (e.g. via Settings or the existing `miniflux_config` table / Miniflux settings in the UI). All Feishu users will use the same Miniflux server and API token after logging in.

## 5. Disable Feishu Login

If `FEISHU_APP_ID` or `FEISHU_REDIRECT_URI` is not set, the login page will only show the Miniflux token/password form.
