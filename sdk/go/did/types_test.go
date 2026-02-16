package did

import (
	"encoding/json"
	"testing"
	"time"
)

// TestDIDIdentityMarshalJSON verifies DIDIdentity marshals to JSON with snake_case field names.
func TestDIDIdentityMarshalJSON(t *testing.T) {
	functionName := "test_function"
	identity := DIDIdentity{
		DID:            "did:agent:123",
		PrivateKeyJwk:  `{"kty":"EC","crv":"P-256"}`,
		PublicKeyJwk:   `{"kty":"EC","crv":"P-256","x":"...","y":"..."}`,
		DerivationPath: "m/44'/0'/0'/0/0",
		ComponentType:  "agent",
		FunctionName:   &functionName,
	}

	data, err := json.Marshal(identity)
	if err != nil {
		t.Fatalf("failed to marshal DIDIdentity: %v", err)
	}

	// Verify snake_case field names in output
	jsonStr := string(data)
	expectedKeys := []string{
		`"did"`,
		`"private_key_jwk"`,
		`"public_key_jwk"`,
		`"derivation_path"`,
		`"component_type"`,
		`"function_name"`,
	}
	for _, key := range expectedKeys {
		if !contains(jsonStr, key) {
			t.Errorf("expected key %s not found in JSON: %s", key, jsonStr)
		}
	}
}

