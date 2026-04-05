package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/config"
	"github.com/Agent-Field/agentfield/control-plane/internal/events"
	"github.com/Agent-Field/agentfield/control-plane/internal/handlers"
	"github.com/Agent-Field/agentfield/control-plane/internal/logger"
	"github.com/Agent-Field/agentfield/control-plane/internal/services"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
	"github.com/gin-gonic/gin"
)

type executionLogStore interface {
	ListExecutionLogEntries(ctx context.Context, executionID string, afterSeq *int64, limit int, levels []string, nodeIDs []string, sources []string, query string) ([]*types.ExecutionLogEntry, error)
	GetExecutionLogEventBus() *events.EventBus[*types.ExecutionLogEntry]
}

// ExecutionLogsHandler handles structured execution log APIs and related UI observability endpoints.
type ExecutionLogsHandler struct {
	store            executionLogStore
	snapshot         func() config.ExecutionLogsConfig
	llmHealthMonitor *services.LLMHealthMonitor
}

// NewExecutionLogsHandler creates a new ExecutionLogsHandler.
func NewExecutionLogsHandler(store executionLogStore, snapshot func() config.ExecutionLogsConfig, llmHealthMonitor *services.LLMHealthMonitor) *ExecutionLogsHandler {
	return &ExecutionLogsHandler{
		store:            store,
		snapshot:         snapshot,
		llmHealthMonitor: llmHealthMonitor,
	}
}

// GetExecutionQueueStatusHandler returns concurrency slot usage per agent and overall queue health.
// GET /api/ui/v1/executions/queue
func (h *ExecutionLogsHandler) GetExecutionQueueStatusHandler(c *gin.Context) {
	limiter := handlers.GetConcurrencyLimiter()
	maxPerAgent := 0
	counts := map[string]int64{}
	if limiter != nil {
		maxPerAgent = limiter.MaxPerAgent()
		counts = limiter.GetAllCounts()
	}

	type agentSlot struct {
		AgentNodeID string `json:"agent_node_id"`
		Running     int64  `json:"running"`
		Max         int    `json:"max"`
		Available   int    `json:"available"`
	}

	agents := make([]agentSlot, 0, len(counts))
	totalRunning := int64(0)
	for agentID, running := range counts {
		avail := maxPerAgent - int(running)
		if avail < 0 {
			avail = 0
		}
		agents = append(agents, agentSlot{
			AgentNodeID: agentID,
			Running:     running,
			Max:         maxPerAgent,
			Available:   avail,
		})
		totalRunning += running
	}

	c.JSON(http.StatusOK, gin.H{
		"enabled":       maxPerAgent > 0,
		"max_per_agent": maxPerAgent,
		"total_running": totalRunning,
		"agents":        agents,
		"checked_at":    time.Now().Format(time.RFC3339),
	})
}

// GetExecutionLogsHandler returns structured execution logs for a specific execution.
// GET /api/ui/v1/executions/:execution_id/logs
func (h *ExecutionLogsHandler) GetExecutionLogsHandler(c *gin.Context) {
	executionID := strings.TrimSpace(c.Param("execution_id"))
	if executionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "execution_id is required"})
		return
	}
	if h.store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "execution log store not configured"})
		return
	}

	cfg := h.effectiveConfig()
	afterSeq, err := parseInt64Query(c, "after_seq")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid after_seq"})
		return
	}
	limit, err := boundedLimit(c.Query("limit"), cfg.MaxTailEntries)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit"})
		return
	}

	entries, err := h.store.ListExecutionLogEntries(
		c.Request.Context(),
		executionID,
		afterSeq,
		limit,
		parseMultiValueQuery(c, "level"),
		parseMultiValueQuery(c, "node_id"),
		parseMultiValueQuery(c, "source"),
		c.Query("q"),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"entries": entries,
		"effective": gin.H{
			"retention_period":          cfg.RetentionPeriod.String(),
			"max_entries_per_execution": cfg.MaxEntriesPerExecution,
			"max_tail_entries":          cfg.MaxTailEntries,
			"stream_idle_timeout":       cfg.StreamIdleTimeout.String(),
			"max_stream_duration":       cfg.MaxStreamDuration.String(),
		},
	})
}

