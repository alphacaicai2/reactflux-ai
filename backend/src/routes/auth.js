import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { getMinifluxCredentials } from '../utils/miniflux.js';

const auth = new Hono();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const FEISHU_REDIRECT_URI = process.env.FEISHU_REDIRECT_URI || '';
const FEISHU_ALLOWED_TENANT_KEYS = (process.env.FEISHU_ALLOWED_TENANT_KEYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SESSION_TTL_DAYS = 7;

let cachedAppAccessToken = null;
let cachedAppTokenExpiry = 0;

async function getFeishuAppAccessToken() {
  if (cachedAppAccessToken && Date.now() < cachedAppTokenExpiry) {
    return cachedAppAccessToken;
  }
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (data.app_access_token) {
    cachedAppAccessToken = data.app_access_token;
    cachedAppTokenExpiry = Date.now() + (data.expire || 7200) * 1000;
    return cachedAppAccessToken;
  }
  throw new Error(data.msg || 'Failed to get Feishu app_access_token');
}

async function exchangeCodeForUserToken(code) {
  const appToken = await getFeishuAppAccessToken();
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appToken}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
    }),
  });
  const data = await res.json();
  if (data.code !== 0 && data.code !== undefined) {
    throw new Error(data.msg || 'Failed to exchange code for user token');
  }
  return data.data || data;
}

/**
 * GET /api/auth/feishu/config
 * Public config for frontend QR SDK (no secret).
 */
auth.get('/feishu/config', (c) => {
  if (!FEISHU_APP_ID || !FEISHU_REDIRECT_URI) {
    return c.json({ success: false, error: 'Feishu login is not configured' }, 503);
  }
  return c.json({
    success: true,
    data: {
      appId: FEISHU_APP_ID,
      redirectUri: FEISHU_REDIRECT_URI,
    },
  });
});

function cleanupExpiredSessions() {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  } catch {}
}

/**
 * POST /api/auth/feishu/callback
 * Exchange Feishu code for session and return user + Miniflux credentials.
 */
auth.post('/feishu/callback', async (c) => {
  try {
    cleanupExpiredSessions();
    const body = await c.req.json().catch(() => ({}));
    const { code } = body;
    if (!code) {
      return c.json({ success: false, error: 'Missing code' }, 400);
    }

    const tokenData = await exchangeCodeForUserToken(code);
    const tenantKey = tokenData.tenant_key;
    const openId = tokenData.open_id;
    const unionId = tokenData.union_id;
    const userId = tokenData.user_id;
    const name = tokenData.name || tokenData.en_name || openId;
    const avatarUrl = tokenData.avatar_url || '';
    const email = tokenData.email || '';

    if (FEISHU_ALLOWED_TENANT_KEYS.length > 0 && !FEISHU_ALLOWED_TENANT_KEYS.includes(tenantKey)) {
      return c.json({ success: false, error: 'ORG_DENIED' }, 403);
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO users (feishu_open_id, feishu_union_id, feishu_user_id, name, avatar_url, email, tenant_key, last_login_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(feishu_open_id) DO UPDATE SET
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         email = excluded.email,
         tenant_key = excluded.tenant_key,
         last_login_at = excluded.last_login_at,
         updated_at = excluded.updated_at`
    ).run(openId, unionId || null, userId || null, name, avatarUrl, email || null, tenantKey || null, now, now);

    const userRow = db.prepare('SELECT id FROM users WHERE feishu_open_id = ?').get(openId);

    const sessionToken = randomUUID();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      sessionToken,
      userRow.id,
      expiresAt
    );

    const miniflux = getMinifluxCredentials();
    if (!miniflux) {
      return c.json({
        success: false,
        error: 'Miniflux is not configured. Please configure Miniflux in settings first.',
      }, 503);
    }

    return c.json({
      success: true,
      data: {
        session: { token: sessionToken, expiresAt },
        user: { name, avatar: avatarUrl, openId },
        miniflux: { server: miniflux.apiUrl, token: miniflux.apiKey },
      },
    });
  } catch (err) {
    console.error('Feishu callback error:', err);
    return c.json(
      { success: false, error: err.message || 'Login failed' },
      500
    );
  }
});

/**
 * GET /api/auth/session
 * Validate session token (Authorization: Bearer <token>) and return user info.
 */
auth.get('/session', (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ success: false, error: 'Missing token' }, 401);
  }

  cleanupExpiredSessions();
  const now = new Date().toISOString();
  const row = db.prepare(
    'SELECT s.token, s.expires_at, u.id as user_id, u.name, u.avatar_url, u.feishu_open_id FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1'
  ).get(token, now);

  if (!row) {
    return c.json({ success: false, error: 'Invalid or expired session' }, 401);
  }

  return c.json({
    success: true,
    data: {
      user: { name: row.name, avatar: row.avatar_url, openId: row.feishu_open_id },
    },
  });
});

/**
 * POST /api/auth/logout
 * Invalidate session (Authorization: Bearer <token>).
 */
auth.post('/logout', (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  return c.json({ success: true });
});

export default auth;
