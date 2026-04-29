package connector

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	connectorspkg "github.com/Agent-Field/agentfield/control-plane/connectors"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/auth"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/manifest"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/paginate"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
)

// ConnectorAPI holds the manifest registry and executor for connector operations
type ConnectorAPI struct {
	registry     *manifest.Registry
	executor     *connectors.Executor
	auditor      *StorageAuditor
	authRegistry *auth.Registry
	paginateReg  *paginate.Registry
}

// NewConnectorAPI creates a new ConnectorAPI with initialized registry and executor
func NewConnectorAPI(store storage.StorageProvider) (*ConnectorAPI, error) {
	// Load manifest registry
	reg, err := manifest.LoadEmbedded()
	if err != nil {
		return nil, fmt.Errorf("load embedded manifests: %w", err)
	}

	// Initialize auth registry with default strategies (built-in)
	authReg := auth.NewRegistry()

	// Initialize pagination registry with default strategies (built-in)
	paginateReg := paginate.NewRegistry()

	// Create storage auditor
	auditor := NewStorageAuditor(store)

	// Create executor with auditor
	executor := connectors.NewExecutor(reg, authReg, paginateReg, auditor)

	return &ConnectorAPI{
		registry:     reg,
		executor:     executor,
		auditor:      auditor,
		authRegistry: authReg,
		paginateReg:  paginateReg,
	}, nil
}

// ListConnectors returns all available connectors (excluding internal ones starting with "_")
func (h *Handlers) ListConnectors(c *gin.Context) {
	api, err := NewConnectorAPI(h.storage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to initialize connector API: %v", err)})
		return
	}

	manifests := api.registry.All()
	
	type connectorInfo struct {
		Name         string  `json:"name"`
		Display      string  `json:"display"`
		Category     string  `json:"category"`
		Description  string  `json:"description"`
		BrandColor   string  `json:"brand_color"`
		IconURL      string  `json:"icon_url"`
		OpCount      int     `json:"op_count"`
		HasInbound   bool    `json:"has_inbound"`
	}

	var result []connectorInfo
	for _, m := range manifests {
		// Skip internal connectors (starting with "_")
		if len(m.Name) > 0 && m.Name[0:1] == "_" {
			continue
		}
		
		hasInbound := m.Inbound != nil
		
		info := connectorInfo{
			Name:        m.Name,
			Display:     m.Display,
			Category:    m.Category,
			Description: m.Description,
			BrandColor:  m.UI.BrandColor,
			IconURL:     fmt.Sprintf("/api/v1/connectors/%s/icon", m.Name),
			OpCount:     len(m.Operations),
			HasInbound:  hasInbound,
		}
		result = append(result, info)
	}

	c.JSON(http.StatusOK, gin.H{"connectors": result})
}

// GetConnector returns full manifest details for a specific connector
func (h *Handlers) GetConnector(c *gin.Context) {
	connectorName := c.Param("name")

	api, err := NewConnectorAPI(h.storage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to initialize connector API: %v", err)})
		return
	}

	// Look up manifest
	m, ok := api.registry.Get(connectorName)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("connector %q not found", connectorName)})
		return
	}

	// Check if secret is set for auth
	secretSet := false
	if m.Auth.SecretEnv != "" {
		secretSet = os.Getenv(m.Auth.SecretEnv) != ""
	}

	type authInfo struct {
		Strategy    string `json:"strategy"`
		SecretEnv   string `json:"secret_env"`
		SecretSet   bool   `json:"secret_set"`
		Description string `json:"description,omitempty"`
	}

	type operationInfo struct {
		Name        string                 `json:"name"`
		Display     string                 `json:"display"`
		Description string                 `json:"description"`
		Method      string                 `json:"method"`
		URL         string                 `json:"url"`
		Inputs      map[string]interface{} `json:"inputs"`
		Output      manifest.Output        `json:"output"`
		Tags        []string               `json:"tags,omitempty"`
	}

	type response struct {
		Name        string               `json:"name"`
		Display     string               `json:"display"`
		Category    string               `json:"category"`
		Description string               `json:"description"`
		BrandColor  string               `json:"brand_color"`
		IconURL     string               `json:"icon_url"`
		Auth        authInfo             `json:"auth"`
		Inbound     interface{}          `json:"inbound"`
		Operations  []operationInfo      `json:"operations"`
	}

	// Build operations array
	var ops []operationInfo
	for opName, op := range m.Operations {
		// Build input schema
		inputSchema := make(map[string]interface{})
		for inputName, input := range op.Inputs {
			inputSchema[inputName] = map[string]interface{}{
				"type":        input.Type,
				"in":          input.In,
				"description": input.Description,
				"default":     input.Default,
				"enum":        input.Enum,
				"example":     input.Example,
				"sensitive":   input.Sensitive,
				"wire_name":   input.WireName,
			}
		}

		tags := []string{}
		if op.UI != nil && len(op.UI.Tags) > 0 {
			tags = op.UI.Tags
		}

		ops = append(ops, operationInfo{
			Name:        opName,
			Display:     op.Display,
			Description: op.Description,
			Method:      op.Method,
			URL:         op.URL,
			Inputs:      inputSchema,
			Output:      op.Output,
			Tags:        tags,
		})
	}

	resp := response{
		Name:        m.Name,
		Display:     m.Display,
		Category:    m.Category,
		Description: m.Description,
		BrandColor:  m.UI.BrandColor,
		IconURL:     fmt.Sprintf("/api/v1/connectors/%s/icon", m.Name),
		Auth: authInfo{
			Strategy:    m.Auth.Strategy,
			SecretEnv:   m.Auth.SecretEnv,
			SecretSet:   secretSet,
			Description: m.Auth.Description,
		},
		Inbound:    m.Inbound,
		Operations: ops,
	}

	c.JSON(http.StatusOK, resp)
}

