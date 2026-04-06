# Test Setup

Pre-built test environment for manual and automated testing of the AgentField control plane.

## Directory Layout

```
test_setup/
├── setup.sh                     # One-shot bootstrap (runs steps 1-3 below)
├── postman_collection.json      # Import into Postman
├── agents/
│   ├── agent_alpha/main.py      # Healthy, actively running
│   ├── agent_beta/main.py       # Registered but offline
│   └── agent_gamma/main.py      # Errors at step_fail
├── workflows/
│   ├── workflow_short.py        # Completes in < 5 s
│   ├── workflow_long.py         # Runs 70 s (live-update testing)
│   └── workflow_fail.py         # Deterministically fails at step 2
└── scripts/
    ├── start_agents.sh          # Start agent-alpha + agent-gamma, register agent-beta
    ├── seed.py                  # Register agents + trigger all three workflows via REST
    └── tokens.sh                # Auth token smoke tests
```

## Quick Start

### 1. Start the control plane

```bash
cd control-plane
AGENTFIELD_API_KEY=valid-admin-token go run ./cmd/af dev
```

> The control plane runs at `http://localhost:8080`.
> Setting `AGENTFIELD_API_KEY` enables the auth middleware for token edge-case tests.
> Leave it unset if you want open access (no 401 tests).

### 2. Run the full setup

```bash
cd examples/test_setup
AGENTFIELD_URL=http://localhost:8080 \
AGENTFIELD_API_KEY=valid-admin-token \
bash setup.sh
```

This starts the agents, waits for registration, and seeds all three workflows.

### 3. Or step through manually

```bash
# a) Start agents
AGENTFIELD_URL=http://localhost:8080 bash scripts/start_agents.sh bg

# b) Register agents + seed workflows
AGENTFIELD_URL=http://localhost:8080 AGENTFIELD_API_KEY=valid-admin-token \
  python scripts/seed.py

# c) Run individual workflows
python workflows/workflow_short.py
python workflows/workflow_long.py   # exits immediately, workflow keeps running
python workflows/workflow_fail.py
```

## Test Agents

| Agent | Port | Status | Purpose |
|---|---|---|---|
| `agent-alpha` | 9001 | healthy / ready | Fast and slow skills for short/long workflows |
| `agent-beta` | 9002 | registered, offline | Nothing listens on 9002; tests offline-node UI |
| `agent-gamma` | 9003 | errors at step 2 | `step_fail` raises `ValueError` deterministically |

## Test Workflows

| Workflow | Trigger | Expected Outcome |
|---|---|---|
| `workflow-short` | `agent-alpha.fast_work` | Completes in ~1 s, status = `completed` |
| `workflow-long` | `agent-alpha.slow_work` | Stays `running` for 70 s; good for live-update tests |
| `workflow-fail` | `agent-alpha.step_one` → `agent-gamma.step_fail` | Step 1 succeeds, step 2 fails with `ValueError` |

## Auth Tokens

The control plane uses a single shared API key (`AGENTFIELD_API_KEY`).

| Token | How to use | Expected result |
|---|---|---|
| `valid-admin-token` | Start server with `AGENTFIELD_API_KEY=valid-admin-token`, send `X-API-Key: valid-admin-token` | `200` on all routes |
| `valid-readonly-token` | Start server with `AGENTFIELD_API_KEY=valid-readonly-token`, send read-only (GET) requests | `200` on GET routes |
| `expired-token` | Server has any key set; send `X-API-Key: expired-token` | `401 Unauthorized` |
| *(no token)* | Send request with no auth header | `401 Unauthorized` |

Tokens can be sent three ways:
```
X-API-Key: valid-admin-token
Authorization: Bearer valid-admin-token
GET /api/v1/nodes?api_key=valid-admin-token
```

Run the token smoke tests:
```bash
source scripts/tokens.sh
```

## Postman

Import `postman_collection.json`. The collection uses two variables:

| Variable | Default |
|---|---|
| `base_url` | `http://localhost:8080` |
| `admin_token` | `valid-admin-token` |

All auth edge-case requests are in the **Auth Edge Cases** folder.

## Python SDK Dependency

The agents use the local SDK. Install it once:

```bash
pip install -e ../../sdk/python[dev]
```
