package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/events"
	"github.com/Agent-Field/agentfield/control-plane/internal/logger"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
)

type hitlPendingListItem struct {
	RequestID          string   `json:"request_id"`
	ExecutionID        string   `json:"execution_id"`
	AgentNodeID        string   `json:"agent_node_id"`
	WorkflowID         string   `json:"workflow_id"`
	Title              string   `json:"title"`
	DescriptionPreview string   `json:"description_preview"`
	Tags               []string `json:"tags"`
	Priority           string   `json:"priority"`
	RequestedAt        string   `json:"requested_at"`
	ExpiresAt          string   `json:"expires_at"`
}

type hitlRespondRequest struct {
	Responder string         `json:"responder"`
	Response  map[string]any `json:"response"`
}

func HitlListPendingHandler(store ExecutionStore) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		status := types.ExecutionStatusWaiting
		approvalStatus := "pending"
		hasFormSchema := true

		limit := 50
		if raw := strings.TrimSpace(ctx.Query("limit")); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n <= 0 {
				ctx.JSON(http.StatusBadRequest, gin.H{"error": "limit must be a positive integer"})
				return
			}
			if n > 200 {
				n = 200
			}
			limit = n
		}

		offset := 0
		if raw := strings.TrimSpace(ctx.Query("offset")); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n < 0 {
				ctx.JSON(http.StatusBadRequest, gin.H{"error": "offset must be a non-negative integer"})
				return
			}
			offset = n
		}

		var priority *string
		if value := strings.TrimSpace(ctx.Query("priority")); value != "" {
			priority = &value
		}

		executions, err := store.QueryWorkflowExecutions(ctx.Request.Context(), types.WorkflowExecutionFilters{
			Status:           &status,
			ApprovalStatusEq: &approvalStatus,
			HasFormSchema:    &hasFormSchema,
			Tags:             ctx.QueryArray("tag"),
			Priority:         priority,
			Limit:            limit,
			Offset:           offset,
		})
		if err != nil {
			logger.Logger.Error().Err(err).Msg("failed to list pending HITL items")
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list pending items"})
			return
		}

		items := make([]hitlPendingListItem, 0, len(executions))
		for _, wfExec := range executions {
			item, ok := buildHitlPendingListItem(wfExec)
			if ok {
				items = append(items, item)
			}
		}
		ctx.JSON(http.StatusOK, gin.H{"items": items})
	}
}

func HitlGetPendingHandler(store ExecutionStore) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		requestID := ctx.Param("request_id")
		executionID, wfExec, err := findHitlExecution(ctx.Request.Context(), store, requestID)
		if err != nil {
			logger.Logger.Error().Err(err).Str("request_id", requestID).Msg("failed to get HITL item")
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to look up request"})
			return
		}
		if wfExec == nil || wfExec.ApprovalFormSchema == nil {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
			return
		}

		var schema any
		if err := json.Unmarshal([]byte(*wfExec.ApprovalFormSchema), &schema); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "stored form schema is invalid"})
			return
		}

		status := "pending"
		if wfExec.ApprovalStatus != nil {
			status = *wfExec.ApprovalStatus
		}

		response := gin.H{
			"request_id":    requestID,
			"execution_id":  executionID,
			"agent_node_id": wfExec.AgentNodeID,
			"workflow_id":   wfExec.WorkflowID,
			"schema":        schema,
			"requested_at":  formatTimePtr(wfExec.ApprovalRequestedAt),
			"expires_at":    formatTimePtr(wfExec.ApprovalExpiresAt),
			"status":        status,
		}

		if status == "pending" {
			response["readonly"] = false
			ctx.JSON(http.StatusOK, response)
			return
		}

		response["readonly"] = true
		if wfExec.ApprovalResponse != nil && *wfExec.ApprovalResponse != "" {
			var parsed any
			if err := json.Unmarshal([]byte(*wfExec.ApprovalResponse), &parsed); err == nil {
				response["response"] = parsed
			}
		}
		response["responder"] = stringValue(wfExec.ApprovalResponder)
		response["responded_at"] = formatTimePtr(wfExec.ApprovalRespondedAt)
		ctx.JSON(http.StatusOK, response)
	}
}

