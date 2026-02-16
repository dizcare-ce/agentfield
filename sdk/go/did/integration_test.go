package did

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestTypesAndClientBuildIntegration verifies that types.go and client.go
// compile together without missing symbols or ambiguous references.
// This is a compile-time check that runs as a test.
func TestTypesAndClientBuildIntegration(t *testing.T) {
	// Verify that we can instantiate all major types
	// If this compiles and runs, the integration is successful

	// DIDIdentity
	_ = DIDIdentity{
		DID:            "did:example:123",
		PrivateKeyJwk:  `{"kty":"EC"}`,
		PublicKeyJwk:   `{"kty":"EC"}`,
		DerivationPath: "m/44'/0'/0'/0/0",
		ComponentType:  "agent",
		FunctionName:   nil,
	}

	// DIDIdentityPackage
	_ = DIDIdentityPackage{
		AgentDID:           DIDIdentity{},
		ReasonerDIDs:       map[string]DIDIdentity{},
		SkillDIDs:          map[string]DIDIdentity{},
		AgentfieldServerID: "server-123",
	}

	// ExecutionCredential
	_ = ExecutionCredential{
		VCId:       "vc-123",
		ExecutionID: "exec-123",
		WorkflowID:  "workflow-123",
		SessionID:   nil,
		IssuerDID:   nil,
		TargetDID:   nil,
		CallerDID:   nil,
		VCDocument:  map[string]any{},
		Signature:   nil,
		InputHash:   nil,
		OutputHash:  nil,
		Status:      "succeeded",
		CreatedAt:   time.Now(),
	}

	// GenerateCredentialOptions
	_ = GenerateCredentialOptions{
		ExecutionID:  "exec-123",
		WorkflowID:   nil,
		SessionID:    nil,
		CallerDID:    nil,
		TargetDID:    nil,
		AgentNodeDID: nil,
		Timestamp:    nil,
		InputData:    nil,
		OutputData:   nil,
		Status:       "succeeded",
		ErrorMessage: nil,
		DurationMs:   0,
	}

	// AuditTrailFilter
	_ = AuditTrailFilter{
		WorkflowID: nil,
		SessionID:  nil,
		IssuerDID:  nil,
		Status:     nil,
		Limit:      nil,
	}

	t.Log("All types instantiate successfully")
}

// TestExecutionCredentialJSONRoundTrip verifies that ExecutionCredential
// can be marshaled to JSON and unmarshaled back with all fields intact.
func TestExecutionCredentialJSONRoundTrip(t *testing.T) {
	now := time.Now().UTC()
	sessionID := "session-123"
	issuerDID := "did:issuer:123"
	targetDID := "did:target:456"
	callerDID := "did:caller:789"
	signature := "sig-123"
	inputHash := "hash-input"
	outputHash := "hash-output"

	original := ExecutionCredential{
		VCId:       "vc-123",
		ExecutionID: "exec-123",
		WorkflowID:  "workflow-123",
		SessionID:   &sessionID,
		IssuerDID:   &issuerDID,
		TargetDID:   &targetDID,
		CallerDID:   &callerDID,
		VCDocument: map[string]any{
			"@context": "https://www.w3.org/2018/credentials/v1",
			"type":     []string{"VerifiableCredential"},
		},
		Signature:  &signature,
		InputHash:  &inputHash,
		OutputHash: &outputHash,
		Status:     "succeeded",
		CreatedAt:  now,
	}

	// Marshal to JSON
	jsonData, err := json.Marshal(original)
	require.NoError(t, err)

	// Verify snake_case field names in JSON
	jsonStr := string(jsonData)
	assert.Contains(t, jsonStr, `"vc_id"`)
	assert.Contains(t, jsonStr, `"execution_id"`)
	assert.Contains(t, jsonStr, `"workflow_id"`)
	assert.Contains(t, jsonStr, `"session_id"`)
	assert.Contains(t, jsonStr, `"issuer_did"`)
	assert.Contains(t, jsonStr, `"target_did"`)
	assert.Contains(t, jsonStr, `"caller_did"`)
	assert.Contains(t, jsonStr, `"vc_document"`)
	assert.Contains(t, jsonStr, `"signature"`)
	assert.Contains(t, jsonStr, `"input_hash"`)
	assert.Contains(t, jsonStr, `"output_hash"`)
	assert.Contains(t, jsonStr, `"created_at"`)

	// Unmarshal back to struct
	var recovered ExecutionCredential
	err = json.Unmarshal(jsonData, &recovered)
	require.NoError(t, err)

	// Verify all fields match
	assert.Equal(t, original.VCId, recovered.VCId)
	assert.Equal(t, original.ExecutionID, recovered.ExecutionID)
	assert.Equal(t, original.WorkflowID, recovered.WorkflowID)
	assert.Equal(t, original.SessionID, recovered.SessionID)
	assert.Equal(t, original.IssuerDID, recovered.IssuerDID)
	assert.Equal(t, original.TargetDID, recovered.TargetDID)
	assert.Equal(t, original.CallerDID, recovered.CallerDID)
	// VCDocument comparison: verify keys exist, not strict equality (JSON unmarshaling may change types)
	assert.Contains(t, recovered.VCDocument, "@context")
	assert.Contains(t, recovered.VCDocument, "type")
	assert.Equal(t, original.Signature, recovered.Signature)
	assert.Equal(t, original.InputHash, recovered.InputHash)
	assert.Equal(t, original.OutputHash, recovered.OutputHash)
	assert.Equal(t, original.Status, recovered.Status)
	// CreatedAt comparison must account for JSON marshaling precision
	assert.True(t, original.CreatedAt.Equal(recovered.CreatedAt) ||
		original.CreatedAt.Truncate(time.Second).Equal(recovered.CreatedAt.Truncate(time.Second)),
		"CreatedAt timestamps should match (allowing for marshaling precision)",
	)
}

