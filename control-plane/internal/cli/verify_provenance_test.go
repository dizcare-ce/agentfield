package cli

import (
	"encoding/json"
	"testing"

	"github.com/Agent-Field/agentfield/control-plane/pkg/types"
)

func TestVerifyProvenanceJSON_LegacyChainEmptyComponents(t *testing.T) {
	legacy := types.WorkflowVCChainResponse{
		WorkflowID:   "wf-empty",
		ComponentVCs: []types.ExecutionVC{},
		WorkflowVC:   types.WorkflowVC{WorkflowID: "wf-empty"},
		Status:       "completed",
	}
	raw, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	res := VerifyProvenanceJSON(raw, VerifyOptions{})
	if res.FormatValid != true || res.Type != "workflow" {
		t.Fatalf("expected workflow parse, got type=%q formatValid=%v", res.Type, res.FormatValid)
	}
}

func TestVerifyProvenanceJSON_InvalidJSON(t *testing.T) {
	res := VerifyProvenanceJSON([]byte(`not json`), VerifyOptions{})
	if res.FormatValid || res.Valid {
		t.Fatalf("expected invalid")
	}
}