func HitlRespondHandler(store ExecutionStore, webhookSecret string) gin.HandlerFunc {
	resolver := NewWebhookApprovalController(store, webhookSecret)

	return func(ctx *gin.Context) {
		requestID := ctx.Param("request_id")
		executionID, wfExec, err := findHitlExecution(ctx.Request.Context(), store, requestID)
		if err != nil {
			logger.Logger.Error().Err(err).Str("request_id", requestID).Msg("failed to get HITL item for response")
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to look up request"})
			return
		}
		if wfExec == nil || wfExec.ApprovalFormSchema == nil {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "request not found"})
			return
		}

		var req hitlRespondRequest
		if err := ctx.ShouldBindJSON(&req); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid request body: %v", err)})
			return
		}
		if req.Response == nil {
			req.Response = map[string]any{}
		}

		if types.NormalizeExecutionStatus(wfExec.Status) != types.ExecutionStatusWaiting || wfExec.ApprovalStatus == nil || *wfExec.ApprovalStatus != "pending" {
			ctx.JSON(http.StatusConflict, gin.H{"error": "request is not pending"})
			return
		}

		cleaned, fieldErrors := validateHitlResponse(*wfExec.ApprovalFormSchema, req.Response)
		if len(fieldErrors) > 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"errors": fieldErrors})
			return
		}

		decision := "approved"
		if rawDecision, ok := cleaned["decision"].(string); ok && rawDecision != "" {
			decision = normalizeDecision(rawDecision)
		}

		responseJSON, err := json.Marshal(cleaned)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to serialize response"})
			return
		}

		payload := &ApprovalWebhookPayload{
			RequestID: requestID,
			Decision:  decision,
			Response:  responseJSON,
			Feedback:  extractHitlFeedback(cleaned),
		}
		if err := resolver.resolveApproval(ctx.Request.Context(), executionID, wfExec, payload, strings.TrimSpace(req.Responder)); err != nil {
			logger.Logger.Error().Err(err).Str("request_id", requestID).Msg("failed to resolve HITL response")
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process response"})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"status":       "processed",
			"decision":     decision,
			"execution_id": executionID,
		})
	}
}

func HitlStreamHandler(store ExecutionStore) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		ctx.Header("Content-Type", "text/event-stream")
		ctx.Header("Cache-Control", "no-cache")
		ctx.Header("Connection", "keep-alive")
		ctx.Header("X-Accel-Buffering", "no")

		bus := store.GetExecutionEventBus()
		subscriberID := fmt.Sprintf("hitl_stream_%d", time.Now().UnixNano())
		eventCh := bus.Subscribe(subscriberID)
		defer bus.Unsubscribe(subscriberID)

		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Request.Context().Done():
				return
			case <-ticker.C:
				if _, err := ctx.Writer.WriteString(": ping\n\n"); err != nil {
					return
				}
				ctx.Writer.Flush()
			case event, ok := <-eventCh:
				if !ok {
					return
				}
				switch event.Type {
				case events.ExecutionWaiting:
					data, ok := event.Data.(map[string]interface{})
					if !ok || !boolFromMap(data, "form_schema_present") {
						continue
					}
					wfExec, err := store.GetWorkflowExecution(ctx.Request.Context(), event.ExecutionID)
					if err != nil || wfExec == nil {
						continue
					}
					item, include := buildHitlPendingListItem(wfExec)
					if !include {
						continue
					}
					if !writeHitlSSE(ctx, "hitl.pending.added", item) {
						return
					}
				case events.ExecutionApprovalResolved:
					wfExec, err := store.GetWorkflowExecution(ctx.Request.Context(), event.ExecutionID)
					if err != nil || wfExec == nil || wfExec.ApprovalFormSchema == nil || wfExec.ApprovalRequestID == nil {
						continue
					}
					data, _ := event.Data.(map[string]interface{})
					payload := gin.H{
						"request_id":   *wfExec.ApprovalRequestID,
						"decision":     stringFromMap(data, "approval_decision"),
						"responder":    coalesceString(stringFromMap(data, "responder"), stringValue(wfExec.ApprovalResponder)),
						"responded_at": coalesceString(stringFromMap(data, "responded_at"), formatTimePtr(wfExec.ApprovalRespondedAt)),
					}
					if !writeHitlSSE(ctx, "hitl.pending.resolved", payload) {
						return
					}
				}
			}
		}
	}
}

