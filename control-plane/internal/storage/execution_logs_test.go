package storage

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
)

func TestExecutionLogStorage_ListAndPrune(t *testing.T) {
	ls, ctx := setupLocalStorage(t)

	oldTS := time.Now().UTC().Add(-3 * time.Hour)
	newerTS := time.Now().UTC().Add(-30 * time.Minute)

	entries := []*types.ExecutionLogEntry{
		{
			ExecutionID:     "exec-logs-1",
			WorkflowID:      "wf-logs-1",
			AgentNodeID:     "agent-a",
			Level:           "info",
			Source:          "sdk.runtime",
			Message:         "started",
			SystemGenerated: true,
			EmittedAt:       oldTS,
			Attributes:      json.RawMessage(`{"step":"start"}`),
		},
		{
			ExecutionID: "exec-logs-1",
			WorkflowID:  "wf-logs-1",
			AgentNodeID: "agent-a",
			ReasonerID:  testStringPtr("reasoner-x"),
			Level:       "debug",
			Source:      "sdk.app",
			Message:     "progress",
			EmittedAt:   newerTS,
		},
		{
			ExecutionID: "exec-logs-1",
			WorkflowID:  "wf-logs-1",
			AgentNodeID: "agent-b",
			Level:       "error",
			Source:      "sdk.runtime",
			Message:     "failed",
			EmittedAt:   time.Now().UTC(),
		},
	}

	for _, entry := range entries {
		if err := ls.StoreExecutionLogEntry(ctx, entry); err != nil {
			t.Fatalf("store execution log entry: %v", err)
		}
	}

	all, err := ls.ListExecutionLogEntries(ctx, "exec-logs-1", nil, 10, nil, nil, nil, "")
	if err != nil {
		t.Fatalf("list execution log entries: %v", err)
	}
	if got := len(all); got != 3 {
		t.Fatalf("expected 3 entries, got %d", got)
	}
	for i, entry := range all {
		expectedSeq := int64(i + 1)
		if entry.Sequence != expectedSeq {
			t.Fatalf("expected sequence %d, got %d", expectedSeq, entry.Sequence)
		}
	}

	filtered, err := ls.ListExecutionLogEntries(ctx, "exec-logs-1", nil, 10, []string{"error"}, []string{"agent-b"}, []string{"sdk.runtime"}, "fail")
	if err != nil {
		t.Fatalf("list filtered execution log entries: %v", err)
	}
	if len(filtered) != 1 || filtered[0].Message != "failed" {
		t.Fatalf("expected filtered error entry, got %#v", filtered)
	}

	if err := ls.PruneExecutionLogEntries(ctx, "exec-logs-1", 2, time.Now().UTC().Add(-2*time.Hour)); err != nil {
		t.Fatalf("prune execution log entries: %v", err)
	}

	pruned, err := ls.ListExecutionLogEntries(ctx, "exec-logs-1", nil, 10, nil, nil, nil, "")
	if err != nil {
		t.Fatalf("list pruned execution log entries: %v", err)
	}
	if got := len(pruned); got != 2 {
		t.Fatalf("expected 2 entries after prune, got %d", got)
	}
	if pruned[0].Sequence != 2 || pruned[1].Sequence != 3 {
		t.Fatalf("expected sequences [2 3] after prune, got [%d %d]", pruned[0].Sequence, pruned[1].Sequence)
	}
}

func testStringPtr(value string) *string {
	return &value
}
