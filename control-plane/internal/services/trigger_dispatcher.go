package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/logger"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/Agent-Field/agentfield/control-plane/internal/utils"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
)

// TriggerDispatcher hands off persisted inbound events to their target reasoner
// over HTTP. It mirrors the proxy logic in handlers/reasoners.go but is
// invoked from non-HTTP code paths (the public ingest handler and the cron
// loop runner) so it must be safe to call concurrently and must not assume
// access to a gin.Context.
type TriggerDispatcher struct {
	storage    storage.StorageProvider
	httpClient *http.Client
}

// NewTriggerDispatcher returns a dispatcher with sensible defaults.
func NewTriggerDispatcher(storage storage.StorageProvider) *TriggerDispatcher {
	return &TriggerDispatcher{
		storage: storage,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// DispatchEvent invokes the trigger's target reasoner with the event payload.
// It is fire-and-forget from the ingest handler's perspective: the caller has
// already persisted the InboundEvent and returned 200 to the provider before
// reaching this point. Failures here update the event row's status only.
//
// The reasoner receives the normalized payload as input and a metadata
// envelope containing source name, event type, and trigger id so handlers can
// route on those when they fan in multiple sources.
func (d *TriggerDispatcher) DispatchEvent(ctx context.Context, trig *types.Trigger, ev *types.InboundEvent) {
	if trig == nil || ev == nil {
		return
	}

	node, err := d.storage.GetAgent(ctx, trig.TargetNodeID)
	if err != nil {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("target node %q not found: %v", trig.TargetNodeID, err))
		return
	}
	if node.HealthStatus == types.HealthStatusInactive || node.LifecycleStatus == types.AgentStatusOffline {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("target node %q unreachable (health=%s lifecycle=%s)", trig.TargetNodeID, node.HealthStatus, node.LifecycleStatus))
		return
	}

	reasonerExists := false
	for _, r := range node.Reasoners {
		if r.ID == trig.TargetReasoner {
			reasonerExists = true
			break
		}
	}
	if !reasonerExists {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("reasoner %q not found on node %q", trig.TargetReasoner, trig.TargetNodeID))
		return
	}

	// Build the reasoner input. We hand off the normalized event as `event` and
	// keep `_meta` for trigger context — handlers can ignore the meta when they
	// only care about payload.
	var normalized any
	if len(ev.NormalizedPayload) > 0 {
		_ = json.Unmarshal(ev.NormalizedPayload, &normalized)
	}
	body, err := json.Marshal(map[string]any{
		"event": normalized,
		"_meta": map[string]any{
			"trigger_id":      trig.ID,
			"source":          trig.SourceName,
			"event_type":      ev.EventType,
			"event_id":        ev.ID,
			"idempotency_key": ev.IdempotencyKey,
			"received_at":     ev.ReceivedAt.UTC().Format(time.RFC3339),
		},
	})
	if err != nil {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("marshal dispatch body: %v", err))
		return
	}

	url := fmt.Sprintf("%s/reasoners/%s", node.BaseURL, trig.TargetReasoner)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("build request: %v", err))
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workflow-ID", utils.GenerateWorkflowID())
	req.Header.Set("X-Execution-ID", utils.GenerateExecutionID())
	req.Header.Set("X-AgentField-Request-ID", utils.GenerateAgentFieldRequestID())
	req.Header.Set("X-Trigger-ID", trig.ID)
	req.Header.Set("X-Source-Name", trig.SourceName)
	req.Header.Set("X-Event-Type", ev.EventType)
	req.Header.Set("X-Event-ID", ev.ID)

	resp, err := d.httpClient.Do(req)
	if err != nil {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("dispatch request failed: %v", err))
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		d.markFailed(ctx, ev.ID, fmt.Sprintf("agent returned %d: %s", resp.StatusCode, truncate(respBody, 256)))
		return
	}

	if err := d.storage.MarkInboundEventProcessed(ctx, ev.ID, types.InboundEventStatusDispatched, "", ""); err != nil {
		logger.Logger.Warn().
			Err(err).
			Str("event_id", ev.ID).
			Msg("failed to mark inbound event dispatched")
	}
}

func (d *TriggerDispatcher) markFailed(ctx context.Context, eventID, msg string) {
	logger.Logger.Warn().
		Str("event_id", eventID).
		Msg("trigger dispatch failed: " + msg)
	if err := d.storage.MarkInboundEventProcessed(ctx, eventID, types.InboundEventStatusFailed, msg, ""); err != nil {
		logger.Logger.Error().Err(err).Str("event_id", eventID).Msg("failed to mark inbound event failed")
	}
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "...[truncated]"
}
