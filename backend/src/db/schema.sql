-- AI Configuration Table
CREATE TABLE IF NOT EXISTS ai_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  api_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  model TEXT,
  extra_config TEXT,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Digests Table (updated schema with more fields)
CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT DEFAULT 'all',           -- 'all', 'feed', 'group'
  scope_id INTEGER,                   -- feed_id or category_id
  scope_name TEXT,                    -- display name for scope
  article_count INTEGER DEFAULT 0,    -- number of articles in digest
  hours INTEGER DEFAULT 24,           -- time range in hours (12, 24, 72, 168, 0 for all)
  target_lang TEXT DEFAULT 'zh-CN',   -- target language for digest
  is_read INTEGER DEFAULT 0,          -- read status
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Tasks Table (for digest scheduling)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- task name for display
  scope TEXT NOT NULL,                -- 'all', 'feed', 'group'
  scope_id INTEGER,                   -- feed_id or category_id
  scope_name TEXT,                    -- display name for scope
  hours INTEGER DEFAULT 24,           -- time range in hours
  target_lang TEXT DEFAULT 'zh-CN',   -- target language
  unread_only INTEGER DEFAULT 1,      -- only include unread articles
  push_enabled INTEGER DEFAULT 0,     -- enable push notification
  push_config TEXT,                   -- JSON: { url, method, body }
  cron_expression TEXT NOT NULL,      -- cron expression for schedule
  timezone TEXT DEFAULT 'Asia/Shanghai', -- timezone for schedule
  is_active INTEGER DEFAULT 1,        -- task enabled status
  last_run_at DATETIME,               -- last execution time
  next_run_at DATETIME,               -- next scheduled time
  last_error TEXT,                    -- last error message
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Miniflux Configuration Table
CREATE TABLE IF NOT EXISTS miniflux_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT 'default',
  api_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_config_provider ON ai_config(provider);
CREATE INDEX IF NOT EXISTS idx_digests_created_at ON digests(created_at);
CREATE INDEX IF NOT EXISTS idx_digests_scope ON digests(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_digests_is_read ON digests(is_read);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_is_active ON scheduled_tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at);
