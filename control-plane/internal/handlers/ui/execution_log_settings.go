package ui

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/config"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

// ExecutionLogSettingsHandler reads/updates structured execution log limits (DB + runtime config).
type ExecutionLogSettingsHandler struct {
	Storage     storage.StorageProvider
	ReadConfig  func(func(*config.Config))
	WriteConfig func(func(*config.Config))
}

type executionLogSettingsJSON struct {
	RetentionPeriod        string `json:"retention_period"`
	MaxEntriesPerExecution int    `json:"max_entries_per_execution"`
	MaxTailEntries         int    `json:"max_tail_entries"`
	StreamIdleTimeout      string `json:"stream_idle_timeout"`
	MaxStreamDuration      string `json:"max_stream_duration"`
}

func envLocksExecutionLogs() map[string]bool {
	return map[string]bool{
		"retention_period":          os.Getenv("AGENTFIELD_EXECUTION_LOG_RETENTION_PERIOD") != "",
		"max_entries_per_execution": os.Getenv("AGENTFIELD_EXECUTION_LOG_MAX_ENTRIES_PER_EXECUTION") != "",
		"max_tail_entries":          os.Getenv("AGENTFIELD_EXECUTION_LOG_MAX_TAIL_ENTRIES") != "",
		"stream_idle_timeout":       os.Getenv("AGENTFIELD_EXECUTION_LOG_STREAM_IDLE_TIMEOUT") != "",
		"max_stream_duration":       os.Getenv("AGENTFIELD_EXECUTION_LOG_MAX_DURATION") != "",
	}
}

// GetExecutionLogSettingsHandler GET /api/ui/v1/settings/execution-logs
func (h *ExecutionLogSettingsHandler) GetExecutionLogSettingsHandler(c *gin.Context) {
	if h.ReadConfig == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "not_configured"})
		return
	}

	var eff config.ExecutionLogsConfig
	h.ReadConfig(func(cfg *config.Config) {
		eff = config.EffectiveExecutionLogs(cfg.AgentField.ExecutionLogs)
	})

	c.JSON(http.StatusOK, gin.H{
		"effective": gin.H{
			"retention_period":          eff.RetentionPeriod.String(),
			"max_entries_per_execution": eff.MaxEntriesPerExecution,
			"max_tail_entries":          eff.MaxTailEntries,
			"stream_idle_timeout":       eff.StreamIdleTimeout.String(),
			"max_stream_duration":       eff.MaxStreamDuration.String(),
		},
		"env_locks": envLocksExecutionLogs(),
	})
}