// GetConnectorIcon returns the icon SVG for a connector or 404 with lucide hint
func (h *Handlers) GetConnectorIcon(c *gin.Context) {
	connectorName := c.Param("name")

	api, err := NewConnectorAPI(h.storage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to initialize connector API: %v", err)})
		return
	}

	// Look up manifest
	m, ok := api.registry.Get(connectorName)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("connector %q not found", connectorName)})
		return
	}

	// Check icon type
	if m.UI.Icon.Lucide != "" {
		// Lucide icon — return 404 with hint
		c.JSON(http.StatusNotFound, gin.H{"lucide": m.UI.Icon.Lucide})
		return
	}

	// Try to read SVG from embedded FS
	if m.UI.Icon.File != "" {
		iconPath := fmt.Sprintf("manifests/%s/icon.svg", connectorName)
		data, err := connectorspkg.FS.ReadFile(iconPath)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("icon file not found: %v", err)})
			return
		}

		c.Header("Content-Type", "image/svg+xml")
		c.Data(http.StatusOK, "image/svg+xml", data)
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "no icon configured"})
}

// InvokeConnectorOperation executes a connector operation
func (h *Handlers) InvokeConnectorOperation(c *gin.Context) {
	connectorName := c.Param("name")
	operationName := c.Param("op")

	api, err := NewConnectorAPI(h.storage)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to initialize connector API: %v", err)})
		return
	}

	// Parse request body
	var reqBody struct {
		Inputs map[string]interface{} `json:"inputs"`
		RunID  string                 `json:"run_id"`
	}
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid request body: %v", err)})
		return
	}

	// Check connector exists
	_, ok := api.registry.Get(connectorName)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("connector %q not found", connectorName),
		})
		return
	}

	// Check operation exists
	op, _, found := api.registry.Operation(connectorName, operationName)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{
			"error": fmt.Sprintf("operation %q/%q not found", connectorName, operationName),
		})
		return
	}
	_ = op // suppress unused warning

	// Create context with run_id for auditor + receiver for invocation_id passback.
	ctx := c.Request.Context()
	if reqBody.RunID != "" {
		ctx = context.WithValue(ctx, "run_id", reqBody.RunID)
	}
	var invocationID string
	ctx = WithInvocationIDReceiver(ctx, &invocationID)

	// Invoke operation
	startTime := time.Now()
	result, err := api.executor.Invoke(ctx, connectorName, operationName, reqBody.Inputs)
	duration := int64(time.Since(startTime).Milliseconds())

	if invocationID == "" {
		// OnStart never fired (e.g. registry lookup failed before audit).
		invocationID = "unknown"
	}

	if err != nil {
		// Parse error to determine HTTP status
		httpStatus := http.StatusBadRequest
		errorMsg := err.Error()

		// Check for upstream HTTP errors in error message
		if len(errorMsg) > 6 && errorMsg[:6] == "http " {
			// Try to extract status code
			var status int
			if _, scanErr := fmt.Sscanf(errorMsg, "http %d:", &status); scanErr == nil {
				httpStatus = status
				if status >= 500 {
					httpStatus = http.StatusBadGateway // 502 for upstream 5xx
				}
			}
		}

		c.JSON(httpStatus, gin.H{
			"error":         errorMsg,
			"invocation_id": invocationID,
			"http_status":   httpStatus,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"result":        result,
		"duration_ms":   duration,
		"invocation_id": invocationID,
		"http_status":   http.StatusOK,
	})
}

// ListConnectorInvocations lists connector invocations, optionally filtered by run_id
func (h *Handlers) ListConnectorInvocations(c *gin.Context) {
	ctx := c.Request.Context()
	runID := c.Query("run_id")

	var invocations []*types.ConnectorInvocation
	var err error

	// Empty runID lists most recent across all runs; non-empty filters by run_id.
	invocations, err = h.storage.ListConnectorInvocations(ctx, runID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to list invocations: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"invocations": invocations})
}

// GetConnectorInvocation returns a single invocation by ID
func (h *Handlers) GetConnectorInvocation(c *gin.Context) {
	id := c.Param("id")
	_ = id

	// Note: This would require a GetConnectorInvocation method on StorageProvider
	// For now, just return 404 with a note about the requirement
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "individual invocation retrieval not yet implemented",
		"note":  "GetConnectorInvocation storage method needed",
	})
}
