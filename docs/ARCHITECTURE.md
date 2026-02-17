# AgentField Architecture

AgentField is a modular platform for orchestrating AI agents. It consists of a
Go-based control plane, language SDKs (Python, Go, TypeScript), example agents,
and operational tooling.

## Repository Layout

```
agentfield/
├── control-plane/   # Go service: API, business logic, web UI
├── sdk/             # Client SDKs (Python, Go, TypeScript)
├── examples/        # Reference agent implementations
├── docs/            # Project documentation
├── deployments/     # Docker, Helm, and Railway configs
├── tests/           # Functional and integration tests
└── scripts/         # Developer utility scripts
```

## High-Level Overview

```
┌───────────────────────────────────────────────────────────────┐
│                           Clients                             │
│   - Web UI (control-plane/web)                                │
│   - Python SDK (sdk/python)                                   │
│   - Go SDK (sdk/go)                                           │
│   - TypeScript SDK (sdk/typescript)                           │
└───────────────────────────────────────────────────────────────┘
                      │            │
                      ▼            ▼
┌───────────────────────────────────────────────────────────────┐
│                        Control Plane                          │
│   - REST API (cmd, internal/handlers)                         │
│   - Business logic (internal/services, internal/core)         │
│   - Credential & encryption (internal/encryption)             │
│   - Persistent state (internal/storage, migrations)           │
│   - Configuration (config)                                    │
└───────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────────────────────┐
│                    External Dependencies                      │
│   - PostgreSQL (default persistence)                          │
│   - Observability stack (OpenTelemetry, Prometheus)           │
│   - Pluggable LLM providers (via SDK adapters)                │
└───────────────────────────────────────────────────────────────┘
```

## Control Plane (`control-plane/`)

The control plane is a Go service that exposes REST endpoints, manages agent
registration, handles credentials, and serves a React-based administration UI.

### Directory Structure

```
control-plane/
├── cmd/            # Binary entry points (HTTP server, background workers)
├── internal/       # All private business logic (not importable externally)
│   ├── application/    # Application bootstrap and dependency wiring
│   ├── cli/            # CLI framework and sub-commands
│   ├── config/         # Runtime configuration loading
│   ├── core/           # Domain types, interfaces, and core services
│   ├── encryption/     # Credential and secret encryption helpers
│   ├── events/         # Internal event bus
│   ├── handlers/       # HTTP request handlers (REST endpoints)
│   ├── infrastructure/ # Low-level I/O (communication, process, storage backends)
│   ├── logger/         # Structured logging setup
│   ├── mcp/            # Model Context Protocol integration
│   ├── packages/       # Package-management helpers
│   ├── server/         # HTTP server setup and middleware
│   ├── services/       # High-level service layer
│   ├── storage/        # Persistence abstractions and implementations
│   ├── templates/      # Code-generation templates (Go, Python, TypeScript)
│   └── utils/          # Shared utility functions
├── pkg/            # Exported, reusable packages
│   ├── adminpb/    # Generated protobuf types for the admin API
│   └── types/      # Shared public types
├── proto           # Protocol Buffer source definitions
├── migrations/     # Database schema migrations (Goose)
├── config/         # Default configuration and environment templates
└── web/            # React-based administration UI (TypeScript)
```

### Data Flow

1. SDK clients or the web UI call the REST API defined in `internal/handlers`.
2. Handlers delegate to the service layer in `internal/services`.
3. Services coordinate with `internal/core` domain logic, `internal/storage`
   for persistence, and `internal/encryption` for secret handling.
4. Persistent state lives in PostgreSQL, versioned by `migrations/`.

## SDKs (`sdk/`)

### Python (`sdk/python`)

A FastAPI-based agent framework and control-plane client. Agents are defined
with a `@agent.reasoner()` decorator, served over HTTP via FastAPI, and
registered with the control plane at startup.

- `agentfield/agent.py` – `Agent` class, `@reasoner` decorator, lifecycle management.
- `agentfield/agent_server.py` – FastAPI app factory that exposes agent endpoints.
- `agentfield/client.py` – REST client for the control-plane API.
- `agentfield/router.py` – Request routing and workflow orchestration helpers.
- `agentfield/memory.py` – In-process memory and state management.
- PyPI-ready project built with `pyproject.toml`.

### Go (`sdk/go`)

Idiomatic Go client and agent framework with `agent`, `client`, `types`, and
`ai` packages. Implements interfaces shared with the control plane and is
available via `go get`.

### TypeScript (`sdk/typescript`)

Node.js/Bun agent framework with equivalent packages for agent definition,
MCP integration, memory, and workflow orchestration.

## Examples (`examples/`)

Reference implementations of agents in Python, Go, and TypeScript that
demonstrate common patterns (streaming, tool use, multimodal, benchmarks).

## Deployments (`deployments/`)

- `deployments/docker/Dockerfile.control-plane` – builds the Go binary and
  bundles the web UI.
- `deployments/docker/Dockerfile.python-agent` and `Dockerfile.go-agent` –
  reference runtime images for agent containers.
- `deployments/docker/docker-compose.yml` – local stack (control plane +
  dependencies).
- `deployments/helm/` – Helm chart for Kubernetes.

## Extensibility

- Swap the persistence backend by implementing the interfaces in
  `internal/storage`.
- Add new transports (GraphQL, WebSockets) via `cmd/` entry points.
- Extend any SDK by adding modules in its respective directory.

For operational details see `docs/DEVELOPMENT.md` and `docs/SECURITY.md`.