// TestExecutionCredentialWithNilOptionalFields verifies that ExecutionCredential
// with all nil optional fields marshals and unmarshals correctly.
func TestExecutionCredentialWithNilOptionalFields(t *testing.T) {
	original := ExecutionCredential{
		VCId:        "vc-456",
		ExecutionID: "exec-456",
		WorkflowID:  "workflow-456",
		SessionID:   nil,
		IssuerDID:   nil,
		TargetDID:   nil,
		CallerDID:   nil,
		VCDocument:  map[string]any{"type": "VerifiableCredential"},
		Signature:   nil,
		InputHash:   nil,
		OutputHash:  nil,
		Status:      "pending",
		CreatedAt:   time.Now().UTC(),
	}

	// Marshal to JSON
	jsonData, err := json.Marshal(original)
	require.NoError(t, err)

	// Optional fields should be omitted from JSON when nil
	jsonStr := string(jsonData)
	// These should NOT be in the JSON when nil (due to omitempty)
	assert.NotContains(t, jsonStr, `"session_id":null`)
	assert.NotContains(t, jsonStr, `"issuer_did":null`)
	assert.NotContains(t, jsonStr, `"target_did":null`)
	assert.NotContains(t, jsonStr, `"caller_did":null`)

	// Unmarshal back
	var recovered ExecutionCredential
	err = json.Unmarshal(jsonData, &recovered)
	require.NoError(t, err)

	// Verify nil fields remain nil
	assert.Nil(t, recovered.SessionID)
	assert.Nil(t, recovered.IssuerDID)
	assert.Nil(t, recovered.TargetDID)
	assert.Nil(t, recovered.CallerDID)
	assert.Nil(t, recovered.Signature)
	assert.Nil(t, recovered.InputHash)
	assert.Nil(t, recovered.OutputHash)
}

