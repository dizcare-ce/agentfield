#!/usr/bin/env bash
set -euo pipefail

CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-http://localhost:8080}"
NODE_ID="${NODE_ID:-pr-review-bot}"
TARGET="${TARGET:-${NODE_ID}.review_pr}"
REQUEST_BODY='{"input": {"pr_number": 1138}}'

extract_execution_id() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.execution_id // empty'
  else
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("execution_id",""))'
  fi
}

wait_for_url() {
  local label="$1"
  local url="$2"
  for _attempt in $(seq 1 60); do
    if curl -sf "$url" >/dev/null; then
      printf '✓ %s is ready\n' "$label"
      return 0
    fi
    sleep 1
  done

  printf 'Timed out waiting for %s: %s\n' "$label" "$url" >&2
  exit 1
}

echo "AgentField HITL end-to-end launcher"
echo "This waits for the control plane and pr-review-bot agent, then triggers the PR review workflow."
echo

wait_for_url "control plane" "${CONTROL_PLANE_URL}/health"
wait_for_url "agent node ${NODE_ID}" "${CONTROL_PLANE_URL}/api/v1/nodes/${NODE_ID}"

echo "Triggering workflow with:"
echo "curl -s -X POST ${CONTROL_PLANE_URL}/api/v1/execute/${TARGET} -H \"Content-Type: application/json\" -d '${REQUEST_BODY}'"
echo

response="$(curl -s -X POST "${CONTROL_PLANE_URL}/api/v1/execute/${TARGET}" -H "Content-Type: application/json" -d "${REQUEST_BODY}")"
execution_id="$(printf '%s' "$response" | extract_execution_id)"

if [[ -z "$execution_id" ]]; then
  echo "Failed to extract execution_id from response:" >&2
  printf '%s\n' "$response" >&2
  exit 1
fi

printf '✓ Workflow launched. execution_id=%s\n\n' "$execution_id"
echo "→ Open ${CONTROL_PLANE_URL}/hitl in your browser to respond to the form."
echo "→ Or watch the agent logs: docker compose logs -f hitl-example-agent"
