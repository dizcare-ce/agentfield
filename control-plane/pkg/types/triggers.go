package types

import (
	"encoding/json"
	"time"
)

// ManagedBy distinguishes triggers declared in agent code (auto-created on
// node registration; UI cannot delete) from triggers created through the
// Triggers UI.
type ManagedBy string

const (
	ManagedByCode ManagedBy = "code"
	ManagedByUI   ManagedBy = "ui"
)

// Trigger is a binding between a Source and a target reasoner. It carries
// per-instance config (Source-specific JSON), an env-var name from which the
// dispatcher reads the provider secret at request time, and the target
// reasoner the dispatcher invokes when the source emits an event.
type Trigger struct {
	ID             string          `json:"id"`
	SourceName     string          `json:"source_name"`
	Config         json.RawMessage `json:"config"`
	SecretEnvVar   string          `json:"secret_env_var"`
	TargetNodeID   string          `json:"target_node_id"`
	TargetReasoner string          `json:"target_reasoner"`
	EventTypes     []string        `json:"event_types"`
	ManagedBy      ManagedBy       `json:"managed_by"`
	Enabled        bool            `json:"enabled"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// InboundEvent is one persisted event delivery. The control plane stores every
// event before dispatch so failed deliveries can be replayed and the audit
// trail stays intact even when downstream agents are unavailable.
type InboundEvent struct {
	ID                string          `json:"id"`
	TriggerID         string          `json:"trigger_id"`
	SourceName        string          `json:"source_name"`
	EventType         string          `json:"event_type"`
	RawPayload        json.RawMessage `json:"raw_payload"`
	NormalizedPayload json.RawMessage `json:"normalized_payload"`
	IdempotencyKey    string          `json:"idempotency_key"`
	VCID              string          `json:"vc_id,omitempty"`
	Status            string          `json:"status"`
	ErrorMessage      string          `json:"error_message,omitempty"`
	ReceivedAt        time.Time       `json:"received_at"`
	ProcessedAt       *time.Time      `json:"processed_at,omitempty"`
}

const (
	InboundEventStatusReceived   = "received"
	InboundEventStatusDispatched = "dispatched"
	InboundEventStatusFailed     = "failed"
	InboundEventStatusReplayed   = "replayed"
)

// TriggerBinding is the registration-time payload an agent sends to declare a
// code-managed trigger for one of its reasoners. The control plane upserts a
// Trigger row keyed by (target_node_id, target_reasoner, source_name) so
// subsequent registrations are idempotent.
type TriggerBinding struct {
	Source       string          `json:"source"`
	EventTypes   []string        `json:"event_types,omitempty"`
	Config       json.RawMessage `json:"config,omitempty"`
	SecretEnvVar string          `json:"secret_env_var,omitempty"`
}
