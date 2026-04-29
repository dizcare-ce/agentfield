package connectors

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/PaesslerAG/jsonpath"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/auth"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/manifest"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/paginate"
)

// Executor orchestrates connector invocations.
type Executor struct {
	registry     *manifest.Registry
	client       *http.Client
	limiter      *Limiter
	auditor      Auditor
	authRegistry *auth.Registry
	paginateReg  *paginate.Registry
}

// NewExecutor creates a new executor.
func NewExecutor(
	registry *manifest.Registry,
	authRegistry *auth.Registry,
	paginateReg *paginate.Registry,
	auditor Auditor,
) *Executor {
	if auditor == nil {
		auditor = &NoopAuditor{}
	}
	return &Executor{
		registry:     registry,
		authRegistry: authRegistry,
		paginateReg:  paginateReg,
		limiter:      NewLimiter(),
		auditor:      auditor,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// Invoke executes a connector operation and returns the result.
func (e *Executor) Invoke(ctx context.Context, connector, operation string, inputs map[string]interface{}) (interface{}, error) {
	startTime := time.Now()
	startMs := startTime.UnixNano() / 1e6

	auditRec := AuditRecord{
		Connector:   connector,
		Operation:   operation,
		StartedAt:   startMs,
		Status:      "pending",
	}
	_ = e.auditor.OnStart(ctx, auditRec)

	// Look up operation
	op, mani, ok := e.registry.Operation(connector, operation)
	if !ok {
		auditRec.Status = "failed"
		auditRec.ErrorMessage = "operation not found"
		auditRec.CompletedAt = time.Now().UnixNano() / 1e6
		auditRec.DurationMs = auditRec.CompletedAt - startMs
		_ = e.auditor.OnEnd(ctx, auditRec)
		return nil, fmt.Errorf("operation %s/%s not found", connector, operation)
	}

	// Validate inputs
	if err := e.validateInputs(inputs, op.Inputs); err != nil {
		auditRec.Status = "failed"
		auditRec.ErrorMessage = err.Error()
		auditRec.CompletedAt = time.Now().UnixNano() / 1e6
		auditRec.DurationMs = auditRec.CompletedAt - startMs
		_ = e.auditor.OnEnd(ctx, auditRec)
		return nil, fmt.Errorf("validate inputs: %w", err)
	}

	// Get concurrency limit from manifest
	limit := int64(10) // default per-op
	if mani.Concurrency != nil && mani.Concurrency.DefaultOpMaxInFlight > 0 {
		limit = int64(mani.Concurrency.DefaultOpMaxInFlight)
	}
	if op.Concurrency != nil && op.Concurrency.MaxInFlight > 0 {
		limit = int64(op.Concurrency.MaxInFlight)
	}

	// Acquire concurrency slot
	release, err := e.limiter.Acquire(ctx, connector, operation, limit)
	if err != nil {
		auditRec.Status = "failed"
		auditRec.ErrorMessage = err.Error()
		auditRec.CompletedAt = time.Now().UnixNano() / 1e6
		auditRec.DurationMs = auditRec.CompletedAt - startMs
		_ = e.auditor.OnEnd(ctx, auditRec)
		return nil, err
	}
	defer release()

	// Resolve secret from environment
	secret, err := Resolve(mani.Auth.SecretEnv)
	if err != nil {
		auditRec.Status = "failed"
		auditRec.ErrorMessage = err.Error()
		auditRec.CompletedAt = time.Now().UnixNano() / 1e6
		auditRec.DurationMs = auditRec.CompletedAt - startMs
		_ = e.auditor.OnEnd(ctx, auditRec)
		return nil, err
	}

	// Get auth strategy
	authStrat, err := e.authRegistry.Get(mani.Auth.Strategy)
	if err != nil {
		auditRec.Status = "failed"
		auditRec.ErrorMessage = err.Error()
		auditRec.CompletedAt = time.Now().UnixNano() / 1e6
		auditRec.DurationMs = auditRec.CompletedAt - startMs
		_ = e.auditor.OnEnd(ctx, auditRec)
		return nil, err
	}

	// Execute with retry handling
	result, httpStatus, err := e.executeWithRetry(ctx, authStrat, secret, op, inputs)
	auditRec.CompletedAt = time.Now().UnixNano() / 1e6
	auditRec.DurationMs = auditRec.CompletedAt - startMs
	auditRec.HTTPStatus = httpStatus

	if err != nil {
		auditRec.Status = "failed"
		auditRec.ErrorMessage = err.Error()
		_ = e.auditor.OnEnd(ctx, auditRec)
		return nil, err
	}

	auditRec.Status = "succeeded"
	_ = e.auditor.OnEnd(ctx, auditRec)
	return result, nil
}

func (e *Executor) validateInputs(inputs map[string]interface{}, spec map[string]manifest.Input) error {
	for name, input := range spec {
		val, ok := inputs[name]
		if !ok {
			if input.Default != nil {
				inputs[name] = input.Default
			}
			continue
		}
		if len(input.Enum) > 0 {
			found := false
			for _, enumVal := range input.Enum {
				if enumVal == val {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("input %q value not in enum %v", name, input.Enum)
			}
		}
	}
	return nil
}

func (e *Executor) executeWithRetry(
	ctx context.Context,
	authStrat auth.Strategy,
	secret string,
	op *manifest.Operation,
	inputs map[string]interface{},
) (interface{}, int, error) {
	req, err := e.buildRequest(ctx, op, inputs)
	if err != nil {
		return nil, 0, fmt.Errorf("build request: %w", err)
	}

	if err := authStrat.Apply(req, secret, nil); err != nil {
		return nil, 0, fmt.Errorf("apply auth: %w", err)
	}

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	// Handle rate limiting: 429 or 503 with retry logic
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
		sleepTime := 5 * time.Second
		if retryAfter := resp.Header.Get("Retry-After"); retryAfter != "" {
			if secs, _ := strconv.Atoi(retryAfter); secs > 0 {
				sleepTime = time.Duration(secs) * time.Second
				if sleepTime > 30*time.Second {
					sleepTime = 30 * time.Second
				}
			}
		}
		time.Sleep(sleepTime)

		// Retry once
		req2, _ := e.buildRequest(ctx, op, inputs)
		authStrat.Apply(req2, secret, nil)
		resp2, err := e.client.Do(req2)
		if err != nil {
			return nil, resp.StatusCode, fmt.Errorf("retry failed: %w", err)
		}
		defer resp2.Body.Close()
		resp = resp2
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, resp.StatusCode, fmt.Errorf("http %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	return e.mapOutput(body, op.Output), resp.StatusCode, nil
}

func (e *Executor) buildRequest(ctx context.Context, op *manifest.Operation, inputs map[string]interface{}) (*http.Request, error) {
	urlStr := op.URL

	// Substitute path variables
	for name, input := range op.Inputs {
		if input.In == "path" {
			if val, ok := inputs[name]; ok {
				pattern := fmt.Sprintf("{%s}", name)
				urlStr = strings.ReplaceAll(urlStr, pattern, url.QueryEscape(fmt.Sprintf("%v", val)))
			}
		}
	}

	// Add query parameters
	q := url.Values{}
	for name, input := range op.Inputs {
		if input.In == "query" {
			if val, ok := inputs[name]; ok {
				q.Set(name, fmt.Sprintf("%v", val))
			}
		}
	}
	if len(q) > 0 {
		sep := "?"
		if strings.Contains(urlStr, "?") {
			sep = "&"
		}
		urlStr += sep + q.Encode()
	}

	// Build body
	var body io.Reader
	bodyFields := make(map[string]interface{})
	for name, input := range op.Inputs {
		if input.In == "body" {
			if val, ok := inputs[name]; ok {
				bodyFields[name] = val
			}
		}
	}
	if len(bodyFields) > 0 {
		if jsonBody, err := json.Marshal(bodyFields); err == nil {
			body = strings.NewReader(string(jsonBody))
		}
	}

	req, err := http.NewRequestWithContext(ctx, op.Method, urlStr, body)
	if err != nil {
		return nil, fmt.Errorf("new request: %w", err)
	}

	// Add headers
	for name, input := range op.Inputs {
		if input.In == "header" {
			if val, ok := inputs[name]; ok {
				req.Header.Set(name, fmt.Sprintf("%v", val))
			}
		}
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return req, nil
}

func (e *Executor) mapOutput(responseBody []byte, output manifest.Output) interface{} {
	var data interface{}
	if err := json.Unmarshal(responseBody, &data); err != nil {
		return nil
	}

	fieldMap := output.Schema
	if output.Type == "array" {
		if items, ok := output.Schema["items"].(map[string]interface{}); ok {
			fieldMap = items
		} else {
			if arr, ok := data.([]interface{}); ok {
				return arr
			}
			return data
		}
	}

	result := make(map[string]interface{})
	for fieldName, spec := range fieldMap {
		if specMap, ok := spec.(map[string]interface{}); ok {
			if jsonpathStr, ok := specMap["jsonpath"].(string); ok && jsonpathStr != "" {
				if val, err := jsonpath.Get(jsonpathStr, data); err == nil {
					result[fieldName] = val
				}
			}
		}
	}

	if output.Type == "array" {
		if arr, ok := data.([]interface{}); ok {
			return arr
		}
	}

	return result
}
