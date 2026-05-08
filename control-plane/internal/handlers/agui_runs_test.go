package handlers

import (
	"bufio"
	"context"
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

// TestAGUIRunHandler_AgentBodyWithoutResultKey_StringifiesWholeMap covers
// the fallthrough path in the handler: when the agent returns a JSON object
// that doesn't have a `result` key, the entire body becomes the
// TEXT_MESSAGE_CONTENT delta and the parsed map becomes RUN_FINISHED.result.
// This also exercises stringifyResult's non-string branch.
func TestAGUIRunHandler_AgentBodyWithoutResultKey_StringifiesWholeMap(t *testing.T) {
	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","count":3}`))
	}))
	defer agentServer.Close()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "ping"}},
	}}
	router := mountAGUIRouter(t, store)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs",
		strings.NewReader(`{"reasoner":"node-1.ping","input":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	frames := parseAGUIStream(t, w.Body.String())
	require.Len(t, frames, 5)

	// delta is the full body re-serialized (Go's json.Marshal sorts map keys).
	require.Equal(t, `{"count":3,"status":"ok"}`, frames[2].Data["delta"])
	// result preserves the parsed JSON object (decoded to map[string]any with float numbers).
	res, _ := frames[4].Data["result"].(map[string]any)
	require.Equal(t, "ok", res["status"])
	require.EqualValues(t, 3, res["count"])
}

// TestStringifyResult_BranchCoverage covers the cheap branches of the
// helper directly: string passthrough, nil, and arbitrary value JSON-encode.
func TestStringifyResult_BranchCoverage(t *testing.T) {
	require.Equal(t, "hello", stringifyResult("hello"))
	require.Equal(t, "", stringifyResult(nil))
	require.Equal(t, `[1,2,3]`, stringifyResult([]any{1, 2, 3}))
	require.Equal(t, `{"a":1}`, stringifyResult(map[string]any{"a": 1}))
}

// TestAGUIRunHandler_AgentReturnsNonJSON falls through to the
// `string(body)` branch when the agent's response isn't valid JSON.
func TestAGUIRunHandler_AgentReturnsNonJSON(t *testing.T) {
	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte(`plain text answer`))
	}))
	defer agentServer.Close()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "raw"}},
	}}
	router := mountAGUIRouter(t, store)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs",
		strings.NewReader(`{"reasoner":"node-1.raw","input":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	frames := parseAGUIStream(t, w.Body.String())
	require.Equal(t, "plain text answer", frames[2].Data["delta"])
}

// TestAGUIRunHandler_ContextCancelMidFlight covers the <-ctx.Done() branch
// in the wait loop: if the client (or upstream) cancels the request while
// we're blocked on the agent, the handler must return cleanly without
// emitting any post-RUN_STARTED frames.
func TestAGUIRunHandler_ContextCancelMidFlight(t *testing.T) {
	prev := AGUIHeartbeatInterval
	AGUIHeartbeatInterval = time.Hour // disable heartbeats so we don't race the cancel
	defer func() { AGUIHeartbeatInterval = prev }()

	released := make(chan struct{})
	agentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Block until the test releases or the request context cancels.
		select {
		case <-released:
		case <-r.Context().Done():
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"too late"}`))
	}))
	defer func() { close(released); agentServer.Close() }()

	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         agentServer.URL,
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "hang"}},
	}}
	router := mountAGUIRouter(t, store)

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs",
		strings.NewReader(`{"reasoner":"node-1.hang","input":{}}`)).WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		router.ServeHTTP(w, req)
		close(done)
	}()

	// Wait until RUN_STARTED has been emitted, then cancel.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(w.Body.String(), `"type":"RUN_STARTED"`) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	require.Contains(t, w.Body.String(), `"type":"RUN_STARTED"`, "RUN_STARTED should arrive before cancel")
	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not return within 2s of context cancel")
	}

	// No post-RUN_STARTED happy frames should have been emitted on cancel.
	body := w.Body.String()
	require.NotContains(t, body, "TEXT_MESSAGE_START")
	require.NotContains(t, body, "RUN_FINISHED")
}

// TestAGUIRunHandler_RejectsMalformedJSON covers the c.ShouldBindJSON error
// branch — completely invalid request bodies must be rejected as 400 before
// any of the agent lookup or stream-opening logic runs.
func TestAGUIRunHandler_RejectsMalformedJSON(t *testing.T) {
	store := &reasonerTestStorage{agent: &types.AgentNode{
		ID:              "node-1",
		BaseURL:         "http://unused",
		HealthStatus:    types.HealthStatusActive,
		LifecycleStatus: types.AgentStatusReady,
		Reasoners:       []types.ReasonerDefinition{{ID: "echo"}},
	}}
	router := mountAGUIRouter(t, store)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agui/runs", strings.NewReader("not-json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
	require.NotEqual(t, "text/event-stream", w.Header().Get("Content-Type"))
}

// TestHTTPAgentInvoker_HappyPath exercises the real httpAgentInvoker against
// a stub agent server — the handler tests use an interface stub so this
// concrete path otherwise goes uncovered.
func TestHTTPAgentInvoker_HappyPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/reasoners/ping", r.URL.Path)
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		got, _ := io.ReadAll(r.Body)
		require.JSONEq(t, `{"k":1}`, string(got))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	body, err := httpAgentInvoker{}.Invoke(context.Background(),
		&types.AgentNode{BaseURL: server.URL}, "ping", []byte(`{"k":1}`))
	require.NoError(t, err)
	require.JSONEq(t, `{"ok":true}`, string(body))
}

// TestHTTPAgentInvoker_4xxBubblesUpAsError covers the resp.StatusCode >= 400
// branch — the body is still returned but as a callError so the handler can
// turn it into a RUN_ERROR.
func TestHTTPAgentInvoker_4xxBubblesUpAsError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"oops":"server"}`))
	}))
	defer server.Close()

	body, err := httpAgentInvoker{}.Invoke(context.Background(),
		&types.AgentNode{BaseURL: server.URL}, "boom", []byte(`{}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "agent returned 500")
	require.Contains(t, string(body), "oops")
}

// TestHTTPAgentInvoker_DialFailureSurfacesError covers the client.Do error
// branch by pointing the invoker at a closed listener.
func TestHTTPAgentInvoker_DialFailureSurfacesError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	addr := server.URL
	server.Close() // closes the listener; subsequent dials get connection refused

	_, err := httpAgentInvoker{}.Invoke(context.Background(),
		&types.AgentNode{BaseURL: addr}, "ping", []byte(`{}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "agent call failed")
}

// TestHTTPAgentInvoker_BadURLFailsRequestConstruction covers the
// http.NewRequestWithContext error branch — an invalid URL never makes it
// to a dial.
func TestHTTPAgentInvoker_BadURLFailsRequestConstruction(t *testing.T) {
	_, err := httpAgentInvoker{}.Invoke(context.Background(),
		// `\n` in the URL is rejected at request construction time.
		&types.AgentNode{BaseURL: "http://bad\nhost"}, "ping", []byte(`{}`))
	require.Error(t, err)
	require.Contains(t, err.Error(), "create agent request")
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
