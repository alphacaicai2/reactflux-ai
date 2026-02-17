#!/bin/bash

# ===========================================
# ReactFlux AI 一键部署脚本
# ===========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 未安装，请先安装 $1"
        exit 1
    fi
}

# 检查依赖
check_dependencies() {
    print_info "检查依赖..."

    check_command docker
    check_command docker

    # 检查 Docker Compose 版本
    if docker compose version &> /dev/null; then
        print_success "Docker Compose v2 已安装"
    elif command -v docker-compose &> /dev/null; then
        print_warning "检测到 docker-compose (v1)，建议升级到 Docker Compose v2"
        COMPOSE_CMD="docker-compose"
    else
        print_error "Docker Compose 未安装"
        exit 1
    fi

    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        print_error "Docker 未运行，请先启动 Docker"
        exit 1
    fi

    print_success "所有依赖检查通过"
}

# 创建 .env 文件（如果不存在）
setup_env() {
    if [ ! -f .env ]; then
        print_info "创建 .env 文件..."
        cp .env.example .env
        print_success ".env 文件已创建"
    else
        print_info ".env 文件已存在，跳过创建"
    fi
}

# 构建镜像
build_images() {
    print_info "构建 Docker 镜像..."
    $COMPOSE_CMD build --no-cache
    print_success "镜像构建完成"
}

# 启动服务
start_services() {
    print_info "启动服务..."
    $COMPOSE_CMD up -d
    print_success "服务已启动"
}

# 显示服务状态
show_status() {
    print_info "服务状态:"
    $COMPOSE_CMD ps
}

# 显示访问信息
show_info() {
    echo ""
    echo -e "${GREEN}===========================================${NC}"
    echo -e "${GREEN}  ReactFlux AI 部署完成！${NC}"
    echo -e "${GREEN}===========================================${NC}"
    echo ""
    echo -e "前端地址: ${BLUE}http://localhost:${FRONTEND_PORT:-2000}${NC}"
    echo -e "AI 后端:  ${BLUE}http://localhost:${AI_BACKEND_PORT:-3001}${NC}"
    echo ""
    echo "常用命令:"
    echo "  查看日志:   docker compose logs -f"
    echo "  停止服务:   docker compose down"
    echo "  重启服务:   docker compose restart"
    echo ""
}

# 主函数
main() {
    echo -e "${BLUE}"
    echo "==========================================="
    echo "  ReactFlux AI 一键部署脚本"
    echo "==========================================="
    echo -e "${NC}"

    # 设置 Compose 命令
    COMPOSE_CMD="docker compose"

    # 执行部署步骤
    check_dependencies
    setup_env

    # 检查是否需要重新构建
    if [ "$1" == "--rebuild" ] || [ "$1" == "-r" ]; then
        build_images
    fi

    start_services
    show_status
    show_info
}

# 帮助信息
show_help() {
    echo "ReactFlux AI 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help      显示帮助信息"
    echo "  -r, --rebuild   强制重新构建镜像"
    echo ""
    echo "示例:"
    echo "  $0              # 使用现有镜像启动"
    echo "  $0 --rebuild    # 重新构建镜像后启动"
}

# 解析参数
case "$1" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