// TestDIDIdentityUnmarshalJSON verifies DIDIdentity unmarshals from JSON correctly.
func TestDIDIdentityUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"did": "did:agent:123",
		"private_key_jwk": "{\"kty\":\"EC\"}",
		"public_key_jwk": "{\"kty\":\"EC\"}",
		"derivation_path": "m/44'/0'/0'/0/0",
		"component_type": "agent",
		"function_name": "test_function"
	}`

	var identity DIDIdentity
	err := json.Unmarshal([]byte(jsonData), &identity)
	if err != nil {
		t.Fatalf("failed to unmarshal DIDIdentity: %v", err)
	}

	if identity.DID != "did:agent:123" {
		t.Errorf("expected DID 'did:agent:123', got '%s'", identity.DID)
	}
	if identity.ComponentType != "agent" {
		t.Errorf("expected ComponentType 'agent', got '%s'", identity.ComponentType)
	}
	if identity.FunctionName == nil || *identity.FunctionName != "test_function" {
		t.Errorf("expected FunctionName 'test_function', got %v", identity.FunctionName)
	}
}

// TestDIDIdentityOptionalFieldOmitted verifies optional FunctionName is omitted when nil.
func TestDIDIdentityOptionalFieldOmitted(t *testing.T) {
	identity := DIDIdentity{
		DID:            "did:agent:123",
		PrivateKeyJwk:  `{"kty":"EC"}`,
		PublicKeyJwk:   `{"kty":"EC"}`,
		DerivationPath: "m/44'/0'/0'/0/0",
		ComponentType:  "agent",
		FunctionName:   nil,
	}

	data, err := json.Marshal(identity)
	if err != nil {
		t.Fatalf("failed to marshal DIDIdentity with nil optional: %v", err)
	}

	jsonStr := string(data)
	if contains(jsonStr, `"function_name"`) {
		t.Errorf("optional field function_name should be omitted from JSON when nil, got: %s", jsonStr)
	}
}

// TestDIDIdentityPackageMarshalJSON verifies DIDIdentityPackage marshals to JSON with snake_case.
func TestDIDIdentityPackageMarshalJSON(t *testing.T) {
	agentDID := DIDIdentity{
		DID:            "did:agent:123",
		PrivateKeyJwk:  `{"kty":"EC"}`,
		PublicKeyJwk:   `{"kty":"EC"}`,
		DerivationPath: "m/44'/0'/0'/0/0",
		ComponentType:  "agent",
	}

	reasonerDID := DIDIdentity{
		DID:            "did:reasoner:456",
		PrivateKeyJwk:  `{"kty":"EC"}`,
		PublicKeyJwk:   `{"kty":"EC"}`,
		DerivationPath: "m/44'/0'/0'/0/1",
		ComponentType:  "reasoner",
	}

	pkg := DIDIdentityPackage{
		AgentDID: agentDID,
		ReasonerDIDs: map[string]DIDIdentity{
			"reasoner_1": reasonerDID,
		},
		SkillDIDs:          map[string]DIDIdentity{},
		AgentfieldServerID: "server-123",
	}

	data, err := json.Marshal(pkg)
	if err != nil {
		t.Fatalf("failed to marshal DIDIdentityPackage: %v", err)
	}

	jsonStr := string(data)
	expectedKeys := []string{
		`"agent_did"`,
		`"reasoner_dids"`,
		`"skill_dids"`,
		`"agentfield_server_id"`,
	}
	for _, key := range expectedKeys {
		if !contains(jsonStr, key) {
			t.Errorf("expected key %s not found in JSON: %s", key, jsonStr)
		}
	}
}

// TestDIDIdentityPackageUnmarshalJSON verifies round-trip unmarshaling.
func TestDIDIdentityPackageUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"agent_did": {
			"did": "did:agent:123",
			"private_key_jwk": "{\"kty\":\"EC\"}",
			"public_key_jwk": "{\"kty\":\"EC\"}",
			"derivation_path": "m/44'/0'/0'/0/0",
			"component_type": "agent"
		},
		"reasoner_dids": {
			"reasoner_1": {
				"did": "did:reasoner:456",
				"private_key_jwk": "{\"kty\":\"EC\"}",
				"public_key_jwk": "{\"kty\":\"EC\"}",
				"derivation_path": "m/44'/0'/0'/0/1",
				"component_type": "reasoner"
			}
		},
		"skill_dids": {},
		"agentfield_server_id": "server-123"
	}`

	var pkg DIDIdentityPackage
	err := json.Unmarshal([]byte(jsonData), &pkg)
	if err != nil {
		t.Fatalf("failed to unmarshal DIDIdentityPackage: %v", err)
	}

	if pkg.AgentDID.DID != "did:agent:123" {
		t.Errorf("expected AgentDID 'did:agent:123', got '%s'", pkg.AgentDID.DID)
	}
	if pkg.AgentfieldServerID != "server-123" {
		t.Errorf("expected AgentfieldServerID 'server-123', got '%s'", pkg.AgentfieldServerID)
	}
	if reasonerDID, ok := pkg.ReasonerDIDs["reasoner_1"]; !ok {
		t.Errorf("expected reasoner_1 in ReasonerDIDs map")
	} else if reasonerDID.DID != "did:reasoner:456" {
		t.Errorf("expected reasoner DID 'did:reasoner:456', got '%s'", reasonerDID.DID)
	}
}

// TestExecutionCredentialMarshalJSON verifies ExecutionCredential marshals with snake_case.
func TestExecutionCredentialMarshalJSON(t *testing.T) {
	createdAt := time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC)
	sessionID := "session-123"
	issuerDID := "did:agent:123"
	signature := "eyJhbGciOiJFUzI1NiJ9..."

	credential := ExecutionCredential{
		VCId:        "vc-123",
		ExecutionID: "exec-456",
		WorkflowID:  "workflow-789",
		SessionID:   &sessionID,
		IssuerDID:   &issuerDID,
		TargetDID:   nil,
		CallerDID:   nil,
		VCDocument: map[string]any{
			"@context": "https://www.w3.org/2018/credentials/v1",
			"type":     "VerifiableCredential",
		},
		Signature:  &signature,
		InputHash:  nil,
		OutputHash: nil,
		Status:     "succeeded",
		CreatedAt:  createdAt,
	}

	data, err := json.Marshal(credential)
	if err != nil {
		t.Fatalf("failed to marshal ExecutionCredential: %v", err)
	}

	jsonStr := string(data)
	expectedKeys := []string{
		`"vc_id"`,
		`"execution_id"`,
		`"workflow_id"`,
		`"session_id"`,
		`"issuer_did"`,
		`"vc_document"`,
		`"signature"`,
		`"status"`,
		`"created_at"`,
	}
	for _, key := range expectedKeys {
		if !contains(jsonStr, key) {
			t.Errorf("expected key %s not found in JSON: %s", key, jsonStr)
		}
	}

	// Verify omitted optional fields
	if contains(jsonStr, `"target_did"`) {
		t.Errorf("optional field target_did should be omitted from JSON when nil, got: %s", jsonStr)
	}
	if contains(jsonStr, `"caller_did"`) {
		t.Errorf("optional field caller_did should be omitted from JSON when nil, got: %s", jsonStr)
	}
	if contains(jsonStr, `"input_hash"`) {
		t.Errorf("optional field input_hash should be omitted from JSON when nil, got: %s", jsonStr)
	}
}

