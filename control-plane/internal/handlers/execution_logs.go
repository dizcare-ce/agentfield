package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/config"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
	"github.com/gin-gonic/gin"
)

type executionLogEnvelope struct {
	Entries []types.ExecutionLogEntry `json:"entries"`
}

// ExecutionLogStore defines the storage needed for structured execution log ingestion.
type ExecutionLogStore interface {
	StoreExecutionLogEntry(ctx context.Context, entry *types.ExecutionLogEntry) error
	PruneExecutionLogEntries(ctx context.Context, executionID string, maxEntries int, olderThan time.Time) error
}

// StructuredExecutionLogsHandler ingests structured execution logs emitted by SDK runtimes.
// POST /api/v1/executions/:execution_id/logs
func StructuredExecutionLogsHandler(store ExecutionLogStore, snapshot func() config.ExecutionLogsConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		executionID := strings.TrimSpace(c.Param("execution_id"))
		if executionID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "execution_id is required"})
			return
		}

		body, err := c.GetRawData()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("failed to read body: %v", err)})
			return
		}
		if len(body) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "request body is required"})
			return
		}

		entries, err := decodeExecutionLogEntries(body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid payload: %v", err)})
			return
		}
		if len(entries) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "at least one execution log entry is required"})
			return
		}

		cfg := config.EffectiveExecutionLogs(snapshot())
		ctx := c.Request.Context()
		pruneBefore := time.Time{}
		if cfg.RetentionPeriod > 0 {
			pruneBefore = time.Now().UTC().Add(-cfg.RetentionPeriod)
		}

		accepted := 0
		for i := range entries {
			entry := entries[i]
			entry.ExecutionID = strings.TrimSpace(entry.ExecutionID)
			if entry.ExecutionID == "" {
				entry.ExecutionID = executionID
			}
			if entry.ExecutionID != executionID {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":          "execution_id_mismatch",
					"path_execution": executionID,
					"body_execution": entry.ExecutionID,
				})
				return
			}
			if strings.TrimSpace(entry.Message) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
				return
			}
			if strings.TrimSpace(entry.AgentNodeID) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "agent_node_id is required"})
				return
			}
			if strings.TrimSpace(entry.WorkflowID) == "" {
				entry.WorkflowID = executionID
			}
			if entry.RootWorkflowID == nil || strings.TrimSpace(*entry.RootWorkflowID) == "" {
				rootWorkflowID := entry.WorkflowID
				entry.RootWorkflowID = &rootWorkflowID
			}
			if len(entry.Attributes) == 0 {
				entry.Attributes = json.RawMessage("{}")
			}

			if err := store.StoreExecutionLogEntry(ctx, &entry); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to store execution log entry: %v", err)})
				return
			}
			accepted++
		}

		if err := store.PruneExecutionLogEntries(ctx, executionID, cfg.MaxEntriesPerExecution, pruneBefore); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to prune execution logs: %v", err)})
			return
		}

		c.JSON(http.StatusAccepted, gin.H{
			"success":      true,
			"execution_id": executionID,
			"accepted":     accepted,
		})
	}
}

func decodeExecutionLogEntries(body []byte) ([]types.ExecutionLogEntry, error) {
	var envelope executionLogEnvelope
	if err := json.Unmarshal(body, &envelope); err == nil && len(envelope.Entries) > 0 {
		return envelope.Entries, nil
	}

	var single types.ExecutionLogEntry
	if err := json.Unmarshal(body, &single); err != nil {
		return nil, err
	}
	return []types.ExecutionLogEntry{single}, nil
}
