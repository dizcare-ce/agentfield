# Docker (local)

This folder contains a small Docker Compose setup for evaluating AgentField locally:

- Control plane (UI + REST API)
- PostgreSQL (pgvector)
- Optional demo agents (Go + Python)
- **Native HITL forms** end-to-end demo (on the `hitl` profile)

## HITL end-to-end demo (one command)

Spin up the control plane + the PR-review agent and drive the full native HITL
forms flow with zero configuration:

```bash
cd deployments/docker
docker compose --profile hitl up --build

# In another terminal:
./e2e-hitl.sh
```

Then open [http://localhost:8080/hitl](http://localhost:8080/hitl) in your
browser. You'll see one inbox item — "Review PR #1138". Click it, pick a
decision button (Approve / Request changes / Reject), and watch the agent
resume with your submitted values:

```bash
docker compose logs -f hitl-example-agent
```

The agent reuses the AI risk summary from the LLM **only** if you export
`OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` / `AGENTFIELD_AI_KEY`) before
`docker compose up`. With no key set, the demo falls back to a stubbed
summary so nothing blocks the flow.

To clean up:

```bash
docker compose --profile hitl down -v
```

## Quick start

```bash
cd deployments/docker
docker compose --profile python-demo up --build
```

Open the UI:
- `http://localhost:8080/ui/`

## Execute an agent via the control plane

Python demo agent (deterministic; no LLM keys required):

```bash
curl -X POST http://localhost:8080/api/v1/execute/demo-python-agent.hello \
  -H "Content-Type: application/json" \
  -d '{"input":{"name":"World"}}'
```

Go demo agent:

```bash
curl -X POST http://localhost:8080/api/v1/execute/demo-go-agent.demo_echo \
  -H "Content-Type: application/json" \
  -d '{"input":{"message":"Hello!"}}'
```

## Check Verifiable Credentials (VCs)

The Python SDK posts execution VC data back to the control plane. Grab the `run_id` and fetch the VC chain:

```bash
resp=$(curl -s -X POST http://localhost:8080/api/v1/execute/demo-python-agent.hello \
  -H "Content-Type: application/json" \
  -d '{"input":{"name":"VC"}}')
run_id=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin)["run_id"])')
curl -s http://localhost:8080/api/v1/did/workflow/$run_id/vc-chain | head -c 1200
```

## Defaults (PostgreSQL)

- User / password / database: `agentfield` / `agentfield` / `agentfield`

## Docker networking note (callback URL)

The control plane must be able to call your agent at the URL it registers.

- Same Compose network: use the service name (e.g. `http://demo-python-agent:8001`).
- Agent on host, control plane in Docker: use `host.docker.internal` (Python: `AGENT_CALLBACK_URL`, Go: `AGENT_PUBLIC_URL`).

## Cleanup

```bash
cd deployments/docker
docker compose --profile python-demo down -v
```