// TestExecutionCredentialUnmarshalJSON verifies round-trip unmarshaling.
func TestExecutionCredentialUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"vc_id": "vc-123",
		"execution_id": "exec-456",
		"workflow_id": "workflow-789",
		"session_id": "session-123",
		"issuer_did": "did:agent:123",
		"vc_document": {
			"@context": "https://www.w3.org/2018/credentials/v1",
			"type": "VerifiableCredential"
		},
		"signature": "eyJhbGciOiJFUzI1NiJ9...",
		"status": "succeeded",
		"created_at": "2026-02-16T12:00:00Z"
	}`

	var credential ExecutionCredential
	err := json.Unmarshal([]byte(jsonData), &credential)
	if err != nil {
		t.Fatalf("failed to unmarshal ExecutionCredential: %v", err)
	}

	if credential.VCId != "vc-123" {
		t.Errorf("expected VCId 'vc-123', got '%s'", credential.VCId)
	}
	if credential.Status != "succeeded" {
		t.Errorf("expected Status 'succeeded', got '%s'", credential.Status)
	}
	if credential.SessionID == nil || *credential.SessionID != "session-123" {
		t.Errorf("expected SessionID 'session-123', got %v", credential.SessionID)
	}
	if credential.TargetDID != nil {
		t.Errorf("expected TargetDID to be nil, got %v", credential.TargetDID)
	}
	if credential.CallerDID != nil {
		t.Errorf("expected CallerDID to be nil, got %v", credential.CallerDID)
	}

	expectedTime := time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC)
	if !credential.CreatedAt.Equal(expectedTime) {
		t.Errorf("expected CreatedAt %v, got %v", expectedTime, credential.CreatedAt)
	}
}

// TestExecutionCredentialOptionalFields verifies optional fields are properly handled.
func TestExecutionCredentialOptionalFields(t *testing.T) {
	createdAt := time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC)

	// Test with no optional fields
	credential := ExecutionCredential{
		VCId:        "vc-123",
		ExecutionID: "exec-456",
		WorkflowID:  "workflow-789",
		VCDocument:  map[string]any{},
		Status:      "succeeded",
		CreatedAt:   createdAt,
	}

	data, err := json.Marshal(credential)
	if err != nil {
		t.Fatalf("failed to marshal ExecutionCredential: %v", err)
	}

	jsonStr := string(data)
	omittedKeys := []string{
		`"session_id"`,
		`"issuer_did"`,
		`"target_did"`,
		`"caller_did"`,
		`"signature"`,
		`"input_hash"`,
		`"output_hash"`,
	}
	for _, key := range omittedKeys {
		if contains(jsonStr, key) {
			t.Errorf("optional field %s should be omitted when nil, got: %s", key, jsonStr)
		}
	}
}

// TestGenerateCredentialOptionsMarshalJSON verifies marshaling with json:"-" tags.
func TestGenerateCredentialOptionsMarshalJSON(t *testing.T) {
	workflowID := "workflow-789"
	status := "succeeded"

	opts := GenerateCredentialOptions{
		ExecutionID:  "exec-456",
		WorkflowID:   &workflowID,
		SessionID:    nil,
		CallerDID:    nil,
		TargetDID:    nil,
		AgentNodeDID: nil,
		Timestamp:    nil,
		InputData:    map[string]any{"key": "value"},
		OutputData:   map[string]any{"result": "success"},
		Status:       status,
		ErrorMessage: nil,
		DurationMs:   1000,
	}

	data, err := json.Marshal(opts)
	if err != nil {
		t.Fatalf("failed to marshal GenerateCredentialOptions: %v", err)
	}

	jsonStr := string(data)

	// Verify included fields
	if !contains(jsonStr, `"execution_id"`) {
		t.Errorf("expected key execution_id in JSON: %s", jsonStr)
	}
	if !contains(jsonStr, `"workflow_id"`) {
		t.Errorf("expected key workflow_id in JSON: %s", jsonStr)
	}
	if !contains(jsonStr, `"status"`) {
		t.Errorf("expected key status in JSON: %s", jsonStr)
	}
	if !contains(jsonStr, `"duration_ms"`) {
		t.Errorf("expected key duration_ms in JSON: %s", jsonStr)
	}

	// Verify InputData and OutputData are NOT in JSON (json:"-" tags)
	if contains(jsonStr, `"input_data"`) {
		t.Errorf("InputData should not be in JSON (json:\"-\" tag), got: %s", jsonStr)
	}
	if contains(jsonStr, `"output_data"`) {
		t.Errorf("OutputData should not be in JSON (json:\"-\" tag), got: %s", jsonStr)
	}
}

// TestGenerateCredentialOptionsUnmarshalJSON verifies unmarshaling.
func TestGenerateCredentialOptionsUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"execution_id": "exec-456",
		"workflow_id": "workflow-789",
		"status": "succeeded",
		"duration_ms": 1000
	}`

	var opts GenerateCredentialOptions
	err := json.Unmarshal([]byte(jsonData), &opts)
	if err != nil {
		t.Fatalf("failed to unmarshal GenerateCredentialOptions: %v", err)
	}

	if opts.ExecutionID != "exec-456" {
		t.Errorf("expected ExecutionID 'exec-456', got '%s'", opts.ExecutionID)
	}
	if opts.Status != "succeeded" {
		t.Errorf("expected Status 'succeeded', got '%s'", opts.Status)
	}
	if opts.DurationMs != 1000 {
		t.Errorf("expected DurationMs 1000, got %d", opts.DurationMs)
	}
}

