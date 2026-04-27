package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/logger"
	"github.com/Agent-Field/agentfield/control-plane/internal/services"
	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/Agent-Field/agentfield/control-plane/internal/utils"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
)

// TriggerHandlers groups the HTTP layer for the trigger plugin system. Public
// ingest (`POST /sources/:trigger_id`) is registered separately from the
// authenticated CRUD/UI endpoints because they have different auth posture.
type TriggerHandlers struct {
	storage       storage.StorageProvider
	dispatcher    *services.TriggerDispatcher
	sourceManager *services.SourceManager
}

// NewTriggerHandlers wires the dependencies for trigger HTTP endpoints.
func NewTriggerHandlers(s storage.StorageProvider, d *services.TriggerDispatcher, m *services.SourceManager) *TriggerHandlers {
	return &TriggerHandlers{storage: s, dispatcher: d, sourceManager: m}
}

// ingestRequest is the parsed shape of an inbound trigger POST. We accept any
// content but pass it through to the Source as raw bytes so signature
// verification can run over the exact wire bytes.
type triggerCreateRequest struct {
	SourceName     string          `json:"source_name"`
	Config         json.RawMessage `json:"config"`
	SecretEnvVar   string          `json:"secret_env_var"`
	TargetNodeID   string          `json:"target_node_id"`
	TargetReasoner string          `json:"target_reasoner"`
	EventTypes     []string        `json:"event_types"`
	Enabled        *bool           `json:"enabled"`
}

// IngestSourceHandler is the public ingest endpoint at /sources/:trigger_id.
//
// It looks up the trigger, resolves the Source from the registry, runs the
// Source's verification, persists every emitted event with idempotency
// checking, and hands each event to the dispatcher. The endpoint always
// returns 200 once persistence succeeds — dispatch failures update the
// event row's status but do not propagate back to the provider, since
// providers retry on non-2xx and we already have the event durably stored.
func (h *TriggerHandlers) IngestSourceHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		triggerID := c.Param("trigger_id")
		if triggerID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "trigger_id is required"})
			return
		}

		trig, err := h.storage.GetTrigger(ctx, triggerID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "trigger not found"})
			return
		}
		if !trig.Enabled {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "trigger disabled"})
			return
		}

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}

		raw := &sources.RawRequest{
			Headers: c.Request.Header,
			Body:    body,
			URL:     c.Request.URL,
			Method:  c.Request.Method,
		}

		secret := ""
		if trig.SecretEnvVar != "" {
			secret = os.Getenv(trig.SecretEnvVar)
		}

		events, err := sources.HandleHTTP(ctx, trig.SourceName, raw, trig.Config, secret)
		if err != nil {
			// Verification failures and unknown sources both return 401 to
			// match webhook-provider expectations: a 4xx means "don't retry".
			logger.Logger.Warn().
				Err(err).
				Str("trigger_id", triggerID).
				Str("source", trig.SourceName).
				Msg("trigger ingest verification failed")
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		persisted := 0
		for _, ev := range events {
			if !triggerEventTypeMatches(trig.EventTypes, ev.Type) {
				continue
			}
			if ev.IdempotencyKey != "" {
				exists, err := h.storage.InboundEventExistsByIdempotency(ctx, trig.SourceName, ev.IdempotencyKey)
				if err == nil && exists {
					continue
				}
			}
			rawPayload := ev.Raw
			if len(rawPayload) == 0 {
				rawPayload = json.RawMessage(body)
			}
			normalized := ev.Normalized
			if len(normalized) == 0 {
				normalized = rawPayload
			}
			stored := &types.InboundEvent{
				ID:                utils.GenerateExecutionID(),
				TriggerID:         trig.ID,
				SourceName:        trig.SourceName,
				EventType:         ev.Type,
				RawPayload:        rawPayload,
				NormalizedPayload: normalized,
				IdempotencyKey:    ev.IdempotencyKey,
				Status:            types.InboundEventStatusReceived,
				ReceivedAt:        ev.ReceivedAt,
			}
			if stored.ReceivedAt.IsZero() {
				stored.ReceivedAt = time.Now().UTC()
			}
			if err := h.storage.InsertInboundEvent(ctx, stored); err != nil {
				logger.Logger.Error().
					Err(err).
					Str("trigger_id", triggerID).
					Msg("failed to persist inbound event")
				continue
			}
			persisted++
			// Async dispatch — provider has waited long enough.
			go h.dispatcher.DispatchEvent(context.Background(), trig, stored)
		}

		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"received": persisted,
		})
	}
}

