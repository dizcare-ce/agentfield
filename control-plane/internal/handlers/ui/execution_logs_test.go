package ui

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/config"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
	"github.com/gin-gonic/gin"
)

func TestGetExecutionLogsHandler_ReturnsStructuredEntries(t *testing.T) {
	gin.SetMode(gin.TestMode)

	realStorage := setupTestStorage(t)
	requireExecutionLogEntry(t, realStorage, &types.ExecutionLogEntry{
		ExecutionID: "exec-ui-1",
		WorkflowID:  "wf-ui-1",
		AgentNodeID: "agent-a",
		Level:       "info",
		Source:      "sdk.runtime",
		Message:     "started",
		EmittedAt:   time.Now().UTC(),
	})

	handler := NewExecutionLogsHandler(realStorage, func() config.ExecutionLogsConfig {
		return config.ExecutionLogsConfig{MaxTailEntries: 100}
	}, nil)
	router := gin.New()
	router.GET("/api/ui/v1/executions/:execution_id/logs", handler.GetExecutionLogsHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/ui/v1/executions/exec-ui-1/logs?level=info", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	body := resp.Body.String()
	if !strings.Contains(body, `"message":"started"`) {
		t.Fatalf("expected response to include stored log entry, got %s", body)
	}
	if !strings.Contains(body, `"max_tail_entries":100`) {
		t.Fatalf("expected response to include effective config, got %s", body)
	}
}

func TestStreamExecutionLogsHandler_ReplaysAndStreamsDedicatedExecutionLogs(t *testing.T) {
	gin.SetMode(gin.TestMode)

	realStorage := setupTestStorage(t)
	requireExecutionLogEntry(t, realStorage, &types.ExecutionLogEntry{
		ExecutionID: "exec-stream-1",
		WorkflowID:  "wf-stream-1",
		AgentNodeID: "agent-a",
		Level:       "info",
		Source:      "sdk.runtime",
		Message:     "replay event",
		EmittedAt:   time.Now().UTC(),
	})

	handler := NewExecutionLogsHandler(realStorage, func() config.ExecutionLogsConfig {
		return config.ExecutionLogsConfig{
			MaxTailEntries:         100,
			StreamIdleTimeout:      2 * time.Second,
			MaxStreamDuration:      5 * time.Second,
			RetentionPeriod:        time.Hour,
			MaxEntriesPerExecution: 500,
		}
	}, nil)
	router := gin.New()
	router.GET("/api/ui/v1/executions/:execution_id/logs/stream", handler.StreamExecutionLogsHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/ui/v1/executions/exec-stream-1/logs/stream?replay_limit=10", nil)
	reqCtx, cancel := context.WithCancel(req.Context())
	defer cancel()
	req = req.WithContext(reqCtx)
	resp := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		router.ServeHTTP(resp, req)
		close(done)
	}()

	time.Sleep(50 * time.Millisecond)
	requireExecutionLogEntry(t, realStorage, &types.ExecutionLogEntry{
		ExecutionID: "exec-stream-1",
		WorkflowID:  "wf-stream-1",
		AgentNodeID: "agent-a",
		Level:       "error",
		Source:      "sdk.app",
		Message:     "live event",
		EmittedAt:   time.Now().UTC(),
	})

	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("stream handler did not exit after cancel")
	}

	if got := resp.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("expected SSE content type, got %q", got)
	}
	body := resp.Body.String()
	if !strings.Contains(body, `Execution log stream connected`) {
		t.Fatalf("expected connected event, got %s", body)
	}
	if !strings.Contains(body, `replay event`) {
		t.Fatalf("expected replayed execution log, got %s", body)
	}
	if !strings.Contains(body, `live event`) {
		t.Fatalf("expected live execution log, got %s", body)
	}
}

func requireExecutionLogEntry(t *testing.T, store interface {
	StoreExecutionLogEntry(ctx context.Context, entry *types.ExecutionLogEntry) error
}, entry *types.ExecutionLogEntry) {
	t.Helper()
	if err := store.StoreExecutionLogEntry(context.Background(), entry); err != nil {
		t.Fatalf("store execution log entry: %v", err)
	}
}