// StreamExecutionLogsHandler streams real-time structured execution logs for a specific execution via SSE.
// GET /api/ui/v1/executions/:execution_id/logs/stream
func (h *ExecutionLogsHandler) StreamExecutionLogsHandler(c *gin.Context) {
	executionID := strings.TrimSpace(c.Param("execution_id"))
	if executionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "execution_id is required"})
		return
	}
	if h.store == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "execution log store not configured"})
		return
	}

	cfg := h.effectiveConfig()
	afterSeq, err := parseInt64Query(c, "after_seq")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid after_seq"})
		return
	}
	replayLimit, err := boundedLimit(c.DefaultQuery("replay_limit", c.Query("limit")), cfg.MaxTailEntries)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid replay_limit"})
		return
	}
	levels := parseMultiValueQuery(c, "level")
	nodeIDs := parseMultiValueQuery(c, "node_id")
	sources := parseMultiValueQuery(c, "source")
	query := c.Query("q")

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	initialEvent := map[string]interface{}{
		"type":         "connected",
		"execution_id": executionID,
		"message":      "Execution log stream connected",
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	}
	if payload, err := json.Marshal(initialEvent); err == nil {
		if !writeSSE(c, payload) {
			return
		}
	}

	replay, err := h.store.ListExecutionLogEntries(c.Request.Context(), executionID, afterSeq, replayLimit, levels, nodeIDs, sources, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	lastSeq := afterSeq
	for _, entry := range replay {
		payload, err := json.Marshal(entry)
		if err != nil {
			logger.Logger.Error().Err(err).Msg("failed to marshal execution log replay event")
			continue
		}
		if !writeSSE(c, payload) {
			return
		}
		seq := entry.Sequence
		lastSeq = &seq
	}

	subscriberID := fmt.Sprintf("exec_logs_%s_%d_%s", executionID, time.Now().UnixNano(), c.ClientIP())
	eventChan := h.store.GetExecutionLogEventBus().Subscribe(subscriberID)
	defer h.store.GetExecutionLogEventBus().Unsubscribe(subscriberID)

	ctx := c.Request.Context()
	heartbeatEvery := 30 * time.Second
	if cfg.StreamIdleTimeout > 0 && cfg.StreamIdleTimeout < heartbeatEvery {
		heartbeatEvery = cfg.StreamIdleTimeout / 2
		if heartbeatEvery < 5*time.Second {
			heartbeatEvery = 5 * time.Second
		}
	}
	heartbeatTicker := time.NewTicker(heartbeatEvery)
	defer heartbeatTicker.Stop()

	var idleTimer *time.Timer
	var idleC <-chan time.Time
	if cfg.StreamIdleTimeout > 0 {
		idleTimer = time.NewTimer(cfg.StreamIdleTimeout)
		idleC = idleTimer.C
		defer idleTimer.Stop()
		resetTimer(idleTimer, cfg.StreamIdleTimeout)
	}

	var maxDurationTimer *time.Timer
	var maxDurationC <-chan time.Time
	if cfg.MaxStreamDuration > 0 {
		maxDurationTimer = time.NewTimer(cfg.MaxStreamDuration)
		maxDurationC = maxDurationTimer.C
		defer maxDurationTimer.Stop()
	}

	logger.Logger.Debug().
		Str("execution_id", executionID).
		Str("subscriber", subscriberID).
		Msg("structured execution log SSE client connected")

	for {
		select {
		case <-ctx.Done():
			logger.Logger.Debug().Str("execution_id", executionID).Msg("structured execution log SSE client disconnected")
			return
		case <-maxDurationC:
			if payload, err := json.Marshal(gin.H{"type": "stream_closed", "reason": "max_duration", "timestamp": time.Now().UTC().Format(time.RFC3339)}); err == nil {
				_ = writeSSE(c, payload)
			}
			return
		case <-idleC:
			if payload, err := json.Marshal(gin.H{"type": "stream_closed", "reason": "idle_timeout", "timestamp": time.Now().UTC().Format(time.RFC3339)}); err == nil {
				_ = writeSSE(c, payload)
			}
			return
		case <-heartbeatTicker.C:
			heartbeat := map[string]interface{}{
				"type":      "heartbeat",
				"timestamp": time.Now().UTC().Format(time.RFC3339),
			}
			if heartbeatJSON, err := json.Marshal(heartbeat); err == nil {
				if !writeSSE(c, heartbeatJSON) {
					return
				}
			}
		case entry, ok := <-eventChan:
			if !ok {
				return
			}
			if entry == nil || entry.ExecutionID != executionID {
				continue
			}
			if lastSeq != nil && entry.Sequence <= *lastSeq {
				continue
			}
			if !matchesExecutionLogFilters(entry, levels, nodeIDs, sources, query) {
				continue
			}

			payload, err := json.Marshal(entry)
			if err != nil {
				logger.Logger.Error().Err(err).Msg("failed to marshal execution log event")
				continue
			}
			if !writeSSE(c, payload) {
				return
			}
			seq := entry.Sequence
			lastSeq = &seq
			if idleTimer != nil {
				resetTimer(idleTimer, cfg.StreamIdleTimeout)
			}
		}
	}
}

