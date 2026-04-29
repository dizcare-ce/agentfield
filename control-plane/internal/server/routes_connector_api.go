package server

import (
	connectorpkg "github.com/Agent-Field/agentfield/control-plane/internal/handlers/connector"
	"github.com/Agent-Field/agentfield/control-plane/internal/logger"

	"github.com/gin-gonic/gin"
)

// registerConnectorAPIRoutes installs the HTTP API surface for the connector
// framework: manifest discovery, icon serving, operation invocation, and audit.
// These routes are public (no auth required) — clients invoke operations
// directly with connector-specific credentials passed via inputs.
func (s *AgentFieldServer) registerConnectorAPIRoutes(apiGroup *gin.RouterGroup) {
	if !s.config.Features.Connector.Enabled {
		return
	}

	// Create handlers with injected storage
	h := connectorpkg.NewHandlers(
		s.config.Features.Connector,
		s.storage,
		s.statusManager,
		s.accessPolicyService,
		s.tagApprovalService,
		s.didService,
	)

	connectorAPIGroup := apiGroup.Group("/connectors")
	{
		// List all connectors
		connectorAPIGroup.GET("", h.ListConnectors)

		// Get specific connector details
		connectorAPIGroup.GET("/:name", h.GetConnector)

		// Get connector icon (SVG or lucide hint)
		connectorAPIGroup.GET("/:name/icon", h.GetConnectorIcon)

		// Invoke connector operation
		connectorAPIGroup.POST("/:name/:op", h.InvokeConnectorOperation)

		// List invocations (audit)
		connectorAPIGroup.GET("/_invocations", h.ListConnectorInvocations)
		connectorAPIGroup.GET("/_invocations/:id", h.GetConnectorInvocation)
	}

	logger.Logger.Info().Msg("🔌 Connector API routes registered (/connectors)")
}
