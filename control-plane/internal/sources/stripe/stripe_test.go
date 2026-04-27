package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strconv"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

func TestStripe_VerifiesAndEmitsEvent(t *testing.T) {
	secret := "whsec_test"
	body := []byte(`{"id":"evt_123","type":"payment_intent.succeeded","data":{"object":{}}}`)
	ts := time.Now().Unix()

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(ts, 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req := &sources.RawRequest{
		Headers: http.Header{
			"Stripe-Signature": []string{"t=" + strconv.FormatInt(ts, 10) + ",v1=" + sig},
		},
		Body:   body,
		URL:    &url.URL{Path: "/sources/abc"},
		Method: "POST",
	}

	s := &source{}
	events, err := s.HandleRequest(context.Background(), req, nil, secret)
	if err != nil {
		t.Fatalf("HandleRequest returned error: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Type != "payment_intent.succeeded" {
		t.Fatalf("unexpected event type: %q", events[0].Type)
	}
	if events[0].IdempotencyKey != "evt_123" {
		t.Fatalf("unexpected idempotency key: %q", events[0].IdempotencyKey)
	}
}

func TestStripe_RejectsTamperedSignature(t *testing.T) {
	secret := "whsec_test"
	body := []byte(`{"id":"evt_456","type":"x"}`)
	ts := time.Now().Unix()

	req := &sources.RawRequest{
		Headers: http.Header{
			"Stripe-Signature": []string{"t=" + strconv.FormatInt(ts, 10) + ",v1=deadbeef"},
		},
		Body:   body,
		URL:    &url.URL{Path: "/x"},
		Method: "POST",
	}

	s := &source{}
	_, err := s.HandleRequest(context.Background(), req, nil, secret)
	if err == nil {
		t.Fatalf("expected verification failure, got nil")
	}
}
