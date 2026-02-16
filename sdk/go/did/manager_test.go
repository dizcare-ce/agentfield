package did

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// didClientInterface defines the methods needed for mocking DIDClient in tests.
// This is used for dependency injection during testing.
type didClientInterface interface {
	RegisterAgent(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error)
	GenerateCredential(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error)
	ExportAuditTrail(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error)
}

// MockDIDClient is a mock implementation of didClientInterface for testing.
type MockDIDClient struct {
	registerAgentFunc      func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error)
	generateCredentialFunc func(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error)
	exportAuditTrailFunc   func(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error)
}

func (m *MockDIDClient) RegisterAgent(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
	if m.registerAgentFunc != nil {
		return m.registerAgentFunc(ctx, req)
	}
	return DIDIdentityPackage{}, fmt.Errorf("not mocked")
}

func (m *MockDIDClient) GenerateCredential(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error) {
	if m.generateCredentialFunc != nil {
		return m.generateCredentialFunc(ctx, opts)
	}
	return ExecutionCredential{}, fmt.Errorf("not mocked")
}

func (m *MockDIDClient) ExportAuditTrail(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error) {
	if m.exportAuditTrailFunc != nil {
		return m.exportAuditTrailFunc(ctx, filters)
	}
	return AuditTrailExport{}, fmt.Errorf("not mocked")
}

// TestNewDIDManager tests the NewDIDManager constructor
func TestManagerNewDIDManager(t *testing.T) {
	mockClient := &MockDIDClient{}
	agentNodeID := "test-agent-1"

	manager := NewDIDManager(mockClient, agentNodeID)

	assert.NotNil(t, manager)
	assert.Equal(t, mockClient, manager.client)
	assert.Equal(t, agentNodeID, manager.agentNodeID)
	assert.False(t, manager.enabled)
	assert.Nil(t, manager.identityPackage)
}

// TestNewDIDManager_NilClient tests NewDIDManager with nil client
func TestManagerNewDIDManager_NilClient(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")

	assert.NotNil(t, manager)
	assert.Nil(t, manager.client)
	assert.False(t, manager.enabled)
}

// TestManagerRegisterAgent_Success tests successful DID registration
func TestManagerManagerRegisterAgent_Success(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID:            "did:example:agent123",
			PrivateKeyJwk:  "private_key",
			PublicKeyJwk:   "public_key",
			DerivationPath: "m/44'/60'/0'/0/0",
			ComponentType:  "agent",
		},
		ReasonerDIDs:       map[string]DIDIdentity{},
		SkillDIDs:          map[string]DIDIdentity{},
		AgentfieldServerID: "server123",
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			assert.Equal(t, "test-agent", req.AgentNodeID)
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	assert.False(t, manager.enabled)

	err := manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})
	assert.NoError(t, err)
	assert.True(t, manager.enabled)

	// Verify identity package is stored
	pkg := manager.GetIdentityPackage()
	assert.NotNil(t, pkg)
	assert.Equal(t, "did:example:agent123", pkg.AgentDID.DID)
}

// TestManagerRegisterAgent_Failure tests failed DID registration
func TestManagerManagerRegisterAgent_Failure(t *testing.T) {
	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{}, fmt.Errorf("server error")
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	assert.False(t, manager.enabled)

	err := manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})
	assert.Error(t, err)
	assert.False(t, manager.enabled) // Should remain disabled on failure
	assert.Nil(t, manager.GetIdentityPackage())
}

// TestManagerRegisterAgent_NilClient tests registration with nil client
func TestManagerManagerRegisterAgent_NilClient(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")

	err := manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})
	assert.Error(t, err)
	assert.False(t, manager.enabled)
}

// TestGetAgentDID_Enabled tests GetAgentDID when enabled
func TestManagerGetAgentDID_Enabled(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent123",
		},
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	did := manager.GetAgentDID()
	assert.Equal(t, "did:example:agent123", did)
}

