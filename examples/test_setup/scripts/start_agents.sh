#!/usr/bin/env bash
# start_agents.sh — Launch all three test agents in separate terminals / tmux panes.
#
# Usage:
#   bash scripts/start_agents.sh          # auto-detects tmux or falls back to background
#   bash scripts/start_agents.sh tmux     # force tmux
#   bash scripts/start_agents.sh bg       # force background processes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
AGENTFIELD_URL="${AGENTFIELD_URL:-http://localhost:8080}"

# Install SDK in dev mode if not already present
ensure_sdk() {
    if ! python -c "import agentfield" 2>/dev/null; then
        echo "Installing agentfield SDK..."
        pip install -e "$ROOT/../../sdk/python[dev]" -q
    fi
}

start_tmux() {
    SESSION="agentfield-test"
    tmux new-session -d -s "$SESSION" -n "alpha" 2>/dev/null || true

    tmux send-keys -t "$SESSION:alpha" \
        "AGENTFIELD_URL=$AGENTFIELD_URL AGENT_PORT=9001 python $ROOT/agents/agent_alpha/main.py" Enter

    tmux new-window -t "$SESSION" -n "gamma"
    tmux send-keys -t "$SESSION:gamma" \
        "AGENTFIELD_URL=$AGENTFIELD_URL AGENT_PORT=9003 python $ROOT/agents/agent_gamma/main.py" Enter

    tmux new-window -t "$SESSION" -n "beta-register"
    tmux send-keys -t "$SESSION:beta-register" \
        "AGENTFIELD_URL=$AGENTFIELD_URL python $ROOT/agents/agent_beta/main.py --register-only" Enter

    echo "Agents started in tmux session '$SESSION'."
    echo "Attach with:  tmux attach -t $SESSION"
}

start_background() {
    LOG_DIR="$ROOT/logs"
    mkdir -p "$LOG_DIR"

    AGENTFIELD_URL=$AGENTFIELD_URL AGENTFIELD_API_KEY=$AGENTFIELD_API_KEY AGENT_PORT=9001 \
        python "$ROOT/agents/agent_alpha/main.py" > "$LOG_DIR/agent_alpha.log" 2>&1 &
    echo "agent-alpha PID $!  →  $LOG_DIR/agent_alpha.log"

    AGENTFIELD_URL=$AGENTFIELD_URL AGENTFIELD_API_KEY=$AGENTFIELD_API_KEY AGENT_PORT=9003 \
        python "$ROOT/agents/agent_gamma/main.py" > "$LOG_DIR/agent_gamma.log" 2>&1 &
    echo "agent-gamma PID $!  →  $LOG_DIR/agent_gamma.log"

    # Register agent-beta (offline) — just runs once
    AGENTFIELD_URL=$AGENTFIELD_URL AGENTFIELD_API_KEY=$AGENTFIELD_API_KEY \
        python "$ROOT/agents/agent_beta/main.py" --register-only
    echo "agent-beta registered (offline)"

    echo ""
    echo "Agents running in background. Stop with:  kill \$(lsof -ti:9001,9003)"
}

ensure_sdk

MODE="${1:-auto}"

if [ "$MODE" = "auto" ]; then
    if command -v tmux &>/dev/null && [ -z "$TERM_PROGRAM" ]; then
        MODE="tmux"
    else
        MODE="bg"
    fi
fi

case "$MODE" in
    tmux)   start_tmux ;;
    bg)     start_background ;;
    *)      echo "Unknown mode: $MODE (use tmux or bg)"; exit 1 ;;
esac
