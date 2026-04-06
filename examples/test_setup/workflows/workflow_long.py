"""
workflow-long — Runs for 60+ seconds (live-update testing).

Calls agent-alpha.slow_work with a 70 s sleep.
The execution is submitted asynchronously; this script prints the
workflow_id and exits — the workflow continues running in the control plane.
Use the UI or Postman to watch its live status.
"""

import asyncio
import os

from agentfield import AgentFieldClient

AGENTFIELD_URL = os.getenv("AGENTFIELD_URL", "http://localhost:8080")


async def main():
    client = AgentFieldClient(server_url=AGENTFIELD_URL)

    print("Submitting workflow-long (70 s run) via agent-alpha.slow_work ...")
    print("The workflow will keep running after this script exits.")
    print("Watch it at: http://localhost:8080/ui/workflows\n")

    # Use execute_async so we don't block for 70 s locally
    submission = await client._submit_execution_async(
        target="agent-alpha.slow_work",
        input_data={"duration_seconds": 70},
        headers={},
    )

    workflow_id = submission.get("workflow_id") or submission.get("execution_id", "N/A")
    print(f"workflow_id : {workflow_id}")
    print(f"status      : {submission.get('status', 'running')}")
    print(f"\nCheck status: GET {AGENTFIELD_URL}/api/v1/executions/{workflow_id}")
    return submission


if __name__ == "__main__":
    asyncio.run(main())