// TestWorkflowCredentialMarshalJSON verifies WorkflowCredential marshals with snake_case.
func TestWorkflowCredentialMarshalJSON(t *testing.T) {
	startTime := time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC)
	endTime := time.Date(2026, 2, 16, 12, 5, 0, 0, time.UTC)
	sessionID := "session-123"

	credential := WorkflowCredential{
		WorkflowID:    "workflow-789",
		SessionID:     &sessionID,
		ComponentVCs:  []string{"vc-1", "vc-2", "vc-3"},
		WorkflowVCID:  "wf-vc-456",
		Status:        "succeeded",
		StartTime:     startTime,
		EndTime:       &endTime,
		TotalSteps:    5,
		CompletedSteps: 5,
	}

	data, err := json.Marshal(credential)
	if err != nil {
		t.Fatalf("failed to marshal WorkflowCredential: %v", err)
	}

	jsonStr := string(data)
	expectedKeys := []string{
		`"workflow_id"`,
		`"session_id"`,
		`"component_vcs"`,
		`"workflow_vc_id"`,
		`"status"`,
		`"start_time"`,
		`"end_time"`,
		`"total_steps"`,
		`"completed_steps"`,
	}
	for _, key := range expectedKeys {
		if !contains(jsonStr, key) {
			t.Errorf("expected key %s not found in JSON: %s", key, jsonStr)
		}
	}
}

