package generichmac

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
		URL:     &url.URL{Path: "/sources/abc"},
		Method:  "POST",
	}
}

func TestGenericHMAC_DefaultHeader(t *testing.T) {
	secret := "supersecret"
	body := []byte(`{"hello":"world"}`)
	r := req(body, map[string]string{
		"X-Signature": sign(body, secret),
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("want 1 event, got %d", len(events))
	}
}

func TestGenericHMAC_CustomHeaderAndPrefix(t *testing.T) {
	secret := "supersecret"
	body := []byte(`{"k":"v"}`)
	cfg := json.RawMessage(`{
        "signature_header":"X-Custom-Sig",
        "signature_prefix":"sha256=",
        "event_type_header":"X-Event-Type",
        "idempotency_header":"X-Delivery-ID"
    }`)
	r := req(body, map[string]string{
		"X-Custom-Sig":   "sha256=" + sign(body, secret),
		"X-Event-Type":   "order.created",
		"X-Delivery-ID":  "del-99",
	})

	events, err := (&source{}).HandleRequest(context.Background(), r, cfg, secret)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if events[0].Type != "order.created" {
		t.Errorf("want event type from header, got %q", events[0].Type)
	}
	if events[0].IdempotencyKey != "del-99" {
		t.Errorf("want idempotency from header, got %q", events[0].IdempotencyKey)
	}
}

func TestGenericHMAC_RejectsWrongPrefix(t *testing.T) {
	secret := "supersecret"
	body := []byte(`{}`)
	cfg := json.RawMessage(`{"signature_header":"X-Sig","signature_prefix":"sha256="}`)
	r := req(body, map[string]string{
		"X-Sig": sign(body, secret), // missing sha256= prefix
	})
	_, err := (&source{}).HandleRequest(context.Background(), r, cfg, secret)
	if err == nil || !strings.Contains(err.Error(), "configured prefix") {
		t.Fatalf("expected prefix error, got %v", err)
	}
}

func TestGenericHMAC_RejectsTamperedSignature(t *testing.T) {
	secret := "supersecret"
	body := []byte(`{"k":"v"}`)
	r := req(body, map[string]string{
		"X-Signature": "deadbeef",
	})
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, secret)
	if err == nil || !strings.Contains(err.Error(), "signature mismatch") {
		t.Fatalf("expected mismatch error, got %v", err)
	}
}

func TestGenericHMAC_RejectsMissingSecret(t *testing.T) {
	r := req([]byte(`{}`), map[string]string{"X-Signature": "x"})
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "")
	if err == nil {
		t.Fatal("expected error for missing secret")
	}
}

func TestGenericHMAC_RejectsMissingHeader(t *testing.T) {
	r := req([]byte(`{}`), nil)
	_, err := (&source{}).HandleRequest(context.Background(), r, nil, "secret")
	if err == nil || !strings.Contains(err.Error(), "missing signature header") {
		t.Fatalf("expected missing header error, got %v", err)
	}
}
