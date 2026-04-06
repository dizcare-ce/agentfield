#!/usr/bin/env bash
# setup.sh — One-shot test environment bootstrap.
#
# What it does:
#   1. Verifies the control plane is reachable
#   2. Starts agent-alpha and agent-gamma (background or tmux)
#   3. Registers agent-beta as offline
#   4. Runs seed.py to trigger the three test workflows
#
# Usage:
#   AGENTFIELD_URL=http://localhost:8080 bash setup.sh
#   AGENTFIELD_URL=http://localhost:8080 AGENTFIELD_API_KEY=valid-admin-token bash setup.sh

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${AGENTFIELD_URL:-http://localhost:8080}"

echo "╔══════════════════════════════════════════╗"
echo "║  AgentField Test Environment Setup       ║"
echo "╚══════════════════════════════════════════╝"
echo "  Control plane: $BASE"
echo ""

# ── 1. Health check ───────────────────────────────────────────────────────────
echo "[1/3] Checking control plane health..."
if ! curl -sf "$BASE/api/v1/health" -o /dev/null; then
    echo ""
    echo "ERROR: Control plane not reachable at $BASE"
    echo ""
    echo "Start it first:"
    echo "  cd control-plane"
    echo "  AGENTFIELD_API_KEY=valid-admin-token go run ./cmd/af dev"
    exit 1
fi
echo "  Control plane is UP"

# ── 2. Start agents ───────────────────────────────────────────────────────────
echo ""
echo "[2/3] Starting test agents..."
bash "$DIR/scripts/start_agents.sh" bg

echo "  Waiting 3 s for agents to register..."
sleep 3

# ── 3. Seed workflows ─────────────────────────────────────────────────────────
echo ""
echo "[3/3] Seeding test workflows..."
AGENTFIELD_URL="$BASE" python "$DIR/scripts/seed.py"

echo ""
echo "Setup complete. Open $BASE/ui/ to explore."
