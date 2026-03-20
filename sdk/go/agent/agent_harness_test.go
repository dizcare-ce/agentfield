package agent

import (
	"context"
	"strings"
	"testing"

	"github.com/Agent-Field/agentfield/sdk/go/harness"
)

func TestAgentAcceptsHarnessConfig(t *testing.T) {
	hc := &HarnessConfig{
		Provider: "claude-code",
		Model:    "sonnet",
	}

	a, err := New(Config{
		NodeID:        "test-agent",
		Version:       "v1",
		HarnessConfig: hc,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if a.cfg.HarnessConfig != hc {
		t.Errorf("expected harness config to be identical")
	}
}

func TestHarnessRunnerLazyInit(t *testing.T) {
	hc := &HarnessConfig{
		Provider: "claude-code",
	}

	a, _ := New(Config{
		NodeID:        "test-agent",
		Version:       "v1",
		HarnessConfig: hc,
	})

	if a.harnessRunner != nil {
		t.Errorf("expected harness runner to be nil initially")
	}

	runner := a.HarnessRunner()
	if runner == nil {
		t.Fatalf("expected harness runner to be created")
	}

	if a.harnessRunner != runner {
		t.Errorf("expected harness runner to be cached")
	}

	if runner.DefaultOptions.Provider != "claude-code" {
		t.Errorf("expected provider to be propagated")
	}
}

func TestHarnessRunnerWithoutConfig(t *testing.T) {
	a, _ := New(Config{
		NodeID:  "test-agent",
		Version: "v1",
	})

	runner := a.HarnessRunner()
	if runner == nil {
		t.Fatalf("expected harness runner to be created even without config")
	}

	if runner.DefaultOptions.Provider != "" {
		t.Errorf("expected empty provider")
	}
}

func TestHarnessConfigPropagatesAllFields(t *testing.T) {
	hc := &HarnessConfig{
		Provider:         "opencode",
		Model:            "model-1",
		MaxTurns:         5,
		PermissionMode:   "auto",
		SystemPrompt:     "you are a helpful bot",
		Env:              map[string]string{"A": "B"},
		Cwd:              "/tmp",
		ProjectDir:       "/proj",
		Tools:            []string{"bash"},
		MaxBudgetUSD:     1.5,
		ResumeSessionID:  "session-1",
		BinPath:          "/bin/opencode",
		Timeout:          100,
		MaxRetries:       2,
		InitialDelay:     0.5,
		MaxDelay:         5.0,
		BackoffFactor:    1.5,
		SchemaMaxRetries: 1,
	}

	a, _ := New(Config{
		NodeID:        "test-agent",
		Version:       "v1",
		HarnessConfig: hc,
	})

	runner := a.HarnessRunner()
	opts := runner.DefaultOptions

	if opts.Provider != hc.Provider {
		t.Errorf("expected Provider %q, got %q", hc.Provider, opts.Provider)
	}
	if opts.Model != hc.Model {
		t.Errorf("expected Model %q, got %q", hc.Model, opts.Model)
	}
	if opts.MaxTurns != hc.MaxTurns {
		t.Errorf("expected MaxTurns %d, got %d", hc.MaxTurns, opts.MaxTurns)
	}
	if opts.PermissionMode != hc.PermissionMode {
		t.Errorf("expected PermissionMode %q, got %q", hc.PermissionMode, opts.PermissionMode)
	}
	if opts.SystemPrompt != hc.SystemPrompt {
		t.Errorf("expected SystemPrompt %q, got %q", hc.SystemPrompt, opts.SystemPrompt)
	}
	if opts.Env["A"] != "B" {
		t.Errorf("expected Env['A'] == 'B'")
	}
	if opts.Cwd != hc.Cwd {
		t.Errorf("expected Cwd %q, got %q", hc.Cwd, opts.Cwd)
	}
	if opts.ProjectDir != hc.ProjectDir {
		t.Errorf("expected ProjectDir %q, got %q", hc.ProjectDir, opts.ProjectDir)
	}
	if len(opts.Tools) != 1 || opts.Tools[0] != hc.Tools[0] {
		t.Errorf("expected Tools %v, got %v", hc.Tools, opts.Tools)
	}
	if opts.MaxBudgetUSD != hc.MaxBudgetUSD {
		t.Errorf("expected MaxBudgetUSD %f, got %f", hc.MaxBudgetUSD, opts.MaxBudgetUSD)
	}
	if opts.ResumeSessionID != hc.ResumeSessionID {
		t.Errorf("expected ResumeSessionID %q, got %q", hc.ResumeSessionID, opts.ResumeSessionID)
	}
	if opts.BinPath != hc.BinPath {
		t.Errorf("expected BinPath %q, got %q", hc.BinPath, opts.BinPath)
	}
	if opts.Timeout != hc.Timeout {
		t.Errorf("expected Timeout %d, got %d", hc.Timeout, opts.Timeout)
	}
	if opts.MaxRetries != hc.MaxRetries {
		t.Errorf("expected MaxRetries %d, got %d", hc.MaxRetries, opts.MaxRetries)
	}
	if opts.InitialDelay != hc.InitialDelay {
		t.Errorf("expected InitialDelay %f, got %f", hc.InitialDelay, opts.InitialDelay)
	}
	if opts.MaxDelay != hc.MaxDelay {
		t.Errorf("expected MaxDelay %f, got %f", hc.MaxDelay, opts.MaxDelay)
	}
	if opts.BackoffFactor != hc.BackoffFactor {
		t.Errorf("expected BackoffFactor %f, got %f", hc.BackoffFactor, opts.BackoffFactor)
	}
	if opts.SchemaMaxRetries != hc.SchemaMaxRetries {
		t.Errorf("expected SchemaMaxRetries %d, got %d", hc.SchemaMaxRetries, opts.SchemaMaxRetries)
	}
}

// Ensure Harness method passes schema, prompt and options correctly to HarnessRunner.
func TestHarnessPassesOptionsToRunner(t *testing.T) {
	a, _ := New(Config{
		NodeID:  "test-agent",
		Version: "v1",
	})

	ctx := context.Background()
	prompt := "Test prompt"
	var dest map[string]interface{}
	
	opts := harness.Options{
		Provider: "non-existent-provider",
	}

	_, err := a.Harness(ctx, prompt, nil, &dest, opts)
	if err == nil {
		t.Fatal("Expected an error from runner.Run for non-existent provider, got nil")
	}

	expectedSubstrings := []string{"unsupported provider", "non-existent-provider"}
	errStr := err.Error()
	matched := false
	for _, sub := range expectedSubstrings {
		if errStr != "" && strings.Contains(errStr, sub) {
			matched = true
			break
		}
	}
	if !matched {
		t.Errorf("Expected error to contain one of %v, got %q", expectedSubstrings, errStr)
	}
}
