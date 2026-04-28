package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Trigger and inbound event storage methods. Implementations use GORM so the
// same code path serves SQLite (local) and PostgreSQL (cloud) backends —
// schema differences are handled by the migration files and AutoMigrate.

// CreateTrigger inserts a new trigger row. Caller is responsible for assigning
// a unique ID; the dispatcher uses that ID as the public ingest URL slug.
func (ls *LocalStorage) CreateTrigger(ctx context.Context, t *types.Trigger) error {
	if t == nil {
		return errors.New("nil trigger")
	}
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	model, err := triggerToModel(t)
	if err != nil {
		return err
	}
	if model.CreatedAt.IsZero() {
		model.CreatedAt = time.Now().UTC()
	}
	model.UpdatedAt = time.Now().UTC()
	return gormDB.Create(&model).Error
}

// GetTrigger fetches a single trigger by ID.
func (ls *LocalStorage) GetTrigger(ctx context.Context, id string) (*types.Trigger, error) {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return nil, err
	}
	var model TriggerModel
	if err := gormDB.Where("id = ?", id).First(&model).Error; err != nil {
		return nil, err
	}
	return modelToTrigger(model)
}

// ListTriggers returns all triggers, optionally filtered by target node and source.
func (ls *LocalStorage) ListTriggers(ctx context.Context, targetNodeID, sourceName string) ([]*types.Trigger, error) {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return nil, err
	}
	q := gormDB.Model(&TriggerModel{})
	if targetNodeID != "" {
		q = q.Where("target_node_id = ?", targetNodeID)
	}
	if sourceName != "" {
		q = q.Where("source_name = ?", sourceName)
	}
	var rows []TriggerModel
	if err := q.Order("created_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]*types.Trigger, 0, len(rows))
	for _, r := range rows {
		t, err := modelToTrigger(r)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

// UpdateTrigger applies a partial update by writing all fields. Mutually
// exclusive with UpsertCodeManagedTrigger — code-managed triggers must not be
// edited through this path; the handler should reject UI updates on them.
func (ls *LocalStorage) UpdateTrigger(ctx context.Context, t *types.Trigger) error {
	if t == nil {
		return errors.New("nil trigger")
	}
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	model, err := triggerToModel(t)
	if err != nil {
		return err
	}
	model.UpdatedAt = time.Now().UTC()
	return gormDB.Where("id = ?", model.ID).Save(&model).Error
}

// DeleteTrigger removes a trigger by ID. Handlers must reject deletion of
// code-managed triggers — that check is at the HTTP layer, not here.
func (ls *LocalStorage) DeleteTrigger(ctx context.Context, id string) error {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	return gormDB.Where("id = ?", id).Delete(&TriggerModel{}).Error
}

// UpsertCodeManagedTrigger inserts or updates a code-managed trigger keyed by
// (target_node_id, target_reasoner, source_name). Called by the node-register
// handler for each declared TriggerBinding so re-registrations are idempotent.
// Returns the row's ID so the registration response can echo it back to the SDK.
//
// Sticky-pause rule (§5.3): when an existing row has manual_override_enabled
// = true, the upsert PRESERVES the row's Enabled value rather than letting
// the binding's value win. That's how operators can pause a misbehaving
// code-managed trigger via the UI without a code deploy resurrecting it.
//
// Re-registration also clears the orphaned flag and stamps last_registered_at.
func (ls *LocalStorage) UpsertCodeManagedTrigger(ctx context.Context, t *types.Trigger) (string, error) {
	if t == nil {
		return "", errors.New("nil trigger")
	}
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return "", err
	}
	model, err := triggerToModel(t)
	if err != nil {
		return "", err
	}
	model.ManagedBy = string(types.ManagedByCode)
	now := time.Now().UTC()
	model.UpdatedAt = now
	model.LastRegisteredAt = &now
	// A fresh registration always clears the orphan flag — the binding is
	// declared again so the row is no longer a vestige.
	model.Orphaned = false

	// Look for an existing code-managed row for this (node, reasoner, source).
	var existing TriggerModel
	err = gormDB.Where(
		"target_node_id = ? AND target_reasoner = ? AND source_name = ? AND managed_by = ?",
		model.TargetNodeID, model.TargetReasoner, model.SourceName, string(types.ManagedByCode),
	).First(&existing).Error
	switch {
	case err == nil:
		// Preserve ID and creation time, refresh everything else.
		model.ID = existing.ID
		model.CreatedAt = existing.CreatedAt
		// Sticky-pause: when the operator has explicitly overridden enabled
		// via the /pause endpoint, do NOT let re-registration flip it back.
		if existing.ManualOverrideEnabled {
			model.ManualOverrideEnabled = true
			model.ManualOverrideAt = existing.ManualOverrideAt
			model.Enabled = existing.Enabled
		}
		if err := gormDB.Save(&model).Error; err != nil {
			return "", err
		}
		return model.ID, nil
	case errors.Is(err, gorm.ErrRecordNotFound):
		if model.ID == "" {
			return "", errors.New("code-managed trigger requires caller-supplied ID for inserts")
		}
		model.CreatedAt = now
		if err := gormDB.Clauses(clause.OnConflict{DoNothing: true}).Create(&model).Error; err != nil {
			return "", err
		}
		return model.ID, nil
	default:
		return "", err
	}
}

// MarkOrphanedTriggers flips orphaned=true on every code-managed trigger for
// the given node whose (source_name, target_reasoner) tuple is NOT in
// declaredKeys. Caller (the registration handler) builds declaredKeys from the
// bindings the agent actually re-declared in this registration. Orphaned rows
// stop dispatching but the row + event history are preserved so the operator
// can decide to delete or convert-to-ui via the UI.
//
// declaredKeys items use the format "<source>:<reasoner>" — match what's used
// throughout the registration flow so callers don't have to reinvent it.
func (ls *LocalStorage) MarkOrphanedTriggers(ctx context.Context, nodeID string, declaredKeys []string) error {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	declared := make(map[string]struct{}, len(declaredKeys))
	for _, k := range declaredKeys {
		declared[k] = struct{}{}
	}
	var rows []TriggerModel
	if err := gormDB.Where(
		"target_node_id = ? AND managed_by = ? AND orphaned = ?",
		nodeID, string(types.ManagedByCode), false,
	).Find(&rows).Error; err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, r := range rows {
		key := r.SourceName + ":" + r.TargetReasoner
		if _, kept := declared[key]; kept {
			continue
		}
		// Decorator was removed in user code. Flip the flag; preserve
		// everything else so the events page can still render history.
		if err := gormDB.Model(&TriggerModel{}).
			Where("id = ?", r.ID).
			Updates(map[string]any{"orphaned": true, "updated_at": now}).Error; err != nil {
			return err
		}
	}
	return nil
}

// SetTriggerOverride flips the sticky-pause flag on a code-managed trigger
// (operator pressed pause/resume in the UI). When enabled=true and override=true,
// the row is paused and re-registration won't unpause it. Resume passes
// override=false to clear the override; the row's enabled value resets to the
// binding's last-declared value (caller is responsible for choosing the right
// post-resume Enabled — typically true).
func (ls *LocalStorage) SetTriggerOverride(ctx context.Context, triggerID string, override bool, enabled bool) error {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	updates := map[string]any{
		"manual_override_enabled": override,
		"enabled":                 enabled,
		"updated_at":              now,
	}
	if override {
		updates["manual_override_at"] = now
	} else {
		updates["manual_override_at"] = nil
	}
	return gormDB.Model(&TriggerModel{}).Where("id = ?", triggerID).Updates(updates).Error
}

// ConvertTriggerToUIManaged flips an orphaned code-managed trigger to UI-managed
// so the operator can edit/delete it via the UI without the next agent
// registration recreating it. Returns ErrRecordNotFound if no such row exists.
func (ls *LocalStorage) ConvertTriggerToUIManaged(ctx context.Context, triggerID string) error {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	res := gormDB.Model(&TriggerModel{}).
		Where("id = ? AND managed_by = ?", triggerID, string(types.ManagedByCode)).
		Updates(map[string]any{
			"managed_by": string(types.ManagedByUI),
			"orphaned":   false,
			"updated_at": now,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// InsertInboundEvent persists a received event. The unique index on
// (source_name, idempotency_key) means duplicate inserts return a constraint
// error — InboundEventExistsByIdempotency lets callers detect that case
// without relying on driver-specific error parsing.
func (ls *LocalStorage) InsertInboundEvent(ctx context.Context, e *types.InboundEvent) error {
	if e == nil {
		return errors.New("nil event")
	}
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	model := inboundEventToModel(e)
	if model.ReceivedAt.IsZero() {
		model.ReceivedAt = time.Now().UTC()
	}
	return gormDB.Create(&model).Error
}

// InboundEventExistsByIdempotency reports whether an event with the given
// (source_name, idempotency_key) is already persisted. Used for dedup before
// dispatching, since InsertInboundEvent will fail on the unique constraint
// for duplicates.
func (ls *LocalStorage) InboundEventExistsByIdempotency(ctx context.Context, sourceName, idempotencyKey string) (bool, error) {
	if idempotencyKey == "" {
		return false, nil
	}
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return false, err
	}
	var count int64
	if err := gormDB.Model(&InboundEventModel{}).
		Where("source_name = ? AND idempotency_key = ?", sourceName, idempotencyKey).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// GetInboundEvent fetches a stored event by ID.
func (ls *LocalStorage) GetInboundEvent(ctx context.Context, id string) (*types.InboundEvent, error) {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return nil, err
	}
	var model InboundEventModel
	if err := gormDB.Where("id = ?", id).First(&model).Error; err != nil {
		return nil, err
	}
	out := modelToInboundEvent(model)
	return &out, nil
}

// ListInboundEvents returns recent events for a trigger, newest first.
func (ls *LocalStorage) ListInboundEvents(ctx context.Context, triggerID string, limit int) ([]*types.InboundEvent, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return nil, err
	}
	var rows []InboundEventModel
	if err := gormDB.Where("trigger_id = ?", triggerID).
		Order("received_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]*types.InboundEvent, 0, len(rows))
	for _, r := range rows {
		ev := modelToInboundEvent(r)
		out = append(out, &ev)
	}
	return out, nil
}

// MarkInboundEventProcessed updates an event's status after dispatch finishes.
// vcID may be empty when DID/VC issuance is disabled or not yet wired.
func (ls *LocalStorage) MarkInboundEventProcessed(ctx context.Context, id, status, errorMessage, vcID string) error {
	gormDB, err := ls.gormWithContext(ctx)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	updates := map[string]any{
		"status":       status,
		"processed_at": now,
	}
	if errorMessage != "" {
		updates["error_message"] = errorMessage
	}
	if vcID != "" {
		updates["vc_id"] = vcID
	}
	return gormDB.Model(&InboundEventModel{}).Where("id = ?", id).Updates(updates).Error
}

// triggerToModel marshals a domain Trigger into its persistence form.
func triggerToModel(t *types.Trigger) (TriggerModel, error) {
	cfg := strings.TrimSpace(string(t.Config))
	if cfg == "" {
		cfg = "{}"
	}
	types_ := t.EventTypes
	if types_ == nil {
		types_ = []string{}
	}
	typesJSON, err := json.Marshal(types_)
	if err != nil {
		return TriggerModel{}, fmt.Errorf("marshal event_types: %w", err)
	}
	managed := string(t.ManagedBy)
	if managed == "" {
		managed = string(types.ManagedByUI)
	}
	var codeOrigin *string
	if t.CodeOrigin != "" {
		v := t.CodeOrigin
		codeOrigin = &v
	}
	return TriggerModel{
		ID:                    t.ID,
		SourceName:            t.SourceName,
		ConfigJSON:            cfg,
		SecretEnvVar:          t.SecretEnvVar,
		TargetNodeID:          t.TargetNodeID,
		TargetReasoner:        t.TargetReasoner,
		EventTypes:            string(typesJSON),
		ManagedBy:             managed,
		Enabled:               t.Enabled,
		CreatedAt:             t.CreatedAt,
		UpdatedAt:              t.UpdatedAt,
		ManualOverrideEnabled: t.ManualOverrideEnabled,
		ManualOverrideAt:      t.ManualOverrideAt,
		CodeOrigin:            codeOrigin,
		LastRegisteredAt:      t.LastRegisteredAt,
		Orphaned:              t.Orphaned,
	}, nil
}

func modelToTrigger(m TriggerModel) (*types.Trigger, error) {
	var eventTypes []string
	if m.EventTypes != "" {
		if err := json.Unmarshal([]byte(m.EventTypes), &eventTypes); err != nil {
			return nil, fmt.Errorf("decode event_types: %w", err)
		}
	}
	cfg := json.RawMessage(m.ConfigJSON)
	if len(cfg) == 0 {
		cfg = json.RawMessage("{}")
	}
	codeOrigin := ""
	if m.CodeOrigin != nil {
		codeOrigin = *m.CodeOrigin
	}
	return &types.Trigger{
		ID:                    m.ID,
		SourceName:            m.SourceName,
		Config:                cfg,
		SecretEnvVar:          m.SecretEnvVar,
		TargetNodeID:          m.TargetNodeID,
		TargetReasoner:        m.TargetReasoner,
		EventTypes:            eventTypes,
		ManagedBy:             types.ManagedBy(m.ManagedBy),
		Enabled:               m.Enabled,
		CreatedAt:             m.CreatedAt,
		UpdatedAt:             m.UpdatedAt,
		ManualOverrideEnabled: m.ManualOverrideEnabled,
		ManualOverrideAt:      m.ManualOverrideAt,
		CodeOrigin:            codeOrigin,
		LastRegisteredAt:      m.LastRegisteredAt,
		Orphaned:              m.Orphaned,
	}, nil
}

func inboundEventToModel(e *types.InboundEvent) InboundEventModel {
	return InboundEventModel{
		ID:                e.ID,
		TriggerID:         e.TriggerID,
		SourceName:        e.SourceName,
		EventType:         e.EventType,
		RawPayload:        string(e.RawPayload),
		NormalizedPayload: string(e.NormalizedPayload),
		IdempotencyKey:    e.IdempotencyKey,
		VCID:              e.VCID,
		Status:            e.Status,
		ErrorMessage:      e.ErrorMessage,
		ReceivedAt:        e.ReceivedAt,
		ProcessedAt:       e.ProcessedAt,
	}
}

func modelToInboundEvent(m InboundEventModel) types.InboundEvent {
	return types.InboundEvent{
		ID:                m.ID,
		TriggerID:         m.TriggerID,
		SourceName:        m.SourceName,
		EventType:         m.EventType,
		RawPayload:        json.RawMessage(m.RawPayload),
		NormalizedPayload: json.RawMessage(m.NormalizedPayload),
		IdempotencyKey:    m.IdempotencyKey,
		VCID:              m.VCID,
		Status:            m.Status,
		ErrorMessage:      m.ErrorMessage,
		ReceivedAt:        m.ReceivedAt,
		ProcessedAt:       m.ProcessedAt,
	}
}