// CreateTrigger handles POST /api/v1/triggers (UI-managed instances only).
func (h *TriggerHandlers) CreateTrigger() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req triggerCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.SourceName == "" || req.TargetNodeID == "" || req.TargetReasoner == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "source_name, target_node_id, and target_reasoner are required"})
			return
		}
		src, ok := sources.Get(req.SourceName)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown source: " + req.SourceName})
			return
		}
		cfg := req.Config
		if len(cfg) == 0 {
			cfg = json.RawMessage("{}")
		}
		if err := src.Validate(cfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if src.SecretRequired() && req.SecretEnvVar == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "secret_env_var is required for source " + req.SourceName})
			return
		}

		enabled := true
		if req.Enabled != nil {
			enabled = *req.Enabled
		}
		now := time.Now().UTC()
		t := &types.Trigger{
			ID:             utils.GenerateExecutionID(),
			SourceName:     req.SourceName,
			Config:         cfg,
			SecretEnvVar:   req.SecretEnvVar,
			TargetNodeID:   req.TargetNodeID,
			TargetReasoner: req.TargetReasoner,
			EventTypes:     req.EventTypes,
			ManagedBy:      types.ManagedByUI,
			Enabled:        enabled,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := h.storage.CreateTrigger(c.Request.Context(), t); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if enabled && src.Kind() == sources.KindLoop && h.sourceManager != nil {
			if err := h.sourceManager.Start(t); err != nil {
				logger.Logger.Warn().Err(err).Str("trigger_id", t.ID).Msg("failed to start loop source")
			}
		}
		c.JSON(http.StatusCreated, t)
	}
}

// ListTriggers handles GET /api/v1/triggers.
func (h *TriggerHandlers) ListTriggers() gin.HandlerFunc {
	return func(c *gin.Context) {
		nodeID := c.Query("target_node_id")
		source := c.Query("source_name")
		ts, err := h.storage.ListTriggers(c.Request.Context(), nodeID, source)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"triggers": ts})
	}
}

// GetTrigger handles GET /api/v1/triggers/:trigger_id.
func (h *TriggerHandlers) GetTrigger() gin.HandlerFunc {
	return func(c *gin.Context) {
		t, err := h.storage.GetTrigger(c.Request.Context(), c.Param("trigger_id"))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "trigger not found"})
			return
		}
		c.JSON(http.StatusOK, t)
	}
}

// UpdateTrigger handles PUT /api/v1/triggers/:trigger_id. Code-managed
// triggers cannot be edited from the UI; their config is sourced from agent
// registration. The handler rejects writes against them.
func (h *TriggerHandlers) UpdateTrigger() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		id := c.Param("trigger_id")
		existing, err := h.storage.GetTrigger(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "trigger not found"})
			return
		}
		if existing.ManagedBy == types.ManagedByCode {
			c.JSON(http.StatusForbidden, gin.H{"error": "code-managed trigger cannot be edited via UI"})
			return
		}
		var req triggerCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.SourceName != "" {
			existing.SourceName = req.SourceName
		}
		if len(req.Config) > 0 {
			existing.Config = req.Config
		}
		if req.SecretEnvVar != "" {
			existing.SecretEnvVar = req.SecretEnvVar
		}
		if req.TargetNodeID != "" {
			existing.TargetNodeID = req.TargetNodeID
		}
		if req.TargetReasoner != "" {
			existing.TargetReasoner = req.TargetReasoner
		}
		if req.EventTypes != nil {
			existing.EventTypes = req.EventTypes
		}
		if req.Enabled != nil {
			existing.Enabled = *req.Enabled
		}
		existing.UpdatedAt = time.Now().UTC()

		src, ok := sources.Get(existing.SourceName)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown source: " + existing.SourceName})
			return
		}
		if err := src.Validate(existing.Config); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := h.storage.UpdateTrigger(ctx, existing); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Restart the loop runner if the source is loop-kind so config changes
		// take effect immediately without waiting for the next emit cycle.
		if h.sourceManager != nil && src.Kind() == sources.KindLoop {
			h.sourceManager.Stop(existing.ID)
			if existing.Enabled {
				if err := h.sourceManager.Start(existing); err != nil {
					logger.Logger.Warn().Err(err).Str("trigger_id", existing.ID).Msg("failed to restart loop source")
				}
			}
		}

		c.JSON(http.StatusOK, existing)
	}
}

