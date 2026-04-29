// Command connector-try invokes connector operations from the
// command line. Three modes: list (catalog), describe (op signature),
// and run (live API call, optionally dry-run or routed at a mock base).
//
// Examples:
//
//	connector-try list
//	connector-try describe slack chat_post_message
//	connector-try slack chat_post_message --input '{"channel":"C123","text":"hi"}' --dry-run
//	connector-try slack chat_post_message --input @msg.json
//	connector-try notion query_database --input '...' --base http://localhost:4010
//	cat input.json | connector-try notion create_page --input -
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/connectors"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/auth"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/manifest"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/paginate"
)

const usage = `connector-try — invoke AgentField connectors from the CLI

USAGE
  connector-try list
  connector-try describe <connector> <operation>
  connector-try <connector> <operation> [flags]

FLAGS (run mode)
  --input STRING    JSON inputs. Use "@file.json" to load from file, "-" for stdin.
  --dry-run         Build the HTTP request, print it, don't send.
  --base URL        Override the base URL (e.g. http://localhost:4010 for a Prism mock).
                    Replaces the host portion of every op URL in the connector.
  --verbose, -v     Show response headers and full body (default: response only).
  --env-file PATH   Load env vars from this file before reading auth.secret_env.

ENV
  Each connector reads its credential from a connector-specific env var
  (auth.secret_env in the manifest). Use 'describe' to see which one.

EXIT CODES
  0  success
  1  CLI usage error
  2  connector or operation not found
  3  invocation failed (network, auth, validation)
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(1)
	}
	switch os.Args[1] {
	case "list":
		cmdList()
	case "describe":
		cmdDescribe(os.Args[2:])
	case "-h", "--help", "help":
		fmt.Println(usage)
	default:
		cmdRun(os.Args[1:])
	}
}

func mustRegistry() *manifest.Registry {
	reg, err := manifest.LoadEmbedded()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load embedded manifests: %v\n", err)
		os.Exit(3)
	}
	return reg
}

// ─── list ──────────────────────────────────────────────────────────────

func cmdList() {
	reg := mustRegistry()
	names := []string{}
	for _, m := range reg.All() {
		names = append(names, m.Name)
	}
	sort.Strings(names)

	for _, name := range names {
		m, _ := reg.Get(name)
		fmt.Printf("%s — %s (%s)\n", m.Name, m.Display, m.Auth.SecretEnv)
		opNames := []string{}
		for op := range m.Operations {
			opNames = append(opNames, op)
		}
		sort.Strings(opNames)
		for _, op := range opNames {
			o := m.Operations[op]
			fmt.Printf("  %-30s  %-6s  %s\n", op, o.Method, truncate(o.Display, 60))
		}
		fmt.Println()
	}
}

// ─── describe ──────────────────────────────────────────────────────────

func cmdDescribe(args []string) {
	if len(args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: connector-try describe <connector> <operation>")
		os.Exit(1)
	}
	reg := mustRegistry()
	op, m, ok := reg.Operation(args[0], args[1])
	if !ok {
		fmt.Fprintf(os.Stderr, "operation %s/%s not found\n", args[0], args[1])
		os.Exit(2)
	}

	fmt.Printf("Connector:  %s (%s)\n", m.Name, m.Display)
	fmt.Printf("Operation:  %s — %s\n", args[1], op.Display)
	fmt.Printf("Method:     %s\n", op.Method)
	fmt.Printf("URL:        %s\n", op.URL)
	fmt.Printf("Auth:       %s (env: %s)\n", m.Auth.Strategy, m.Auth.SecretEnv)
	if op.Description != "" {
		fmt.Printf("\n%s\n", strings.TrimSpace(op.Description))
	}

	if len(op.Inputs) > 0 {
		fmt.Println("\nInputs:")
		names := []string{}
		for n := range op.Inputs {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, n := range names {
			in := op.Inputs[n]
			req := ""
			if in.Default != nil {
				req = fmt.Sprintf(" (default: %v)", in.Default)
			}
			fmt.Printf("  %s: %s [%s]%s — %s\n", n, in.Type, in.In, req, in.Description)
		}
	}

	if op.Output.Type != "" {
		fmt.Printf("\nOutput type: %s\n", op.Output.Type)
		if len(op.Output.Schema) > 0 {
			keys := []string{}
			for k := range op.Output.Schema {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			fmt.Println("Output fields:")
			for _, k := range keys {
				fmt.Printf("  %s\n", k)
			}
		}
	}

	if exampleInput := exampleInputJSON(op); exampleInput != "" {
		fmt.Printf("\nExample input:\n  --input '%s'\n", exampleInput)
	}
}

// exampleInputJSON builds a minimal JSON skeleton from declared examples
// or zero values for required (no-default) inputs.
func exampleInputJSON(op *manifest.Operation) string {
	if len(op.Inputs) == 0 {
		return ""
	}
	skel := map[string]interface{}{}
	for name, in := range op.Inputs {
		if in.Default != nil {
			continue
		}
		if in.Example != nil {
			skel[name] = in.Example
			continue
		}
		switch in.Type {
		case "string":
			skel[name] = "..."
		case "integer":
			skel[name] = 0
		case "boolean":
			skel[name] = false
		case "array":
			skel[name] = []interface{}{}
		case "object":
			skel[name] = map[string]interface{}{}
		}
	}
	if len(skel) == 0 {
		return ""
	}
	b, _ := json.Marshal(skel)
	return string(b)
}

// ─── run ───────────────────────────────────────────────────────────────

func cmdRun(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	inputStr := fs.String("input", "", "JSON inputs (literal, @file, or -)")
	dryRun := fs.Bool("dry-run", false, "print request, don't send")
	base := fs.String("base", "", "override base URL (host) for every op in this connector")
	verbose := fs.Bool("verbose", false, "show response headers and body")
	fs.BoolVar(verbose, "v", false, "shorthand for --verbose")
	envFile := fs.String("env-file", "", "load env vars from this dotenv-style file")

	if err := fs.Parse(args[2:]); err != nil {
		os.Exit(1)
	}
	connector := args[0]
	operation := args[1]

	if *envFile != "" {
		if err := loadEnvFile(*envFile); err != nil {
			fmt.Fprintf(os.Stderr, "load env file: %v\n", err)
			os.Exit(1)
		}
	}

	inputs, err := parseInputs(*inputStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse --input: %v\n", err)
		os.Exit(1)
	}

	reg := mustRegistry()
	if *base != "" {
		if err := rewriteBase(reg, connector, *base); err != nil {
			fmt.Fprintf(os.Stderr, "rewrite base: %v\n", err)
			os.Exit(2)
		}
	}

	op, m, ok := reg.Operation(connector, operation)
	if !ok {
		fmt.Fprintf(os.Stderr, "operation %s/%s not found\n", connector, operation)
		os.Exit(2)
	}

	if *dryRun {
		runDryRun(connector, operation, op, m, inputs, *verbose)
		return
	}

	// Live mode — verify auth secret is set up front for a clearer error.
	if m.Auth.SecretEnv != "" && os.Getenv(m.Auth.SecretEnv) == "" {
		fmt.Fprintf(os.Stderr, "auth: env var %s is not set. Either export it or pass --env-file.\n", m.Auth.SecretEnv)
		os.Exit(3)
	}

	executor := connectors.NewExecutor(reg, auth.NewRegistry(), paginate.NewRegistry(), &connectors.NoopAuditor{})
	if *verbose {
		executor.SetHTTPClient(verboseClient())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := executor.Invoke(ctx, connector, operation, inputs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "invoke: %v\n", err)
		os.Exit(3)
	}
	out, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(out))
}

// runDryRun installs a fake transport that captures every outgoing request,
// prints it, and short-circuits with an empty 200 response. We then run the
// normal executor path so URL templating, auth, header injection, and body
// building all execute the same code as production.
func runDryRun(connector, operation string, op *manifest.Operation, m *manifest.Manifest, inputs map[string]interface{}, verbose bool) {
	captured := &http.Request{}
	transport := roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		*captured = *r
		// Body must be consumable; copy so we can print it.
		if r.Body != nil {
			b, _ := io.ReadAll(r.Body)
			captured.Body = io.NopCloser(bytes.NewReader(b))
			r.Body = io.NopCloser(bytes.NewReader(b))
		}
		return &http.Response{
			StatusCode: 200,
			Body:       io.NopCloser(strings.NewReader(`{"_dry_run":true}`)),
			Header:     http.Header{"Content-Type": []string{"application/json"}},
		}, nil
	})

	// If auth env var isn't set, set a placeholder so we can see what auth
	// header WOULD be attached.
	cleanupEnv := func() {}
	if m.Auth.SecretEnv != "" && os.Getenv(m.Auth.SecretEnv) == "" {
		_ = os.Setenv(m.Auth.SecretEnv, "DRY_RUN_PLACEHOLDER_TOKEN")
		cleanupEnv = func() { _ = os.Unsetenv(m.Auth.SecretEnv) }
	}
	defer cleanupEnv()

	executor := connectors.NewExecutor(mustRegistryWithExisting(op, m), auth.NewRegistry(), paginate.NewRegistry(), &connectors.NoopAuditor{})
	executor.SetHTTPClient(&http.Client{Transport: transport, Timeout: 5 * time.Second})

	_, err := executor.Invoke(context.Background(), connector, operation, inputs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "build request: %v\n", err)
		os.Exit(3)
	}

	// Manually format request — DumpRequestOut runs a roundtripper that
	// fails on canceled contexts.
	fmt.Println(redactAuth(formatRequest(captured)))

	if verbose {
		fmt.Println("\n--- equivalent curl ---")
		fmt.Println(toCurl(captured))
	}
}

// mustRegistryWithExisting returns a registry that contains the manifest m.
// Used by dry-run because we may have rewritten URLs after the embed load.
func mustRegistryWithExisting(_ *manifest.Operation, m *manifest.Manifest) *manifest.Registry {
	reg := manifest.NewRegistry()
	if err := reg.Register(m); err != nil {
		fmt.Fprintf(os.Stderr, "register manifest: %v\n", err)
		os.Exit(3)
	}
	return reg
}

// rewriteBase replaces the scheme://host portion of every op URL in the
// named connector with the supplied base. Useful for routing requests at
// a Prism mock or a test instance.
func rewriteBase(reg *manifest.Registry, connector, newBase string) error {
	m, ok := reg.Get(connector)
	if !ok {
		return fmt.Errorf("connector %q not found", connector)
	}
	newBase = strings.TrimRight(newBase, "/")
	for opName, op := range m.Operations {
		idx := strings.Index(op.URL, "://")
		if idx < 0 {
			continue
		}
		rest := op.URL[idx+3:]
		slash := strings.Index(rest, "/")
		if slash < 0 {
			op.URL = newBase
		} else {
			op.URL = newBase + rest[slash:]
		}
		m.Operations[opName] = op
	}
	return nil
}

// ─── helpers ───────────────────────────────────────────────────────────

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func parseInputs(raw string) (map[string]interface{}, error) {
	if raw == "" {
		return map[string]interface{}{}, nil
	}
	var data []byte
	switch {
	case raw == "-":
		b, err := io.ReadAll(os.Stdin)
		if err != nil {
			return nil, fmt.Errorf("read stdin: %w", err)
		}
		data = b
	case strings.HasPrefix(raw, "@"):
		b, err := os.ReadFile(raw[1:])
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", raw[1:], err)
		}
		data = b
	default:
		data = []byte(raw)
	}
	out := map[string]interface{}{}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("parse json: %w", err)
	}
	return out, nil
}

func loadEnvFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.Index(line, "=")
		if eq < 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		val := strings.Trim(strings.TrimSpace(line[eq+1:]), `"'`)
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
	return nil
}

