#!/usr/bin/env bash
# End-to-end test driver for the native HITL forms demo.
#
# Assumes you've already started the stack in another terminal with:
#     docker compose --profile hitl up --build
#
# What this script does:
#   1. Waits for the control plane at localhost:8080 to be reachable
#   2. Waits for the pr-review-bot agent to be registered
#   3. Fires a reasoner execution (POST /api/v1/execute/pr-review-bot.review_pr)
#   4. Prints the execution_id and tells you to open http://localhost:8080/hitl
#
# The agent will pause on `app.pause(form_schema=...)`. You respond via the
# portal at /hitl, and the agent resumes with your submitted values — visible
# in `docker compose logs -f hitl-example-agent`.

set -euo pipefail

BASE_URL="${AGENTFIELD_URL:-http://localhost:8080}"
NODE_ID="${AGENT_NODE_ID:-pr-review-bot}"
REASONER="${HITL_REASONER:-review_pr}"
PR_NUMBER="${HITL_PR_NUMBER:-1138}"
TIMEOUT_SECONDS="${HITL_TIMEOUT_SECONDS:-120}"

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
dim()   { printf '\033[2m%s\033[0m\n' "$*"; }

banner() {
  cyan "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓"
  cyan "┃                                                                  ┃"
  cyan "┃   AgentField — Native HITL forms end-to-end demo                 ┃"
  cyan "┃                                                                  ┃"
  cyan "┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛"
  echo
}

wait_for() {
  local label="$1"
  local url="$2"
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  printf '  ◦ waiting for %s ... ' "$label"
  while (( SECONDS < deadline )); do
    if curl -sf -o /dev/null --connect-timeout 2 "$url"; then
      green "ready"
      return 0
    fi
    sleep 1
  done
  red "TIMEOUT"
  red "  → $url never became reachable within ${TIMEOUT_SECONDS}s"
  red "  → Is 'docker compose --profile hitl up' running in another terminal?"
  exit 1
}

banner

dim "Target control plane : $BASE_URL"
dim "Target agent node    : $NODE_ID"
dim "Reasoner             : $REASONER"
dim "PR number (input)    : $PR_NUMBER"
echo

# Step 1: wait for the control plane to come up.
wait_for "control plane"    "$BASE_URL/api/v1/health"

# Step 2: wait for the agent node to register.
# (Falls back to plain probe on the execute endpoint if the node lookup 404s.)
wait_for "agent $NODE_ID"   "$BASE_URL/api/v1/nodes/$NODE_ID" || \
  wait_for "agent $NODE_ID (exec probe)" "$BASE_URL/api/v1/execute/$NODE_ID.$REASONER"

# Step 3: trigger the reasoner.
cyan "→ launching workflow ..."
response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"input\": {\"pr_number\": $PR_NUMBER}}" \
  "$BASE_URL/api/v1/execute/$NODE_ID.$REASONER")

echo "$response" | (python3 -m json.tool 2>/dev/null || cat)
echo

# Try to extract the execution_id (best effort — tolerate missing python).
execution_id=""
if command -v python3 >/dev/null 2>&1; then
  execution_id=$(python3 -c '
import json, sys
try:
    data = json.loads(sys.stdin.read())
    print(data.get("execution_id") or data.get("run_id") or "")
except Exception:
    pass
' <<<"$response" || true)
fi

green "✓ workflow launched"
if [[ -n "$execution_id" ]]; then
  dim "  execution_id=$execution_id"
fi
echo
cyan "Next:"
echo "  → Open $BASE_URL/hitl in your browser"
echo "  → You should see one inbox item: \"Review PR #$PR_NUMBER\""
echo "  → Click it, pick a decision button (Approve / Request changes / Reject)"
echo "  → The agent will resume and print the decision in its logs:"
dim  "      docker compose logs -f hitl-example-agent"
echo