// DeleteTrigger handles DELETE /api/v1/triggers/:trigger_id. Rejects deletion
// of code-managed triggers — they're owned by agent code and re-created on
// the next registration anyway.
func (h *TriggerHandlers) DeleteTrigger() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		id := c.Param("trigger_id")
		existing, err := h.storage.GetTrigger(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "trigger not found"})
			return
		}
		if existing.ManagedBy == types.ManagedByCode {
			c.JSON(http.StatusForbidden, gin.H{"error": "code-managed trigger cannot be deleted via UI"})
			return
		}
		if h.sourceManager != nil {
			h.sourceManager.Stop(id)
		}
		if err := h.storage.DeleteTrigger(ctx, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "deleted"})
	}
}

// ListTriggerEvents handles GET /api/v1/triggers/:trigger_id/events.
func (h *TriggerHandlers) ListTriggerEvents() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("trigger_id")
		limit := 100
		if v := c.Query("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		events, err := h.storage.ListInboundEvents(c.Request.Context(), id, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"events": events})
	}
}

// ReplayEvent handles POST /api/v1/triggers/:trigger_id/events/:event_id/replay.
// It re-dispatches a stored event without re-verifying the original signature
// — the assumption is that anyone with UI access has authority to replay.
func (h *TriggerHandlers) ReplayEvent() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		eventID := c.Param("event_id")
		ev, err := h.storage.GetInboundEvent(ctx, eventID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
			return
		}
		trig, err := h.storage.GetTrigger(ctx, ev.TriggerID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "trigger not found"})
			return
		}
		// Mint a new event row so the replay has its own audit trail. Keep the
		// idempotency key cleared so providers' dedup index doesn't reject it.
		replayed := &types.InboundEvent{
			ID:                utils.GenerateExecutionID(),
			TriggerID:         trig.ID,
			SourceName:        trig.SourceName,
			EventType:         ev.EventType,
			RawPayload:        ev.RawPayload,
			NormalizedPayload: ev.NormalizedPayload,
			IdempotencyKey:    "",
			Status:            types.InboundEventStatusReplayed,
			ReceivedAt:        time.Now().UTC(),
		}
		if err := h.storage.InsertInboundEvent(ctx, replayed); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		go h.dispatcher.DispatchEvent(context.Background(), trig, replayed)
		c.JSON(http.StatusAccepted, gin.H{"event_id": replayed.ID})
	}
}

// ListSources handles GET /api/v1/sources — the catalog endpoint the UI uses
// to populate the "new trigger" form.
func ListSourcesHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"sources": sources.List()})
	}
}

// triggerEventTypeMatches reports whether an inbound event matches one of the
// trigger's configured filters. An empty filter list means "match all".
func triggerEventTypeMatches(filters []string, eventType string) bool {
	if len(filters) == 0 {
		return true
	}
	for _, f := range filters {
		if f == "*" || f == eventType {
			return true
		}
		// Allow prefix-match on event family, e.g. "pull_request" matches
		// "pull_request.opened".
		if strings.HasSuffix(f, ".*") && strings.HasPrefix(eventType, strings.TrimSuffix(f, ".*")+".") {
			return true
		}
		if !strings.Contains(f, ".") && strings.HasPrefix(eventType, f+".") {
			return true
		}
	}
	return false
}

