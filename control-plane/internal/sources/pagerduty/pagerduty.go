// Package pagerduty implements the PagerDuty webhook Source.
//
// PagerDuty Webhooks v3 signing: The X-PagerDuty-Signature header contains a
// comma-separated list of v1=<hex> entries (supports key rotation during secret
// change-over). Each is HMAC-SHA256 computed over the raw body. Accept the
// request if any signature entry matches. Event type is taken from
// event.event_type in the JSON body (e.g. "incident.triggered"), falling back
// to event.resource_type if event_type is missing. Idempotency is keyed by
// event.id (PagerDuty guarantees uniqueness per event).
package pagerduty

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

type source struct{}

func init() {
	sources.Register(&source{})
}

func (s *source) Name() string         { return "pagerduty" }
func (s *source) Kind() sources.Kind   { return sources.KindHTTP }
func (s *source) SecretRequired() bool { return true }

func (s *source) ConfigSchema() json.RawMessage {
	return json.RawMessage(`{
        "type":"object",
        "properties":{},
        "additionalProperties": false
    }`)
}

func (s *source) Validate(cfg json.RawMessage) error { return nil }

func (s *source) HandleRequest(ctx context.Context, req *sources.RawRequest, cfg json.RawMessage, secret string) ([]sources.Event, error) {
	if secret == "" {
		return nil, errors.New("pagerduty: missing webhook secret")
	}

	sigHeader := req.Headers.Get("X-PagerDuty-Signature")
	if sigHeader == "" {
		return nil, errors.New("pagerduty: missing X-PagerDuty-Signature header")
	}

	// Verify signature: header is comma-separated list of v1=<hex> entries
	if !verifySignature(req.Body, sigHeader, secret) {
		return nil, errors.New("pagerduty: signature mismatch")
	}

	// Parse body to extract event.event_type and event.id
	var envelope struct {
		Event struct {
			EventType    string `json:"event_type"`
			ResourceType string `json:"resource_type"`
			ID           string `json:"id"`
		} `json:"event"`
	}
	if err := json.Unmarshal(req.Body, &envelope); err != nil {
		return nil, errors.New("pagerduty: invalid JSON body")
	}

	eventType := envelope.Event.EventType
	if eventType == "" {
		eventType = envelope.Event.ResourceType
	}

	return []sources.Event{{
		Type:           eventType,
		IdempotencyKey: envelope.Event.ID,
		Raw:            req.Body,
		Normalized:     req.Body,
	}}, nil
}

// verifySignature checks if any v1=<hex> entry in the comma-separated header
// matches HMAC-SHA256(body, secret). Comparison is done using hmac.Equal
// over hex string byte representations.
func verifySignature(body []byte, header, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))

	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "v1=") {
			candidate := strings.TrimPrefix(part, "v1=")
			if hmac.Equal([]byte(candidate), []byte(expected)) {
				return true
			}
		}
	}
	return false
}
