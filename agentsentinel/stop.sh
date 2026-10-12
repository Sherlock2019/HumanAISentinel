#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for service in backend frontend; do
  file="$ROOT/.run/$service.pid"
  [[ -f "$file" ]] || continue
  read -r pid < "$file"
  if [[ "$pid" =~ ^[0-9]+$ ]] && [[ -r "/proc/$pid/cmdline" ]]; then
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
    cwd="$(readlink "/proc/$pid/cwd")"
    if [[ "$cwd" == "$ROOT" ]] && [[ "$cmd" == *uvicorn* || "$cmd" == *npm* ]]; then
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      for attempt in {1..100}; do
        kill -0 -- "-$pid" 2>/dev/null || break
        sleep 0.1
      done
      if kill -0 -- "-$pid" 2>/dev/null; then
        echo "AgentSentinel $service did not exit gracefully; stopping its owned process group."
        kill -KILL -- "-$pid" 2>/dev/null || true
      fi
      echo "Stopped AgentSentinel $service."
    else
      echo "Skipping stale PID $pid: ownership check failed."
    fi
  fi
  # A retiring launcher may already have removed this file; do not remove a replacement.
  if [[ -f "$file" ]] && [[ "$(<"$file")" == "$pid" ]]; then
    rm -f -- "$file"
  fi
done
