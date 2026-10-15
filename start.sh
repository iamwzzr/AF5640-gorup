#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"
if [ ! -x backend/.venv/bin/python ] || [ ! -f frontend/dist/index.html ]; then
  echo "请先运行 ./setup.sh 完成依赖安装与界面构建。"
  exit 1
fi
AF5640_PORT="${AF5640_PORT:-8000}"
echo "AF5640-gorup 正在启动：http://127.0.0.1:${AF5640_PORT}"
echo "在终端按 Ctrl+C 停止。"
cd backend
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$AF5640_PORT"