func findHitlExecution(ctx context.Context, store ExecutionStore, requestID string) (string, *types.WorkflowExecution, error) {
	results, err := store.QueryWorkflowExecutions(ctx, types.WorkflowExecutionFilters{
		ApprovalRequestID: &requestID,
		Limit:             1,
	})
	if err != nil {
		return "", nil, err
	}
	if len(results) == 0 {
		return "", nil, nil
	}
	return results[0].ExecutionID, results[0], nil
}

func buildHitlPendingListItem(wfExec *types.WorkflowExecution) (hitlPendingListItem, bool) {
	if wfExec == nil || wfExec.ApprovalRequestID == nil || wfExec.ApprovalFormSchema == nil {
		return hitlPendingListItem{}, false
	}

	schema, err := parseHitlSchema(*wfExec.ApprovalFormSchema)
	if err != nil {
		return hitlPendingListItem{}, false
	}

	return hitlPendingListItem{
		RequestID:          *wfExec.ApprovalRequestID,
		ExecutionID:        wfExec.ExecutionID,
		AgentNodeID:        wfExec.AgentNodeID,
		WorkflowID:         wfExec.WorkflowID,
		Title:              coalesceString(strings.TrimSpace(schema.Title), "Untitled request"),
		DescriptionPreview: hitlDescriptionPreview(schema.Description),
		Tags:               parseJSONStrings(wfExec.ApprovalTags),
		Priority:           coalesceString(stringValue(wfExec.ApprovalPriority), "normal"),
		RequestedAt:        formatTimePtr(wfExec.ApprovalRequestedAt),
		ExpiresAt:          formatTimePtr(wfExec.ApprovalExpiresAt),
	}, true
}

func hitlDescriptionPreview(markdown string) string {
	text := markdown
	codeFenceRE := regexp.MustCompile("(?s)```.*?```")
	text = codeFenceRE.ReplaceAllString(text, " ")
	linkRE := regexp.MustCompile(`\[(.*?)\]\((.*?)\)`)
	text = linkRE.ReplaceAllString(text, "$1")
	replacer := strings.NewReplacer("`", "", "#", "", "*", "", "_", "", "\n", " ", "\r", " ")
	text = replacer.Replace(text)
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > 200 {
		return text[:200]
	}
	return text
}

func parseJSONStrings(raw *string) []string {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	var values []string
	if err := json.Unmarshal([]byte(*raw), &values); err != nil {
		return nil
	}
	return values
}

func formatTimePtr(ts *time.Time) string {
	if ts == nil {
		return ""
	}
	return ts.UTC().Format(time.RFC3339)
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func coalesceString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func writeHitlSSE(ctx *gin.Context, event string, payload any) bool {
	body, err := json.Marshal(payload)
	if err != nil {
		logger.Logger.Warn().Err(err).Str("event", event).Msg("failed to marshal HITL SSE payload")
		return false
	}
	if _, err := ctx.Writer.WriteString("event: " + event + "\n"); err != nil {
		return false
	}
	if _, err := ctx.Writer.WriteString("data: " + string(body) + "\n\n"); err != nil {
		return false
	}
	ctx.Writer.Flush()
	return true
}

func boolFromMap(data map[string]interface{}, key string) bool {
	value, ok := data[key]
	if !ok {
		return false
	}
	switch v := value.(type) {
	case bool:
		return v
	default:
		return false
	}
}

func stringFromMap(data map[string]interface{}, key string) string {
	value, ok := data[key]
	if !ok {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}