// PutExecutionLogSettingsHandler PUT /api/ui/v1/settings/execution-logs
func (h *ExecutionLogSettingsHandler) PutExecutionLogSettingsHandler(c *gin.Context) {
	if h.Storage == nil || h.WriteConfig == nil || h.ReadConfig == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "not_configured"})
		return
	}

	locks := envLocksExecutionLogs()
	for key, locked := range locks {
		if locked {
			c.JSON(http.StatusConflict, gin.H{
				"error":   "env_locked",
				"message": "Clear environment override for " + key + " before editing from UI",
				"locks":   locks,
			})
			return
		}
	}

	var body executionLogSettingsJSON
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_json", "message": err.Error()})
		return
	}

	next := config.ExecutionLogsConfig{}
	if body.RetentionPeriod != "" {
		d, err := time.ParseDuration(body.RetentionPeriod)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_retention_period"})
			return
		}
		next.RetentionPeriod = d
	}
	if body.MaxEntriesPerExecution > 0 {
		next.MaxEntriesPerExecution = body.MaxEntriesPerExecution
	}
	if body.MaxTailEntries > 0 {
		next.MaxTailEntries = body.MaxTailEntries
	}
	if body.StreamIdleTimeout != "" {
		d, err := time.ParseDuration(body.StreamIdleTimeout)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_stream_idle_timeout"})
			return
		}
		next.StreamIdleTimeout = d
	}
	if body.MaxStreamDuration != "" {
		d, err := time.ParseDuration(body.MaxStreamDuration)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_max_stream_duration"})
			return
		}
		next.MaxStreamDuration = d
	}
	if next.RetentionPeriod == 0 && next.MaxEntriesPerExecution == 0 && next.MaxTailEntries == 0 && next.StreamIdleTimeout == 0 && next.MaxStreamDuration == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no_fields", "message": "Provide at least one field to update"})
		return
	}

	if err := persistExecutionLogOverlay(c.Request.Context(), h.Storage, next); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "persist_failed", "message": err.Error()})
		return
	}

	h.WriteConfig(func(cfg *config.Config) {
		if next.RetentionPeriod > 0 {
			cfg.AgentField.ExecutionLogs.RetentionPeriod = next.RetentionPeriod
		}
		if next.MaxEntriesPerExecution > 0 {
			cfg.AgentField.ExecutionLogs.MaxEntriesPerExecution = next.MaxEntriesPerExecution
		}
		if next.MaxTailEntries > 0 {
			cfg.AgentField.ExecutionLogs.MaxTailEntries = next.MaxTailEntries
		}
		if next.StreamIdleTimeout > 0 {
			cfg.AgentField.ExecutionLogs.StreamIdleTimeout = next.StreamIdleTimeout
		}
		if next.MaxStreamDuration > 0 {
			cfg.AgentField.ExecutionLogs.MaxStreamDuration = next.MaxStreamDuration
		}
	})

	var eff config.ExecutionLogsConfig
	h.ReadConfig(func(cfg *config.Config) {
		eff = config.EffectiveExecutionLogs(cfg.AgentField.ExecutionLogs)
	})

	c.JSON(http.StatusOK, gin.H{
		"effective": gin.H{
			"retention_period":          eff.RetentionPeriod.String(),
			"max_entries_per_execution": eff.MaxEntriesPerExecution,
			"max_tail_entries":          eff.MaxTailEntries,
			"stream_idle_timeout":       eff.StreamIdleTimeout.String(),
			"max_stream_duration":       eff.MaxStreamDuration.String(),
		},
	})
}

func persistExecutionLogOverlay(ctx context.Context, st storage.StorageProvider, patch config.ExecutionLogsConfig) error {
	var root map[string]interface{}
	entry, err := st.GetConfig(ctx, agentfieldYAMLConfigKey)
	if err != nil {
		return err
	}
	if entry != nil && entry.Value != "" {
		if err := yaml.Unmarshal([]byte(entry.Value), &root); err != nil {
			return err
		}
	}
	if root == nil {
		root = make(map[string]interface{})
	}

	af, _ := root["agentfield"].(map[string]interface{})
	if af == nil {
		af = make(map[string]interface{})
		root["agentfield"] = af
	}
	execLogs, _ := af["execution_logs"].(map[string]interface{})
	if execLogs == nil {
		execLogs = make(map[string]interface{})
		af["execution_logs"] = execLogs
	}

	if patch.RetentionPeriod > 0 {
		execLogs["retention_period"] = patch.RetentionPeriod.String()
	}
	if patch.MaxEntriesPerExecution > 0 {
		execLogs["max_entries_per_execution"] = patch.MaxEntriesPerExecution
	}
	if patch.MaxTailEntries > 0 {
		execLogs["max_tail_entries"] = patch.MaxTailEntries
	}
	if patch.StreamIdleTimeout > 0 {
		execLogs["stream_idle_timeout"] = patch.StreamIdleTimeout.String()
	}
	if patch.MaxStreamDuration > 0 {
		execLogs["max_stream_duration"] = patch.MaxStreamDuration.String()
	}

	out, err := yaml.Marshal(root)
	if err != nil {
		return err
	}
	return st.SetConfig(ctx, agentfieldYAMLConfigKey, string(out), "ui")
}
