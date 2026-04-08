"""
workflow-fail — Deterministically fails at step 2.

Step 1: agent-alpha.step_one  → succeeds
Step 2: agent-gamma.step_fail → raises ValueError intentionally

The result is a FAILED workflow run with a real error trace,
visible in the UI and queryable via the API.
"""

import asyncio
import os

from agentfield.client import AgentFieldClient

AGENTFIELD_URL = os.getenv("AGENTFIELD_URL", "http://localhost:8080")
AGENTFIELD_API_KEY = os.getenv("AGENTFIELD_API_KEY", "")


async def main():
    client = AgentFieldClient(base_url=AGENTFIELD_URL, api_key=AGENTFIELD_API_KEY or None)

    print("Step 1: calling agent-alpha.step_one ...")
    step1 = await client.execute(
        target="agent-alpha.step_one",
        input_data={"payload": "workflow-fail-start"},
    )
    step1_wf = step1.get("workflow_id") or step1.get("execution_id", "N/A")
    print(f"  step 1 workflow_id : {step1_wf}")
    print(f"  step 1 status      : {step1.get('status', 'N/A')}")

    print("\nStep 2: calling agent-gamma.step_fail (will raise) ...")
    try:
        step2 = await client.execute(
            target="agent-gamma.step_fail",
            input_data={"payload": "trigger-from-workflow-fail"},
        )
        step2_wf = step2.get("workflow_id") or step2.get("execution_id", "N/A")
        print(f"  step 2 workflow_id : {step2_wf}")
        print(f"  step 2 status      : {step2.get('status', 'UNEXPECTED SUCCESS')}")
    except Exception as exc:
        print(f"  step 2 FAILED as expected: {exc}")
        print("\nworkflow-fail scenario complete. Check the UI for a FAILED workflow run.")

    return step1_wf


if __name__ == "__main__":
    asyncio.run(main())