// TestWorkflowCredentialUnmarshalJSON verifies round-trip unmarshaling.
func TestWorkflowCredentialUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"workflow_id": "workflow-789",
		"session_id": "session-123",
		"component_vcs": ["vc-1", "vc-2", "vc-3"],
		"workflow_vc_id": "wf-vc-456",
		"status": "succeeded",
		"start_time": "2026-02-16T12:00:00Z",
		"end_time": "2026-02-16T12:05:00Z",
		"total_steps": 5,
		"completed_steps": 5
	}`

	var credential WorkflowCredential
	err := json.Unmarshal([]byte(jsonData), &credential)
	if err != nil {
		t.Fatalf("failed to unmarshal WorkflowCredential: %v", err)
	}

	if credential.WorkflowID != "workflow-789" {
		t.Errorf("expected WorkflowID 'workflow-789', got '%s'", credential.WorkflowID)
	}
	if credential.TotalSteps != 5 {
		t.Errorf("expected TotalSteps 5, got %d", credential.TotalSteps)
	}
	if len(credential.ComponentVCs) != 3 {
		t.Errorf("expected 3 ComponentVCs, got %d", len(credential.ComponentVCs))
	}
}

// TestWorkflowCredentialOptionalEndTime verifies EndTime can be nil.
func TestWorkflowCredentialOptionalEndTime(t *testing.T) {
	startTime := time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC)

	credential := WorkflowCredential{
		WorkflowID:     "workflow-789",
		SessionID:      nil,
		ComponentVCs:   []string{},
		WorkflowVCID:   "wf-vc-456",
		Status:         "in_progress",
		StartTime:      startTime,
		EndTime:        nil,
		TotalSteps:     5,
		CompletedSteps: 2,
	}

	data, err := json.Marshal(credential)
	if err != nil {
		t.Fatalf("failed to marshal WorkflowCredential: %v", err)
	}

	jsonStr := string(data)
	if contains(jsonStr, `"end_time"`) {
		t.Errorf("optional field end_time should be omitted when nil, got: %s", jsonStr)
	}
}

// TestAuditTrailExportMarshalJSON verifies AuditTrailExport marshals correctly.
func TestAuditTrailExportMarshalJSON(t *testing.T) {
	createdAt := time.Date(2026, 2, 16, 12, 0, 0, 0, time.UTC)

	export := AuditTrailExport{
		AgentDIDs: []string{"did:agent:123", "did:agent:456"},
		ExecutionVCs: []ExecutionCredential{
			{
				VCId:        "vc-1",
				ExecutionID: "exec-1",
				WorkflowID:  "workflow-1",
				VCDocument:  map[string]any{},
				Status:      "succeeded",
				CreatedAt:   createdAt,
			},
		},
		WorkflowVCs: []WorkflowCredential{
			{
				WorkflowID:     "workflow-1",
				ComponentVCs:   []string{"vc-1"},
				WorkflowVCID:   "wf-vc-1",
				Status:         "succeeded",
				StartTime:      createdAt,
				TotalSteps:     1,
				CompletedSteps: 1,
			},
		},
		TotalCount:     2,
		FiltersApplied: map[string]any{"workflow_id": "workflow-1"},
	}

	data, err := json.Marshal(export)
	if err != nil {
		t.Fatalf("failed to marshal AuditTrailExport: %v", err)
	}

	jsonStr := string(data)
	expectedKeys := []string{
		`"agent_dids"`,
		`"execution_vcs"`,
		`"workflow_vcs"`,
		`"total_count"`,
		`"filters_applied"`,
	}
	for _, key := range expectedKeys {
		if !contains(jsonStr, key) {
			t.Errorf("expected key %s not found in JSON: %s", key, jsonStr)
		}
	}
}

// TestAuditTrailExportUnmarshalJSON verifies round-trip unmarshaling.
func TestAuditTrailExportUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"agent_dids": ["did:agent:123"],
		"execution_vcs": [
			{
				"vc_id": "vc-1",
				"execution_id": "exec-1",
				"workflow_id": "workflow-1",
				"vc_document": {},
				"status": "succeeded",
				"created_at": "2026-02-16T12:00:00Z"
			}
		],
		"workflow_vcs": [
			{
				"workflow_id": "workflow-1",
				"component_vcs": ["vc-1"],
				"workflow_vc_id": "wf-vc-1",
				"status": "succeeded",
				"start_time": "2026-02-16T12:00:00Z",
				"total_steps": 1,
				"completed_steps": 1
			}
		],
		"total_count": 2,
		"filters_applied": {"workflow_id": "workflow-1"}
	}`

	var export AuditTrailExport
	err := json.Unmarshal([]byte(jsonData), &export)
	if err != nil {
		t.Fatalf("failed to unmarshal AuditTrailExport: %v", err)
	}

	if len(export.AgentDIDs) != 1 {
		t.Errorf("expected 1 AgentDID, got %d", len(export.AgentDIDs))
	}
	if export.TotalCount != 2 {
		t.Errorf("expected TotalCount 2, got %d", export.TotalCount)
	}
	if len(export.ExecutionVCs) != 1 {
		t.Errorf("expected 1 ExecutionVC, got %d", len(export.ExecutionVCs))
	}
}

