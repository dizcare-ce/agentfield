package sentry

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

func sign(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func req(body []byte, headers map[string]string) *sources.RawRequest {
	h := http.Header{}
	for k, v := range headers {
		h.Set(k, v)
	}
	return &sources.RawRequest{
		Headers: h,
		Body:    body,
		URL:     &url.URL{Path: "/sources/sentry"},
		Method:  "POST",
	}
}

func TestSentry_VerifiesValidSignature(t *testing.T) {
	secret := "whsec_sentry_test"
	body := []byte(`{"action":"created","data":{"id":"issue-1"},"installation":{}}`)
	r := req(body, map[string]string{
		"Sentry-Hook-Signature":  sign(body, secret),
		"Sentry-Hook-Resource":   "issue",
		"Sentry-Hook-Timestamp":  "2026-01-01T00:00:00Z",
		"Request-ID":             "request-uuid-123",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
	if events[0].Type != "issue.created" {
		t.Errorf("want type issue.created, got %q", events[0].Type)
	}
	if events[0].IdempotencyKey != "request-uuid-123" {
		t.Errorf("want idempotency=request-uuid-123, got %q", events[0].IdempotencyKey)
	}
}

func TestSentry_FallsBackToBareResourceWhenNoAction(t *testing.T) {
	secret := "whsec_sentry_test"
	body := []byte(`{"data":{"id":"event-1"}}`)
	r := req(body, map[string]string{
		"Sentry-Hook-Signature": sign(body, secret),
		"Sentry-Hook-Resource":  "error",
		"Sentry-Hook-Timestamp": "2026-01-01T00:00:00Z",
		"Request-ID":            "request-uuid-456",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if events[0].Type != "error" {
		t.Errorf("want bare resource error, got %q", events[0].Type)
	}
}

func TestSentry_IdempotencyFromRequestID(t *testing.T) {
	secret := "whsec_sentry_test"
	body := []byte(`{"action":"resolved","data":{"id":"issue-2"}}`)
	r := req(body, map[string]string{
		"Sentry-Hook-Signature": sign(body, secret),
		"Sentry-Hook-Resource":  "issue",
		"Request-ID":            "request-uuid-789",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if events[0].IdempotencyKey != "request-uuid-789" {
		t.Errorf("want idempotency=request-uuid-789, got %q", events[0].IdempotencyKey)
	}
}

func TestSentry_IdempotencyFallbackToTimestampHash(t *testing.T) {
	secret := "whsec_sentry_test"
	body := []byte(`{"action":"created","data":{"id":"alert-1"}}`)
	timestamp := "2026-01-01T00:00:00Z"
	r := req(body, map[string]string{
		"Sentry-Hook-Signature": sign(body, secret),
		"Sentry-Hook-Resource":  "metric_alert",
		"Sentry-Hook-Timestamp": timestamp,
		// No Request-ID — should fallback to hash
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the fallback key is computed correctly
	bodyPrefix := body
	if len(bodyPrefix) > 64 {
		bodyPrefix = bodyPrefix[:64]
	}
	h := sha256.New()
	h.Write([]byte(timestamp))
	h.Write(bodyPrefix)
	expectedKey := hex.EncodeToString(h.Sum(nil))

	if events[0].IdempotencyKey != expectedKey {
		t.Errorf("want idempotency=%s, got %q", expectedKey, events[0].IdempotencyKey)
	}
}

func TestSentry_RejectsTamperedBody(t *testing.T) {
	secret := "whsec_sentry_test"
	body := []byte(`{"action":"created"}`)
	signed := sign(body, secret)
	tampered := []byte(`{"action":"deleted"}`) // different body, original signature
	r := req(tampered, map[string]string{
		"Sentry-Hook-Signature": signed,
		"Sentry-Hook-Resource":  "issue",
		"Request-ID":            "request-uuid-999",
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err == nil || !strings.Contains(err.Error(), "signature mismatch") {
		t.Fatalf("expected signature mismatch error, got %v", err)
	}
}

func TestSentry_RejectsMissingSignatureHeader(t *testing.T) {
	r := req([]byte(`{"action":"created"}`), map[string]string{
		"Sentry-Hook-Resource": "issue",
		"Request-ID":           "request-uuid-111",
	})
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "secret")
	if err == nil || !strings.Contains(err.Error(), "Sentry-Hook-Signature") {
		t.Fatalf("expected error for missing signature header, got %v", err)
	}
}

func TestSentry_RejectsMissingSecret(t *testing.T) {
	body := []byte(`{"action":"created"}`)
	r := req(body, map[string]string{
		"Sentry-Hook-Signature": sign(body, "secret"),
		"Sentry-Hook-Resource":  "issue",
		"Request-ID":            "request-uuid-222",
	})
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "")
	if err == nil || !strings.Contains(err.Error(), "missing webhook secret") {
		t.Fatalf("expected error for missing secret, got %v", err)
	}
}

func TestSentry_RegistryMetadata(t *testing.T) {
	s := &source{}
	if s.Name() != "sentry" {
		t.Errorf("name=%q, want sentry", s.Name())
	}
	if s.Kind() != sources.KindHTTP {
		t.Errorf("kind=%v, want HTTP", s.Kind())
	}
	if !s.SecretRequired() {
		t.Error("sentry should require secret")
	}
	if len(s.ConfigSchema()) == 0 {
		t.Fatal("sentry should expose a config schema")
	}
	if err := s.Validate([]byte(`{}`)); err != nil {
		t.Fatalf("sentry has no config knobs, validate should accept empty payload: %v", err)
	}
}
