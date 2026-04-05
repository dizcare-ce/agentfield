package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/config"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
	"github.com/gin-gonic/gin"
)

type executionLogIngestStore interface {
	StoreExecutionLogEntry(ctx context.Context, entry *types.ExecutionLogEntry) error
	PruneExecutionLogEntries(ctx context.Context, executionID string, maxEntries int, olderThan time.Time) error
}

type executionLogBatchRequest struct {
	Entries []*types.ExecutionLogEntry `json:"entries"`
}

// ExecutionLogIngestHandler ingests structured execution logs emitted by SDK runtimes.
// POST /api/v1/executions/:execution_id/logs
func ExecutionLogIngestHandler(store executionLogIngestStore, snapshot func() config.ExecutionLogsConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		executionID := strings.TrimSpace(c.Param("execution_id"))
		if executionID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "execution_id is required"})
			return
		}
		if store == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "execution log store not configured"})
			return
		}

		entries, err := decodeExecutionLogEntries(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload", "message": err.Error()})
			return
		}
		if len(entries) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "entries are required"})
			return
		}

		now := time.Now().UTC()
		for idx, entry := range entries {
			if entry == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("entry %d is null", idx)})
				return
			}
			if err := normalizeExecutionLogEntry(entry, executionID, now); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("entry %d: %s", idx, err.Error())})
				return
			}
		}

		ctx := c.Request.Context()
		for _, entry := range entries {
			if err := store.StoreExecutionLogEntry(ctx, entry); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store execution log entry", "message": err.Error()})
				return
			}
		}

		cfg := config.EffectiveExecutionLogs(config.ExecutionLogsConfig{})
		if snapshot != nil {
			cfg = config.EffectiveExecutionLogs(snapshot())
		}
		if err := store.PruneExecutionLogEntries(ctx, executionID, cfg.MaxEntriesPerExecution, now.Add(-cfg.RetentionPeriod)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prune execution logs", "message": err.Error()})
			return
		}

		c.JSON(http.StatusAccepted, gin.H{
			"accepted": len(entries),
			"entries":  entries,
		})
	}
}

func decodeExecutionLogEntries(body io.ReadCloser) ([]*types.ExecutionLogEntry, error) {
	defer body.Close()
	raw, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty body")
	}

	var batch executionLogBatchRequest
	if err := json.Unmarshal(raw, &batch); err == nil && len(batch.Entries) > 0 {
		return batch.Entries, nil
	}

	var single types.ExecutionLogEntry
	if err := json.Unmarshal(raw, &single); err != nil {
		return nil, err
	}
	return []*types.ExecutionLogEntry{&single}, nil
}

func normalizeExecutionLogEntry(entry *types.ExecutionLogEntry, executionID string, now time.Time) error {
	entry.ExecutionID = strings.TrimSpace(entry.ExecutionID)
	if entry.ExecutionID == "" {
		entry.ExecutionID = executionID
	}
	if entry.ExecutionID != executionID {
		return fmt.Errorf("execution_id does not match request path")
	}

	entry.WorkflowID = strings.TrimSpace(entry.WorkflowID)
	entry.AgentNodeID = strings.TrimSpace(entry.AgentNodeID)
	entry.Level = strings.ToLower(strings.TrimSpace(entry.Level))
	entry.Source = strings.TrimSpace(entry.Source)
	entry.Message = strings.TrimSpace(entry.Message)

	if entry.WorkflowID == "" {
		return fmt.Errorf("workflow_id is required")
	}
	if entry.AgentNodeID == "" {
		return fmt.Errorf("agent_node_id is required")
	}
	if entry.Level == "" {
		return fmt.Errorf("level is required")
	}
	if entry.Source == "" {
		return fmt.Errorf("source is required")
	}
	if entry.Message == "" {
		return fmt.Errorf("message is required")
	}
	if entry.EmittedAt.IsZero() {
		entry.EmittedAt = now
	}
	if len(entry.Attributes) == 0 {
		entry.Attributes = json.RawMessage("{}")
	}
	entry.Sequence = 0
	entry.EventID = 0
	entry.RecordedAt = time.Time{}
	return nil
}
