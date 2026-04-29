package connectors

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/auth"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/manifest"
	"github.com/Agent-Field/agentfield/control-plane/internal/connectors/paginate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// rewriteHost loads the real embedded manifest for `name`, deep-copies it,
// and replaces the production base host in every operation URL with the
// httptest mock server. Returns a registry containing only the rewritten
// manifest, ready to feed an executor.
func loadAndRewrite(t *testing.T, name, fromBase, toBase string) (*manifest.Registry, *manifest.Manifest) {
	t.Helper()

	embedded, err := manifest.LoadEmbedded()
	require.NoError(t, err)
	original, ok := embedded.Get(name)
	require.True(t, ok, "embedded manifest %q must exist", name)

	// Round-trip through YAML to deep-copy without sharing maps/slices.
	raw, err := yaml.Marshal(original)
	require.NoError(t, err)
	var copy manifest.Manifest
	require.NoError(t, yaml.Unmarshal(raw, &copy))

	for opName, op := range copy.Operations {
		op.URL = strings.Replace(op.URL, fromBase, toBase, 1)
		copy.Operations[opName] = op
	}

	reg := manifest.NewRegistry()
	require.NoError(t, reg.Register(&copy))
	return reg, &copy
}

// newExecutorWithBearer wires up an executor; auth.NewRegistry() pre-registers
// the bearer strategy used by every connector in this batch.
func newExecutorWithBearer(reg *manifest.Registry) *Executor {
	return NewExecutor(reg, auth.NewRegistry(), paginate.NewRegistry(), &NoopAuditor{})
}

// TestSlackChatPostMessageSmoke verifies the slack manifest produces a valid
// outbound POST to chat.postMessage with bearer auth and JSON body, and the
// JSONPath output mapping returns the expected fields.
func TestSlackChatPostMessageSmoke(t *testing.T) {
	var capturedBody map[string]interface{}
	var capturedAuth, capturedMethod, capturedPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		capturedMethod = r.Method
		capturedPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &capturedBody)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":      true,
			"ts":      "1727644800.000100",
			"channel": map[string]interface{}{"id": "C123ABC"},
		})
	}))
	defer server.Close()

	reg, _ := loadAndRewrite(t, "slack", "https://slack.com/api", server.URL)

	t.Setenv("SLACK_BOT_TOKEN", "xoxb-test-token")
	exec := newExecutorWithBearer(reg)

	result, err := exec.Invoke(context.Background(), "slack", "chat_post_message", map[string]interface{}{
		"channel": "C123ABC",
		"text":    "hello world",
	})
	require.NoError(t, err)

	assert.Equal(t, "POST", capturedMethod)
	assert.Equal(t, "/chat.postMessage", capturedPath)
	assert.Equal(t, "Bearer xoxb-test-token", capturedAuth)
	assert.Equal(t, "C123ABC", capturedBody["channel"])
	assert.Equal(t, "hello world", capturedBody["text"])

	out, ok := result.(map[string]interface{})
	require.True(t, ok, "result should be an object")
	assert.Equal(t, true, out["ok"], "ok field should be mapped from response")
}

// TestGmailSendMessageSmoke verifies gmail send_message templates the
// {user_id} path variable correctly, sends a Bearer token, and bodies the
// raw RFC2822 payload.
func TestGmailSendMessageSmoke(t *testing.T) {
	var capturedAuth, capturedMethod, capturedPath string
	var capturedBody map[string]interface{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		capturedMethod = r.Method
		capturedPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &capturedBody)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":       "msg-abc-123",
			"threadId": "thread-xyz-999",
			"labelIds": []string{"SENT"},
		})
	}))
	defer server.Close()

	reg, _ := loadAndRewrite(t, "gmail", "https://gmail.googleapis.com/gmail/v1", server.URL)

	t.Setenv("GOOGLE_OAUTH_TOKEN", "ya29.test-access-token")
	exec := newExecutorWithBearer(reg)

	result, err := exec.Invoke(context.Background(), "gmail", "send_message", map[string]interface{}{
		"user_id": "me",
		"raw":     "RnJvbTogZm9vQGV4YW1wbGUuY29t", // base64url placeholder
	})
	require.NoError(t, err)

	assert.Equal(t, "POST", capturedMethod)
	assert.Equal(t, "/users/me/messages/send", capturedPath, "path template must substitute {user_id}")
	assert.Equal(t, "Bearer ya29.test-access-token", capturedAuth)
	assert.NotEmpty(t, capturedBody["raw"], "raw body should be present")

	out, ok := result.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "msg-abc-123", out["id"])
}

// TestNotionCreatePageSmoke verifies notion includes the Notion-Version
// header (modeled as an input with a default), uses bearer auth, and maps
// the page id from the response.
func TestNotionCreatePageSmoke(t *testing.T) {
	var capturedAuth, capturedNotionVersion, capturedMethod, capturedPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		capturedNotionVersion = r.Header.Get("Notion-Version")
		capturedMethod = r.Method
		capturedPath = r.URL.Path

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"id":           "page-uuid-abc",
			"url":          "https://www.notion.so/page-uuid-abc",
			"created_time": "2026-04-28T12:00:00.000Z",
		})
	}))
	defer server.Close()

	reg, _ := loadAndRewrite(t, "notion", "https://api.notion.com/v1", server.URL)

	t.Setenv("NOTION_TOKEN", "secret_test_token")
	exec := newExecutorWithBearer(reg)

	result, err := exec.Invoke(context.Background(), "notion", "create_page", map[string]interface{}{
		"parent":     map[string]interface{}{"database_id": "db-uuid"},
		"properties": map[string]interface{}{"Name": map[string]interface{}{"title": []interface{}{}}},
	})
	require.NoError(t, err)

	assert.Equal(t, "POST", capturedMethod)
	assert.Equal(t, "/pages", capturedPath)
	assert.Equal(t, "Bearer secret_test_token", capturedAuth)
	assert.NotEmpty(t, capturedNotionVersion, "Notion-Version header MUST be sent (modeled as input default)")

	out, ok := result.(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "page-uuid-abc", out["id"])
}

// TestNotionVersionDefaultsAcrossOps verifies every notion op carries the
// Notion-Version input — this is the gotcha that motivated the input-as-header
// pattern, so we lock the contract in tests.
func TestNotionVersionDefaultsAcrossOps(t *testing.T) {
	embedded, err := manifest.LoadEmbedded()
	require.NoError(t, err)
	m, ok := embedded.Get("notion")
	require.True(t, ok)

	for opName, op := range m.Operations {
		input, ok := op.Inputs["notion_version"]
		require.True(t, ok, "op %s must declare notion_version input", opName)
		assert.Equal(t, "header", input.In, "op %s notion_version must be in: header", opName)
		assert.NotNil(t, input.Default, "op %s notion_version must have a default", opName)
	}
}

func init() {
	// Quiet linters about the json import being only-used in subtests.
	_ = os.Getenv
}
