package did

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewDIDClient_Valid tests NewDIDClient with valid inputs
func TestNewDIDClient_Valid(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
		headers map[string]string
		wantErr bool
	}{
		{
			name:    "valid URL",
			baseURL: "https://api.example.com",
			headers: map[string]string{"Authorization": "Bearer token"},
			wantErr: false,
		},
		{
			name:    "URL with trailing slash",
			baseURL: "https://api.example.com/",
			headers: nil,
			wantErr: false,
		},
		{
			name:    "URL with path",
			baseURL: "https://api.example.com/v1",
			headers: nil,
			wantErr: false,
		},
		{
			name:    "http URL",
			baseURL: "http://localhost:8080",
			headers: nil,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewDIDClient(tt.baseURL, tt.headers)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, client)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, client)
				assert.NotNil(t, client.httpClient)
				assert.Equal(t, 30*time.Second, client.httpClient.Timeout)
				if tt.headers != nil {
					assert.Equal(t, tt.headers, client.defaultHeaders)
				}
			}
		})
	}
}

// TestNewDIDClient_InvalidURL tests NewDIDClient with invalid inputs
func TestNewDIDClient_InvalidURL(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
		wantErr bool
	}{
		{
			name:    "empty URL",
			baseURL: "",
			wantErr: true,
		},
		{
			name:    "invalid URL format",
			baseURL: "://invalid",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewDIDClient(tt.baseURL, nil)
			assert.Error(t, err)
			assert.Nil(t, client)
		})
	}
}

// TestRegisterAgent_Success tests successful agent registration
func TestRegisterAgent_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request method and path
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/did/register", r.URL.Path)

		// Verify content type
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		// Parse request body
		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		// Verify snake_case transformation
		assert.Equal(t, "agent-1", reqBody["agent_node_id"])
		reasoners := reqBody["reasoners"].([]interface{})
		assert.Len(t, reasoners, 1)
		assert.Equal(t, "reasoner-1", reasoners[0].(map[string]interface{})["id"])

		// Write response
		response := DIDIdentityPackage{
			AgentDID: DIDIdentity{
				DID:            "did:agentfield:agent-1",
				PrivateKeyJwk:  "private_key",
				PublicKeyJwk:   "public_key",
				DerivationPath: "m/44'/0'/0'",
				ComponentType:  "agent",
			},
			ReasonerDIDs: map[string]DIDIdentity{
				"reasoner-1": {
					DID:            "did:agentfield:reasoner-1",
					PrivateKeyJwk:  "reasoner_private",
					PublicKeyJwk:   "reasoner_public",
					DerivationPath: "m/44'/0'/1'",
					ComponentType:  "reasoner",
				},
			},
			SkillDIDs: map[string]DIDIdentity{},
			AgentfieldServerID: "server-id-123",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	req := DIDRegistrationRequest{
		AgentNodeID: "agent-1",
		Reasoners: []map[string]interface{}{
			{"id": "reasoner-1", "type": "reasoner"},
		},
		Skills: []map[string]interface{}{},
	}

	result, err := client.RegisterAgent(context.Background(), req)
	assert.NoError(t, err)
	assert.Equal(t, "did:agentfield:agent-1", result.AgentDID.DID)
	assert.Equal(t, "server-id-123", result.AgentfieldServerID)
	assert.Len(t, result.ReasonerDIDs, 1)
}

// TestRegisterAgent_NotFound tests 404 error handling
func TestRegisterAgent_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("endpoint not found"))
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	req := DIDRegistrationRequest{
		AgentNodeID: "agent-1",
		Reasoners:   []map[string]interface{}{},
		Skills:      []map[string]interface{}{},
	}

	_, err = client.RegisterAgent(context.Background(), req)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "404")
}

// TestRegisterAgent_InvalidJSON tests invalid JSON response handling
func TestRegisterAgent_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("invalid json"))
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	req := DIDRegistrationRequest{
		AgentNodeID: "agent-1",
		Reasoners:   []map[string]interface{}{},
		Skills:      []map[string]interface{}{},
	}

	_, err = client.RegisterAgent(context.Background(), req)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode response")
}

