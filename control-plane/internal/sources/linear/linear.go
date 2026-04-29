// Package linear implements the Linear webhook Source.
//
// Linear signs deliveries with HMAC-SHA256 over the raw body using the
// workspace webhook secret, sent in the Linear-Signature header as a hex-encoded
// digest (no prefix). The Linear-Delivery header carries a UUID for idempotency.
// Event type is derived from the body's "type" and "action" fields.
package linear

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

type source struct{}

func init() {
	sources.Register(&source{})
}

func (s *source) Name() string         { return "linear" }
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
		return nil, errors.New("linear: missing webhook secret")
	}

	sig := req.Headers.Get("Linear-Signature")
	if sig == "" {
		return nil, errors.New("linear: missing Linear-Signature header")
	}

	// Compute HMAC-SHA256 of raw body
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(req.Body)
	expected := hex.EncodeToString(mac.Sum(nil))

	// Linear signature is just the hex digest, no prefix
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return nil, errors.New("linear: signature mismatch")
	}

	// Extract type and action from body to form event type
	var probe struct {
		Type   string `json:"type"`
		Action string `json:"action"`
	}
	_ = json.Unmarshal(req.Body, &probe)

	eventType := probe.Type
	if probe.Action != "" {
		eventType = fmt.Sprintf("%s.%s", probe.Type, probe.Action)
	}

	// Linear-Delivery header is the idempotency key
	delivery := req.Headers.Get("Linear-Delivery")

	return []sources.Event{{
		Type:           eventType,
		IdempotencyKey: delivery,
		Raw:            req.Body,
		Normalized:     req.Body,
	}}, nil
}
