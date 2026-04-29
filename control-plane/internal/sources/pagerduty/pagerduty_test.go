package pagerduty

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
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}

func req(body []byte, headers map[string]string) *sources.RawRequest {
	h := http.Header{}
	for k, v := range headers {
		h.Set(k, v)
	}
	return &sources.RawRequest{
		Headers: h,
		Body:    body,
		URL:     &url.URL{Path: "/sources/pagerduty"},
		Method:  "POST",
	}
}

func TestPagerDuty_VerifiesValidSignature(t *testing.T) {
	secret := "whsec_test_pd"
	body := []byte(`{
		"event": {
			"id": "01ABC123456789DEF",
			"event_type": "incident.triggered",
			"resource_type": "incident"
		}
	}`)
	r := req(body, map[string]string{
		"X-PagerDuty-Signature": sign(body, secret),
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
	if events[0].Type != "incident.triggered" {
		t.Errorf("want type incident.triggered, got %q", events[0].Type)
	}
	if events[0].IdempotencyKey != "01ABC123456789DEF" {
		t.Errorf("want idempotency=01ABC123456789DEF, got %q", events[0].IdempotencyKey)
	}
}

func TestPagerDuty_MultipleSignatures_AcceptsMatching(t *testing.T) {
	secret := "whsec_test_pd"
	body := []byte(`{"event": {"id": "evt-123", "event_type": "incident.acknowledged"}}`)
	goodSig := sign(body, secret)
	badSig := "v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad"

	r := req(body, map[string]string{
		"X-PagerDuty-Signature": badSig + ", " + goodSig,
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
	if events[0].Type != "incident.acknowledged" {
		t.Errorf("want type incident.acknowledged, got %q", events[0].Type)
	}
}

func TestPagerDuty_FallsBackToResourceType(t *testing.T) {
	secret := "whsec_test_pd"
	body := []byte(`{
		"event": {
			"id": "evt-456",
			"resource_type": "service"
		}
	}`)
	r := req(body, map[string]string{
		"X-PagerDuty-Signature": sign(body, secret),
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if events[0].Type != "service" {
		t.Errorf("want type service, got %q", events[0].Type)
	}
}

func TestPagerDuty_RejectsAllBadSignatures(t *testing.T) {
	secret := "whsec_test_pd"
	body := []byte(`{"event": {"id": "evt-789", "event_type": "incident.resolved"}}`)
	badSig1 := "v1=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad"
	badSig2 := "v1=deaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeadbee"

	r := req(body, map[string]string{
		"X-PagerDuty-Signature": badSig1 + ", " + badSig2,
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err == nil || !strings.Contains(err.Error(), "signature mismatch") {
		t.Fatalf("expected signature mismatch error, got %v", err)
	}
}

func TestPagerDuty_RejectsMissingSignatureHeader(t *testing.T) {
	body := []byte(`{"event": {"id": "evt-xxx"}}`)
	r := req(body, map[string]string{})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "secret")
	if err == nil || !strings.Contains(err.Error(), "X-PagerDuty-Signature") {
		t.Fatalf("expected missing header error, got %v", err)
	}
}

func TestPagerDuty_RejectsMissingSecret(t *testing.T) {
	body := []byte(`{"event": {"id": "evt-yyy"}}`)
	sig := sign(body, "x")
	r := req(body, map[string]string{
		"X-PagerDuty-Signature": sig,
	})

	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "")
	if err == nil || !strings.Contains(err.Error(), "missing webhook secret") {
		t.Fatalf("expected missing secret error, got %v", err)
	}
}

func TestPagerDuty_RegistryMetadata(t *testing.T) {
	s := &source{}
	if s.Name() != "pagerduty" {
		t.Errorf("name=%q, want pagerduty", s.Name())
	}
	if s.Kind() != sources.KindHTTP {
		t.Errorf("kind=%v, want HTTP", s.Kind())
	}
	if !s.SecretRequired() {
		t.Error("pagerduty should require secret")
	}
	if len(s.ConfigSchema()) == 0 {
		t.Fatal("pagerduty should expose a config schema")
	}
	if err := s.Validate([]byte(`{}`)); err != nil {
		t.Fatalf("pagerduty has no config knobs, validate should ignore payload: %v", err)
	}
}