// TestGenerateCredential_Success tests successful credential generation
func TestGenerateCredential_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/execution/vc", r.URL.Path)

		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		// Verify base64 encoding of input/output
		inputDataB64 := reqBody["input_data"].(string)
		outputDataB64 := reqBody["output_data"].(string)

		// Decode and verify
		inputBytes, _ := base64.StdEncoding.DecodeString(inputDataB64)
		outputBytes, _ := base64.StdEncoding.DecodeString(outputDataB64)

		var inputData map[string]interface{}
		var outputData map[string]interface{}
		json.Unmarshal(inputBytes, &inputData)
		json.Unmarshal(outputBytes, &outputData)

		assert.Equal(t, "input_value", inputData["key"])
		assert.Equal(t, "output_value", outputData["key"])

		// Write response
		signature := "sig_value"
		vcId := "vc_id_123"
		response := ExecutionCredential{
			VCId:        vcId,
			ExecutionID: "exec-1",
			WorkflowID:  "workflow-1",
			Status:      "succeeded",
			Signature:   &signature,
			VCDocument:  map[string]any{"proof": "value"},
			CreatedAt:   time.Now(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	opts := GenerateCredentialOptions{
		ExecutionID: "exec-1",
		WorkflowID:  stringPtr("workflow-1"),
		InputData:   map[string]interface{}{"key": "input_value"},
		OutputData:  map[string]interface{}{"key": "output_value"},
		Status:      "succeeded",
		DurationMs:  1000,
	}

	result, err := client.GenerateCredential(context.Background(), opts)
	assert.NoError(t, err)
	assert.Equal(t, "vc_id_123", result.VCId)
	assert.Equal(t, "exec-1", result.ExecutionID)
	assert.NotNil(t, result.Signature)
	assert.Equal(t, "sig_value", *result.Signature)
}

// TestGenerateCredential_Base64Parity tests base64 encoding matches TypeScript
func TestGenerateCredential_Base64Parity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		json.NewDecoder(r.Body).Decode(&reqBody)

		// TypeScript produces this base64 for {foo:'bar'}
		expectedB64 := "eyJmb28iOiJiYXIifQ=="

		inputDataB64 := reqBody["input_data"].(string)
		assert.Equal(t, expectedB64, inputDataB64)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ExecutionCredential{
			VCId:        "vc_123",
			ExecutionID: "exec-1",
			WorkflowID:  "workflow-1",
			Status:      "succeeded",
			VCDocument:  map[string]any{},
			CreatedAt:   time.Now(),
		})
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	opts := GenerateCredentialOptions{
		ExecutionID: "exec-1",
		InputData:   map[string]interface{}{"foo": "bar"},
		OutputData:  map[string]interface{}{},
		Status:      "succeeded",
	}

	_, err = client.GenerateCredential(context.Background(), opts)
	assert.NoError(t, err)
}

// TestGenerateCredential_OptionalFields tests optional field handling
func TestGenerateCredential_OptionalFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		json.NewDecoder(r.Body).Decode(&reqBody)

		// Verify optional fields are present
		ctx := reqBody["execution_context"].(map[string]interface{})
		assert.Equal(t, "session-123", ctx["session_id"])
		assert.Equal(t, "caller-did", ctx["caller_did"])
		assert.Equal(t, "target-did", ctx["target_did"])

		// Verify error message field
		assert.Equal(t, "test error", reqBody["error_message"])

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ExecutionCredential{
			VCId:        "vc_123",
			ExecutionID: "exec-1",
			WorkflowID:  "workflow-1",
			Status:      "failed",
			VCDocument:  map[string]any{},
			CreatedAt:   time.Now(),
		})
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	opts := GenerateCredentialOptions{
		ExecutionID:  "exec-1",
		WorkflowID:   stringPtr("workflow-1"),
		SessionID:    stringPtr("session-123"),
		CallerDID:    stringPtr("caller-did"),
		TargetDID:    stringPtr("target-did"),
		InputData:    map[string]interface{}{},
		OutputData:   map[string]interface{}{},
		Status:       "failed",
		ErrorMessage: stringPtr("test error"),
		DurationMs:   5000,
	}

	result, err := client.GenerateCredential(context.Background(), opts)
	assert.NoError(t, err)
	assert.Equal(t, "failed", result.Status)
}

