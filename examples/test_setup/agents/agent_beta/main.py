"""
agent-beta — Registered but offline test agent.

This agent registers once with the control plane and then exits,
leaving behind a registered-but-offline node.

Run once with:
    python main.py --register-only

Or simply start it and Ctrl-C immediately after you see "Registered".
"""

import os
import sys
import time

import requests

AGENTFIELD_URL = os.getenv("AGENTFIELD_URL", "http://localhost:8080")
API_KEY = os.getenv("AGENTFIELD_API_KEY", "")
NODE_ID = "agent-beta"


def register_only():
    """Register agent-beta via the REST API then exit, leaving it offline."""
    payload = {
        "node_id": NODE_ID,
        "name": "agent-beta",
        "description": "Registered-but-offline test agent",
        "url": "http://localhost:9002",  # Nothing is actually listening here
        "capabilities": ["offline_test"],
        "status": "ready",
    }
    headers = {"X-API-Key": API_KEY} if API_KEY else {}
    resp = requests.post(f"{AGENTFIELD_URL}/api/v1/nodes", json=payload, headers=headers, timeout=5)
    if resp.status_code in (200, 201, 409):
        print(f"agent-beta registered (status {resp.status_code}). Exiting — agent is now OFFLINE.")
    else:
        print(f"Registration failed: {resp.status_code} {resp.text}")
        sys.exit(1)


if __name__ == "__main__":
    if "--register-only" in sys.argv or len(sys.argv) == 1:
        register_only()
    else:
        # Fallback: normal SDK start (for completeness)
        from agentfield import Agent, AIConfig

        app = Agent(
            node_id=NODE_ID,
            agentfield_server=AGENTFIELD_URL,
            ai_config=AIConfig(model="openai/gpt-4o-mini"),
        )

        @app.skill()
        def ping() -> dict:
            return {"pong": True}

        print("agent-beta starting (will go offline when you Ctrl-C)")
        app.run(port=9002, auto_port=False)
