#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"
if [ ! -x backend/.venv/bin/python ] || [ ! -f frontend/node_modules/vite/bin/vite.js ]; then
  echo "请先运行 ./setup.sh。"
  exit 1
fi
backend_pid=""
frontend_pid=""
cleanup() {
  if [ -n "$frontend_pid" ]; then kill "$frontend_pid" 2>/dev/null || true; fi
  if [ -n "$backend_pid" ]; then kill "$backend_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM
(cd backend && exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
backend_pid=$!
(cd frontend && exec node node_modules/vite/bin/vite.js --host 127.0.0.1) &
frontend_pid=$!
echo "开发界面：http://127.0.0.1:5173；后端：http://127.0.0.1:8000"
wait "$backend_pid" "$frontend_pid"
