package linear

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
		URL:     &url.URL{Path: "/sources/linear"},
		Method:  "POST",
	}
}

func TestLinear_VerifiesValidSignature(t *testing.T) {
	secret := "whsec_linear_test"
	body := []byte(`{"type":"Issue","action":"create","data":{"id":"issue-1"},"createdAt":"2026-01-01T00:00:00Z"}`)
	r := req(body, map[string]string{
		"Linear-Signature": sign(body, secret),
		"Linear-Delivery":  "delivery-uuid-123",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
	if events[0].Type != "Issue.create" {
		t.Errorf("want type Issue.create, got %q", events[0].Type)
	}
	if events[0].IdempotencyKey != "delivery-uuid-123" {
		t.Errorf("want idempotency=delivery-uuid-123, got %q", events[0].IdempotencyKey)
	}
}

func TestLinear_FallsBackToBareTypeWhenNoAction(t *testing.T) {
	secret := "whsec_linear_test"
	body := []byte(`{"type":"Comment","data":{"id":"comment-1"},"createdAt":"2026-01-01T00:00:00Z"}`)
	r := req(body, map[string]string{
		"Linear-Signature": sign(body, secret),
		"Linear-Delivery":  "delivery-uuid-456",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if events[0].Type != "Comment" {
		t.Errorf("want bare type Comment, got %q", events[0].Type)
	}
}

func TestLinear_RejectsTamperedBody(t *testing.T) {
	secret := "whsec_linear_test"
	body := []byte(`{"type":"Issue","action":"create"}`)
	signed := sign(body, secret)
	tampered := []byte(`{"type":"Issue","action":"delete"}`) // different body, original signature
	r := req(tampered, map[string]string{
		"Linear-Signature": signed,
		"Linear-Delivery":  "delivery-uuid-789",
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err == nil || !strings.Contains(err.Error(), "signature mismatch") {
		t.Fatalf("expected signature mismatch error, got %v", err)
	}
}

func TestLinear_RejectsMissingSignatureHeader(t *testing.T) {
	r := req([]byte(`{"type":"Issue"}`), map[string]string{
		"Linear-Delivery": "delivery-uuid-999",
	})
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "secret")
	if err == nil || !strings.Contains(err.Error(), "Linear-Signature") {
		t.Fatalf("expected error for missing signature header, got %v", err)
	}
}

func TestLinear_RejectsMissingSecret(t *testing.T) {
	body := []byte(`{"type":"Issue"}`)
	r := req(body, map[string]string{
		"Linear-Signature": sign(body, "secret"),
		"Linear-Delivery":  "delivery-uuid-123",
	})
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "")
	if err == nil || !strings.Contains(err.Error(), "missing webhook secret") {
		t.Fatalf("expected error for missing secret, got %v", err)
	}
}

func TestLinear_MalformedJSONStillWorks(t *testing.T) {
	secret := "whsec_linear_test"
	body := []byte(`{invalid json`)
	r := req(body, map[string]string{
		"Linear-Signature": sign(body, secret),
		"Linear-Delivery":  "delivery-uuid-456",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("malformed JSON should not cause error, got %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
	// type should be empty since we couldn't unmarshal
	if events[0].Type != "" {
		t.Errorf("want empty type for malformed JSON, got %q", events[0].Type)
	}
}

func TestLinear_RegistryMetadata(t *testing.T) {
	s := &source{}
	if s.Name() != "linear" {
		t.Errorf("name=%q, want linear", s.Name())
	}
	if s.Kind() != sources.KindHTTP {
		t.Errorf("kind=%v, want HTTP", s.Kind())
	}
	if !s.SecretRequired() {
		t.Error("linear should require secret")
	}
	if len(s.ConfigSchema()) == 0 {
		t.Fatal("linear should expose a config schema")
	}
	if err := s.Validate([]byte(`{}`)); err != nil {
		t.Fatalf("linear has no config knobs, validate should accept empty payload: %v", err)
	}
}
