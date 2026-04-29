package types

import "time"

// ConnectorInvocationStatus represents the status of a connector invocation.
type ConnectorInvocationStatus string

const (
	ConnectorInvocationStatusPending   ConnectorInvocationStatus = "pending"
	ConnectorInvocationStatusSucceeded ConnectorInvocationStatus = "succeeded"
	ConnectorInvocationStatusFailed    ConnectorInvocationStatus = "failed"
)

// ConnectorInvocation represents a single invocation of a connector operation.
type ConnectorInvocation struct {
	// Unique identifier for this invocation
	ID string `json:"id"`

	// RunID identifies the workflow that issued this call
	RunID string `json:"run_id"`

	// ExecutionID identifies the reasoner step that issued the call
	ExecutionID string `json:"execution_id"`

	// AgentNodeID identifies the agent node that made the call
	AgentNodeID string `json:"agent_node_id"`

	// ConnectorName is the name of the connector (e.g., "github", "slack")
	ConnectorName string `json:"connector_name"`

	// OperationName is the name of the operation within the connector
	OperationName string `json:"operation_name"`

	// InputsRedacted contains JSON-encoded inputs with sensitive fields redacted
	// nil when no recordable inputs
	InputsRedacted []byte `json:"inputs_redacted,omitempty"`

	// Status is the invocation status: pending | succeeded | failed
	Status string `json:"status"`

	// HTTPStatus is the HTTP status code returned by the connector
	HTTPStatus *int `json:"http_status,omitempty"`

	// ErrorMessage contains error details when status is failed
	ErrorMessage string `json:"error_message,omitempty"`

	// DurationMS is the execution duration in milliseconds
	DurationMS *int64 `json:"duration_ms,omitempty"`

	// StartedAt is the timestamp when the invocation began
	StartedAt time.Time `json:"started_at"`

	// CompletedAt is the timestamp when the invocation completed (null if pending)
	CompletedAt *time.Time `json:"completed_at,omitempty"`

	// ParentVCID links to the parent VC for provenance chain
	ParentVCID string `json:"parent_vc_id,omitempty"`

	// InvocationVCID is the VC ID for this invocation's audit record
	InvocationVCID string `json:"invocation_vc_id,omitempty"`
}
