package connectors

import "context"

// AuditRecord carries information about a connector invocation.
type AuditRecord struct {
	Connector    string
	Operation    string
	StartedAt    int64  // Unix milliseconds
	CompletedAt  int64  // Unix milliseconds
	Status       string // pending, succeeded, failed
	ErrorMessage string
	DurationMs   int64
	HTTPStatus   int
}

// Auditor writes audit records for connector invocations.
type Auditor interface {
	OnStart(ctx context.Context, record AuditRecord) error
	OnEnd(ctx context.Context, record AuditRecord) error
}

// NoopAuditor is an Auditor that does nothing.
type NoopAuditor struct{}

// OnStart does nothing.
func (n *NoopAuditor) OnStart(ctx context.Context, record AuditRecord) error {
	return nil
}

// OnEnd does nothing.
func (n *NoopAuditor) OnEnd(ctx context.Context, record AuditRecord) error {
	return nil
}
