package server

import (
	"github.com/Agent-Field/agentfield/control-plane/internal/handlers"

	"github.com/gin-gonic/gin"
)

// registerTriggerRoutes installs the webhook plugin system endpoints. The
// inbound ingest path (/sources/:trigger_id) lives at the root because
// providers cannot easily be reconfigured to authenticate against the API,
// and signature verification is performed by each Source.
func (s *AgentFieldServer) registerTriggerRoutes(agentAPI *gin.RouterGroup) {
	if s.triggerHandlers == nil {
		return
	}

	// Public ingest — no auth middleware. Verification is the Source's job.
	s.Router.POST("/sources/:trigger_id", s.triggerHandlers.IngestSourceHandler())

	// Authenticated UI/API surface for managing triggers.
	triggers := agentAPI.Group("/triggers")
	triggers.GET("", s.triggerHandlers.ListTriggers())
	triggers.POST("", s.triggerHandlers.CreateTrigger())
	triggers.GET("/:trigger_id", s.triggerHandlers.GetTrigger())
	triggers.PUT("/:trigger_id", s.triggerHandlers.UpdateTrigger())
	triggers.DELETE("/:trigger_id", s.triggerHandlers.DeleteTrigger())
	triggers.GET("/:trigger_id/events", s.triggerHandlers.ListTriggerEvents())
	triggers.POST("/:trigger_id/events/:event_id/replay", s.triggerHandlers.ReplayEvent())
	// Source-of-truth controls for code-managed triggers (Phase 3 §5.3, §5.4).
	triggers.POST("/:trigger_id/pause", s.triggerHandlers.PauseTrigger())
	triggers.POST("/:trigger_id/resume", s.triggerHandlers.ResumeTrigger())
	triggers.POST("/:trigger_id/convert-to-ui", s.triggerHandlers.ConvertTriggerToUI())

	// Plugin catalog — UI uses this to render the "new trigger" form.
	agentAPI.GET("/sources", handlers.ListSourcesHandler())
}