// TestGetAgentDID_Disabled tests GetAgentDID when disabled
func TestManagerGetAgentDID_Disabled(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")

	did := manager.GetAgentDID()
	assert.Equal(t, "", did)
}

// TestGetAgentDID_NoIdentityPackage tests GetAgentDID when identityPackage is nil
func TestManagerGetAgentDID_NoIdentityPackage(t *testing.T) {
	mockClient := &MockDIDClient{}
	manager := NewDIDManager(mockClient, "test-agent")
	manager.enabled = true // Manually enable but no identity package

	did := manager.GetAgentDID()
	assert.Equal(t, "", did)
}

// TestGetFunctionDID_ReasonerFound tests GetFunctionDID with reasoner in package
func TestManagerGetFunctionDID_ReasonerFound(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent123",
		},
		ReasonerDIDs: map[string]DIDIdentity{
			"reasoner1": {
				DID: "did:example:reasoner123",
			},
		},
		SkillDIDs: map[string]DIDIdentity{},
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	did := manager.GetFunctionDID("reasoner1")
	assert.Equal(t, "did:example:reasoner123", did)
}

// TestGetFunctionDID_SkillFound tests GetFunctionDID with skill in package
func TestManagerGetFunctionDID_SkillFound(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent123",
		},
		ReasonerDIDs: map[string]DIDIdentity{},
		SkillDIDs: map[string]DIDIdentity{
			"skill1": {
				DID: "did:example:skill123",
			},
		},
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	did := manager.GetFunctionDID("skill1")
	assert.Equal(t, "did:example:skill123", did)
}

// TestGetFunctionDID_Fallback tests GetFunctionDID falls back to agent DID
func TestManagerGetFunctionDID_Fallback(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent123",
		},
		ReasonerDIDs: map[string]DIDIdentity{},
		SkillDIDs:    map[string]DIDIdentity{},
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	did := manager.GetFunctionDID("unknown_function")
	assert.Equal(t, "did:example:agent123", did)
}

// TestGetFunctionDID_Disabled tests GetFunctionDID when disabled
func TestManagerGetFunctionDID_Disabled(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")

	did := manager.GetFunctionDID("any_function")
	assert.Equal(t, "", did)
}

// TestGetFunctionDID_NilIdentityPackage tests GetFunctionDID with nil identity package
func TestManagerGetFunctionDID_NilIdentityPackage(t *testing.T) {
	mockClient := &MockDIDClient{}
	manager := NewDIDManager(mockClient, "test-agent")
	manager.enabled = true // Manually enable but no identity package

	did := manager.GetFunctionDID("any_function")
	assert.Equal(t, "", did)
}

