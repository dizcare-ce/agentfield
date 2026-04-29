package connector

import (
	"context"
	"fmt"
	"time"

	connectors "github.com/Agent-Field/agentfield/control-plane/internal/connectors"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
)

// invocationIDKey is the context key handlers use to receive the
// generated invocation ID from the auditor. Handlers pass a *string;
// auditor writes the UUID into it on OnStart. Race-free per call.
type invocationIDKey struct{}

// WithInvocationIDReceiver returns a context that lets the auditor write
// the generated invocation UUID back to the caller. The handler reads
// *out after Invoke returns.
func WithInvocationIDReceiver(ctx context.Context, out *string) context.Context {
	return context.WithValue(ctx, invocationIDKey{}, out)
}

// StorageAuditor implements connectors.Auditor by persisting invocations
// to the connector_invocations table. It tracks pending start, completion,
// and failure states with full audit metadata.
type StorageAuditor struct {
	store storage.StorageProvider
}

// NewStorageAuditor creates a StorageAuditor with a storage backend.
func NewStorageAuditor(store storage.StorageProvider) *StorageAuditor {
	return &StorageAuditor{
		store: store,
	}
}

// OnStart creates a pending ConnectorInvocation record and stores the
// invocation ID for later retrieval by handlers.
func (s *StorageAuditor) OnStart(ctx context.Context, record connectors.AuditRecord) error {
	if s.store == nil {
		return fmt.Errorf("storage auditor: store is nil")
	}

	// Extract run_id from context if present (passed by handler)
	runID := ""
	if v := ctx.Value("run_id"); v != nil {
		if rid, ok := v.(string); ok {
			runID = rid
		}
	}

	// Create ConnectorInvocation record with pending status
	inv := &types.ConnectorInvocation{
		ID:            record.InvocationID,
		RunID:         runID,
		ConnectorName: record.Connector,
		OperationName: record.Operation,
		Status:        "pending",
		StartedAt:     time.UnixMilli(record.StartedAt),
	}

	// Store the record
	if err := s.store.InsertConnectorInvocation(ctx, inv); err != nil {
		return fmt.Errorf("storage auditor: insert invocation: %w", err)
	}

	// Write the generated UUID into the handler's *string receiver if one
	// was provided via WithInvocationIDReceiver. Race-free per call.
	if out, ok := ctx.Value(invocationIDKey{}).(*string); ok && out != nil {
		*out = record.InvocationID
	}

	return nil
}

// OnEnd updates the ConnectorInvocation record with completion status,
// duration, HTTP status, and error details.
func (s *StorageAuditor) OnEnd(ctx context.Context, record connectors.AuditRecord) error {
	if s.store == nil {
		return fmt.Errorf("storage auditor: store is nil")
	}

	// Use the invocation ID from the audit record
	invocationID := record.InvocationID

	// Convert error message
	var errorMsg string
	if record.ErrorMessage != "" {
		errorMsg = record.ErrorMessage
	}

	// Convert completed timestamp and duration
	completedAt := time.UnixMilli(record.CompletedAt)
	durationMS := record.DurationMs

	// Prepare HTTP status (may be nil)
	var httpStatus *int
	if record.HTTPStatus != 0 {
		httpStatus = &record.HTTPStatus
	}

	// Update the record
	if err := s.store.UpdateConnectorInvocation(
		ctx,
		invocationID,
		record.Status,
		errorMsg,
		httpStatus,
		durationMS,
		completedAt,
	); err != nil {
		return fmt.Errorf("storage auditor: update invocation: %w", err)
	}

	return nil
}

