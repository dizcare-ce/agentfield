package handlers

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// aguiFrame is a parsed SSE frame: the `event:` discriminator and the JSON
// payload from the `data:` line, decoded into a map.
type aguiFrame struct {
	Event string
	Data  map[string]any
}

// parseAGUIStream splits an SSE response body into one frame per AG-UI event.
// It is intentionally strict — every frame must have both `event:` and
// `data:` lines, terminated by a blank line — because that strictness is
// what the AG-UI protocol guarantees and what we want to assert against.
func parseAGUIStream(t *testing.T, body string) []aguiFrame {
	t.Helper()
	var frames []aguiFrame
	scanner := bufio.NewScanner(strings.NewReader(body))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var curEvent, curData string
	flush := func() {
		if curEvent == "" && curData == "" {
			return
		}
		require.NotEmpty(t, curEvent, "frame missing event line: data=%q", curData)
		require.NotEmpty(t, curData, "frame missing data line: event=%q", curEvent)
		var decoded map[string]any
		require.NoError(t, json.Unmarshal([]byte(curData), &decoded), "data line is not JSON: %s", curData)
		frames = append(frames, aguiFrame{Event: curEvent, Data: decoded})
		curEvent, curData = "", ""
	}

	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case line == "":
			flush()
		case strings.HasPrefix(line, "event: "):
			curEvent = strings.TrimPrefix(line, "event: ")
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
// assertion: a successful run must produce exactly RunStarted →
// TextMessageStart → TextMessageContent → TextMessageEnd → RunFinished, in
// that order, with the threadId/runId from the request propagated to the
// frames that carry them, and the reasoner's `result` value surfaced as the
// TextMessageContent delta.
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

	// Sequence + discriminator: event-line type and JSON `type` field must agree.
	wantSequence := []string{
		"RunStarted",
		"TextMessageStart",
		"TextMessageContent",
		"TextMessageEnd",
		"RunFinished",
	}
	for i, want := range wantSequence {
		require.Equal(t, want, frames[i].Event, "frame %d event line", i)
		require.Equal(t, want, frames[i].Data["type"], "frame %d JSON type", i)
	}

	// RunStarted carries threadId/runId/input.
	require.Equal(t, "thread-test", frames[0].Data["threadId"])
	require.Equal(t, "run-test", frames[0].Data["runId"])
	require.Equal(t, map[string]any{"prompt": "hi"}, frames[0].Data["input"])

	// TextMessage* share a stable messageId.
	msgID, _ := frames[1].Data["messageId"].(string)
	require.NotEmpty(t, msgID)
	require.Equal(t, "assistant", frames[1].Data["role"])
	require.Equal(t, msgID, frames[2].Data["messageId"])
	require.Equal(t, "hello world", frames[2].Data["delta"])
	require.Equal(t, msgID, frames[3].Data["messageId"])

	// RunFinished reports success and surfaces the parsed agent JSON.
	outcome, _ := frames[4].Data["outcome"].(map[string]any)
	require.Equal(t, "success", outcome["type"])
	require.Equal(t, map[string]any{"result": "hello world"}, frames[4].Data["result"])
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
	require.Equal(t, "RunStarted", frames[0].Event)
	require.NotEmpty(t, frames[0].Data["threadId"], "threadId should be auto-generated")
	require.NotEmpty(t, frames[0].Data["runId"], "runId should be auto-generated")
}

// TestAGUIRunHandler_AgentFailureEmitsRunError confirms the error path on
// the streaming side: once the SSE stream has opened, a downstream agent
// failure must surface as a RunError frame, not as a partial happy path.
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
	require.Equal(t, "RunStarted", frames[0].Event)

	// Last frame must be RunError; nothing past it.
	last := frames[len(frames)-1]
	require.Equal(t, "RunError", last.Event)
	require.NotEmpty(t, last.Data["message"])
	require.Equal(t, "ERR_AGENT_CALL", last.Data["code"])

	// Critically: no TextMessage* and no RunFinished should follow RunStarted
	// when the agent call fails. We never want a happy-path-shaped stream
	// that secretly didn't succeed.
	for _, f := range frames[1:] {
		require.NotContains(t,
			[]string{"TextMessageStart", "TextMessageContent", "TextMessageEnd", "RunFinished"},
			f.Event, "unexpected post-error frame: %s", f.Event)
	}
}

// TestAGUIRunHandler_ValidationErrorsReturnJSON confirms that pre-stream
// validation errors are returned as plain JSON 4xx responses (not as
// SSE frames). Once we emit RunStarted, the contract is "you'll see
// RunError on failure" — but until then, conventional REST errors win
// because clients can't tell from the wire whether a stream is going to
// open or not until they read at least one frame.
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