// TestGenerateCredential_Enabled tests GenerateCredential when enabled
func TestManagerGenerateCredential_Enabled(t *testing.T) {
	expectedCred := ExecutionCredential{
		VCId:        "vc_123",
		ExecutionID: "exec_123",
		Status:      "succeeded",
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
		generateCredentialFunc: func(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error) {
			return expectedCred, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	cred, err := manager.GenerateCredential(context.Background(), GenerateCredentialOptions{
		ExecutionID: "exec_123",
		Status:      "succeeded",
	})

	assert.NoError(t, err)
	assert.Equal(t, expectedCred, cred)
}

// TestGenerateCredential_Disabled tests GenerateCredential when disabled
func TestManagerGenerateCredential_Disabled(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")

	cred, err := manager.GenerateCredential(context.Background(), GenerateCredentialOptions{})

	assert.Error(t, err)
	assert.Equal(t, "DID system not enabled", err.Error())
	assert.Equal(t, ExecutionCredential{}, cred)
}

// TestGenerateCredential_NilClient tests GenerateCredential with nil client
func TestManagerGenerateCredential_NilClient(t *testing.T) {
	mockClient := &MockDIDClient{}
	manager := NewDIDManager(mockClient, "test-agent")
	manager.enabled = true
	manager.client = nil // Clear client after enabling

	cred, err := manager.GenerateCredential(context.Background(), GenerateCredentialOptions{})

	assert.Error(t, err)
	assert.Equal(t, "DID system not enabled", err.Error())
	assert.Equal(t, ExecutionCredential{}, cred)
}

// TestExportAuditTrail_Enabled tests ExportAuditTrail when enabled
func TestManagerExportAuditTrail_Enabled(t *testing.T) {
	expectedExport := AuditTrailExport{
		AgentDIDs:   []string{"did:example:agent"},
		ExecutionVCs: []ExecutionCredential{},
		WorkflowVCs: []WorkflowCredential{},
		TotalCount:  0,
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
		exportAuditTrailFunc: func(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error) {
			return expectedExport, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	export, err := manager.ExportAuditTrail(context.Background(), AuditTrailFilter{})

	assert.NoError(t, err)
	assert.Equal(t, expectedExport, export)
}

// TestExportAuditTrail_Disabled tests ExportAuditTrail when disabled
func TestManagerExportAuditTrail_Disabled(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")

	export, err := manager.ExportAuditTrail(context.Background(), AuditTrailFilter{})

	assert.Error(t, err)
	assert.Equal(t, "DID system not enabled", err.Error())
	assert.Equal(t, AuditTrailExport{}, export)
}

// TestExportAuditTrail_NilClient tests ExportAuditTrail with nil client
func TestManagerExportAuditTrail_NilClient(t *testing.T) {
	mockClient := &MockDIDClient{}
	manager := NewDIDManager(mockClient, "test-agent")
	manager.enabled = true
	manager.client = nil

	export, err := manager.ExportAuditTrail(context.Background(), AuditTrailFilter{})

	assert.Error(t, err)
	assert.Equal(t, "DID system not enabled", err.Error())
	assert.Equal(t, AuditTrailExport{}, export)
}

// TestIsEnabled_True tests IsEnabled when enabled
func TestManagerIsEnabled_True(t *testing.T) {
	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	assert.True(t, manager.IsEnabled())
}

// TestIsEnabled_False tests IsEnabled when disabled
func TestManagerIsEnabled_False(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")
	assert.False(t, manager.IsEnabled())
}

// TestGetIdentityPackage_Enabled tests GetIdentityPackage when enabled
func TestManagerGetIdentityPackage_Enabled(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent123",
		},
		AgentfieldServerID: "server123",
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	pkg := manager.GetIdentityPackage()
	assert.NotNil(t, pkg)
	assert.Equal(t, "did:example:agent123", pkg.AgentDID.DID)
	assert.Equal(t, "server123", pkg.AgentfieldServerID)
}

// TestGetIdentityPackage_Disabled tests GetIdentityPackage when disabled
func TestManagerGetIdentityPackage_Disabled(t *testing.T) {
	manager := NewDIDManager(nil, "test-agent")
	pkg := manager.GetIdentityPackage()
	assert.Nil(t, pkg)
}

// TestConcurrentAccess tests thread safety with concurrent goroutines
func TestManagerConcurrentAccess(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent123",
		},
		ReasonerDIDs: map[string]DIDIdentity{
			"reasoner1": {DID: "did:example:reasoner1"},
		},
		SkillDIDs: map[string]DIDIdentity{
			"skill1": {DID: "did:example:skill1"},
		},
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			// Simulate some delay to increase race condition likelihood
			time.Sleep(10 * time.Millisecond)
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")

	// Track errors
	var errorCount int32
	var wg sync.WaitGroup

	// Spawn reader goroutines (10 goroutines reading concurrently)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				agentDID := manager.GetAgentDID()
				funcDID := manager.GetFunctionDID("reasoner1")
				funcDID2 := manager.GetFunctionDID("skill1")
				enabled := manager.IsEnabled()
				pkg := manager.GetIdentityPackage()

				// After registration, verify values are sensible
				if enabled {
					if agentDID == "" || funcDID == "" || funcDID2 == "" || pkg == nil {
						atomic.AddInt32(&errorCount, 1)
					}
				}
				time.Sleep(1 * time.Millisecond)
			}
		}(i)
	}

	// Single writer goroutine (RegisterAgent)
	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(5 * time.Millisecond)
		manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})
	}()

	wg.Wait()

	// Verify final state
	assert.Zero(t, errorCount, "no panics or inconsistencies should occur")
	assert.True(t, manager.IsEnabled())
	assert.Equal(t, "did:example:agent123", manager.GetAgentDID())
}