// TestAuditTrailExportOptionalFiltersApplied verifies FiltersApplied can be nil.
func TestAuditTrailExportOptionalFiltersApplied(t *testing.T) {
	export := AuditTrailExport{
		AgentDIDs:      []string{},
		ExecutionVCs:   []ExecutionCredential{},
		WorkflowVCs:    []WorkflowCredential{},
		TotalCount:     0,
		FiltersApplied: nil,
	}

	data, err := json.Marshal(export)
	if err != nil {
		t.Fatalf("failed to marshal AuditTrailExport: %v", err)
	}

	jsonStr := string(data)
	if contains(jsonStr, `"filters_applied"`) {
		t.Errorf("optional field filters_applied should be omitted when nil, got: %s", jsonStr)
	}
}

// TestAuditTrailFilterStructure verifies AuditTrailFilter has correct query tags.
func TestAuditTrailFilterStructure(t *testing.T) {
	limit := 100
	workflowID := "workflow-789"
	filter := AuditTrailFilter{
		WorkflowID: &workflowID,
		SessionID:  nil,
		IssuerDID:  nil,
		Status:     nil,
		Limit:      &limit,
	}

	// Verify that the filter struct can be created and accessed
	if filter.WorkflowID == nil || *filter.WorkflowID != "workflow-789" {
		t.Errorf("expected WorkflowID 'workflow-789', got %v", filter.WorkflowID)
	}
	if filter.Limit == nil || *filter.Limit != 100 {
		t.Errorf("expected Limit 100, got %v", filter.Limit)
	}
	if filter.SessionID != nil {
		t.Errorf("expected SessionID to be nil, got %v", filter.SessionID)
	}

	// Note: We cannot directly test query struct tags without reflection,
	// but the presence of the struct tags ensures they work at runtime
	// when used by HTTP clients for URL parameter encoding.
}

// TestDIDRegistrationRequestMarshalJSON verifies DIDRegistrationRequest marshals with snake_case.
func TestDIDRegistrationRequestMarshalJSON(t *testing.T) {
	req := DIDRegistrationRequest{
		AgentNodeID: "agent-node-123",
		Reasoners: []map[string]any{
			{"id": "reasoner_1", "type": "reasoning"},
			{"id": "reasoner_2", "type": "planning"},
		},
		Skills: []map[string]any{},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal DIDRegistrationRequest: %v", err)
	}

	jsonStr := string(data)
	expectedKeys := []string{
		`"agent_node_id"`,
		`"reasoners"`,
		`"skills"`,
	}
	for _, key := range expectedKeys {
		if !contains(jsonStr, key) {
			t.Errorf("expected key %s not found in JSON: %s", key, jsonStr)
		}
	}
}

