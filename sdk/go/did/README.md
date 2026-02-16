# DID/VC Module

Decentralized Identity (DID) and Verifiable Credentials (VC) support for AgentField agents. This module enables cryptographic identity management and tamper-proof audit trails for compliance-grade multi-agent workflows.

## Overview

The `did` package provides:

- **Agent Identity Registration**: Register agents with the control plane to obtain a Decentralized Identifier (DID)
- **Function DIDs**: Automatic DID assignment for reasoners and skills
- **Verifiable Credential Generation**: Create W3C-compliant credentials for execution audit trails
- **Audit Trail Export**: Export and filter credentials for compliance verification
- **Graceful Degradation**: All DID features are optional; agents work unchanged when disabled

## W3C Verifiable Credentials Alignment

This module implements the [W3C Verifiable Credentials Data Model 1.1](https://www.w3.org/TR/vc-data-model/). Credentials generated through this module are:

- **Tamper-proof**: Cryptographic signatures prevent unauthorized modification
- **Verifiable**: Signatures can be verified independently
- **Compliance-ready**: Suitable for auditing and regulatory requirements
- **Interoperable**: Standard format compatible with other W3C VC implementations

The control plane is responsible for:
- Generating cryptographic keys (JWK format)
- Creating and signing credentials
- Managing the DID registry
- Verifying credential proofs

The Go SDK stores and transmits credentials as opaque structures; no local cryptographic operations are performed.

## When to Use DID/VC Features

**Use when:**
- Your workflow requires audit trails for compliance (e.g., financial, healthcare, regulated environments)
- You need cryptographic proof of who executed what and when
- You want tamper-proof records of multi-agent interactions
- Your control plane supports the DID system (v1.0+)

**Not needed when:**
- You're building simple internal agents without compliance requirements
- Audit trails are optional or logs are sufficient
- Your control plane doesn't support DID registration

## Configuration

Enable DID/VC features by setting `VCEnabled: true` in the Agent configuration:

```go
package main

import (
	"context"
	"log"

	agentfieldagent "github.com/Agent-Field/agentfield/sdk/go/agent"
)

func main() {
	// Create agent with DID/VC support enabled
	agent, err := agentfieldagent.New(agentfieldagent.Config{
		NodeID:        "my-agent",
		AgentFieldURL: "https://control-plane.example.com",
		Token:         "your-api-token",
		VCEnabled:     true, // Enable DID/VC features
	})
	if err != nil {
		log.Fatal(err)
	}

	// Register a reasoner
	agent.RegisterReasoner("analyst", func(ctx context.Context, input map[string]any) (any, error) {
		// Your reasoning logic here
		return map[string]any{"result": "analysis"}, nil
	})

	// Run the agent
	if err := agent.Run(context.Background()); err != nil {
		log.Fatal(err)
	}
}
```

### Configuration Notes

- **VCEnabled**: Optional boolean (default: `false`). Set to `true` to enable DID registration and credential generation.
- **AgentFieldURL**: Required for DID features. Must be the control plane base URL.
- **Token**: Optional; used in Authorization header if provided.
- **Non-fatal failures**: If registration fails, a warning is logged but the agent continues operating without DIDs.

## Usage Examples

### Getting the Agent's DID

```go
// After agent initialization with VCEnabled=true
agentDID := agent.DID().GetAgentDID()
if agentDID != "" {
	log.Printf("Agent DID: %s", agentDID)
} else {
	log.Println("Agent DID not available (feature disabled or registration failed)")
}
```

### Getting a Function's DID

```go
// Get DID for a specific reasoner or skill
// Falls back to agent DID if function not found
reasonerDID := agent.DID().GetFunctionDID("analyst")
log.Printf("Reasoner DID: %s", reasonerDID)
```

### Generating Credentials

```go
import (
	"context"
	"time"

	"github.com/Agent-Field/agentfield/sdk/go/did"
)

// After a reasoner execution, generate a credential
cred, err := agent.DID().GenerateCredential(context.Background(), did.GenerateCredentialOptions{
	ExecutionID: "exec-abc123",
	WorkflowID:  stringPtr("workflow-xyz"),
	SessionID:   stringPtr("session-123"),
	InputData:   map[string]any{"query": "analyze sales data"},
	OutputData:  map[string]any{"result": 42},
	Status:      "succeeded",
	DurationMs:  1500,
})
if err != nil {
	log.Printf("Failed to generate credential: %v", err)
	return // Credential generation is non-fatal
}

log.Printf("Credential generated: %s", cred.VCId)

// Helper function for optional string pointers
func stringPtr(s string) *string {
	return &s
}
```

### Exporting Audit Trails

```go
import (
	"context"

	"github.com/Agent-Field/agentfield/sdk/go/did"
)

// Export all credentials for a workflow
export, err := agent.DID().ExportAuditTrail(context.Background(), did.AuditTrailFilter{
	WorkflowID: stringPtr("workflow-xyz"),
	Limit:      intPtr(1000),
})
if err != nil {
	log.Printf("Failed to export audit trail: %v", err)
	return
}

log.Printf("Found %d execution credentials", len(export.ExecutionVCs))
for _, vc := range export.ExecutionVCs {
	log.Printf("  Execution %s: %s", vc.ExecutionID, vc.Status)
}

// Helper function for optional int pointers
func intPtr(i int) *int {
	return &i
}
```

### Filtering Audit Trails

```go
// Filter by multiple criteria
filter := did.AuditTrailFilter{
	WorkflowID: stringPtr("workflow-xyz"),
	SessionID:  stringPtr("session-123"),
	Status:     stringPtr("succeeded"),
	Limit:      intPtr(100),
}

export, err := agent.DID().ExportAuditTrail(context.Background(), filter)
if err != nil {
	log.Printf("Error: %v", err)
	return
}

// Inspect the export
log.Printf("Audit trail: %d total credentials", export.TotalCount)
log.Printf("Applied filters: %+v", export.FiltersApplied)
```

## Control Plane Endpoints

The DID package communicates with these control plane endpoints:

### POST /api/v1/did/register
Registers an agent and obtains its identity package (DID + reasoner DIDs + skill DIDs).

**Request:**
```json
{
  "agent_node_id": "my-agent",
  "reasoners": [
    {"id": "analyst"},
    {"id": "validator"}
  ],
  "skills": []
}
```

**Response:**
```json
{
  "agent_did": {
    "did": "did:agent:xyz789...",
    "private_key_jwk": "{...}",
    "public_key_jwk": "{...}",
    "derivation_path": "m/44'/0'/0'/0/0",
    "component_type": "agent"
  },
  "reasoner_dids": {
    "analyst": {
      "did": "did:reasoner:abc123...",
      "private_key_jwk": "{...}",
      "public_key_jwk": "{...}",
      "derivation_path": "m/44'/0'/0'/0/1",
      "component_type": "reasoner",
      "function_name": "analyst"
    }
  },
  "skill_dids": {},
  "agentfield_server_id": "server-123"
}
```

### POST /api/v1/execution/vc
Generates a verifiable credential for an execution.

**Request:**
```json
{
  "execution_context": {
    "execution_id": "exec-123",
    "workflow_id": "workflow-xyz",
    "session_id": "session-456",
    "caller_did": "did:reasoner:...",
    "target_did": "did:reasoner:...",
    "agent_node_did": "did:agent:...",
    "timestamp": "2026-02-16T12:00:00Z"
  },
  "input_data": "eyJxdWVyeSI6ImFuYWx5emUgc2FsZXMgZGF0YSJ9",
  "output_data": "eyJyZXN1bHQiOiA0Mn0=",
  "status": "succeeded",
  "error_message": null,
  "duration_ms": 1500
}
```

Note: `input_data` and `output_data` are base64-encoded JSON strings.

**Response:**
```json
{
  "vc_id": "vc-xyz789...",
  "execution_id": "exec-123",
  "workflow_id": "workflow-xyz",
  "session_id": "session-456",
  "issuer_did": "did:agent:...",
  "target_did": "did:reasoner:...",
  "caller_did": "did:reasoner:...",
  "vc_document": {
    "@context": "https://www.w3.org/2018/credentials/v1",
    "type": ["VerifiableCredential"],
    "issuer": "did:agent:...",
    "issuanceDate": "2026-02-16T12:00:00Z",
    "credentialSubject": {...},
    "proof": {...}
  },
  "signature": "sig...",
  "input_hash": "hash...",
  "output_hash": "hash...",
  "status": "succeeded",
  "created_at": "2026-02-16T12:00:00Z"
}
```

### GET /api/v1/did/export/vcs
Exports audit trail credentials with optional filters.

**Query Parameters (all optional):**
- `workflow_id`: Filter by workflow ID
- `session_id`: Filter by session ID
- `issuer_did`: Filter by issuer DID
- `status`: Filter by credential status (e.g., "succeeded", "failed")
- `limit`: Maximum number of credentials to return

**Response:**
```json
{
  "agent_dids": ["did:agent:..."],
  "execution_vcs": [
    {
      "vc_id": "vc-1",
      "execution_id": "exec-123",
      "workflow_id": "workflow-xyz",
      "status": "succeeded",
      "created_at": "2026-02-16T12:00:00Z",
      ...
    }
  ],
  "workflow_vcs": [],
  "total_count": 1,
  "filters_applied": {
    "workflow_id": "workflow-xyz"
  }
}
```

## Error Handling

### Graceful Degradation When Disabled

When `VCEnabled: false` (or registration fails):
- `agent.DID().GetAgentDID()` returns empty string
- `agent.DID().GetFunctionDID(name)` returns empty string
- `agent.DID().GenerateCredential(ctx, opts)` returns error "DID system not enabled"
- `agent.DID().ExportAuditTrail(ctx, filter)` returns error "DID system not enabled"
- `agent.DID().IsEnabled()` returns false

This allows your code to check if DIDs are available:

```go
if agent.DID().IsEnabled() {
	// DIDs are available, generate credentials
	cred, err := agent.DID().GenerateCredential(ctx, opts)
	if err != nil {
		log.Printf("Warning: credential generation failed: %v", err)
		// Continue without credential
	}
} else {
	log.Println("DIDs not enabled; skipping credential generation")
}
```

### Non-fatal Registration Errors

If DID registration fails during agent initialization:
1. A warning is logged
2. The agent continues to run
3. All DID methods return empty results or errors
4. No panic occurs

Example registration failure (logged):
```
warning: DID registration failed: http error (503): service unavailable
```

To verify registration succeeded:

```go
pkg := agent.DID().GetIdentityPackage()
if pkg == nil {
	log.Println("DID registration was not successful")
} else {
	log.Printf("Agent DID: %s", pkg.AgentDID.DID)
}
```

### Network Errors

Network failures during credential generation or audit trail export are returned as errors:

```go
cred, err := agent.DID().GenerateCredential(ctx, opts)
if err != nil {
	if errors.Is(err, context.DeadlineExceeded) {
		log.Println("Credential generation timed out (30s)")
	} else {
		log.Printf("Failed to generate credential: %v", err)
	}
	// Caller decides whether to retry or continue
}
```

## Public API Reference

### Types

- **DIDIdentity**: Represents a single identity (agent, reasoner, or skill)
- **DIDIdentityPackage**: Complete identity package returned by registration
- **ExecutionCredential**: Verifiable credential for a single execution
- **GenerateCredentialOptions**: Configuration for credential generation
- **WorkflowCredential**: Aggregate credential for workflow-level audit trails
- **AuditTrailExport**: Complete audit trail for external verification
- **AuditTrailFilter**: Optional filters for audit trail queries

### Methods

**Agent.DID()** returns `*DIDManager`:
- `GetAgentDID() string`: Get the agent's DID (empty if disabled)
- `GetFunctionDID(name string) string`: Get a reasoner/skill DID (empty if not found)
- `GenerateCredential(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error)`: Create a credential
- `ExportAuditTrail(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error)`: Export credentials
- `IsEnabled() bool`: Check if DID system is enabled
- `GetIdentityPackage() *DIDIdentityPackage`: Get the registered identity package (nil if disabled)

## Integration Patterns

### Pattern 1: Credential Generation Per Execution

```go
// In your reasoner handler
agent.RegisterReasoner("analyst", func(ctx context.Context, input map[string]any) (any, error) {
	start := time.Now()

	// Your analysis logic
	result := analyze(input)

	// Generate credential (optional; non-fatal if fails)
	if agent.DID().IsEnabled() {
		duration := time.Since(start).Milliseconds()
		_, err := agent.DID().GenerateCredential(ctx, did.GenerateCredentialOptions{
			ExecutionID: getExecutionID(ctx),    // Extract from context
			WorkflowID:  getWorkflowID(ctx),     // Extract from context
			InputData:   input,
			OutputData:  result,
			Status:      "succeeded",
			DurationMs:  duration,
		})
		if err != nil {
			log.Printf("Warning: failed to generate credential: %v", err)
		}
	}

	return result, nil
})
```

### Pattern 2: Audit Trail Export

```go
// Export credentials for compliance reporting
func exportComplianceReport(agent *agentfieldagent.Agent, workflowID string) error {
	export, err := agent.DID().ExportAuditTrail(context.Background(), did.AuditTrailFilter{
		WorkflowID: stringPtr(workflowID),
		Limit:      intPtr(10000),
	})
	if err != nil {
		return fmt.Errorf("export audit trail: %w", err)
	}

	// Process credentials for reporting
	for _, vc := range export.ExecutionVCs {
		log.Printf("Execution %s: %s status=%s", vc.ExecutionID, vc.CreatedAt, vc.Status)
	}

	return nil
}
```

### Pattern 3: Conditional Audit Logging

```go
// Automatically log credentials for failed executions
handleError := func(ctx context.Context, err error, input, output any) {
	if agent.DID().IsEnabled() {
		_, credErr := agent.DID().GenerateCredential(ctx, did.GenerateCredentialOptions{
			ExecutionID:  getExecutionID(ctx),
			InputData:    input,
			OutputData:   output,
			Status:       "failed",
			ErrorMessage: stringPtr(err.Error()),
			DurationMs:   getDuration(ctx).Milliseconds(),
		})
		if credErr != nil {
			log.Printf("Warning: failed to log error credential: %v", credErr)
		}
	}
}
```

## Troubleshooting

### DIDs are empty strings

**Check:**
1. Is `VCEnabled: true` set in Agent config?
2. Did registration succeed? Call `agent.DID().IsEnabled()` to verify.
3. Is the control plane URL correct and accessible?
4. Check agent logs for "DID registration failed" warnings.

### Credential generation times out

**Check:**
1. Is the control plane responding? Try `curl https://control-plane/health`
2. Is the request payload too large? Limit input/output data size.
3. Network latency? The timeout is 30 seconds.

### "DID system not enabled" error

**Solution:**
1. Set `VCEnabled: true` in agent config
2. Ensure registration succeeded: `log.Println(agent.DID().IsEnabled())`
3. Use `if agent.DID().IsEnabled()` guards before calling credential methods

## Performance Considerations

- **Registration**: Happens once at agent startup (non-blocking)
- **Credential generation**: ~50-100ms per credential (network dependent)
- **Audit trail export**: Depends on number of credentials (server-limited to ~10k by default)
- **Memory**: Audit trails with large input/output data consume proportional memory

## Future Extensibility

The architecture supports these features (not yet implemented):
- Automatic VC generation middleware for all reasoners
- Local DID resolution cache with TTL
- VC verification utilities
- Streaming audit trail export
- Integration with local credential storage

## License

Distributed under the Apache 2.0 License. See the repository root for full details.
