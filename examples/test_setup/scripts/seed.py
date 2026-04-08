"""
seed.py — Register all test agents and trigger all test workflows.

Run after the control plane is up and all three agent servers are running:
    python scripts/seed.py

Environment variables:
    AGENTFIELD_URL  (default: http://localhost:8080)
    AGENTFIELD_API_KEY (default: empty — no auth)
"""

import os
import sys

import requests

BASE = os.getenv("AGENTFIELD_URL", "http://localhost:8080")
API_KEY = os.getenv("AGENTFIELD_API_KEY", "")

HEADERS = {}
if API_KEY:
    HEADERS["X-API-Key"] = API_KEY


def h() -> dict:
    return {**HEADERS, "Content-Type": "application/json"}


def ok(resp: requests.Response, label: str) -> dict:
    if resp.status_code in (200, 201, 202, 409):
        data = resp.json() if resp.content else {}
        print(f"  [OK]  {label}  ({resp.status_code})")
        return data
    else:
        print(f"  [ERR] {label}  ({resp.status_code}): {resp.text[:200]}")
        return {}


# ─── 1. Register agents ──────────────────────────────────────────────────────

def register_agents():
    print("\n=== Registering test agents ===")

    agents = [
        {
            "node_id": "agent-alpha",
            "name": "agent-alpha",
            "description": "Healthy, actively running test agent",
            "url": "http://localhost:9001",
            "capabilities": ["fast_work", "slow_work", "step_one", "ping"],
            "status": "ready",
        },
        {
            "node_id": "agent-beta",
            "name": "agent-beta",
            "description": "Registered but offline test agent",
            "url": "http://localhost:9002",
            "capabilities": ["ping"],
            "status": "ready",
        },
        {
            "node_id": "agent-gamma",
            "name": "agent-gamma",
            "description": "Errors mid-execution test agent",
            "url": "http://localhost:9003",
            "capabilities": ["step_ok", "step_fail", "status"],
            "status": "ready",
        },
    ]

    for agent in agents:
        resp = requests.post(f"{BASE}/api/v1/nodes", json=agent, headers=h(), timeout=5)
        ok(resp, f"register {agent['node_id']}")


# ─── 2. Trigger workflows ─────────────────────────────────────────────────────

def trigger_workflows():
    print("\n=== Triggering test workflows ===")

    # workflow-short: fast_work on agent-alpha (async submit, completes quickly)
    print("\n  [workflow-short] → agent-alpha.fast_work")
    resp = requests.post(
        f"{BASE}/api/v1/execute/async/agent-alpha.fast_work",
        json={"steps": 3},
        headers=h(),
        timeout=10,
    )
    short = ok(resp, "workflow-short submit")
    wf_short = short.get("workflow_id") or short.get("execution_id", "N/A")
    print(f"    workflow_id: {wf_short}")

    # workflow-long: slow_work on agent-alpha (async, runs for 70 s)
    print("\n  [workflow-long] → agent-alpha.slow_work (70 s, submitted async)")
    resp = requests.post(
        f"{BASE}/api/v1/execute/async/agent-alpha.slow_work",
        json={"duration_seconds": 70},
        headers=h(),
        timeout=10,
    )
    long_ = ok(resp, "workflow-long submit")
    wf_long = long_.get("workflow_id") or long_.get("execution_id", "N/A")
    print(f"    workflow_id: {wf_long}")
    print(f"    This workflow is RUNNING. Watch at: {BASE}/ui/workflows")

    # workflow-fail: step_fail on agent-gamma (deterministically errors)
    # Use a separate agent so agent-alpha's thread pool is not a factor.
    print("\n  [workflow-fail] → agent-gamma.step_fail  (expect error)")
    resp = requests.post(
        f"{BASE}/api/v1/execute/async/agent-gamma.step_fail",
        json={"payload": "trigger-from-seed"},
        headers=h(),
        timeout=10,
    )
    wf_fail = ok(resp, "workflow-fail submit")
    wf_fail_s2_id = wf_fail.get("workflow_id") or wf_fail.get("execution_id", "N/A")
    wf_fail_s1 = wf_fail_s2_id  # single execution for summary
    print(f"    workflow_id: {wf_fail_s2_id}  (will land as FAILED in the UI)")

    return {
        "wf_short": wf_short,
        "wf_long": wf_long,
        "wf_fail_step1": wf_fail_s1,
        "wf_fail_step2": wf_fail_s2_id,
    }


# ─── 3. Summary ───────────────────────────────────────────────────────────────

def print_summary(wf_ids: dict):
    print("\n" + "=" * 60)
    print("SEED COMPLETE — Test environment is ready")
    print("=" * 60)
    print(f"  Control plane : {BASE}")
    print(f"  UI            : {BASE}/ui/")
    print("")
    print("  Agents:")
    print("    agent-alpha  → http://localhost:9001  (healthy/running)")
    print("    agent-beta   → http://localhost:9002  (registered, offline)")
    print("    agent-gamma  → http://localhost:9003  (errors at step_fail)")
    print("")
    print("  Workflows:")
    print(f"    workflow-short  → {wf_ids['wf_short']}")
    print(f"    workflow-long   → {wf_ids['wf_long']}  (still RUNNING)")
    print(f"    workflow-fail   → {wf_ids['wf_fail_step1']} / {wf_ids['wf_fail_step2']}")
    print("")
    print("  Auth tokens (set AGENTFIELD_API_KEY on the server):")
    print("    valid-admin-token    → full access")
    print("    valid-readonly-token → send read-only requests only")
    print("    expired-token        → expect 401")
    print("    <no token>           → expect 401")
    print("=" * 60)


if __name__ == "__main__":
    print(f"Seeding test data against {BASE} ...")

    try:
        requests.get(f"{BASE}/api/v1/health", timeout=3)
    except Exception as exc:
        print(f"\nERROR: Control plane not reachable at {BASE}: {exc}")
        print("Start it with:  cd control-plane && go run ./cmd/af dev")
        sys.exit(1)

    register_agents()
    wf_ids = trigger_workflows()
    print_summary(wf_ids)
