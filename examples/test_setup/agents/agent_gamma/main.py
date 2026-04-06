"""
agent-gamma — Errors mid-execution test agent.

Behaviors:
- step_ok   → succeeds (step 1)
- step_fail → deterministically raises an exception (step 2)

Designed so workflow-fail can trigger it at step 2 and produce a FAILED
workflow run with a meaningful error trace visible in the UI and logs.
"""

import os
import time

from agentfield import Agent, AIConfig

app = Agent(
    node_id="agent-gamma",
    agentfield_server=os.getenv("AGENTFIELD_URL", "http://localhost:8080"),
    api_key=os.getenv("AGENTFIELD_API_KEY"),
    ai_config=AIConfig(model="openai/gpt-4o-mini"),
)


@app.skill()
def step_ok(payload: str = "init") -> dict:
    """Step 1 — always succeeds."""
    time.sleep(0.2)
    return {"step": 1, "status": "ok", "payload": payload}


@app.skill()
def step_fail(payload: str = "trigger") -> dict:
    """
    Step 2 — deterministically fails.
    Simulates a real error: missing key in response payload.
    """
    time.sleep(0.3)
    raise ValueError(
        f"agent-gamma: step_fail triggered intentionally (payload={payload!r}). "
        "This is a deterministic test failure."
    )


@app.skill()
def status() -> dict:
    """Health-check — returns current agent status."""
    return {"agent": "agent-gamma", "note": "I fail at step 2 on purpose"}


if __name__ == "__main__":
    print("agent-gamma starting (will error at step_fail)")
    app.run(port=int(os.getenv("AGENT_PORT", "9003")), auto_port=False)
