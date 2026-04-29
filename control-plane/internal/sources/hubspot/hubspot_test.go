package hubspot

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

func signHubSpot(method, fullURL string, body []byte, timestamp string, secret string) string {
	signed := method + fullURL + string(body) + timestamp
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signed))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func reqHS(body []byte, headers map[string]string) *sources.RawRequest {
	h := http.Header{}
	for k, v := range headers {
		h.Set(k, v)
	}
	return &sources.RawRequest{
		Headers: h,
		Body:    body,
		URL:     &url.URL{Path: "/sources/hubspot", RawQuery: ""},
		Method:  "POST",
	}
}

func TestHubSpot_VerifiesValidSignatureSingleEvent(t *testing.T) {
	secret := "whsec_hubspot_test"
	body := []byte(`[{
		"eventId": 123456789,
		"portalId": 1234567,
		"subscriptionType": "contact.creation"
	}]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)
	fullURL := "https://example.com/sources/hubspot"
	sig := signHubSpot("POST", fullURL, body, timestamp, secret)

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3":      sig,
		"X-HubSpot-Request-Timestamp": timestamp,
		"Host":                        "example.com",
		"X-Forwarded-Proto":           "https",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
	if events[0].Type != "contact.creation" {
		t.Errorf("want type contact.creation, got %q", events[0].Type)
	}
	if events[0].IdempotencyKey != "1234567:123456789" {
		t.Errorf("want idempotency=1234567:123456789, got %q", events[0].IdempotencyKey)
	}
}

func TestHubSpot_MultipleEventsEmitMultiple(t *testing.T) {
	secret := "whsec_hubspot_test"
	body := []byte(`[
		{"eventId": 100, "portalId": 999, "subscriptionType": "contact.creation"},
		{"eventId": 101, "portalId": 999, "subscriptionType": "deal.creation"},
		{"eventId": 102, "portalId": 999, "subscriptionType": "ticket.propertyChange"}
	]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)
	fullURL := "https://example.com/sources/hubspot"
	sig := signHubSpot("POST", fullURL, body, timestamp, secret)

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3":      sig,
		"X-HubSpot-Request-Timestamp": timestamp,
		"Host":                        "example.com",
		"X-Forwarded-Proto":           "https",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("want 3 events, got %d", len(events))
	}

	types := []string{events[0].Type, events[1].Type, events[2].Type}
	expectedTypes := []string{"contact.creation", "deal.creation", "ticket.propertyChange"}
	for i, et := range expectedTypes {
		if types[i] != et {
			t.Errorf("event %d: want type %q, got %q", i, et, types[i])
		}
	}

	keys := []string{events[0].IdempotencyKey, events[1].IdempotencyKey, events[2].IdempotencyKey}
	expectedKeys := []string{"999:100", "999:101", "999:102"}
	for i, ek := range expectedKeys {
		if keys[i] != ek {
			t.Errorf("event %d: want idempotency %q, got %q", i, ek, keys[i])
		}
	}
}

func TestHubSpot_RejectsExpiredTimestamp(t *testing.T) {
	secret := "whsec_hubspot_test"
	body := []byte(`[{"eventId": 1, "portalId": 1, "subscriptionType": "contact.creation"}]`)
	oldTime := time.Now().Add(-10 * time.Minute).UnixMilli()
	timestamp := strconv.FormatInt(oldTime, 10)
	fullURL := "https://example.com/sources/hubspot"
	sig := signHubSpot("POST", fullURL, body, timestamp, secret)

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3":      sig,
		"X-HubSpot-Request-Timestamp": timestamp,
		"Host":                        "example.com",
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err == nil || !strings.Contains(err.Error(), "tolerance window") {
		t.Fatalf("expected timestamp tolerance error, got %v", err)
	}
}

