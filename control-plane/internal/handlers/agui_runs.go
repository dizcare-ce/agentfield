package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/Agent-Field/agentfield/control-plane/internal/agui"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/Agent-Field/agentfield/control-plane/internal/utils"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
)

// AGUIRunRequest is the POST body the AG-UI run endpoint accepts. It mirrors
// AG-UI's input shape (threadId/runId optional, freeform input map) plus a
// reasoner field to identify the AgentField target. The reasoner takes the
// usual `node_id.reasoner_name` form.
type AGUIRunRequest struct {
	Reasoner string         `json:"reasoner"`
	Input    map[string]any `json:"input"`
	ThreadID string         `json:"threadId,omitempty"`
	RunID    string         `json:"runId,omitempty"`
}

// agentInvoker abstracts the outbound HTTP call to the agent's reasoner so
// tests can stub behavior without spinning up a real server. The default
// implementation (httpAgentInvoker) does a plain POST and reads the full body.
type agentInvoker interface {
	Invoke(ctx context.Context, agent *types.AgentNode, reasonerName string, input []byte) ([]byte, error)
}

type httpAgentInvoker struct{ client *http.Client }

func (i httpAgentInvoker) Invoke(ctx context.Context, agent *types.AgentNode, reasonerName string, input []byte) ([]byte, error) {
	url := fmt.Sprintf("%s/reasoners/%s", agent.BaseURL, reasonerName)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(input))
	if err != nil {
		return nil, fmt.Errorf("create agent request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := i.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("agent call failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read agent response: %w", err)
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return body, fmt.Errorf("agent returned %d: %s", resp.StatusCode, truncateForLog(body))
	}
	return body, nil
}

// AGUIRunHandler handles POST /api/v1/agui/runs.
//
// It is the AG-UI protocol adapter: clients (e.g. CopilotKit) post a run
// request, the handler invokes the named reasoner, and the response stream
// is an AG-UI Server-Sent Events flow.
//
// POC scope:
//   - Emits RunStarted -> TextMessageStart -> TextMessageContent (one chunk
//     carrying the reasoner's full result) -> TextMessageEnd -> RunFinished.
//   - On invocation failure, emits RunError instead of RunFinished.
//   - Does NOT yet stream tokens, tool-call frames, or state deltas — those
//     require reasoner-side streaming, which is the next iteration.
func AGUIRunHandler(storageProvider storage.StorageProvider) gin.HandlerFunc {
	return aguiRunHandler(storageProvider, httpAgentInvoker{})
}

func aguiRunHandler(storageProvider storage.StorageProvider, invoker agentInvoker) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		var req AGUIRunRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(req.Reasoner) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "reasoner is required"})
			return
		}
		parts := strings.Split(req.Reasoner, ".")
		if len(parts) != 2 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "reasoner must be in format 'node_id.reasoner_name'",
			})
			return
		}
		nodeID, reasonerName := parts[0], parts[1]
		if req.Input == nil {
			req.Input = map[string]any{}
		}

		agent, err := storageProvider.GetAgent(ctx, nodeID)
		if err != nil || agent == nil {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("node '%s' not found", nodeID),
			})
			return
		}
		if !reasonerExists(agent, reasonerName) {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("reasoner '%s' not found on node '%s'", reasonerName, nodeID),
			})
			return
		}

		// Validation passed — switch to streaming mode. From here on we report
		// failures via RunError frames instead of HTTP error responses, since
		// the SSE stream is already open.
		threadID := req.ThreadID
		if threadID == "" {
			threadID = "thread-" + utils.GenerateExecutionID()
		}
		runID := req.RunID
		if runID == "" {
			runID = "run-" + utils.GenerateExecutionID()
		}

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")

		flush := func() {
			if f, ok := c.Writer.(http.Flusher); ok {
				f.Flush()
			}
		}

		write := func(ev agui.Event) bool {
			if err := agui.WriteSSE(c.Writer, ev); err != nil {
				return false
			}
			flush()
			return true
		}

		if !write(agui.RunStarted{
			ThreadID:  threadID,
			RunID:     runID,
			Input:     req.Input,
			Timestamp: agui.Now(),
		}) {
			return
		}

		inputJSON, err := json.Marshal(req.Input)
		if err != nil {
			write(agui.RunError{
				Message:   fmt.Sprintf("failed to marshal input: %v", err),
				Code:      "ERR_INPUT_MARSHAL",
				Timestamp: agui.Now(),
			})
			return
		}

		body, invokeErr := invoker.Invoke(ctx, agent, reasonerName, inputJSON)
		if invokeErr != nil {
			write(agui.RunError{
				Message:   invokeErr.Error(),
				Code:      "ERR_AGENT_CALL",
				Timestamp: agui.Now(),
			})
			return
		}

		// Try to decode the agent response as JSON; if successful, surface the
		// `result` field as text when present, else stringify the whole body.
		// Also attach the parsed result to RunFinished.result so structured
		// consumers don't have to reparse the text.
		var parsed any
		var resultText string
		if err := json.Unmarshal(body, &parsed); err == nil {
			if obj, ok := parsed.(map[string]any); ok {
				if r, ok := obj["result"]; ok {
					resultText = stringifyResult(r)
				}
			}
			if resultText == "" {
				resultText = stringifyResult(parsed)
			}
		} else {
			resultText = string(body)
		}

		messageID := "msg-" + utils.GenerateExecutionID()

		if !write(agui.TextMessageStart{
			MessageID: messageID,
			Role:      "assistant",
			Timestamp: agui.Now(),
		}) {
			return
		}
		if !write(agui.TextMessageContent{
			MessageID: messageID,
			Delta:     resultText,
			Timestamp: agui.Now(),
		}) {
			return
		}
		if !write(agui.TextMessageEnd{
			MessageID: messageID,
			Timestamp: agui.Now(),
		}) {
			return
		}
		write(agui.RunFinished{
			Outcome:   &agui.Outcome{Type: "success"},
			Result:    parsed,
			Timestamp: agui.Now(),
		})
	}
}

func reasonerExists(agent *types.AgentNode, name string) bool {
	for _, r := range agent.Reasoners {
		if r.ID == name {
			return true
		}
	}
	return false
}

// stringifyResult renders an arbitrary JSON value as a text chunk suitable
// for the AG-UI TextMessageContent delta. Strings pass through verbatim;
// everything else is JSON-encoded.
func stringifyResult(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if v == nil {
		return ""
	}
	encoded, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(encoded)
}
