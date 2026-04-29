package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
)

// InsertConnectorInvocation persists a connector invocation record.
func (ls *LocalStorage) InsertConnectorInvocation(ctx context.Context, invocation *types.ConnectorInvocation) error {
	if invocation == nil {
		return fmt.Errorf("connector invocation is nil")
	}
	if invocation.ID == "" {
		return fmt.Errorf("invocation id is required")
	}
	if invocation.RunID == "" {
		return fmt.Errorf("run_id is required")
	}

	db := ls.requireSQLDB()
	now := time.Now().UTC()

	_, err := db.ExecContext(ctx, `
		INSERT INTO connector_invocations (
			id, run_id, execution_id, agent_node_id,
			connector_name, operation_name, inputs_redacted,
			status, http_status, error_message, duration_ms,
			started_at, completed_at, parent_vc_id, invocation_vc_id,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		invocation.ID,
		invocation.RunID,
		invocation.ExecutionID,
		invocation.AgentNodeID,
		invocation.ConnectorName,
		invocation.OperationName,
		invocation.InputsRedacted,
		invocation.Status,
		invocation.HTTPStatus,
		invocation.ErrorMessage,
		invocation.DurationMS,
		invocation.StartedAt,
		invocation.CompletedAt,
		invocation.ParentVCID,
		invocation.InvocationVCID,
		now,
		now,
	)

	if err != nil {
		return fmt.Errorf("insert connector invocation: %w", err)
	}

	return nil
}

// UpdateConnectorInvocation updates the completion state of a connector invocation.
func (ls *LocalStorage) UpdateConnectorInvocation(ctx context.Context, id, status, errorMessage string, httpStatus *int, durationMS int64, completedAt time.Time) error {
	if id == "" {
		return fmt.Errorf("invocation id is required")
	}
	if status == "" {
		return fmt.Errorf("status is required")
	}

	db := ls.requireSQLDB()
	now := time.Now().UTC()

	var httpStatusVal sql.NullInt64
	if httpStatus != nil {
		httpStatusVal = sql.NullInt64{Int64: int64(*httpStatus), Valid: true}
	}

	var durationVal sql.NullInt64
	if durationMS > 0 {
		durationVal = sql.NullInt64{Int64: durationMS, Valid: true}
	}

	result, err := db.ExecContext(ctx, `
		UPDATE connector_invocations
		SET status = ?, error_message = ?, http_status = ?, duration_ms = ?, completed_at = ?, updated_at = ?
		WHERE id = ?
	`, status, errorMessage, httpStatusVal, durationVal, completedAt, now, id)

	if err != nil {
		return fmt.Errorf("update connector invocation: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check rows affected: %w", err)
	}

	if rows == 0 {
		return fmt.Errorf("connector invocation not found: %s", id)
	}

	return nil
}

// ListConnectorInvocations retrieves connector invocations. When runID is
// empty, returns the most recent 100 across all runs (newest first); when
// provided, returns all invocations for that run ordered chronologically.
func (ls *LocalStorage) ListConnectorInvocations(ctx context.Context, runID string) ([]*types.ConnectorInvocation, error) {
	db := ls.requireSQLDB()

	var (
		query string
		rows  *sql.Rows
		err   error
	)
	if runID == "" {
		query = `
			SELECT id, run_id, execution_id, agent_node_id,
			       connector_name, operation_name, inputs_redacted,
			       status, http_status, error_message, duration_ms,
			       started_at, completed_at, parent_vc_id, invocation_vc_id,
			       created_at, updated_at
			FROM connector_invocations
			ORDER BY started_at DESC
			LIMIT 100
		`
		rows, err = db.QueryContext(ctx, query)
	} else {
		query = `
			SELECT id, run_id, execution_id, agent_node_id,
			       connector_name, operation_name, inputs_redacted,
			       status, http_status, error_message, duration_ms,
			       started_at, completed_at, parent_vc_id, invocation_vc_id,
			       created_at, updated_at
			FROM connector_invocations
			WHERE run_id = ?
			ORDER BY started_at ASC
		`
		rows, err = db.QueryContext(ctx, query, runID)
	}
	if err != nil {
		return nil, fmt.Errorf("query connector invocations: %w", err)
	}
	defer rows.Close()

	var invocations []*types.ConnectorInvocation
	for rows.Next() {
		var (
			inv               types.ConnectorInvocation
			httpStatus        sql.NullInt64
			durationMS        sql.NullInt64
			completedAt       sql.NullTime
			createdAt, updatedAt time.Time
		)

		err := rows.Scan(
			&inv.ID, &inv.RunID, &inv.ExecutionID, &inv.AgentNodeID,
			&inv.ConnectorName, &inv.OperationName, &inv.InputsRedacted,
			&inv.Status, &httpStatus, &inv.ErrorMessage, &durationMS,
			&inv.StartedAt, &completedAt, &inv.ParentVCID, &inv.InvocationVCID,
			&createdAt, &updatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan connector invocation: %w", err)
		}

		if httpStatus.Valid {
			val := int(httpStatus.Int64)
			inv.HTTPStatus = &val
		}

		if durationMS.Valid {
			inv.DurationMS = &durationMS.Int64
		}

		if completedAt.Valid {
			inv.CompletedAt = &completedAt.Time
		}

		invocations = append(invocations, &inv)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return invocations, nil
}
