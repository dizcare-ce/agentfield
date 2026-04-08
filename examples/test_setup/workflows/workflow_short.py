"""
workflow-short — Completes in < 5 s.

Calls agent-alpha.fast_work with 3 steps (~1 s total).
Prints the workflow_id so you can look it up in the UI.
"""

import asyncio
import os

from agentfield.client import AgentFieldClient

AGENTFIELD_URL = os.getenv("AGENTFIELD_URL", "http://localhost:8080")
AGENTFIELD_API_KEY = os.getenv("AGENTFIELD_API_KEY", "")


async def main():
    client = AgentFieldClient(base_url=AGENTFIELD_URL, api_key=AGENTFIELD_API_KEY or None)

    print("Triggering workflow-short via agent-alpha.fast_work ...")
    result = await client.execute(
        target="agent-alpha.fast_work",
        input_data={"steps": 3},
    )

    workflow_id = result.get("workflow_id") or result.get("execution_id", "N/A")
    print(f"workflow_id : {workflow_id}")
    print(f"status      : {result.get('status', 'N/A')}")
    print(f"result      : {result.get('result', result)}")
    return result


if __name__ == "__main__":
    asyncio.run(main())