func TestHubSpot_RejectsMissingTimestampHeader(t *testing.T) {
	body := []byte(`[{"eventId": 1, "portalId": 1, "subscriptionType": "contact.creation"}]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)
	fullURL := "https://example.com/sources/hubspot"
	sig := signHubSpot("POST", fullURL, body, timestamp, "secret")

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3": sig,
		// Missing timestamp header
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "secret")
	if err == nil || !strings.Contains(err.Error(), "X-HubSpot-Request-Timestamp") {
		t.Fatalf("expected missing timestamp header error, got %v", err)
	}
}

func TestHubSpot_RejectsMissingSignatureHeader(t *testing.T) {
	body := []byte(`[{"eventId": 1, "portalId": 1, "subscriptionType": "contact.creation"}]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)

	r := reqHS(body, map[string]string{
		"X-HubSpot-Request-Timestamp": timestamp,
		// Missing signature header
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "secret")
	if err == nil || !strings.Contains(err.Error(), "X-HubSpot-Signature-v3") {
		t.Fatalf("expected missing signature header error, got %v", err)
	}
}

func TestHubSpot_RejectsMissingSecret(t *testing.T) {
	body := []byte(`[{"eventId": 1, "portalId": 1, "subscriptionType": "contact.creation"}]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)
	fullURL := "https://example.com/sources/hubspot"
	sig := signHubSpot("POST", fullURL, body, timestamp, "x")

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3":      sig,
		"X-HubSpot-Request-Timestamp": timestamp,
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "")
	if err == nil || !strings.Contains(err.Error(), "missing webhook secret") {
		t.Fatalf("expected missing secret error, got %v", err)
	}
}

func TestHubSpot_RejectsSignatureMismatch(t *testing.T) {
	secret := "whsec_hubspot_test"
	body := []byte(`[{"eventId": 1, "portalId": 1, "subscriptionType": "contact.creation"}]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)
	fullURL := "https://example.com/sources/hubspot"
	// Sign with different secret
	sig := signHubSpot("POST", fullURL, body, timestamp, "different_secret")

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3":      sig,
		"X-HubSpot-Request-Timestamp": timestamp,
		"Host":                        "example.com",
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err == nil || !strings.Contains(err.Error(), "signature mismatch") {
		t.Fatalf("expected signature mismatch error, got %v", err)
	}
}

func TestHubSpot_RegistryMetadata(t *testing.T) {
	s := &source{}
	if s.Name() != "hubspot" {
		t.Errorf("name=%q, want hubspot", s.Name())
	}
	if s.Kind() != sources.KindHTTP {
		t.Errorf("kind=%v, want HTTP", s.Kind())
	}
	if !s.SecretRequired() {
		t.Error("hubspot should require secret")
	}
	if len(s.ConfigSchema()) == 0 {
		t.Fatal("hubspot should expose a config schema")
	}
	if err := s.Validate([]byte(`{}`)); err != nil {
		t.Fatalf("hubspot has no config knobs, validate should ignore payload: %v", err)
	}
}

// TestHubSpot_FallbackHostReconstruction verifies that when Host header is absent,
// we reconstruct from req.URL.Host or fall back to localhost.
func TestHubSpot_FallbackHostReconstruction(t *testing.T) {
	secret := "whsec_hubspot_test"
	body := []byte(`[{"eventId": 1, "portalId": 1, "subscriptionType": "contact.creation"}]`)
	now := time.Now().UnixMilli()
	timestamp := strconv.FormatInt(now, 10)

	// Reconstruct URL without Host header (simulate scenario where Host is not provided).
	// We'll use scheme://localhost/path as the URL HubSpot would have signed.
	fallbackURL := "https://localhost/sources/hubspot"
	sig := signHubSpot("POST", fallbackURL, body, timestamp, secret)

	r := reqHS(body, map[string]string{
		"X-HubSpot-Signature-v3":      sig,
		"X-HubSpot-Request-Timestamp": timestamp,
		"X-Forwarded-Proto":           "https",
		// Host intentionally omitted
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
}
