package handlers

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// aguiFrame is a parsed SSE frame: just the JSON object decoded from the
// `data:` line. The canonical AG-UI encoder emits frames as `data: <json>\n\n`
// only — no `event:` line — so the JSON `type` field is the sole discriminator.
type aguiFrame struct {
	Data map[string]any
}

func (f aguiFrame) Type() string {
	t, _ := f.Data["type"].(string)
	return t
}

// parseAGUIStream splits an SSE response body into one frame per AG-UI event.
// Strict on shape: every frame must be `data: <json>\n\n`. We assert against
// the strictness because that's exactly what the AG-UI spec guarantees and
// what the reference encoders emit (see ag-ui-protocol/ag-ui encoder.ts /
// encoder.py).
func parseAGUIStream(t *testing.T, body string) []aguiFrame {
	t.Helper()
	var frames []aguiFrame
	scanner := bufio.NewScanner(strings.NewReader(body))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var curData string
	flush := func() {
		if curData == "" {
			return
		}
		var decoded map[string]any
		require.NoError(t, json.Unmarshal([]byte(curData), &decoded), "data line is not JSON: %s", curData)
		frames = append(frames, aguiFrame{Data: decoded})
		curData = ""
	}

	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case line == "":
			flush()
		case strings.HasPrefix(line, "event:"):
			t.Fatalf("AG-UI frames must not include an `event:` line; got: %q", line)
		case strings.HasPrefix(line, "data: "):
			curData = strings.TrimPrefix(line, "data: ")
		}
	}
	flush()
	return frames
}

func mountAGUIRouter(t *testing.T, store *reasonerTestStorage) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/v1/agui/runs", AGUIRunHandler(store))
	return router
}

// TestAGUIRunHandler_HappyPath_EmitsCanonicalEventSequence is the core POC
// assertion: a successful run must produce exactly RUN_STARTED →
// TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT → TEXT_MESSAGE_END → RUN_FINISHED,
// in that order, with the threadId/runId from the request propagated through
// to RUN_FINISHED, and the reasoner's `result` value surfaced as the
// TEXT_MESSAGE_CONTENT delta.
func TestAGUIRunHandler_HappyPath_EmitsCanonicalEventSequence(t *testing.T) {
	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/reasoners/echo", r.URL.Path)
		require.Equal(t, http.MethodPost, r.Method)
		body, _ := io.ReadAll(r.Body)
		require.JSONEq(t, `{"prompt":"hi"}`, string(body))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"hello world"}`))
	}))
	defer agentServer.Close()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "echo"}},
	}}
	router := mountAGUIRouter(t, store)

	body := `{"reasoner":"node-1.echo","input":{"prompt":"hi"},"threadId":"thread-test","runId":"run-test"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, "response: %s", w.Body.String())
	require.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))

	frames := parseAGUIStream(t, w.Body.String())
	require.Len(t, frames, 5, "want 5 frames, got: %s", w.Body.String())

	wantSequence := []string{
		"RUN_STARTED",
		"TEXT_MESSAGE_START",
		"TEXT_MESSAGE_CONTENT",
		"TEXT_MESSAGE_END",
		"RUN_FINISHED",
	}
	for i, want := range wantSequence {
		require.Equal(t, want, frames[i].Type(), "frame %d: %v", i, frames[i].Data)
	}

	// RUN_STARTED carries threadId/runId; we deliberately do NOT emit `input`
	// because the spec types it as RunAgentInput, not a freeform map.
	require.Equal(t, "thread-test", frames[0].Data["threadId"])
	require.Equal(t, "run-test", frames[0].Data["runId"])
	require.NotContains(t, frames[0].Data, "input",
		"input must be omitted until we emit it as the spec's RunAgentInput shape")

	// TextMessage* share a stable messageId.
	msgID, _ := frames[1].Data["messageId"].(string)
	require.NotEmpty(t, msgID)
	require.Equal(t, "assistant", frames[1].Data["role"])
	require.Equal(t, msgID, frames[2].Data["messageId"])
	require.Equal(t, "hello world", frames[2].Data["delta"])
	require.Equal(t, msgID, frames[3].Data["messageId"])

	// RUN_FINISHED carries threadId/runId (required by spec), success outcome,
	// and the parsed agent JSON.
	require.Equal(t, "thread-test", frames[4].Data["threadId"])
	require.Equal(t, "run-test", frames[4].Data["runId"])
	outcome, _ := frames[4].Data["outcome"].(map[string]any)
	require.Equal(t, "success", outcome["type"])
	require.Equal(t, map[string]any{"result": "hello world"}, frames[4].Data["result"])

	// Spot-check: timestamp on RUN_STARTED is a number (Unix ms), not a string.
	if ts, ok := frames[0].Data["timestamp"]; ok {
		_, isFloat := ts.(float64) // JSON numbers decode as float64 in map[string]any
		require.True(t, isFloat, "timestamp must be a number, got %T", ts)
	}
}

