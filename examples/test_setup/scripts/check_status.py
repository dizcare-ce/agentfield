"""
check_status.py — Show current status of all three test agents.

Usage:
    python scripts/check_status.py

Environment variables:
    AGENTFIELD_URL     (default: http://localhost:8080)
    AGENTFIELD_API_KEY (default: empty)
"""

import os
import sys
from datetime import datetime, timezone

import requests

BASE = os.getenv("AGENTFIELD_URL", "http://localhost:8080")
API_KEY = os.getenv("AGENTFIELD_API_KEY", "")
HEADERS = {"X-API-Key": API_KEY} if API_KEY else {}

AGENTS = ["agent-alpha", "agent-beta", "agent-gamma"]

# ANSI colours
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
GREY   = "\033[90m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def colour_state(state: str) -> str:
    s = state.lower()
    if s in ("active", "ready"):
        return f"{GREEN}{state}{RESET}"
    if s in ("inactive", "offline"):
        return f"{RED}{state}{RESET}"
    return f"{YELLOW}{state}{RESET}"


def age(ts: str) -> str:
    """Return human-readable age from an ISO timestamp."""
    if not ts:
        return "unknown"
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        secs = int((datetime.now(timezone.utc) - dt).total_seconds())
        if secs < 60:
            return f"{secs}s ago"
        if secs < 3600:
            return f"{secs // 60}m ago"
        return f"{secs // 3600}h ago"
    except Exception:
        return ts


def fetch_node(agent_id: str) -> dict:
    try:
        r = requests.get(f"{BASE}/api/v1/nodes/{agent_id}", headers=HEADERS, timeout=5)
        return r.json() if r.status_code == 200 else {}
    except Exception:
        return {}


def fetch_status(agent_id: str) -> dict:
    try:
        r = requests.get(f"{BASE}/api/ui/v1/nodes/{agent_id}/status", headers=HEADERS, timeout=5)
        return r.json() if r.status_code == 200 else {}
    except Exception:
        return {}


def check_agent(agent_id: str) -> dict:
    node   = fetch_node(agent_id)
    status = fetch_status(agent_id)
    return {
        "id":               agent_id,
        "registered":       bool(node),
        "state":            status.get("state", "unknown"),
        "lifecycle_status": status.get("lifecycle_status", "unknown"),
        "health_score":     status.get("health_score"),
        "last_seen":        status.get("last_seen") or node.get("last_heartbeat"),
        "skills":           [s["id"] for s in node.get("skills", [])],
        "reasoners":        [r["id"] for r in node.get("reasoners", [])],
        "url":              node.get("base_url", "unknown"),
    }


def print_report(results: list[dict]):
    width = 60
    print()
    print(f"{BOLD}{'═' * width}{RESET}")
    print(f"{BOLD}  AgentField — Test Agent Status{RESET}")
    print(f"  {GREY}{BASE}{RESET}")
    print(f"{BOLD}{'═' * width}{RESET}")

    for r in results:
        reg_label = f"{GREEN}registered{RESET}" if r["registered"] else f"{RED}not registered{RESET}"
        state_label = colour_state(r["state"])
        score = r["health_score"]
        score_label = (
            f"{GREEN}{score}{RESET}" if score and score >= 70
            else f"{RED}{score}{RESET}" if score is not None
            else f"{GREY}n/a{RESET}"
        )

        print()
        print(f"  {BOLD}{r['id']}{RESET}")
        print(f"    registered   : {reg_label}")
        print(f"    state        : {state_label}  ({r['lifecycle_status']})")
        print(f"    health score : {score_label}")
        print(f"    last seen    : {GREY}{age(r['last_seen'])}{RESET}")
        print(f"    url          : {GREY}{r['url']}{RESET}")

        capabilities = r["skills"] + r["reasoners"]
        if capabilities:
            print(f"    capabilities : {', '.join(capabilities)}")
        else:
            print(f"    capabilities : {GREY}none registered{RESET}")

    print()
    print(f"{BOLD}{'─' * width}{RESET}")

    # Quick summary line
    active  = sum(1 for r in results if r["state"] == "active")
    offline = sum(1 for r in results if r["state"] in ("inactive", "offline", "unknown"))
    print(f"  Summary: {GREEN}{active} active{RESET}  {RED}{offline} offline{RESET}")
    print(f"{BOLD}{'═' * width}{RESET}")
    print()


if __name__ == "__main__":
    try:
        requests.get(f"{BASE}/api/v1/health", timeout=3)
    except Exception:
        print(f"ERROR: Control plane not reachable at {BASE}")
        sys.exit(1)

    results = [check_agent(a) for a in AGENTS]
    print_report(results)