// TestExportAuditTrail_Success tests successful audit trail export
func TestExportAuditTrail_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v1/did/export/vcs", r.URL.Path)

		// Verify query parameters
		query := r.URL.Query()
		assert.Equal(t, "workflow-1", query.Get("workflow_id"))
		assert.Equal(t, "succeeded", query.Get("status"))
		assert.Equal(t, "100", query.Get("limit"))

		response := AuditTrailExport{
			AgentDIDs: []string{"did:agentfield:agent-1"},
			ExecutionVCs: []ExecutionCredential{
				{
					VCId:        "vc_1",
					ExecutionID: "exec-1",
					WorkflowID:  "workflow-1",
					Status:      "succeeded",
					VCDocument:  map[string]any{},
					CreatedAt:   time.Now(),
				},
			},
			WorkflowVCs: []WorkflowCredential{},
			TotalCount:  1,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	filters := AuditTrailFilter{
		WorkflowID: stringPtr("workflow-1"),
		Status:     stringPtr("succeeded"),
		Limit:      intPtr(100),
	}

	result, err := client.ExportAuditTrail(context.Background(), filters)
	assert.NoError(t, err)
	assert.Len(t, result.AgentDIDs, 1)
	assert.Len(t, result.ExecutionVCs, 1)
	assert.Equal(t, 1, result.TotalCount)
}

// TestExportAuditTrail_NoFilters tests query with no filters
func TestExportAuditTrail_NoFilters(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		// Query should be empty
		assert.Equal(t, "", r.URL.RawQuery)

		response := AuditTrailExport{
			AgentDIDs:    []string{},
			ExecutionVCs: []ExecutionCredential{},
			WorkflowVCs:  []WorkflowCredential{},
			TotalCount:   0,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	result, err := client.ExportAuditTrail(context.Background(), AuditTrailFilter{})
	assert.NoError(t, err)
	assert.Equal(t, 0, result.TotalCount)
}

// TestExportAuditTrail_DefensiveNils tests nil slice handling
func TestExportAuditTrail_DefensiveNils(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return response with nil slices (or omitted fields)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"total_count": 0}`))
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	result, err := client.ExportAuditTrail(context.Background(), AuditTrailFilter{})
	assert.NoError(t, err)
	// Should have empty slices, not nil
	assert.NotNil(t, result.AgentDIDs)
	assert.NotNil(t, result.ExecutionVCs)
	assert.NotNil(t, result.WorkflowVCs)
	assert.Equal(t, 0, len(result.AgentDIDs))
}

// TestContextTimeout tests timeout handling with context.WithTimeout
func TestContextTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate slow server
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	// Use a short timeout context
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	req := DIDRegistrationRequest{
		AgentNodeID: "agent-1",
		Reasoners:   []map[string]interface{}{},
		Skills:      []map[string]interface{}{},
	}

	_, err = client.RegisterAgent(ctx, req)
	assert.Error(t, err)
	// Should contain context deadline error
	assert.True(t, strings.Contains(err.Error(), "context") || strings.Contains(err.Error(), "deadline"))
}

// TestDefaultHeaders tests custom default headers are applied
func TestDefaultHeaders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer custom-token", r.Header.Get("Authorization"))
		assert.Equal(t, "custom-value", r.Header.Get("X-Custom-Header"))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(AuditTrailExport{
			AgentDIDs:    []string{},
			ExecutionVCs: []ExecutionCredential{},
			WorkflowVCs:  []WorkflowCredential{},
			TotalCount:   0,
		})
	}))
	defer server.Close()

	headers := map[string]string{
		"Authorization":    "Bearer custom-token",
		"X-Custom-Header":  "custom-value",
	}

	client, err := NewDIDClient(server.URL, headers)
	require.NoError(t, err)

	_, err = client.ExportAuditTrail(context.Background(), AuditTrailFilter{})
	assert.NoError(t, err)
}

// TestError_500Status tests 500 error handling
func TestError_500Status(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal server error"))
	}))
	defer server.Close()

	client, err := NewDIDClient(server.URL, nil)
	require.NoError(t, err)

	_, err = client.ExportAuditTrail(context.Background(), AuditTrailFilter{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

// Helper functions for pointer values

func stringPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}
