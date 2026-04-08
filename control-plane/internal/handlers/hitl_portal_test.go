package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/events"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedHitlExecution(t *testing.T, store *testExecutionStorage, executionID, requestID string) *types.WorkflowExecution {
	t.Helper()

	now := time.Now().UTC()
	status := "pending"
	priority := "high"
	tags := `["pr-review","team:platform"]`
	schema := `{
		"title":"Review request",
		"description":"## Summary\n\nPlease review this change.",
		"fields":[
			{"type":"button_group","name":"decision","required":true,"options":[{"value":"approve","label":"Approve"},{"value":"request_changes","label":"Request changes"},{"value":"reject","label":"Reject"}]},
			{"type":"text","name":"summary","required":true,"max_length":20},
			{"type":"textarea","name":"comments","hidden_when":{"field":"decision","equals":"approve"}},
			{"type":"number","name":"score","min":1,"max":10},
			{"type":"select","name":"team","options":[{"value":"platform","label":"Platform"},{"value":"infra","label":"Infra"}]},
			{"type":"multiselect","name":"labels","min_items":1,"max_items":2,"options":[{"value":"a","label":"A"},{"value":"b","label":"B"},{"value":"c","label":"C"}]},
			{"type":"radio","name":"risk","options":[{"value":"low","label":"Low"},{"value":"high","label":"High"}]},
			{"type":"checkbox","name":"ship_it"},
			{"type":"switch","name":"notify"},
			{"type":"date","name":"ship_date"}
		]
	}`
	expires := now.Add(24 * time.Hour)

	wfExec := &types.WorkflowExecution{
		ExecutionID:         executionID,
		WorkflowID:          "wf-1",
		AgentNodeID:         "agent-1",
		Status:              types.ExecutionStatusWaiting,
		StartedAt:           now,
		ApprovalRequestID:   &requestID,
		ApprovalStatus:      &status,
		ApprovalRequestedAt: &now,
		ApprovalExpiresAt:   &expires,
		ApprovalFormSchema:  &schema,
		ApprovalTags:        &tags,
		ApprovalPriority:    &priority,
	}
	require.NoError(t, store.StoreWorkflowExecution(context.Background(), wfExec))
	require.NoError(t, store.CreateExecutionRecord(context.Background(), &types.Execution{
		ExecutionID: executionID,
		RunID:       "run-1",
		AgentNodeID: "agent-1",
		Status:      types.ExecutionStatusWaiting,
		StartedAt:   now,
		CreatedAt:   now,
	}))
	return wfExec
}

func TestHitlListPendingHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})

	router := gin.New()
	router.GET("/api/hitl/v1/pending", HitlListPendingHandler(store))

	req := httptest.NewRequest(http.MethodGet, "/api/hitl/v1/pending", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
	assert.JSONEq(t, `{"items":[]}`, resp.Body.String())

	seedHitlExecution(t, store, "exec-1", "req-1")
	other := seedHitlExecution(t, store, "exec-2", "req-2")
	otherPriority := "urgent"
	other.ApprovalPriority = &otherPriority
	otherTags := `["ops"]`
	other.ApprovalTags = &otherTags

	req = httptest.NewRequest(http.MethodGet, "/api/hitl/v1/pending?tag=pr-review&priority=high", nil)
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
	assert.Contains(t, resp.Body.String(), `"request_id":"req-1"`)
	assert.NotContains(t, resp.Body.String(), `"request_id":"req-2"`)
	assert.Contains(t, resp.Body.String(), `"title":"Review request"`)
	assert.Contains(t, resp.Body.String(), `"description_preview":"Summary Please review this change."`)
}

func TestHitlGetPendingHandler_NotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})
	router := gin.New()
	router.GET("/api/hitl/v1/pending/:request_id", HitlGetPendingHandler(store))

	req := httptest.NewRequest(http.MethodGet, "/api/hitl/v1/pending/missing", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusNotFound, resp.Code)
}

func TestHitlGetPendingHandler_ReadonlyAfterResolve(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})
	wfExec := seedHitlExecution(t, store, "exec-ro", "req-ro")
	resolver := NewWebhookApprovalController(store, "")
	payload := &ApprovalWebhookPayload{
		RequestID: "req-ro",
		Decision:  "approved",
		Response:  json.RawMessage(`{"decision":"approve","summary":"LGTM"}`),
	}
	require.NoError(t, resolver.resolveApproval(context.Background(), "exec-ro", wfExec, payload, "Alice"))

	router := gin.New()
	router.GET("/api/hitl/v1/pending/:request_id", HitlGetPendingHandler(store))
	req := httptest.NewRequest(http.MethodGet, "/api/hitl/v1/pending/req-ro", nil)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	require.Equal(t, http.StatusOK, resp.Code)
	assert.Contains(t, resp.Body.String(), `"readonly":true`)
	assert.Contains(t, resp.Body.String(), `"responder":"Alice"`)
	assert.Contains(t, resp.Body.String(), `"status":"approved"`)
}

