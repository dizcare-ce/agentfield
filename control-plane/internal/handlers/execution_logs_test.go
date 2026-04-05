package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/config"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
	"github.com/gin-gonic/gin"
)

type ingestTestStore struct {
	stored       []*types.ExecutionLogEntry
	prunedExecID string
	prunedMax    int
	prunedBefore time.Time
}

func (s *ingestTestStore) StoreExecutionLogEntry(ctx context.Context, entry *types.ExecutionLogEntry) error {
	entryCopy := *entry
	s.stored = append(s.stored, &entryCopy)
	return nil
}

func (s *ingestTestStore) PruneExecutionLogEntries(ctx context.Context, executionID string, maxEntries int, olderThan time.Time) error {
	s.prunedExecID = executionID
	s.prunedMax = maxEntries
	s.prunedBefore = olderThan
	return nil
}

func TestExecutionLogIngestHandler_AcceptsBatch(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := &ingestTestStore{}
	router := gin.New()
	router.POST("/api/v1/executions/:execution_id/logs", ExecutionLogIngestHandler(store, func() config.ExecutionLogsConfig {
		return config.ExecutionLogsConfig{
			RetentionPeriod:        2 * time.Hour,
			MaxEntriesPerExecution: 25,
		}
	}))

	body := map[string]interface{}{
		"entries": []map[string]interface{}{
			{
				"workflow_id":      "wf-1",
				"agent_node_id":    "agent-a",
				"level":            "INFO",
				"source":           "sdk.runtime",
				"event_type":       "reasoner.started",
				"message":          "started",
				"system_generated": true,
				"attributes": map[string]interface{}{
					"step": "start",
				},
			},
			{
				"execution_id":  "exec-1",
				"workflow_id":   "wf-1",
				"agent_node_id": "agent-a",
				"level":         "error",
				"source":        "sdk.app",
				"message":       "failed",
			},
		},
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/executions/exec-1/logs", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", resp.Code, resp.Body.String())
	}
	if len(store.stored) != 2 {
		t.Fatalf("expected 2 stored entries, got %d", len(store.stored))
	}
	if store.stored[0].ExecutionID != "exec-1" || store.stored[1].ExecutionID != "exec-1" {
		t.Fatalf("expected execution_id to be normalized from path, got %#v", store.stored)
	}
	if store.stored[0].Level != "info" {
		t.Fatalf("expected level normalization to info, got %q", store.stored[0].Level)
	}
	if store.prunedExecID != "exec-1" || store.prunedMax != 25 {
		t.Fatalf("expected prune to run for exec-1 with max 25, got exec=%q max=%d", store.prunedExecID, store.prunedMax)
	}
}

func TestExecutionLogIngestHandler_RejectsExecutionMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := &ingestTestStore{}
	router := gin.New()
	router.POST("/api/v1/executions/:execution_id/logs", ExecutionLogIngestHandler(store, nil))

	payload := []byte(`{"execution_id":"exec-other","workflow_id":"wf-1","agent_node_id":"agent-a","level":"info","source":"sdk.runtime","message":"started"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/executions/exec-1/logs", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", resp.Code, resp.Body.String())
	}
}
