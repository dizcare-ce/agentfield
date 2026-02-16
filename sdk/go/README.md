# AgentField Go SDK

The AgentField Go SDK provides idiomatic Go bindings for interacting with the AgentField control plane.

## Installation

```bash
go get github.com/Agent-Field/agentfield/sdk/go
```

## Quick Start

```go
package main

import (
    "context"
    "log"

    agentfieldagent "github.com/Agent-Field/agentfield/sdk/go/agent"
)

func main() {
    agent, err := agentfieldagent.New(agentfieldagent.Config{
        NodeID:   "example-agent",
        AgentFieldURL: "http://localhost:8080",
    })
    if err != nil {
        log.Fatal(err)
    }

    agent.RegisterSkill("health", func(ctx context.Context, _ map[string]any) (any, error) {
        return map[string]any{"status": "ok"}, nil
    })

    if err := agent.Run(context.Background()); err != nil {
        log.Fatal(err)
    }
}
```

## Modules

- `agent`: Build AgentField-compatible agents and register reasoners/skills.
- `client`: Low-level HTTP client for the AgentField control plane.
- `types`: Shared data structures and contracts.
- `ai`: Helpers for interacting with AI providers via the control plane.
- `did`: Decentralized Identity (DID) and Verifiable Credentials (VC) for compliance audit trails.

## DID/VC Features

Enable cryptographic identity management and tamper-proof audit trails for compliance-grade workflows:

```go
// Enable DID/VC in agent configuration
agent, err := agentfieldagent.New(agentfieldagent.Config{
    NodeID:        "my-agent",
    AgentFieldURL: "https://control-plane.example.com",
    Token:         "your-api-token",
    VCEnabled:     true,  // Enable DIDs and verifiable credentials
})

// Get the agent's DID
if agent.DID().IsEnabled() {
    agentDID := agent.DID().GetAgentDID()
    log.Printf("Agent DID: %s", agentDID)
}

// Generate credentials for executions (W3C compliant)
cred, err := agent.DID().GenerateCredential(context.Background(), did.GenerateCredentialOptions{
    ExecutionID: "exec-123",
    InputData:   map[string]any{"query": "analyze"},
    OutputData:  map[string]any{"result": 42},
    Status:      "succeeded",
})

// Export audit trail for compliance
export, err := agent.DID().ExportAuditTrail(context.Background(), did.AuditTrailFilter{
    WorkflowID: stringPtr("workflow-xyz"),
    Limit:      intPtr(1000),
})
```

For detailed usage, see the [`did` package documentation](./did/README.md).

## Testing

```bash
go test ./...
```

## License

Distributed under the Apache 2.0 License. See the repository root for full details.
