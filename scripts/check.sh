#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ ! -x backend/.venv/bin/python ] || [ ! -d frontend/node_modules ]; then
  echo "请先运行 ./setup.sh 安装项目依赖。"
  exit 1
fi

bash -n setup.sh start.sh dev.sh start.command scripts/check.sh
(cd backend && .venv/bin/python -m unittest discover -s tests -v)
npm --prefix frontend test
npm --prefix frontend run build
echo "业务回归、HTTP接口、报告导出、脚本语法及前端构建检查通过。"