func TestHitlRespondHandler_HappyPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})
	seedHitlExecution(t, store, "exec-respond", "req-respond")

	router := gin.New()
	router.POST("/api/hitl/v1/pending/:request_id/respond", HitlRespondHandler(store, ""))

	body, _ := json.Marshal(map[string]any{
		"responder": "Alice",
		"response": map[string]any{
			"decision":  "approve",
			"summary":   "Looks good",
			"score":     9,
			"team":      "platform",
			"labels":    []string{"a", "b"},
			"risk":      "low",
			"ship_it":   true,
			"notify":    false,
			"ship_date": "2026-04-10",
			"comments":  "this should be removed because hidden",
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/hitl/v1/pending/req-respond/respond", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	require.Equal(t, http.StatusOK, resp.Code)
	assert.Contains(t, resp.Body.String(), `"decision":"approved"`)

	wfExec, err := store.GetWorkflowExecution(context.Background(), "exec-respond")
	require.NoError(t, err)
	require.NotNil(t, wfExec.ApprovalResponder)
	assert.Equal(t, "Alice", *wfExec.ApprovalResponder)
	require.NotNil(t, wfExec.ApprovalResponse)
	assert.NotContains(t, *wfExec.ApprovalResponse, "comments")
}

func TestHitlRespondHandler_ValidationFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})
	seedHitlExecution(t, store, "exec-invalid", "req-invalid")

	router := gin.New()
	router.POST("/api/hitl/v1/pending/:request_id/respond", HitlRespondHandler(store, ""))

	body, _ := json.Marshal(map[string]any{
		"responder": "Alice",
		"response": map[string]any{
			"decision":  "request_changes",
			"summary":   "this summary is far too long for validation",
			"score":     99,
			"team":      "unknown",
			"labels":    []string{},
			"risk":      "nope",
			"ship_it":   "yes",
			"notify":    "no",
			"ship_date": "not-a-date",
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/hitl/v1/pending/req-invalid/respond", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	require.Equal(t, http.StatusBadRequest, resp.Code)
	assert.Contains(t, resp.Body.String(), `"summary":"must be at most 20 characters"`)
	assert.Contains(t, resp.Body.String(), `"score":"must be at most 10"`)
	assert.Contains(t, resp.Body.String(), `"team":"must be one of the allowed values"`)
	assert.Contains(t, resp.Body.String(), `"labels":"must include at least 1 items"`)
	assert.Contains(t, resp.Body.String(), `"risk":"must be one of the allowed values"`)
	assert.Contains(t, resp.Body.String(), `"ship_it":"must be a boolean"`)
	assert.Contains(t, resp.Body.String(), `"notify":"must be a boolean"`)
	assert.Contains(t, resp.Body.String(), `"ship_date":"must be a valid date"`)
}

func TestHitlRespondHandler_ConflictCases(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})
	wfExec := seedHitlExecution(t, store, "exec-conflict", "req-conflict")
	resolved := "approved"
	wfExec.ApprovalStatus = &resolved

	router := gin.New()
	router.POST("/api/hitl/v1/pending/:request_id/respond", HitlRespondHandler(store, ""))

	body := `{"responder":"Alice","response":{"decision":"approve","summary":"ok"}}`

	req := httptest.NewRequest(http.MethodPost, "/api/hitl/v1/pending/missing/respond", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusNotFound, resp.Code)

	req = httptest.NewRequest(http.MethodPost, "/api/hitl/v1/pending/req-conflict/respond", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusConflict, resp.Code)

	pending := "pending"
	wfExec.ApprovalStatus = &pending
	wfExec.Status = types.ExecutionStatusRunning

	req = httptest.NewRequest(http.MethodPost, "/api/hitl/v1/pending/req-conflict/respond", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusConflict, resp.Code)
}

func TestHitlStreamHandler_EmitsPendingAdded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := newTestExecutionStorage(&types.AgentNode{ID: "agent-1"})
	seedHitlExecution(t, store, "exec-stream", "req-stream")

	router := gin.New()
	router.GET("/api/hitl/v1/stream", HitlStreamHandler(store))

	req := httptest.NewRequest(http.MethodGet, "/api/hitl/v1/stream", nil)
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	req = req.WithContext(ctx)

	resp := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		router.ServeHTTP(resp, req)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond)
	store.GetExecutionEventBus().Publish(events.ExecutionEvent{
		Type:        events.ExecutionWaiting,
		ExecutionID: "exec-stream",
		WorkflowID:  "wf-1",
		AgentNodeID: "agent-1",
		Status:      types.ExecutionStatusWaiting,
		Timestamp:   time.Now().UTC(),
		Data: map[string]interface{}{
			"form_schema_present": true,
		},
	})

	time.Sleep(50 * time.Millisecond)
	cancel()
	<-done

	assert.Equal(t, "text/event-stream", resp.Header().Get("Content-Type"))
	assert.Contains(t, resp.Body.String(), "event: hitl.pending.added")
	assert.Contains(t, resp.Body.String(), `"request_id":"req-stream"`)
}