// TestAGUIRunHandler_GeneratesIDsWhenAbsent confirms that omitted threadId
// and runId are auto-populated rather than left empty — clients shouldn't
// have to mint IDs themselves to get a valid AG-UI stream.
func TestAGUIRunHandler_GeneratesIDsWhenAbsent(t *testing.T) {
	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer agentServer.Close()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "echo"}},
	}}
	router := mountAGUIRouter(t, store)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs",
		strings.NewReader(`{"reasoner":"node-1.echo","input":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	frames := parseAGUIStream(t, w.Body.String())
	require.NotEmpty(t, frames)
	require.Equal(t, "RUN_STARTED", frames[0].Type())
	threadID, _ := frames[0].Data["threadId"].(string)
	runID, _ := frames[0].Data["runId"].(string)
	require.NotEmpty(t, threadID, "threadId should be auto-generated")
	require.NotEmpty(t, runID, "runId should be auto-generated")

	// Auto-generated IDs propagate through to RUN_FINISHED.
	last := frames[len(frames)-1]
	require.Equal(t, "RUN_FINISHED", last.Type())
	require.Equal(t, threadID, last.Data["threadId"])
	require.Equal(t, runID, last.Data["runId"])
}

// TestAGUIRunHandler_AgentFailureEmitsRunError confirms the streaming-side
// error path: once SSE is open, downstream agent failure must surface as a
// terminal RUN_ERROR frame, never as a partial happy-path-shaped sequence.
func TestAGUIRunHandler_AgentFailureEmitsRunError(t *testing.T) {
	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"upstream blew up"}`))
	}))
	defer agentServer.Close()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "boom"}},
	}}
	router := mountAGUIRouter(t, store)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs",
		strings.NewReader(`{"reasoner":"node-1.boom","input":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	frames := parseAGUIStream(t, w.Body.String())
	require.GreaterOrEqual(t, len(frames), 2)
	require.Equal(t, "RUN_STARTED", frames[0].Type())

	last := frames[len(frames)-1]
	require.Equal(t, "RUN_ERROR", last.Type())
	require.NotEmpty(t, last.Data["message"])
	require.Equal(t, "ERR_AGENT_CALL", last.Data["code"])

	// No happy-path frames after RUN_STARTED on the failure path.
	for _, f := range frames[1:] {
		require.NotContains(t,
			[]string{"TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"},
			f.Type(), "unexpected post-error frame: %s", f.Type())
	}
}

// TestAGUIRunHandler_EmitsHeartbeatWhileReasonerIsSlow confirms that a
// long-running reasoner produces SSE comment frames (`: keep-alive`) so
// proxies don't idle-time-out the connection. The comment line is invisible
// to AG-UI clients (the spec only defines `data:`-prefixed events) but
// keeps intermediaries happy.
func TestAGUIRunHandler_EmitsHeartbeatWhileReasonerIsSlow(t *testing.T) {
	prev := AGUIHeartbeatInterval
	AGUIHeartbeatInterval = 50 * time.Millisecond
	defer func() { AGUIHeartbeatInterval = prev }()

	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// Block long enough for several heartbeat ticks before responding.
		time.Sleep(250 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"finally"}`))
	}))
	defer agentServer.Close()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "slow"}},
	}}
	router := mountAGUIRouter(t, store)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs",
		strings.NewReader(`{"reasoner":"node-1.slow","input":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := w.Body.String()
	require.Contains(t, body, ": keep-alive",
		"expected at least one SSE comment heartbeat in:\n%s", body)

	// Lifecycle still completes correctly after the heartbeats.
	frames := parseAGUIStream(t, body)
	require.Equal(t, "RUN_STARTED", frames[0].Type())
	require.Equal(t, "RUN_FINISHED", frames[len(frames)-1].Type())
}

// TestAGUIRunHandler_ValidationErrorsReturnJSON: pre-stream validation
// errors come back as plain JSON 4xx, never as an SSE stream. Once we emit
// RUN_STARTED the contract becomes "you'll see RUN_ERROR on failure" — but
// until the first frame, conventional REST errors win.
func TestAGUIRunHandler_ValidationErrorsReturnJSON(t *testing.T) {
	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         "http://unused",
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "echo"}},
	}}
	router := mountAGUIRouter(t, store)

	cases := []struct {
		name     string
		body     string
		wantCode int
		wantMsg  string
	}{
		{"missing reasoner", `{"input":{}}`, http.StatusBadRequest, "reasoner is required"},
		{"malformed reasoner", `{"reasoner":"no-dot","input":{}}`, http.StatusBadRequest, "node_id.reasoner_name"},
		{"unknown node", `{"reasoner":"missing.echo","input":{}}`, http.StatusNotFound, "not found"},
		{"unknown reasoner on known node", `{"reasoner":"node-1.does-not-exist","input":{}}`, http.StatusNotFound, "reasoner 'does-not-exist' not found"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			require.Equal(t, tc.wantCode, w.Code, w.Body.String())
			require.NotEqual(t, "text/event-stream", w.Header().Get("Content-Type"),
				"validation errors must not open the SSE stream")
			require.Contains(t, w.Body.String(), tc.wantMsg)
		})
	}
}
