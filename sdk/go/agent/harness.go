package agent

import (
	"context"

	"github.com/Agent-Field/agentfield/sdk/go/harness"
)

// harness.go integrates the harness package with the Agent struct,
// providing lazy initialization and a convenience Harness() method.
// HarnessConfig configures the default harness runner for the agent.
type HarnessConfig struct {
	// Provider is the default provider: "opencode" or "claude-code".
	Provider string

	// Model is the default model identifier.
	Model string

	// MaxTurns is the default max agent iterations.
	MaxTurns int

	// PermissionMode is the default permission mode ("auto", "plan").
	PermissionMode string

	// SystemPrompt is prepended to the user prompt.
	SystemPrompt string

	// Env is additional environment variables for the subprocess.
	Env map[string]string

	// Cwd is the working directory for the subprocess.
	Cwd string

	// ProjectDir is the project root the coding agent explores.
	ProjectDir string

	// Tools is a list of allowed tools for the agent.
	Tools []string

	// MaxBudgetUSD is a cost cap (provider-dependent).
	MaxBudgetUSD float64

	// ResumeSessionID resumes a previous session (provider-dependent).
	ResumeSessionID string

	// BinPath overrides the provider binary path.
	BinPath string

	// Timeout in seconds for the subprocess. Default 600.
	Timeout int

	// MaxRetries for transient errors. Default 3.
	MaxRetries int

	// InitialDelay in seconds for retry backoff. Default 1.0.
	InitialDelay float64

	// MaxDelay in seconds for retry backoff. Default 30.0.
	MaxDelay float64

	// BackoffFactor for retry backoff. Default 2.0.
	BackoffFactor float64

	// SchemaMaxRetries for schema validation failures. Default 2.
	SchemaMaxRetries int
}

// HarnessRunner returns the agent's lazily-initialized harness runner.
func (a *Agent) HarnessRunner() *harness.Runner {
	a.initMu.Lock()
	defer a.initMu.Unlock()
	if a.harnessRunner == nil {
		opts := harness.Options{}
		if a.cfg.HarnessConfig != nil {
			hc := a.cfg.HarnessConfig
			opts.Provider = hc.Provider
			opts.Model = hc.Model
			opts.MaxTurns = hc.MaxTurns
			opts.PermissionMode = hc.PermissionMode
			opts.SystemPrompt = hc.SystemPrompt
			opts.Env = hc.Env
			opts.Cwd = hc.Cwd
			opts.ProjectDir = hc.ProjectDir
			opts.Tools = hc.Tools
			opts.MaxBudgetUSD = hc.MaxBudgetUSD
			opts.ResumeSessionID = hc.ResumeSessionID
			opts.BinPath = hc.BinPath
			opts.Timeout = hc.Timeout
			opts.MaxRetries = hc.MaxRetries
			opts.InitialDelay = hc.InitialDelay
			opts.MaxDelay = hc.MaxDelay
			opts.BackoffFactor = hc.BackoffFactor
			opts.SchemaMaxRetries = hc.SchemaMaxRetries
		}
		a.harnessRunner = harness.NewRunner(opts)
	}
	return a.harnessRunner
}

// Harness dispatches a task to an external coding agent and returns structured results.
//
// Works like .ai() but delegates to a coding agent that can read, write, and edit
// files with optional schema-constrained output.
//
// Parameters:
//   - prompt: Task description for the coding agent.
//   - schema: JSON Schema as map[string]any (nil for unstructured output).
//   - dest: Pointer to struct for schema validation (nil if schema is nil).
//   - opts: Per-call option overrides for the harness runner (schema, model, provider, etc.).
//
// Returns a harness.Result with .Text (text) and .Parsed (validated schema) properties.
func (a *Agent) Harness(ctx context.Context, prompt string, schema map[string]any, dest any, opts harness.Options) (*harness.Result, error) {
	return a.HarnessRunner().Run(ctx, prompt, schema, dest, opts)
}
