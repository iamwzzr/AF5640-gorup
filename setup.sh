#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "请先安装 Node.js 22.12+ 或 24 LTS（包含 npm）。"
  exit 1
fi

if [ ! -x backend/.venv/bin/python ]; then
  AF5640_PYTHON_BIN="${AF5640_PYTHON:-}"
  if [ -z "$AF5640_PYTHON_BIN" ]; then
    for candidate in python3.12 python3.13 python3.11 python3.14 python3; do
      if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' 2>/dev/null; then
        AF5640_PYTHON_BIN="$(command -v "$candidate")"
        break
      fi
    done
  fi
  if [ -z "$AF5640_PYTHON_BIN" ]; then
    runtime_python="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
    if [ -x "$runtime_python" ]; then AF5640_PYTHON_BIN="$runtime_python"; fi
  fi
  if [ -z "$AF5640_PYTHON_BIN" ]; then
    echo "请安装 Python 3.12，或设置 AF5640_PYTHON=/完整路径/python3。"
    exit 1
  fi
  "$AF5640_PYTHON_BIN" -m venv backend/.venv
fi

mkdir -p .cache/pip .cache/npm
backend/.venv/bin/python -m pip install --cache-dir "$PROJECT_ROOT/.cache/pip" -r backend/requirements.lock.txt
npm --prefix frontend ci --cache "$PROJECT_ROOT/.cache/npm" --no-audit --no-fund
npm --prefix frontend run build
echo "安装完成。运行 ./start.sh 后打开 http://127.0.0.1:8000"
