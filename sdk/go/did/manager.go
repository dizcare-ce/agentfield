package did

import (
	"context"
	"fmt"
	"log"
	"sync"
)

// DIDClientInterface defines the interface for a DID client.
// This allows for easy mocking in tests.
type DIDClientInterface interface {
	RegisterAgent(ctx context.Context, req DIDRegistrationRequest) (DIDIdentityPackage, error)
	GenerateCredential(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error)
	ExportAuditTrail(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error)
}

// DIDManager orchestrates DID operations and manages the identity package state.
// It coordinates with DIDClient for HTTP communication and handles graceful degradation
// when the DID system is disabled. All state mutations are protected by RWMutex to ensure
// thread-safe concurrent access.
type DIDManager struct {
	client          DIDClientInterface
	agentNodeID     string
	identityPackage *DIDIdentityPackage
	enabled         bool
	mu              sync.RWMutex
}

// NewDIDManager creates a new DIDManager instance with the specified DIDClient and agent node ID.
// The manager is initialized in a disabled state (enabled=false) until RegisterAgent is called successfully.
// If client is nil, the manager remains disabled and returns empty strings/errors from its methods.
func NewDIDManager(client DIDClientInterface, agentNodeID string) *DIDManager {
	return &DIDManager{
		client:      client,
		agentNodeID: agentNodeID,
		enabled:     false,
	}
}

// RegisterAgent registers the agent with the control plane DID system.
// It calls client.RegisterAgent() to obtain the identity package, stores it on success,
// and sets enabled=true. On success, a debug message is logged. On failure, a warning
// is logged and the error is returned (non-fatal; the agent continues operating).
// Thread-safe: uses RWMutex.Lock() to protect state updates.
func (m *DIDManager) RegisterAgent(ctx context.Context, reasoners []map[string]any, skills []map[string]any) error {
	if m.client == nil {
		m.mu.Lock()
		m.enabled = false
		m.mu.Unlock()
		return fmt.Errorf("DID client is nil")
	}

	// Build registration request
	req := DIDRegistrationRequest{
		AgentNodeID: m.agentNodeID,
		Reasoners:   reasoners,
		Skills:      skills,
	}

	// Call client
	pkg, err := m.client.RegisterAgent(ctx, req)
	if err != nil {
		log.Printf("warning: DID registration failed: %v", err)
		return err
	}

	// Update state on success
	m.mu.Lock()
	m.identityPackage = &pkg
	m.enabled = true
	m.mu.Unlock()

	log.Printf("debug: DID registration successful: agent_did=%s", pkg.AgentDID.DID)
	return nil
}

// GetAgentDID returns the agent's DID string if the DID system is enabled, or an empty string
// if disabled or not registered. No error is returned; this method implements graceful degradation.
// Thread-safe: uses RWMutex.RLock() for concurrent read access.
func (m *DIDManager) GetAgentDID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.enabled || m.identityPackage == nil {
		return ""
	}
	return m.identityPackage.AgentDID.DID
}

// GetFunctionDID returns the DID for a specific function (reasoner or skill).
// It checks ReasonerDIDs first, then SkillDIDs, then falls back to the agent DID.
// Returns an empty string if disabled or not found, without panicking.
// Thread-safe: uses RWMutex.RLock() for concurrent read access.
func (m *DIDManager) GetFunctionDID(functionName string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.enabled || m.identityPackage == nil {
		return ""
	}

	// Check reasoner DIDs first
	if reasonerDID, exists := m.identityPackage.ReasonerDIDs[functionName]; exists {
		return reasonerDID.DID
	}

	// Check skill DIDs
	if skillDID, exists := m.identityPackage.SkillDIDs[functionName]; exists {
		return skillDID.DID
	}

	// Fall back to agent DID
	return m.identityPackage.AgentDID.DID
}

// GenerateCredential generates a verifiable credential for an execution.
// If the DID system is not enabled, returns an error "DID system not enabled".
// Otherwise, delegates to client.GenerateCredential() and returns its result.
// Thread-safe: uses RWMutex.RLock() for read-only access to the enabled flag.
func (m *DIDManager) GenerateCredential(ctx context.Context, opts GenerateCredentialOptions) (ExecutionCredential, error) {
	m.mu.RLock()
	enabled := m.enabled
	client := m.client
	m.mu.RUnlock()

	if !enabled {
		return ExecutionCredential{}, fmt.Errorf("DID system not enabled")
	}

	if client == nil {
		return ExecutionCredential{}, fmt.Errorf("DID system not enabled")
	}

	return client.GenerateCredential(ctx, opts)
}

// ExportAuditTrail exports the audit trail with optional filters.
// If the DID system is not enabled, returns an error "DID system not enabled".
// Otherwise, delegates to client.ExportAuditTrail() and returns its result.
// Thread-safe: uses RWMutex.RLock() for read-only access to the enabled flag.
func (m *DIDManager) ExportAuditTrail(ctx context.Context, filters AuditTrailFilter) (AuditTrailExport, error) {
	m.mu.RLock()
	enabled := m.enabled
	client := m.client
	m.mu.RUnlock()

	if !enabled {
		return AuditTrailExport{}, fmt.Errorf("DID system not enabled")
	}

	if client == nil {
		return AuditTrailExport{}, fmt.Errorf("DID system not enabled")
	}

	return client.ExportAuditTrail(ctx, filters)
}

// IsEnabled returns true if the DID system is enabled and registered, false otherwise.
// Thread-safe: uses RWMutex.RLock() for concurrent read access.
func (m *DIDManager) IsEnabled() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enabled
}

// GetIdentityPackage returns a pointer to the identity package if registered, or nil if disabled.
// Thread-safe: uses RWMutex.RLock() for concurrent read access.
func (m *DIDManager) GetIdentityPackage() *DIDIdentityPackage {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.enabled {
		return nil
	}
	return m.identityPackage
}
