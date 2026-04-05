# Log demo stack (UI + NDJSON process logs)

Brings up the **control plane** (embedded UI on port **8080**) plus three agents that periodically write to **stdout/stderr**, captured as NDJSON and visible under **Agents → expand row → Process logs**.

## Run

From the **repository root**:

```bash
make log-demo-up
# or:
docker compose -f tests/functional/docker/docker-compose.log-demo.yml up --build -d
```

### Docker Desktop not running (host stack)

The compose file uses `/data/...` paths that only exist inside containers. On the host, use:

```bash
make log-demo-native-up
```

This builds a local `agentfield-server` binary, stores SQLite/Bolt under `/tmp/agentfield-log-demo`, and starts the Python, Go, and Node demo agents on ports **8001–8003**. Stop with `make log-demo-native-down` (or `./scripts/stop-log-demo-native.sh`).

Open **http://localhost:8080/ui/agents** and expand:

| Node id            | Runtime |
|--------------------|---------|
| `demo-python-logs` | Python (`examples/python_agent_nodes/docker_hello_world`) |
| `demo-go-logs`     | Go (`examples/go_agent_nodes` via `Dockerfile.demo-go-agent`) |
| `demo-ts-logs`     | Node (`tests/functional/docker/log-demo-node/log-demo.mjs`) |

All services use `AGENTFIELD_AUTHORIZATION_INTERNAL_TOKEN=log-demo-internal-token` so the UI proxy can authenticate to each agent’s `GET /agentfield/v1/logs`.

Startup order: a one-shot **`wait-control-plane`** service polls `GET /api/v1/health` (with retries) before the three demo agents start, so they do not race the control plane on first boot. Demo agents use **`restart: unless-stopped`** so they recover if the CP restarts.

## Stop

```bash
make log-demo-down
```

## Automated check

The functional suite includes `tests/functional/tests/test_ui_node_logs_proxy.py`, which starts a Python agent in-process and asserts the UI log proxy returns NDJSON containing a marker line after a reasoner runs.
