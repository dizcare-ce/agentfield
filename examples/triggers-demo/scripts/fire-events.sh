#!/usr/bin/env bash
#
# Fires signed test events at the local AgentField control plane so the
# triggers-demo can be exercised end-to-end without standing up a real Stripe
# or GitHub provider.
#
# Discovers the agent's code-managed triggers via the CP's API, signs the
# bundled fixture payloads with the demo secrets baked into docker-compose,
# and POSTs them at the public ingest endpoint. The CP verifies the
# signature, persists the event, and dispatches it to the agent — every
# step shows up live in http://localhost:8080/triggers.
#
# Usage (after `docker compose up -d`):
#
#   ./scripts/fire-events.sh
#
# To target a non-default CP host:
#
#   AGENTFIELD_URL=http://my-host:8080 ./scripts/fire-events.sh

set -euo pipefail

AGENTFIELD_URL="${AGENTFIELD_URL:-http://localhost:8080}"
STRIPE_DEMO_SECRET="${STRIPE_DEMO_SECRET:-whsec_demo_stripe_secret_change_me_in_prod}"
GITHUB_DEMO_SECRET="${GITHUB_DEMO_SECRET:-ghsecret_demo_github_secret_change_me}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: this script needs '$1' on PATH (install or use a different shell)" >&2
    exit 2
  }
}

require_cmd curl
require_cmd python3

cp_alive() {
  curl -fsS "${AGENTFIELD_URL}/api/v1/sources" >/dev/null 2>&1
}

discover_trigger_id() {
  local source="$1"
  python3 -c "
import json, sys, urllib.request
with urllib.request.urlopen('${AGENTFIELD_URL}/api/v1/triggers') as r:
    body = json.loads(r.read())
for t in body.get('triggers', []):
    if t.get('source_name') == '${source}':
        print(t['id'])
        sys.exit(0)
sys.exit(1)
" 2>/dev/null
}

stripe_sign() {
  # Stripe-Signature format: t=<unix_ts>,v1=<hex_hmac_sha256(<ts>.<body>)>
  local secret="$1" body="$2"
  local ts; ts=$(date +%s)
  local sig
  sig=$(python3 -c "
import hashlib, hmac, sys
secret = sys.argv[1].encode()
ts     = sys.argv[2].encode()
body   = sys.argv[3].encode()
print(hmac.new(secret, ts + b'.' + body, hashlib.sha256).hexdigest())
" "$secret" "$ts" "$body")
  printf 't=%s,v1=%s' "$ts" "$sig"
}

github_sign() {
  # X-Hub-Signature-256: sha256=<hex_hmac_sha256(body)>
  local secret="$1" body="$2"
  python3 -c "
import hashlib, hmac, sys
print('sha256=' + hmac.new(sys.argv[1].encode(), sys.argv[2].encode(), hashlib.sha256).hexdigest())
" "$secret" "$body"
}

post_event() {
  local label="$1" url="$2" body="$3"
  shift 3
  local headers=("$@")
  echo "→ POST $label  →  $url"
  local args=(-sS -X POST "$url" -H 'Content-Type: application/json' --data-binary "$body")
  for h in "${headers[@]}"; do
    args+=(-H "$h")
  done
  local resp
  resp=$(curl "${args[@]}")
  echo "  response: $resp"
}

# ---------------------------------------------------------------------------
# Wait for CP + agent registration
# ---------------------------------------------------------------------------

echo "checking control plane at ${AGENTFIELD_URL}..."
for _ in $(seq 1 60); do
  if cp_alive; then break; fi
  sleep 1
done
if ! cp_alive; then
  echo "error: control plane did not become reachable at ${AGENTFIELD_URL}" >&2
  echo "  (did you run 'docker compose up -d' from the triggers-demo directory?)" >&2
  exit 1
fi

# Wait until the demo agent has registered with the CP and its code-managed
# triggers exist. The agent declares 3 triggers; we wait until at least the
# Stripe and GitHub ones appear.
echo "waiting for the demo agent to register triggers..."
for _ in $(seq 1 60); do
  stripe_id=$(discover_trigger_id stripe || true)
  github_id=$(discover_trigger_id github || true)
  if [[ -n "${stripe_id:-}" && -n "${github_id:-}" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "${stripe_id:-}" || -z "${github_id:-}" ]]; then
  echo "error: demo agent's triggers didn't register within 60s" >&2
  echo "  current triggers:" >&2
  curl -fsS "${AGENTFIELD_URL}/api/v1/triggers" >&2 || true
  exit 1
fi
echo "  stripe trigger: ${stripe_id}"
echo "  github trigger: ${github_id}"
echo

# ---------------------------------------------------------------------------
# Fire one Stripe payment_intent.succeeded
# ---------------------------------------------------------------------------

stripe_body=$(cat <<'JSON'
{"id":"evt_demo_001","object":"event","type":"payment_intent.succeeded","created":1735395600,"data":{"object":{"id":"pi_demo_001","object":"payment_intent","amount":4200,"currency":"usd","customer":"cus_demo_42","status":"succeeded","metadata":{"order_id":"ord_demo_42"}}}}
JSON
)

stripe_sig=$(stripe_sign "$STRIPE_DEMO_SECRET" "$stripe_body")
post_event "stripe payment_intent.succeeded" \
  "${AGENTFIELD_URL}/sources/${stripe_id}" \
  "$stripe_body" \
  "Stripe-Signature: ${stripe_sig}"

# ---------------------------------------------------------------------------
# Fire one GitHub pull_request.opened
# ---------------------------------------------------------------------------

github_body=$(cat <<'JSON'
{"action":"opened","number":42,"pull_request":{"id":1234567890,"number":42,"state":"open","title":"AgentField triggers demo","html_url":"https://github.com/demo-org/demo-repo/pull/42","user":{"login":"demo-user","id":1000,"type":"User"},"draft":false,"merged":false},"repository":{"id":654321,"name":"demo-repo","full_name":"demo-org/demo-repo","private":false},"sender":{"login":"demo-user","type":"User"}}
JSON
)

github_sig=$(github_sign "$GITHUB_DEMO_SECRET" "$github_body")
delivery_id="$(uuidgen 2>/dev/null || python3 -c 'import uuid;print(uuid.uuid4())')"
post_event "github pull_request.opened" \
  "${AGENTFIELD_URL}/sources/${github_id}" \
  "$github_body" \
  "X-GitHub-Event: pull_request" \
  "X-GitHub-Delivery: ${delivery_id}" \
  "X-Hub-Signature-256: ${github_sig}"

# ---------------------------------------------------------------------------
# Cron fires itself every minute — nothing to send.
# ---------------------------------------------------------------------------

echo
echo "done. Open ${AGENTFIELD_URL}/triggers to see the events flow through."
echo "the cron trigger will also fire automatically every minute on the minute."