// GetLLMHealthHandler returns the health status of all configured LLM endpoints.
// GET /api/ui/v1/llm/health
func (h *ExecutionLogsHandler) GetLLMHealthHandler(c *gin.Context) {
	if h.llmHealthMonitor == nil {
		c.JSON(http.StatusOK, gin.H{
			"enabled":   false,
			"endpoints": []interface{}{},
		})
		return
	}

	statuses := h.llmHealthMonitor.GetAllStatuses()
	anyHealthy := h.llmHealthMonitor.IsAnyEndpointHealthy()

	c.JSON(http.StatusOK, gin.H{
		"enabled":    true,
		"healthy":    anyHealthy,
		"endpoints":  statuses,
		"checked_at": time.Now().Format(time.RFC3339),
	})
}

func (h *ExecutionLogsHandler) effectiveConfig() config.ExecutionLogsConfig {
	if h.snapshot == nil {
		return config.EffectiveExecutionLogs(config.ExecutionLogsConfig{})
	}
	return config.EffectiveExecutionLogs(h.snapshot())
}

func parseInt64Query(c *gin.Context, key string) (*int64, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return nil, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func boundedLimit(raw string, maxValue int) (int, error) {
	limit := maxValue
	if strings.TrimSpace(raw) != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return 0, err
		}
		limit = parsed
	}
	if limit <= 0 {
		limit = maxValue
	}
	if maxValue > 0 && limit > maxValue {
		limit = maxValue
	}
	return limit, nil
}

func parseMultiValueQuery(c *gin.Context, key string) []string {
	values := c.QueryArray(key)
	if len(values) == 0 {
		if single := strings.TrimSpace(c.Query(key)); single != "" {
			values = []string{single}
		}
	}

	seen := make(map[string]struct{}, len(values))
	var out []string
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			if _, ok := seen[trimmed]; ok {
				continue
			}
			seen[trimmed] = struct{}{}
			out = append(out, trimmed)
		}
	}
	return out
}

func matchesExecutionLogFilters(entry *types.ExecutionLogEntry, levels []string, nodeIDs []string, sources []string, query string) bool {
	if entry == nil {
		return false
	}
	if len(levels) > 0 && !containsFold(levels, entry.Level) {
		return false
	}
	if len(nodeIDs) > 0 && !containsExact(nodeIDs, entry.AgentNodeID) {
		return false
	}
	if len(sources) > 0 && !containsExact(sources, entry.Source) {
		return false
	}
	if trimmedQuery := strings.TrimSpace(query); trimmedQuery != "" {
		needle := strings.ToLower(trimmedQuery)
		if !strings.Contains(strings.ToLower(entry.Message), needle) && !strings.Contains(strings.ToLower(string(entry.Attributes)), needle) {
			return false
		}
	}
	return true
}

func containsFold(values []string, candidate string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}

func containsExact(values []string, candidate string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == strings.TrimSpace(candidate) {
			return true
		}
	}
	return false
}

func resetTimer(timer *time.Timer, duration time.Duration) {
	if timer == nil || duration <= 0 {
		return
	}
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(duration)
}
