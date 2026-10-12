#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
export SENTINEL_API_PORT="${SENTINEL_API_PORT:-8100}"
export SENTINEL_UI_PORT="${SENTINEL_UI_PORT:-5174}"
for name in SENTINEL_API_PORT SENTINEL_UI_PORT; do
  value="${!name}"
  if [[ ! "$value" =~ ^[0-9]{1,5}$ ]] || (( 10#$value < 1 || 10#$value > 65535 )); then
    echo "$name must be a port number from 1 to 65535."
    exit 1
  fi
done
if (( 10#$SENTINEL_API_PORT == 10#$SENTINEL_UI_PORT )); then
  echo 'Backend and dashboard ports must be different.'
  exit 1
fi
SENTINEL_API_PORT=$((10#$SENTINEL_API_PORT))
SENTINEL_UI_PORT=$((10#$SENTINEL_UI_PORT))
for command in python3 node npm curl setsid; do
  command -v "$command" >/dev/null || { echo "Missing dependency: $command"; exit 1; }
done
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ is required"'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<20 || (major===20 && minor<19)){console.error("Node.js 20.19+ is required");process.exit(1)}'
echo 'Restarting AgentSentinel (existing demo data and audit evidence are preserved).'
"$ROOT/stop.sh"
for port in "$SENTINEL_API_PORT" "$SENTINEL_UI_PORT"; do
  python3 -c "import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(('127.0.0.1', $port)); s.close()" 2>/dev/null || { echo "Port $port is occupied by an untracked or unrelated process. It was not stopped; stop its owner and retry."; exit 1; }
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
backend_pid=''
frontend_pid=''
cleanup() {
  trap - EXIT INT TERM
  for service in backend frontend; do
    file="$ROOT/.run/$service.pid"
    pid_var="${service}_pid"
    pid="${!pid_var}"
    [[ -n "$pid" ]] || continue
    if kill -0 "$pid" 2>/dev/null; then kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; fi
    # An older launcher must never stop a replacement run or remove its PID files.
    if [[ -f "$file" ]] && [[ "$(<"$file")" == "$pid" ]]; then
      rm -f -- "$file"
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'cleanup; exit 0' INT TERM
command -v setsid >/dev/null || { echo 'setsid is required (standard Linux util-linux).'; exit 1; }
setsid .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$SENTINEL_API_PORT" > .run/backend.log 2>&1 &
backend_pid=$!
printf '%s\n' "$backend_pid" > .run/backend.pid
healthy=0
for attempt in {1..60}; do
  if curl -fsS "http://127.0.0.1:$SENTINEL_API_PORT/health" >/dev/null 2>&1; then healthy=1; break; fi
  if ! kill -0 "$backend_pid" 2>/dev/null; then tail -30 .run/backend.log; exit 1; fi
  sleep 0.5
done
[[ "$healthy" == 1 ]] || { echo 'Backend failed readiness check. See .run/backend.log'; exit 1; }
export SENTINEL_API_TARGET="http://127.0.0.1:$SENTINEL_API_PORT"
setsid npm --prefix frontend run dev -- --host 127.0.0.1 --port "$SENTINEL_UI_PORT" --strictPort > .run/frontend.log 2>&1 &
frontend_pid=$!
printf '%s\n' "$frontend_pid" > .run/frontend.pid
ready=0
for attempt in {1..60}; do
  if curl -fsS "http://127.0.0.1:$SENTINEL_UI_PORT" >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$frontend_pid" 2>/dev/null; then tail -30 .run/frontend.log; exit 1; fi
  sleep 0.5
done
[[ "$ready" == 1 ]] || { echo 'Frontend failed readiness check. See .run/frontend.log'; exit 1; }
printf '\n================================================\n       AGENTSENTINEL IS RUNNING\n================================================\nDashboard: http://localhost:%s\nFastAPI:   http://localhost:%s\nAPI Docs:  http://localhost:%s/docs\nHealth:    http://localhost:%s/health\nPress Ctrl+C to stop.\n================================================\n' "$SENTINEL_UI_PORT" "$SENTINEL_API_PORT" "$SENTINEL_API_PORT" "$SENTINEL_API_PORT"
wait -n