func redactAuth(dump string) string {
	lines := strings.Split(dump, "\n")
	for i, l := range lines {
		lower := strings.ToLower(l)
		if strings.HasPrefix(lower, "authorization:") {
			parts := strings.SplitN(l, " ", 3)
			if len(parts) == 3 {
				lines[i] = parts[0] + " " + parts[1] + " <REDACTED>"
			}
		}
	}
	return strings.Join(lines, "\n")
}

func formatRequest(r *http.Request) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s %s\n", r.Method, r.URL.String())
	keys := make([]string, 0, len(r.Header))
	for k := range r.Header {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		for _, v := range r.Header[k] {
			fmt.Fprintf(&b, "%s: %s\n", k, v)
		}
	}
	if r.Body != nil {
		body, _ := io.ReadAll(r.Body)
		if len(body) > 0 {
			b.WriteString("\n")
			// Pretty-print JSON bodies.
			var out bytes.Buffer
			if json.Indent(&out, body, "", "  ") == nil {
				b.WriteString(out.String())
			} else {
				b.Write(body)
			}
		}
	}
	return b.String()
}

func toCurl(r *http.Request) string {
	var b strings.Builder
	fmt.Fprintf(&b, "curl -X %s '%s'", r.Method, r.URL.String())
	for k, vs := range r.Header {
		for _, v := range vs {
			if strings.EqualFold(k, "authorization") {
				v = "<REDACTED>"
			}
			fmt.Fprintf(&b, " \\\n  -H '%s: %s'", k, v)
		}
	}
	if r.Body != nil {
		body, _ := io.ReadAll(r.Body)
		if len(body) > 0 {
			fmt.Fprintf(&b, " \\\n  -d '%s'", string(body))
		}
	}
	return b.String()
}

func verboseClient() *http.Client {
	return &http.Client{
		Timeout: 30 * time.Second,
		Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			start := time.Now()
			resp, err := http.DefaultTransport.RoundTrip(r)
			dur := time.Since(start)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[%s %s → ERROR %v in %s]\n", r.Method, r.URL, err, dur)
				return nil, err
			}
			fmt.Fprintf(os.Stderr, "[%s %s → %d in %s]\n", r.Method, r.URL, resp.StatusCode, dur)
			return resp, nil
		}),
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
