# Docker (local)

This folder contains a small Docker Compose setup for evaluating AgentField locally:

- Control plane (UI + REST API)
- PostgreSQL (pgvector)
- Optional demo agents (Go + Python)
- **Native HITL forms** end-to-end demo (on the `hitl` profile)

## HITL end-to-end demo

This profile runs the native HITL PR-review demo end to end: the control plane serves the `/hitl` inbox, the `pr-review-bot` agent pauses on a form, and a human response resumes the agent from the browser.

```bash
cd deployments/docker
docker compose --profile hitl up --build

# (in another terminal)
./e2e-hitl.sh
# Then open http://localhost:8080/hitl
```

Expected behavior: the inbox shows one pending item. Open it, choose `Approve`, `Reject`, or `Request changes`, and the agent resumes with that decision in its container logs:

```bash
docker compose logs -f hitl-example-agent
```

The AI risk summary is stubbed unless `OPENAI_API_KEY` is set.

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
