#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
for command in python3 node npm curl setsid; do
  command -v "$command" >/dev/null || { echo "Missing dependency: $command"; exit 1; }
done
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ is required"'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<20 || (major===20 && minor<19)){console.error("Node.js 20.19+ is required");process.exit(1)}'
for port in 8000 5173; do
  python3 -c "import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1', $port)); s.close()" 2>/dev/null || { echo "Port $port is already in use. Stop its owner or run ./stop.sh for AgentSentinel."; exit 1; }
done
mkdir -p .run data
[[ -f .env ]] || cp .env.example .env
[[ -d .venv ]] || python3 -m venv .venv
source .venv/bin/activate
DEPS_HASH="$(sha256sum backend/requirements.txt | cut -d' ' -f1)"
if [[ ! -f .run/python-deps.hash ]] || [[ "$(<.run/python-deps.hash)" != "$DEPS_HASH" ]]; then
  python -m pip install -r backend/requirements.txt
  printf '%s' "$DEPS_HASH" > .run/python-deps.hash
fi
NPM_HASH="$(sha256sum frontend/package.json frontend/package-lock.json 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [[ ! -d frontend/node_modules ]] || [[ ! -f .run/npm-deps.hash ]] || [[ "$(<.run/npm-deps.hash)" != "$NPM_HASH" ]]; then
  (cd frontend; if [[ -f package-lock.json ]]; then npm ci; else npm install; fi)
  sha256sum frontend/package.json frontend/package-lock.json | sha256sum | cut -d' ' -f1 > .run/npm-deps.hash
fi
python scripts/seed_demo.py
cleanup() {
  trap - EXIT INT TERM
  for service in backend frontend; do
    file="$ROOT/.run/$service.pid"
    if [[ -f "$file" ]]; then
      read -r pid < "$file"
      if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; fi
      rm -f -- "$file"
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'cleanup; exit 0' INT TERM
command -v setsid >/dev/null || { echo 'setsid is required (standard Linux util-linux).'; exit 1; }
setsid .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 > .run/backend.log 2>&1 &
printf '%s\n' "$!" > .run/backend.pid
healthy=0
for attempt in {1..60}; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then healthy=1; break; fi
  if ! kill -0 "$(<.run/backend.pid)" 2>/dev/null; then tail -30 .run/backend.log; exit 1; fi
  sleep 0.5
done
[[ "$healthy" == 1 ]] || { echo 'Backend failed readiness check. See .run/backend.log'; exit 1; }
setsid npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort > .run/frontend.log 2>&1 &
printf '%s\n' "$!" > .run/frontend.pid
ready=0
for attempt in {1..60}; do
  if curl -fsS http://127.0.0.1:5173 >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$(<.run/frontend.pid)" 2>/dev/null; then tail -30 .run/frontend.log; exit 1; fi
  sleep 0.5
done
[[ "$ready" == 1 ]] || { echo 'Frontend failed readiness check. See .run/frontend.log'; exit 1; }
printf '\n================================================\n       AGENTSENTINEL IS RUNNING\n================================================\nDashboard: http://localhost:5173\nFastAPI:   http://localhost:8000\nAPI Docs:  http://localhost:8000/docs\nHealth:    http://localhost:8000/health\nPress Ctrl+C to stop.\n================================================\n'
wait -n
