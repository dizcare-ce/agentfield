package did

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DIDClient is an HTTP client for DID-specific control plane endpoints.
// It handles communication with the DID registration, credential generation,
// and audit trail export endpoints with proper payload transformation,
// base64 serialization, and timeout management.
type DIDClient struct {
	baseURL       string
	defaultHeaders map[string]string
	httpClient    *http.Client
}

// NewDIDClient creates a new DIDClient instance with the specified baseURL and default headers.
// It validates that baseURL is non-empty and a valid URL format, then creates an HTTP client
// with a 30-second timeout for all requests.
//
// Returns an error if baseURL is empty or has an invalid URL format.
func NewDIDClient(baseURL string, defaultHeaders map[string]string) (*DIDClient, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("baseURL is required")
	}

	// Validate URL format
	if _, err := url.Parse(baseURL); err != nil {
		return nil, fmt.Errorf("invalid baseURL: %w", err)
	}

	return &DIDClient{
		baseURL:        strings.TrimSuffix(baseURL, "/"),
		defaultHeaders: defaultHeaders,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// RegisterAgent calls POST /api/v1/did/register to register an agent with the control plane.
// It transforms the request payload to snake_case format before transmission and parses
// the response into a DIDIdentityPackage.
//
// Returns DIDIdentityPackage on HTTP 200, or an error on non-200 status or invalid JSON.
func (c *DIDClient) RegisterAgent(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
	endpoint := "/api/v1/did/register"

	// Create request body with snake_case transformation
	body := map[string]interface{}{
		"agent_node_id": req.AgentNodeID,
		"reasoners":     req.Reasoners,
		"skills":        req.Skills,
	}

	var result DIDIdentityPackage
	if err := c.do(ctx, http.MethodPost, endpoint, body, &result); err != nil {
		return DIDIdentityPackage{}, err
	}

	return result, nil
}

// GenerateCredential calls POST /api/v1/execution/vc to generate a verifiable credential.
// It serializes InputData and OutputData as base64-encoded UTF-8 JSON strings.
// Optional fields (sessionId, callerDid, targetDid, errorMessage, timestamp) are included
// only if provided. The timestamp defaults to the current time if not specified.
//
// Returns an ExecutionCredential on HTTP 200, or an error on failure.
func (c *DIDClient) GenerateCredential(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error) {
	endpoint := "/api/v1/execution/vc"

	// Handle timestamp: use provided value or current time
	timestamp := opts.Timestamp
	if timestamp == nil {
		now := time.Now().UTC()
		timestamp = &now
	}

	// Serialize input data as base64-encoded JSON
	inputDataB64, err := serializeToBase64(opts.InputData)
	if err != nil {
		return ExecutionCredential{}, fmt.Errorf("serialize input data: %w", err)
	}

	// Serialize output data as base64-encoded JSON
	outputDataB64, err := serializeToBase64(opts.OutputData)
	if err != nil {
		return ExecutionCredential{}, fmt.Errorf("serialize output data: %w", err)
	}

	// Build execution context object
	executionContext := map[string]interface{}{
		"execution_id":   opts.ExecutionID,
		"workflow_id":    opts.WorkflowID,
		"session_id":     opts.SessionID,
		"caller_did":     opts.CallerDID,
		"target_did":     opts.TargetDID,
		"agent_node_did": opts.AgentNodeDID,
		"timestamp":      timestamp.Format(time.RFC3339),
	}

	// Build request body
	body := map[string]interface{}{
		"execution_context": executionContext,
		"input_data":        inputDataB64,
		"output_data":       outputDataB64,
		"status":            opts.Status,
		"error_message":     opts.ErrorMessage,
		"duration_ms":       opts.DurationMs,
	}

	var result ExecutionCredential
	if err := c.do(ctx, http.MethodPost, endpoint, body, &result); err != nil {
		return ExecutionCredential{}, err
	}

	return result, nil
}

// ExportAuditTrail calls GET /api/v1/did/export/vcs to export audit trail credentials.
// Query parameters (workflow_id, session_id, issuer_did, status, limit) are all optional.
// Returns an AuditTrailExport containing all matching credentials.
func (c *DIDClient) ExportAuditTrail(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error) {
	endpoint := "/api/v1/did/export/vcs"

	// Build query parameters
	query := url.Values{}
	if filters.WorkflowID != nil && *filters.WorkflowID != "" {
		query.Add("workflow_id", *filters.WorkflowID)
	}
	if filters.SessionID != nil && *filters.SessionID != "" {
		query.Add("session_id", *filters.SessionID)
	}
	if filters.IssuerDID != nil && *filters.IssuerDID != "" {
		query.Add("issuer_did", *filters.IssuerDID)
	}
	if filters.Status != nil && *filters.Status != "" {
		query.Add("status", *filters.Status)
	}
	if filters.Limit != nil && *filters.Limit > 0 {
		query.Add("limit", fmt.Sprintf("%d", *filters.Limit))
	}

	// Append query string to endpoint
	if len(query) > 0 {
		endpoint = endpoint + "?" + query.Encode()
	}

	var result AuditTrailExport
	if err := c.do(ctx, http.MethodGet, endpoint, nil, &result); err != nil {
		return AuditTrailExport{}, err
	}

	// Ensure slices are not nil for defensive parsing
	if result.AgentDIDs == nil {
		result.AgentDIDs = []string{}
	}
	if result.ExecutionVCs == nil {
		result.ExecutionVCs = []ExecutionCredential{}
	}
	if result.WorkflowVCs == nil {
		result.WorkflowVCs = []WorkflowCredential{}
	}

	return result, nil
}

// do performs an HTTP request with the specified method, endpoint, body, and response parsing.
// It applies default headers and handles error responses.
func (c *DIDClient) do(ctx context.Context, method string, endpoint string, body interface{}, out interface{}) error {
	// Build full URL
	fullURL := c.baseURL + endpoint
	u, err := url.Parse(fullURL)
	if err != nil {
		return fmt.Errorf("parse URL: %w", err)
	}

	var buf io.ReadWriter = &bytes.Buffer{}
	if body != nil {
		if err := json.NewEncoder(buf).Encode(body); err != nil {
			return fmt.Errorf("encode request: %w", err)
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), buf)
	if err != nil {
		return fmt.Errorf("new request: %w", err)
	}

	// Set default headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Apply custom default headers
	for key, value := range c.defaultHeaders {
		req.Header.Set(key, value)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("perform request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("http error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	if out == nil || len(respBody) == 0 {
		return nil
	}

	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	return nil
}

// serializeToBase64 converts any value to JSON, encodes it as UTF-8,
// and then encodes to base64 using standard encoding.
// This matches the TypeScript implementation for cross-language compatibility.
func serializeToBase64(data interface{}) (string, error) {
	// Marshal to JSON
	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshal JSON: %w", err)
	}

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(jsonBytes)
	return encoded, nil
}
