package connectors

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/auth"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/manifest"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/paginate"
)

func TestLoaderLoadsEmbeddedManifests(t *testing.T) {
	reg, err := manifest.LoadEmbedded()
	require.NoError(t, err, "LoadEmbedded should succeed")
	require.NotNil(t, reg, "registry should not be nil")

	// GitHub manifest should be loaded
	m, ok := reg.Get("github")
	require.True(t, ok, "github manifest should be loaded")
	require.Equal(t, "github", m.Name)
	require.Equal(t, "GitHub", m.Display)

	// Check operations are loaded
	require.NotNil(t, m.Operations)
	require.Greater(t, len(m.Operations), 0, "github should have operations")

	// Verify the four operations from the GitHub manifest
	expectedOps := []string{"create_comment", "list_issues", "create_issue", "merge_pr"}
	for _, opName := range expectedOps {
		op, mani, ok := reg.Operation("github", opName)
		require.True(t, ok, "operation %s should exist", opName)
		require.NotNil(t, op)
		require.NotNil(t, mani)
		require.Equal(t, "github", mani.Name)
	}
}

func TestLoaderVerifiesGitHubOperationDetails(t *testing.T) {
	reg, err := manifest.LoadEmbedded()
	require.NoError(t, err)

	// Verify create_comment operation
	op, _, ok := reg.Operation("github", "create_comment")
	require.True(t, ok)
	require.Equal(t, "POST", op.Method)
	require.True(t, strings.Contains(op.URL, "api.github.com"))

	// Check inputs
	require.NotNil(t, op.Inputs)
	_, hasOwner := op.Inputs["owner"]
	_, hasRepo := op.Inputs["repo"]
	_, hasNumber := op.Inputs["number"]
	_, hasBody := op.Inputs["body"]
	require.True(t, hasOwner && hasRepo && hasNumber && hasBody, "all required inputs should be present")

	// Check output mapping
	require.NotNil(t, op.Output.Schema)
	_, hasID := op.Output.Schema["id"]
	require.True(t, hasID, "output should have id field")

	// Verify list_issues has pagination
	listOp, _, ok := reg.Operation("github", "list_issues")
	require.True(t, ok)
	require.NotNil(t, listOp.Paginate)
	require.Equal(t, "github_link_header", listOp.Paginate.Strategy)
}