// TestDIDIdentityPackageJSONRoundTrip verifies that DIDIdentityPackage
// with map[string]DIDIdentity fields marshals and unmarshals correctly.
func TestDIDIdentityPackageJSONRoundTrip(t *testing.T) {
	funcName1 := "reasoner_1"
	funcName2 := "skill_1"

	original := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID:            "did:agent:abc123",
			PrivateKeyJwk:  `{"kty":"EC"}`,
			PublicKeyJwk:   `{"kty":"EC","x":"..."}`,
			DerivationPath: "m/44'/0'/0'/0/0",
			ComponentType:  "agent",
			FunctionName:   nil,
		},
		ReasonerDIDs: map[string]DIDIdentity{
			"reasoner_1": {
				DID:            "did:reasoner:def456",
				PrivateKeyJwk:  `{"kty":"EC"}`,
				PublicKeyJwk:   `{"kty":"EC","x":"..."}`,
				DerivationPath: "m/44'/0'/0'/0/1",
				ComponentType:  "reasoner",
				FunctionName:   &funcName1,
			},
		},
		SkillDIDs: map[string]DIDIdentity{
			"skill_1": {
				DID:            "did:skill:ghi789",
				PrivateKeyJwk:  `{"kty":"EC"}`,
				PublicKeyJwk:   `{"kty":"EC","x":"..."}`,
				DerivationPath: "m/44'/0'/0'/0/2",
				ComponentType:  "skill",
				FunctionName:   &funcName2,
			},
		},
		AgentfieldServerID: "server-xyz",
	}

	// Marshal to JSON
	jsonData, err := json.Marshal(original)
	require.NoError(t, err)

	// Verify snake_case field names
	jsonStr := string(jsonData)
	assert.Contains(t, jsonStr, `"agent_did"`)
	assert.Contains(t, jsonStr, `"reasoner_dids"`)
	assert.Contains(t, jsonStr, `"skill_dids"`)
	assert.Contains(t, jsonStr, `"agentfield_server_id"`)

	// Unmarshal back
	var recovered DIDIdentityPackage
	err = json.Unmarshal(jsonData, &recovered)
	require.NoError(t, err)

	// Verify agent DID
	assert.Equal(t, original.AgentDID.DID, recovered.AgentDID.DID)
	assert.Equal(t, original.AgentDID.ComponentType, recovered.AgentDID.ComponentType)

	// Verify reasoner DIDs map
	assert.Equal(t, len(original.ReasonerDIDs), len(recovered.ReasonerDIDs))
	assert.Contains(t, recovered.ReasonerDIDs, "reasoner_1")
	assert.Equal(t, original.ReasonerDIDs["reasoner_1"].DID, recovered.ReasonerDIDs["reasoner_1"].DID)
	assert.Equal(t, original.ReasonerDIDs["reasoner_1"].ComponentType, recovered.ReasonerDIDs["reasoner_1"].ComponentType)

	// Verify skill DIDs map
	assert.Equal(t, len(original.SkillDIDs), len(recovered.SkillDIDs))
	assert.Contains(t, recovered.SkillDIDs, "skill_1")
	assert.Equal(t, original.SkillDIDs["skill_1"].DID, recovered.SkillDIDs["skill_1"].DID)
	assert.Equal(t, original.SkillDIDs["skill_1"].ComponentType, recovered.SkillDIDs["skill_1"].ComponentType)

	// Verify server ID
	assert.Equal(t, original.AgentfieldServerID, recovered.AgentfieldServerID)
}

// TestDIDIdentityPackageWithEmptyMaps verifies that DIDIdentityPackage
// with empty reasoner/skill maps marshals and unmarshals correctly.
func TestDIDIdentityPackageWithEmptyMaps(t *testing.T) {
	original := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID:            "did:agent:simple",
			PrivateKeyJwk:  `{"kty":"EC"}`,
			PublicKeyJwk:   `{"kty":"EC"}`,
			DerivationPath: "m/44'/0'/0'/0/0",
			ComponentType:  "agent",
			FunctionName:   nil,
		},
		ReasonerDIDs:       map[string]DIDIdentity{},
		SkillDIDs:          map[string]DIDIdentity{},
		AgentfieldServerID: "server-empty",
	}

	// Marshal and unmarshal
	jsonData, err := json.Marshal(original)
	require.NoError(t, err)

	var recovered DIDIdentityPackage
	err = json.Unmarshal(jsonData, &recovered)
	require.NoError(t, err)

	// Verify empty maps are preserved
	assert.Equal(t, 0, len(recovered.ReasonerDIDs))
	assert.Equal(t, 0, len(recovered.SkillDIDs))
	assert.Equal(t, original.AgentfieldServerID, recovered.AgentfieldServerID)
}

// TestNewDIDClientValidBaseURL verifies that NewDIDClient succeeds with valid baseURL.
func TestNewDIDClientValidBaseURL(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
	}{
		{
			name:    "http localhost",
			baseURL: "http://localhost:8080",
		},
		{
			name:    "https URL with path",
			baseURL: "https://api.example.com/v1",
		},
		{
			name:    "https URL with trailing slash",
			baseURL: "https://api.example.com/",
		},
		{
			name:    "http URL without port",
			baseURL: "http://localhost",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewDIDClient(tt.baseURL, nil)
			assert.NoError(t, err)
			assert.NotNil(t, client)
		})
	}
}

// TestNewDIDClientEmptyBaseURL verifies that NewDIDClient returns error with empty baseURL.
func TestNewDIDClientEmptyBaseURL(t *testing.T) {
	client, err := NewDIDClient("", nil)
	assert.Error(t, err)
	assert.Nil(t, client)
	assert.Contains(t, err.Error(), "baseURL is required")
}

// TestNewDIDClientInvalidURL verifies that NewDIDClient returns error with invalid URL format.
func TestNewDIDClientInvalidURL(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
	}{
		{
			name:    "invalid scheme",
			baseURL: "ht!tp://invalid",
		},
		{
			name:    "malformed URL",
			baseURL: "://invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewDIDClient(tt.baseURL, nil)
			assert.Error(t, err)
			assert.Nil(t, client)
			assert.Contains(t, err.Error(), "invalid baseURL")
		})
	}
}

