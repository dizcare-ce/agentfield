// Package sentry implements the Sentry webhook Source.
//
// Sentry (Internal Integrations / webhooks) signs deliveries with HMAC-SHA256
// over the raw body using the integration's client secret, sent in the
// Sentry-Hook-Signature header as a hex-encoded digest. The Sentry-Hook-Resource
// header identifies the resource type (e.g., "issue", "event_alert").
// Event type is derived from the resource and optionally the body's "action" field.
//
// NOTE: Sentry does not provide a delivery UUID by default. Idempotency is based
// on the Request-ID header if present, or a computed SHA-256 of (timestamp +
// first 64 bytes of body) as a fallback. This is a v1 limitation; Sentry may add
// delivery UUIDs in a future API version.
package sentry

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

func (s *source) Name() string         { return "sentry" }
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
		return nil, errors.New("sentry: missing webhook secret")
	}

	sig := req.Headers.Get("Sentry-Hook-Signature")
	if sig == "" {
		return nil, errors.New("sentry: missing Sentry-Hook-Signature header")
	}

	// Compute HMAC-SHA256 of raw body
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(req.Body)
	expected := hex.EncodeToString(mac.Sum(nil))

	// Sentry signature is just the hex digest, no prefix
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return nil, errors.New("sentry: signature mismatch")
	}

	// Get resource type from header
	resource := req.Headers.Get("Sentry-Hook-Resource")

	// Extract action from body to form event type
	var probe struct {
		Action string `json:"action"`
	}
	_ = json.Unmarshal(req.Body, &probe)

	eventType := resource
	if probe.Action != "" {
		eventType = fmt.Sprintf("%s.%s", resource, probe.Action)
	}

	// Determine idempotency key: prefer Request-ID header, fall back to
	// hash of (timestamp + first 64 bytes of body).
	idempotencyKey := req.Headers.Get("Request-ID")
	if idempotencyKey == "" {
		// Fallback: Sentry does not provide a delivery UUID natively.
		// Compute SHA-256 of (timestamp + first 64 bytes of body) as v1 workaround.
		timestamp := req.Headers.Get("Sentry-Hook-Timestamp")
		bodyPrefix := req.Body
		if len(bodyPrefix) > 64 {
			bodyPrefix = bodyPrefix[:64]
		}
		h := sha256.New()
		h.Write([]byte(timestamp))
		h.Write(bodyPrefix)
		idempotencyKey = hex.EncodeToString(h.Sum(nil))
	}

	return []sources.Event{{
		Type:           eventType,
		IdempotencyKey: idempotencyKey,
		Raw:            req.Body,
		Normalized:     req.Body,
	}}, nil
}
