#!/usr/bin/env bash
# tokens.sh — Print the auth token configurations used by the test suite.
#
# The control plane uses a SINGLE shared API key (AGENTFIELD_API_KEY).
# All four test-token scenarios are covered by different values of that key:
#
#   valid-admin-token    →  Start the server with AGENTFIELD_API_KEY=valid-admin-token
#   valid-readonly-token →  Start the server with AGENTFIELD_API_KEY=valid-readonly-token
#                           (read-only enforcement is at the test level — send only GET requests)
#   expired-token        →  Server has any key set; send "expired-token" → 401
#   no token             →  Send no auth header → 401 (when a key is configured)
#
# Usage:
#   source scripts/tokens.sh
#   echo $ADMIN_TOKEN $READONLY_TOKEN $EXPIRED_TOKEN

export ADMIN_TOKEN="valid-admin-token"
export READONLY_TOKEN="valid-readonly-token"
export EXPIRED_TOKEN="expired-token"
# NO_TOKEN: just don't set a header — see Postman collection

# ─── Quick test (requires server running with AGENTFIELD_API_KEY=valid-admin-token) ───

BASE="${AGENTFIELD_URL:-http://localhost:8080}"

echo "=== Auth Token Smoke Tests ==="
echo "Base URL: $BASE"
echo ""

echo "[1] valid-admin-token → expect 200"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
  -H "X-API-Key: $ADMIN_TOKEN" \
  "$BASE/api/v1/nodes"

echo "[2] expired-token → expect 401"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
  -H "X-API-Key: $EXPIRED_TOKEN" \
  "$BASE/api/v1/nodes"

echo "[3] Bearer token format → expect 200"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/api/v1/nodes"

echo "[4] no token → expect 401"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
  "$BASE/api/v1/nodes"

echo "[5] health endpoint (no auth required) → expect 200"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" \
  "$BASE/api/v1/health"

echo ""
echo "Done. Start server with:  AGENTFIELD_API_KEY=valid-admin-token go run ./cmd/af dev"
