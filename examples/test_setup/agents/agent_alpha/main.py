"""
agent-alpha — Healthy, actively running test agent.

Behaviors:
- Registers as healthy (READY status)
- Emits process logs on every call
- Supports a fast skill and a slow reasoner for workflow coverage
"""

import asyncio
import os
import time

from agentfield import Agent, AIConfig

app = Agent(
    node_id="agent-alpha",
    agentfield_server=os.getenv("AGENTFIELD_URL", "http://localhost:8080"),
    api_key=os.getenv("AGENTFIELD_API_KEY"),
    # No AI calls needed — all skills are deterministic
    ai_config=AIConfig(model="openai/gpt-4o-mini"),
)


@app.skill()
def ping(message: str = "hello") -> dict:
    """Instant health-check skill. Always succeeds."""
    return {"pong": message, "agent": "agent-alpha", "ts": time.time()}


@app.skill()
def fast_work(steps: int = 3) -> dict:
    """
    Simulates a short workflow step (used by workflow-short).
    Completes in < 2 s regardless of steps.
    """
    results = []
    for i in range(steps):
        time.sleep(0.3)
        results.append(f"step-{i+1}-done")
    return {"results": results, "duration_approx": f"{steps * 0.3:.1f}s"}


@app.skill()
def slow_work(duration_seconds: int = 70) -> dict:
    """
    Simulates a long-running workflow step (used by workflow-long).
    Sleeps for duration_seconds then returns.
    """
    time.sleep(duration_seconds)
    return {"status": "completed", "slept_for": duration_seconds}


@app.skill()
def step_one(payload: str = "start") -> dict:
    """First step used by workflow-fail. Always succeeds."""
    return {"step": 1, "status": "ok", "payload": payload}


if __name__ == "__main__":
    print("agent-alpha starting (healthy agent)")
    app.run(port=int(os.getenv("AGENT_PORT", "9001")), auto_port=False)