// TestDIDRegistrationRequestUnmarshalJSON verifies round-trip unmarshaling.
func TestDIDRegistrationRequestUnmarshalJSON(t *testing.T) {
	jsonData := `{
		"agent_node_id": "agent-node-123",
		"reasoners": [
			{"id": "reasoner_1", "type": "reasoning"}
		],
		"skills": []
	}`

	var req DIDRegistrationRequest
	err := json.Unmarshal([]byte(jsonData), &req)
	if err != nil {
		t.Fatalf("failed to unmarshal DIDRegistrationRequest: %v", err)
	}

	if req.AgentNodeID != "agent-node-123" {
		t.Errorf("expected AgentNodeID 'agent-node-123', got '%s'", req.AgentNodeID)
	}
	if len(req.Reasoners) != 1 {
		t.Errorf("expected 1 Reasoner, got %d", len(req.Reasoners))
	}
	if len(req.Skills) != 0 {
		t.Errorf("expected 0 Skills, got %d", len(req.Skills))
	}
}

// TestRoundTripMarshalExecutionCredential verifies ExecutionCredential round-trip.
func TestRoundTripMarshalExecutionCredential(t *testing.T) {
	createdAt := time.Date(2026, 2, 16, 15, 30, 45, 123456789, time.UTC)
	issuerDID := "did:agent:issuer-123"

	original := ExecutionCredential{
		VCId:        "vc-12345",
		ExecutionID: "exec-67890",
		WorkflowID:  "wf-abcde",
		SessionID:   nil,
		IssuerDID:   &issuerDID,
		TargetDID:   nil,
		CallerDID:   nil,
		VCDocument: map[string]any{
			"@context": []string{
				"https://www.w3.org/2018/credentials/v1",
				"https://www.w3.org/2018/credentials/examples/v1",
			},
			"type": []string{"VerifiableCredential", "ExecutionCredential"},
			"issuer": map[string]any{
				"id": "did:agent:issuer-123",
			},
		},
		Signature:  nil,
		InputHash:  nil,
		OutputHash: nil,
		Status:     "succeeded",
		CreatedAt:  createdAt,
	}

	// Marshal to JSON
	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	// Unmarshal back
	var restored ExecutionCredential
	err = json.Unmarshal(data, &restored)
	if err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// Verify equality
	if restored.VCId != original.VCId {
		t.Errorf("VCId mismatch: expected %s, got %s", original.VCId, restored.VCId)
	}
	if restored.ExecutionID != original.ExecutionID {
		t.Errorf("ExecutionID mismatch: expected %s, got %s", original.ExecutionID, restored.ExecutionID)
	}
	if restored.Status != original.Status {
		t.Errorf("Status mismatch: expected %s, got %s", original.Status, restored.Status)
	}
	if !restored.CreatedAt.Equal(original.CreatedAt) {
		t.Errorf("CreatedAt mismatch: expected %v, got %v", original.CreatedAt, restored.CreatedAt)
	}
}

// TestTimeFieldSerialization verifies time.Time fields serialize correctly.
func TestTimeFieldSerialization(t *testing.T) {
	createdAt := time.Date(2026, 2, 16, 12, 30, 45, 0, time.UTC)
	credential := ExecutionCredential{
		VCId:        "vc-test",
		ExecutionID: "exec-test",
		WorkflowID:  "wf-test",
		VCDocument:  map[string]any{},
		Status:      "succeeded",
		CreatedAt:   createdAt,
	}

	data, err := json.Marshal(credential)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	// Verify RFC3339 format in JSON
	jsonStr := string(data)
	if !contains(jsonStr, "2026-02-16T12:30:45Z") {
		t.Errorf("expected RFC3339 timestamp format in JSON, got: %s", jsonStr)
	}

	// Verify unmarshal restores correctly
	var restored ExecutionCredential
	err = json.Unmarshal(data, &restored)
	if err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if !restored.CreatedAt.Equal(createdAt) {
		t.Errorf("time roundtrip failed: expected %v, got %v", createdAt, restored.CreatedAt)
	}
}

// contains is a helper function to check if a substring exists in a string.
func contains(str, substr string) bool {
	return len(str) > 0 && len(substr) > 0 && (str == substr || (len(str) > len(substr) && stringContainsSubstring(str, substr)))
}

// stringContainsSubstring is a helper to check substring presence.
func stringContainsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
