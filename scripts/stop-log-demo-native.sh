#!/usr/bin/env bash
set -euo pipefail
DATA_DIR="${AGENTFIELD_LOG_DEMO_DATA:-/tmp/agentfield-log-demo}"

stop_pid() {
  local pid="$1"
  if kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}" 2>/dev/null || true
    sleep 1
    if kill -0 "${pid}" 2>/dev/null; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
  fi
}

for f in cp.pid demo-python.pid demo-go.pid demo-ts.pid; do
  p="${DATA_DIR}/${f}"
  if [[ -f "${p}" ]]; then
    pid="$(cat "${p}")"
    if [[ -n "${pid}" ]]; then
      stop_pid "${pid}"
      echo "Stopped PID ${pid} (${f})"
    fi
    rm -f "${p}"
  fi
done

for port in 8080 8180 8001 8002 8003; do
  if command -v lsof >/dev/null 2>&1; then
    while read -r pid; do
      [[ -n "${pid}" ]] || continue
      stop_pid "${pid}"
      echo "Stopped PID ${pid} (port ${port})"
    done < <(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)
  fi
done

echo "Done."
