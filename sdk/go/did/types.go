package did

import "time"

// DIDIdentity represents a single identity (agent, reasoner, or skill) in the DID system.
// It contains cryptographic key material (JWK format) and metadata for identity resolution.
// Immutable after creation; private keys are never exposed in public APIs.
type DIDIdentity struct {
	DID            string  `json:"did"`
	PrivateKeyJwk  string  `json:"private_key_jwk"`
	PublicKeyJwk   string  `json:"public_key_jwk"`
	DerivationPath string  `json:"derivation_path"`
	ComponentType  string  `json:"component_type"`
	FunctionName   *string `json:"function_name,omitempty"`
}

// DIDIdentityPackage represents the complete identity package returned by DID registration.
// It contains the agent's DID and maps of reasoner and skill DIDs, indexed by function name.
// AgentfieldServerID tracks the identity package on the control plane.
type DIDIdentityPackage struct {
	AgentDID           DIDIdentity            `json:"agent_did"`
	ReasonerDIDs       map[string]DIDIdentity `json:"reasoner_dids"`
	SkillDIDs          map[string]DIDIdentity `json:"skill_dids"`
	AgentfieldServerID string                 `json:"agentfield_server_id"`
}

// ExecutionCredential represents a single execution's verifiable credential.
// It contains the W3C VC document (opaque to SDK), cryptographic proof, and audit metadata.
// Optional fields (sessionId, issuerDid, targetDid, callerDid, signature, inputHash, outputHash)
// use *string pointers to support JSON null semantics and omitempty serialization.
type ExecutionCredential struct {
	VCId        string         `json:"vc_id"`
	ExecutionID string         `json:"execution_id"`
	WorkflowID  string         `json:"workflow_id"`
	SessionID   *string        `json:"session_id,omitempty"`
	IssuerDID   *string        `json:"issuer_did,omitempty"`
	TargetDID   *string        `json:"target_did,omitempty"`
	CallerDID   *string        `json:"caller_did,omitempty"`
	VCDocument  map[string]any `json:"vc_document"`
	Signature   *string        `json:"signature,omitempty"`
	InputHash   *string        `json:"input_hash,omitempty"`
	OutputHash  *string        `json:"output_hash,omitempty"`
	Status      string         `json:"status"`
	CreatedAt   time.Time      `json:"created_at"`
}

// GenerateCredentialOptions provides configuration for credential generation.
// It captures execution context, input/output data (serialized separately as base64),
// status information, and execution metadata.
// InputData and OutputData use json:"-" tags because they are serialized as base64
// before transmission and not included in the struct's JSON representation.
type GenerateCredentialOptions struct {
	ExecutionID  string         `json:"execution_id"`
	WorkflowID   *string        `json:"workflow_id,omitempty"`
	SessionID    *string        `json:"session_id,omitempty"`
	CallerDID    *string        `json:"caller_did,omitempty"`
	TargetDID    *string        `json:"target_did,omitempty"`
	AgentNodeDID *string        `json:"agent_node_did,omitempty"`
	Timestamp    *time.Time     `json:"timestamp,omitempty"`
	InputData    any            `json:"-"` // Serialized separately as base64
	OutputData   any            `json:"-"` // Serialized separately as base64
	Status       string         `json:"status"`
	ErrorMessage *string        `json:"error_message,omitempty"`
	DurationMs   int64          `json:"duration_ms"`
}

// WorkflowCredential represents an aggregate verifiable credential at the workflow level.
// It tracks the workflow execution as a whole, including start/end times and step completion.
// EndTime is optional (nil if workflow is still in progress).
type WorkflowCredential struct {
	WorkflowID    string     `json:"workflow_id"`
	SessionID     *string    `json:"session_id,omitempty"`
	ComponentVCs  []string   `json:"component_vcs"`
	WorkflowVCID  string     `json:"workflow_vc_id"`
	Status        string     `json:"status"`
	StartTime     time.Time  `json:"start_time"`
	EndTime       *time.Time `json:"end_time,omitempty"`
	TotalSteps    int        `json:"total_steps"`
	CompletedSteps int       `json:"completed_steps"`
}

// AuditTrailExport represents a complete audit trail for external verification.
// It aggregates execution and workflow credentials with optional filter metadata.
// FiltersApplied documents which filters were active during this export operation.
type AuditTrailExport struct {
	AgentDIDs       []string              `json:"agent_dids"`
	ExecutionVCs    []ExecutionCredential `json:"execution_vcs"`
	WorkflowVCs     []WorkflowCredential  `json:"workflow_vcs"`
	TotalCount      int                   `json:"total_count"`
	FiltersApplied  map[string]any        `json:"filters_applied,omitempty"`
}

// AuditTrailFilter provides optional filters for audit trail export queries.
// All fields are optional (nil pointers); empty filter returns all credentials up to server limit.
// Query struct tags indicate these fields are sent as URL query parameters, not JSON body.
type AuditTrailFilter struct {
	WorkflowID *string `query:"workflow_id,omitempty"`
	SessionID  *string `query:"session_id,omitempty"`
	IssuerDID  *string `query:"issuer_did,omitempty"`
	Status     *string `query:"status,omitempty"`
	Limit      *int    `query:"limit,omitempty"`
}

// DIDRegistrationRequest is an internal type used by DIDClient to register agents with the control plane.
// It captures the agent's node ID and declarative lists of reasoners and skills to register.
// This type is not exposed to end users; it is internal to the DID package.
type DIDRegistrationRequest struct {
	AgentNodeID string              `json:"agent_node_id"`
	Reasoners   []map[string]any    `json:"reasoners"`
	Skills      []map[string]any    `json:"skills"`
}