// TestRegisterAgent_Reasoners tests RegisterAgent passes reasoners correctly
func TestManagerRegisterAgent_Reasoners(t *testing.T) {
	var capturedReq DIDRegistrationRequest

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			capturedReq = req
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	reasoners := []map[string]any{
		{"id": "reasoner1"},
		{"id": "reasoner2"},
	}
	skills := []map[string]any{
		{"id": "skill1"},
	}

	manager.RegisterAgent(context.Background(), reasoners, skills)

	assert.Equal(t, "test-agent", capturedReq.AgentNodeID)
	assert.Equal(t, reasoners, capturedReq.Reasoners)
	assert.Equal(t, skills, capturedReq.Skills)
}

// TestGetFunctionDID_ReasonerTakesPrecedence tests that reasoner DIDs are checked before skills
func TestManagerGetFunctionDID_ReasonerTakesPrecedence(t *testing.T) {
	mockPkg := DIDIdentityPackage{
		AgentDID: DIDIdentity{
			DID: "did:example:agent",
		},
		ReasonerDIDs: map[string]DIDIdentity{
			"component1": {DID: "did:example:reasoner"},
		},
		SkillDIDs: map[string]DIDIdentity{
			"component1": {DID: "did:example:skill"},
		},
	}

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return mockPkg, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	// Should return reasoner DID, not skill DID
	did := manager.GetFunctionDID("component1")
	assert.Equal(t, "did:example:reasoner", did)
}

// TestStateTransition tests the state transition from disabled to enabled
func TestManagerStateTransition(t *testing.T) {
	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")

	// Initial state: disabled
	assert.False(t, manager.IsEnabled())
	assert.Equal(t, "", manager.GetAgentDID())

	// After registration: enabled
	err := manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})
	assert.NoError(t, err)
	assert.True(t, manager.IsEnabled())
	assert.Equal(t, "did:example:agent", manager.GetAgentDID())
}

// TestGenerateCredential_ContextPropagation tests that context is passed to client
func TestManagerGenerateCredential_ContextPropagation(t *testing.T) {
	var contextReceived context.Context

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
		generateCredentialFunc: func(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error) {
			contextReceived = ctx
			return ExecutionCredential{}, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	manager.GenerateCredential(ctx, GenerateCredentialOptions{})

	assert.NotNil(t, contextReceived)
	assert.Equal(t, ctx, contextReceived)
}

// TestExportAuditTrail_ContextPropagation tests that context is passed to client
func TestManagerExportAuditTrail_ContextPropagation(t *testing.T) {
	var contextReceived context.Context

	mockClient := &MockDIDClient{
		registerAgentFunc: func(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error) {
			return DIDIdentityPackage{
				AgentDID: DIDIdentity{DID: "did:example:agent"},
			}, nil
		},
		exportAuditTrailFunc: func(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error) {
			contextReceived = ctx
			return AuditTrailExport{}, nil
		},
	}

	manager := NewDIDManager(mockClient, "test-agent")
	manager.RegisterAgent(context.Background(), []map[string]any{}, []map[string]any{})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	manager.ExportAuditTrail(ctx, AuditTrailFilter{})

	assert.NotNil(t, contextReceived)
	assert.Equal(t, ctx, contextReceived)
}
