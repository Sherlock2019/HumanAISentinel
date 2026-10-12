#!/usr/bin/env bash
set -e
exec "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/agentsentinel/stop.sh" "$@"
