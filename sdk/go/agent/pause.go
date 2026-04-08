package agent

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"

	"github.com/Agent-Field/agentfield/sdk/go/client"
)

// ApprovalResult holds the outcome of a human approval (HITL) request.
type ApprovalResult struct {
	// Decision is one of "approved", "rejected", "request_changes", "expired", "error".
	Decision string

	// Feedback is a free-form human comment (if provided).
	Feedback string

	// ExecutionID is the execution that was paused.
	ExecutionID string

	// ApprovalRequestID is the request ID used for this approval.
	ApprovalRequestID string

	// RawResponse carries the submitted form values when using the native
	// HITL portal flow.  Nil for legacy external-approval responses.
	RawResponse map[string]any
}

// Approved returns true when the human approved the request.
func (r ApprovalResult) Approved() bool { return r.Decision == "approved" }

// ChangesRequested returns true when the human requested changes.
func (r ApprovalResult) ChangesRequested() bool { return r.Decision == "request_changes" }

// PauseOptions configures a Pause call.
type PauseOptions struct {
	// ApprovalRequestID is the ID of the approval request.  Required for the
	// external-approval flow.  Optional when FormSchema is provided — if empty,
	// a random UUID is auto-generated.
	ApprovalRequestID string

	// ApprovalRequestURL is the URL where the human can review the request.
	// When FormSchema is set and this is empty, the control plane auto-generates
	// /hitl/<request_id>.
	ApprovalRequestURL string

	// ExpiresInHours is the time before the request expires (default 72).
	ExpiresInHours int

	// FormSchema is the native HITL form schema produced by the hitl package.
	// When set, the control plane renders a native form at /hitl/<request_id>.
	FormSchema json.RawMessage

	// Tags are optional metadata labels for inbox filtering.
	Tags []string

	// Priority is the optional priority level: "low", "normal", "high", "urgent".
	Priority string
}

// PauseOption is a functional option for Pause.
type PauseOption func(*PauseOptions)

// WithApprovalRequestID sets the approval request ID explicitly.
func WithApprovalRequestID(id string) PauseOption {
	return func(o *PauseOptions) { o.ApprovalRequestID = id }
}

// WithApprovalRequestURL sets the URL where the human can review the request.
func WithApprovalRequestURL(u string) PauseOption {
	return func(o *PauseOptions) { o.ApprovalRequestURL = u }
}

// WithExpiresInHours sets the approval expiry window.
func WithExpiresInHours(h int) PauseOption {
	return func(o *PauseOptions) { o.ExpiresInHours = h }
}

// WithFormSchema sets the native HITL form schema (produced by the hitl package).
// When set, the control plane renders a native form portal page.
func WithFormSchema(schema json.RawMessage) PauseOption {
	return func(o *PauseOptions) { o.FormSchema = schema }
}

// WithHitlTags sets metadata tags for inbox filtering (e.g. "pr-review").
func WithHitlTags(tags ...string) PauseOption {
	return func(o *PauseOptions) { o.Tags = tags }
}

// WithPriority sets the priority level: "low", "normal", "high", or "urgent".
func WithPriority(p string) PauseOption {
	return func(o *PauseOptions) { o.Priority = p }
}

// Pause transitions the current execution to the "waiting" state on the
// control plane and blocks until the human responds or the context is cancelled.
//
// External-approval flow (legacy): create an approval request on an external
// service, pass the resulting ID via WithApprovalRequestID, and optionally
// pass the review URL via WithApprovalRequestURL.
//
// Native portal flow: pass a form schema via WithFormSchema and omit
// WithApprovalRequestID — a UUID is auto-generated.  The control plane renders
// the form at /hitl/<request_id> with no external service required.
//
// Example (native portal):
//
//	import "github.com/Agent-Field/agentfield/sdk/go/hitl"
//
//	schema, _ := hitl.NewForm("Review PR #1138",
//	    hitl.WithField(hitl.NewButtonGroup("decision",
//	        hitl.NewOption("approve", "Approve", hitl.WithVariant("default")),
//	        hitl.NewOption("reject",  "Reject",  hitl.WithVariant("destructive")),
//	    )),
//	).MarshalJSON()
//
//	result, err := agent.Pause(ctx,
//	    agent.WithFormSchema(schema),
//	    agent.WithHitlTags("pr-review"),
//	    agent.WithPriority("high"),
//	)
func (a *Agent) Pause(ctx context.Context, opts ...PauseOption) (ApprovalResult, error) {
	o := &PauseOptions{ExpiresInHours: 72}
	for _, opt := range opts {
		opt(o)
	}

	// Resolve ApprovalRequestID
	if o.ApprovalRequestID == "" {
		if len(o.FormSchema) > 0 {
			id, err := generateUUID()
			if err != nil {
				return ApprovalResult{}, fmt.Errorf("pause: generate request ID: %w", err)
			}
			o.ApprovalRequestID = id
		} else {
			return ApprovalResult{}, fmt.Errorf(
				"pause: ApprovalRequestID is required when FormSchema is not provided; " +
					"for the native portal flow pass WithFormSchema — a UUID is auto-generated",
			)
		}
	}

	if a.client == nil {
		return ApprovalResult{}, fmt.Errorf(
			"pause: no control plane client — set AgentFieldURL in Config",
		)
	}

	// Resolve execution ID from context
	execCtx := executionContextFrom(ctx)
	executionID := execCtx.ExecutionID
	if executionID == "" {
		return ApprovalResult{}, fmt.Errorf("pause: no execution_id in context")
	}

	req := client.RequestApprovalRequest{
		ExpiresInHours: o.ExpiresInHours,
		FormSchema:     o.FormSchema,
		Tags:           o.Tags,
		Priority:       o.Priority,
	}
	if o.ApprovalRequestURL != "" {
		req.Title = o.ApprovalRequestURL // field is re-used for the URL
	}

	// Tell the control plane to transition to "waiting"
	_, err := a.client.RequestApproval(ctx, a.cfg.NodeID, executionID, req)
	if err != nil {
		return ApprovalResult{}, fmt.Errorf("pause: request approval: %w", err)
	}

	// Block until the context is done (the CP will call the agent's webhook
	// when the human responds; in the Go SDK we rely on context cancellation
	// or the caller using WaitForApproval on the client directly).
	<-ctx.Done()

	return ApprovalResult{
		Decision:          "expired",
		ExecutionID:       executionID,
		ApprovalRequestID: o.ApprovalRequestID,
	}, nil
}

// generateUUID returns a random UUID (version 4) string without importing
// an external dependency.
func generateUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant bits
	return fmt.Sprintf(
		"%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:],
	), nil
}
