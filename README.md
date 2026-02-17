# ReactFlux AI

ReactFlux AI 是一个集成了 AI 功能的 RSS 阅读器，基于 [ReactFlux](https://github.com/electh/ReactFlux) 构建，增加了智能文章摘要、翻译和对话功能。

## 功能列表

### ReactFlux 核心功能
- 完整的 RSS/Atom 订阅管理
- 多平台支持（Web、PWA）
- Miniflux 后端集成
- OPML 导入/导出
- 主题定制
- 键盘快捷键支持
- 响应式设计

### AI 增强功能
- **智能摘要**: 一键生成文章摘要，快速了解核心内容
- **文章翻译**: 支持多语言翻译
- **AI 对话**: 与 AI 讨论文章内容，深入理解
- **本地存储**: 所有 AI 配置和对话历史存储在本地

## 快速开始

### 前置要求
- Docker 20.10+
- Docker Compose v2+

### 一键部署

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd reactflux-ai
   ```

2. **配置环境变量**（可选）
   ```bash
   cp .env.example .env
   # 根据需要修改 .env 文件
   ```

3. **启动服务**
   ```bash
   docker compose up -d
   ```

4. **访问应用**
   - 前端: http://localhost:2000
   - AI 后端 API: http://localhost:3001

### 使用部署脚本

```bash
# Linux/macOS
chmod +x deploy.sh
./deploy.sh

# Windows (Git Bash)
bash deploy.sh
```

## 配置说明

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `AI_BACKEND_PORT` | AI 后端服务端口 | `3001` |
| `FRONTEND_PORT` | 前端服务端口 | `2000` |
| `AI_DB_PATH` | SQLite 数据库路径 | `/app/data/reactflux.db` |
| `CORS_ORIGIN` | CORS 允许的源 | `*` |
| `NODE_ENV` | 运行环境 | `production` |

### Miniflux 集成（可选）

如果你想使用 Miniflux 作为 RSS 后端：

1. 取消 `.env` 文件中 Miniflux 相关配置的注释
2. 填入你的 Miniflux 服务器地址和 API 密钥

```env
MINIFLUX_URL=https://your-miniflux-server.com
MINIFLUX_API_KEY=your_api_key
```

### 数据持久化

数据通过 Docker Volume 进行持久化：

- `reactflux-ai-data`: 存储 AI 后端的 SQLite 数据库

## 项目结构

```
reactflux-ai/
├── backend/              # AI 后端服务
│   ├── src/
│   │   ├── index.js      # 入口文件
│   │   ├── routes/       # API 路由
│   │   ├── services/     # 业务逻辑
│   │   ├── utils/        # 工具函数
│   │   └── db/           # 数据库配置
│   ├── Dockerfile
│   └── package.json
├── reactflux-src/        # ReactFlux 前端源码
│   ├── src/
│   ├── Dockerfile
│   └── Caddyfile
├── docker/               # Docker 配置文件
├── docker-compose.yml    # Docker Compose 配置
├── .env.example          # 环境变量示例
├── deploy.sh             # 一键部署脚本
└── README.md
```

## 开发指南

### 本地开发

**后端开发**
```bash
cd backend
npm install
npm run dev
```

**前端开发**
```bash
cd reactflux-src
pnpm install
pnpm dev
```

### 构建镜像

```bash
# 构建所有服务
docker compose build

# 仅构建前端
docker compose build reactflux

# 仅构建后端
docker compose build reactflux-ai
```

### 查看日志

```bash
# 查看所有日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f reactflux-ai
```

### 停止服务

```bash
# 停止但保留数据
docker compose down

# 停止并删除数据
docker compose down -v
```

## API 端点

### AI 后端 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/ai/config` | GET/PUT | AI 配置管理 |
| `/api/ai/summarize` | POST | 文章摘要 |
| `/api/ai/translate` | POST | 文章翻译 |
| `/api/ai/chat` | POST | AI 对话 |
| `/api/ai/chat/history` | GET | 对话历史 |

## 技术栈

- **前端**: React, Vite, TypeScript, Tailwind CSS
- **后端**: Node.js, Hono, better-sqlite3
- **Web 服务器**: Caddy
- **容器化**: Docker, Docker Compose

## 许可证

本项目基于 ReactFlux（遵循其原始许可证）构建，AI 增强功能采用 MIT 许可证。

## 致谢

- [ReactFlux](https://github.com/electh/ReactFlux) - 优秀的 RSS 阅读器项目