func TestExecutorWithMockServer(t *testing.T) {
	// Set up a mock HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify bearer token was sent
		authHeader := r.Header.Get("Authorization")
		require.True(t, strings.HasPrefix(authHeader, "Bearer "), "Bearer token should be present")

		// Return mock response
		response := map[string]interface{}{
			"id":         123,
			"html_url":   "https://github.com/octocat/hello-world/issues/1#issuecomment-123",
			"created_at": "2024-01-15T10:00:00Z",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	// Create test manifest pointing at mock server
	testManifest := manifest.Manifest{
		SchemaVersion: "1.0",
		Name:          "test",
		Display:       "Test Connector",
		Category:      "Generic",
		Version:       "1.0",
		Description:   "Test connector",
		Auth: manifest.AuthBlock{
			Strategy:  "bearer",
			SecretEnv: "TEST_API_KEY",
		},
		Operations: map[string]manifest.Operation{
			"post_comment": {
				Display:     "Post a comment",
				Description: "Posts a comment to a test endpoint",
				Method:      "POST",
				URL:         server.URL + "/comment",
				Inputs: map[string]manifest.Input{
					"text": {
						Type:        "string",
						In:          "body",
						Description: "Comment text",
					},
				},
				Output: manifest.Output{
					Type: "object",
					Schema: map[string]interface{}{
						"id": map[string]interface{}{
							"type":     "integer",
							"jsonpath": "$.id",
						},
						"html_url": map[string]interface{}{
							"type":     "string",
							"jsonpath": "$.html_url",
						},
						"created_at": map[string]interface{}{
							"type":     "string",
							"jsonpath": "$.created_at",
						},
					},
				},
			},
		},
	}

	// Register the test manifest
	reg := manifest.NewRegistry()
	require.NoError(t, reg.Register(&testManifest))

	// Set up secret
	os.Setenv("TEST_API_KEY", "test-token-12345")
	defer os.Unsetenv("TEST_API_KEY")

	// Create executor
	authReg := auth.NewRegistry()
	paginateReg := paginate.NewRegistry()
	executor := NewExecutor(reg, authReg, paginateReg, &NoopAuditor{})

	// Invoke operation
	ctx := context.Background()
	result, err := executor.Invoke(ctx, "test", "post_comment", map[string]interface{}{
		"text": "This is a test comment",
	})

	require.NoError(t, err)
	require.NotNil(t, result)

	// Verify result
	resultMap, ok := result.(map[string]interface{})
	require.True(t, ok, "result should be a map")
	assert.Equal(t, float64(123), resultMap["id"])
	assert.Equal(t, "https://github.com/octocat/hello-world/issues/1#issuecomment-123", resultMap["html_url"])
}

func TestExecutorValidatesInputs(t *testing.T) {
	testManifest := manifest.Manifest{
		SchemaVersion: "1.0",
		Name:          "test",
		Display:       "Test",
		Category:      "Generic",
		Version:       "1.0",
		Description:   "Test",
		Auth: manifest.AuthBlock{
			Strategy:  "bearer",
			SecretEnv: "TEST_API_KEY",
		},
		Operations: map[string]manifest.Operation{
			"test_op": {
				Display:     "Test Op",
				Description: "Test operation",
				Method:      "GET",
				URL:         "http://example.com/api",
				Inputs: map[string]manifest.Input{
					"state": {
						Type:        "string",
						In:          "query",
						Description: "State filter",
						Enum:        []interface{}{"open", "closed", "all"},
					},
				},
				Output: manifest.Output{
					Type:   "object",
					Schema: map[string]interface{}{},
				},
			},
		},
	}

	reg := manifest.NewRegistry()
	require.NoError(t, reg.Register(&testManifest))

	os.Setenv("TEST_API_KEY", "test-token")
	defer os.Unsetenv("TEST_API_KEY")

	authReg := auth.NewRegistry()
	paginateReg := paginate.NewRegistry()
	executor := NewExecutor(reg, authReg, paginateReg, &NoopAuditor{})

	// Valid enum value should be accepted
	err := executor.validateInputs(map[string]interface{}{"state": "open"}, testManifest.Operations["test_op"].Inputs)
	require.NoError(t, err)

	// Invalid enum value should error
	err = executor.validateInputs(map[string]interface{}{"state": "invalid"}, testManifest.Operations["test_op"].Inputs)
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "enum"))
}

func TestAuthStrategyBearerToken(t *testing.T) {
	bearer := &auth.Bearer{}
	req, _ := http.NewRequest("GET", "http://example.com", nil)

	err := bearer.Apply(req, "my-secret-token", nil)
	require.NoError(t, err)
	require.Equal(t, "Bearer my-secret-token", req.Header.Get("Authorization"))
}

func TestAuthStrategyAPIKeyHeader(t *testing.T) {
	keyAuth := &auth.APIKeyHeader{}
	req, _ := http.NewRequest("GET", "http://example.com", nil)

	err := keyAuth.Apply(req, "my-api-key", nil)
	require.NoError(t, err)
	require.Equal(t, "my-api-key", req.Header.Get("X-API-Key"))

	// With custom header name
	req2, _ := http.NewRequest("GET", "http://example.com", nil)
	err = keyAuth.Apply(req2, "my-api-key", map[string]interface{}{"header": "X-Custom-Header"})
	require.NoError(t, err)
	require.Equal(t, "my-api-key", req2.Header.Get("X-Custom-Header"))
}

func TestSecretsResolve(t *testing.T) {
	os.Setenv("MY_SECRET", "secret-value")
	defer os.Unsetenv("MY_SECRET")

	val, err := Resolve("MY_SECRET")
	require.NoError(t, err)
	require.Equal(t, "secret-value", val)

	// Missing env var
	_, err = Resolve("NONEXISTENT_VAR_XYZ")
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "not found"))
}

func TestConcurrencyLimiter(t *testing.T) {
	limiter := NewLimiter()
	ctx := context.Background()

	// Acquire slot
	release, err := limiter.Acquire(ctx, "test", "op", 1)
	require.NoError(t, err)
	require.NotNil(t, release)

	// Should be able to acquire again after releasing
	release()
	release2, err := limiter.Acquire(ctx, "test", "op", 1)
	require.NoError(t, err)
	release2()
}

func TestNoopAuditor(t *testing.T) {
	auditor := &NoopAuditor{}
	record := AuditRecord{Connector: "test", Operation: "op"}
	err := auditor.OnStart(context.Background(), record)
	require.NoError(t, err)
	err = auditor.OnEnd(context.Background(), record)
	require.NoError(t, err)
}