// TestNewDIDClientWithHeaders verifies that NewDIDClient accepts default headers.
func TestNewDIDClientWithHeaders(t *testing.T) {
	headers := map[string]string{
		"Authorization": "Bearer token123",
		"X-Custom":      "value",
	}

	client, err := NewDIDClient("http://localhost:8080", headers)
	assert.NoError(t, err)
	assert.NotNil(t, client)
}

// TestNewDIDClientWithNilHeaders verifies that NewDIDClient accepts nil headers.
func TestNewDIDClientWithNilHeaders(t *testing.T) {
	client, err := NewDIDClient("http://localhost:8080", nil)
	assert.NoError(t, err)
	assert.NotNil(t, client)
}

// TestDIDIdentityWithOptionalField verifies that DIDIdentity with optional
// FunctionName field marshals and unmarshals correctly.
func TestDIDIdentityWithOptionalField(t *testing.T) {
	funcName := "test_function"

	original := DIDIdentity{
		DID:            "did:test:123",
		PrivateKeyJwk:  `{"kty":"EC"}`,
		PublicKeyJwk:   `{"kty":"EC"}`,
		DerivationPath: "m/44'/0'/0'/0/0",
		ComponentType:  "reasoner",
		FunctionName:   &funcName,
	}

	// Marshal and unmarshal
	jsonData, err := json.Marshal(original)
	require.NoError(t, err)

	var recovered DIDIdentity
	err = json.Unmarshal(jsonData, &recovered)
	require.NoError(t, err)

	// Verify optional field is preserved
	assert.NotNil(t, recovered.FunctionName)
	assert.Equal(t, funcName, *recovered.FunctionName)
}

// TestGenerateCredentialOptionsExportedFields verifies that GenerateCredentialOptions
// has all necessary exported fields for proper struct composition.
func TestGenerateCredentialOptionsExportedFields(t *testing.T) {
	now := time.Now().UTC()
	workflowID := "workflow-123"
	sessionID := "session-123"
	callerDID := "did:caller:123"
	targetDID := "did:target:456"
	agentNodeDID := "did:agent:789"
	errorMsg := "test error"

	opts := GenerateCredentialOptions{
		ExecutionID:  "exec-123",
		WorkflowID:   &workflowID,
		SessionID:    &sessionID,
		CallerDID:    &callerDID,
		TargetDID:    &targetDID,
		AgentNodeDID: &agentNodeDID,
		Timestamp:    &now,
		InputData:    map[string]any{"test": "data"},
		OutputData:   map[string]any{"result": 42},
		Status:       "succeeded",
		ErrorMessage: &errorMsg,
		DurationMs:   1000,
	}

	// Verify all fields are accessible
	assert.Equal(t, "exec-123", opts.ExecutionID)
	assert.Equal(t, "workflow-123", *opts.WorkflowID)
	assert.Equal(t, "session-123", *opts.SessionID)
	assert.Equal(t, "did:caller:123", *opts.CallerDID)
	assert.Equal(t, "did:target:456", *opts.TargetDID)
	assert.Equal(t, "did:agent:789", *opts.AgentNodeDID)
	assert.Equal(t, now, *opts.Timestamp)
	assert.NotNil(t, opts.InputData)
	assert.NotNil(t, opts.OutputData)
	assert.Equal(t, "succeeded", opts.Status)
	assert.Equal(t, "test error", *opts.ErrorMessage)
	assert.Equal(t, int64(1000), opts.DurationMs)
}

// TestAuditTrailFilterExportedFields verifies that AuditTrailFilter
// has all necessary exported fields for proper struct composition.
func TestAuditTrailFilterExportedFields(t *testing.T) {
	workflowID := "workflow-123"
	sessionID := "session-123"
	issuerDID := "did:issuer:789"
	status := "succeeded"
	limit := 100

	filter := AuditTrailFilter{
		WorkflowID: &workflowID,
		SessionID:  &sessionID,
		IssuerDID:  &issuerDID,
		Status:     &status,
		Limit:      &limit,
	}

	// Verify all fields are accessible
	assert.Equal(t, "workflow-123", *filter.WorkflowID)
	assert.Equal(t, "session-123", *filter.SessionID)
	assert.Equal(t, "did:issuer:789", *filter.IssuerDID)
	assert.Equal(t, "succeeded", *filter.Status)
	assert.Equal(t, 100, *filter.Limit)
}
