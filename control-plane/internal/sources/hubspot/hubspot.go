// Package hubspot implements the HubSpot webhook Source.
//
// HubSpot Signature v3 (latest): The X-HubSpot-Signature-v3 header contains a
// base64-encoded HMAC-SHA256 signature over the concatenation of
// (HTTP_METHOD + FULL_URL + RAW_BODY + TIMESTAMP), where TIMESTAMP is the
// value of the X-HubSpot-Request-Timestamp header (Unix milliseconds).
//
// Replay protection: X-HubSpot-Request-Timestamp must be within 5 minutes
// (300,000 ms) of the current time.
//
// Webhook body is a JSON array of events. Each event produces one Event with:
// - Type = subscriptionType (e.g. "contact.creation")
// - IdempotencyKey = stringified eventId or "<portalId>:<eventId>"
// - Raw/Normalized = the entire original body (multi-event payloads)
package hubspot

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

const (
	replayToleranceMs = 300_000 // 5 minutes in milliseconds
)

type source struct{}

func init() {
	sources.Register(&source{})
}

func (s *source) Name() string         { return "hubspot" }
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
		return nil, errors.New("hubspot: missing webhook secret")
	}

	sigHeader := req.Headers.Get("X-HubSpot-Signature-v3")
	if sigHeader == "" {
		return nil, errors.New("hubspot: missing X-HubSpot-Signature-v3 header")
	}

	tsHeader := req.Headers.Get("X-HubSpot-Request-Timestamp")
	if tsHeader == "" {
		return nil, errors.New("hubspot: missing X-HubSpot-Request-Timestamp header")
	}

	// Validate timestamp is recent (within 5 minutes)
	ts, err := strconv.ParseInt(tsHeader, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("hubspot: invalid timestamp: %w", err)
	}
	now := time.Now().UnixMilli()
	if diff := now - ts; diff > replayToleranceMs || diff < 0 {
		return nil, fmt.Errorf("hubspot: timestamp outside tolerance window (age: %d ms)", diff)
	}

	// Reconstruct the full URL that HubSpot signed.
	// NOTE: RawRequest only provides URL.Path and URL.RawQuery. We reconstruct
	// scheme and host from X-Forwarded-Proto and Host headers (which HubSpot
	// populates based on the registered webhook URL). If these headers are absent,
	// we fall back to reasonable defaults.
	scheme := "https" // Default to https for webhooks
	if fwdProto := req.Headers.Get("X-Forwarded-Proto"); fwdProto != "" {
		scheme = fwdProto
	}
	host := req.Headers.Get("Host")
	if host == "" {
		// Fallback: use URL.Host if available, otherwise assume localhost
		if req.URL.Host != "" {
			host = req.URL.Host
		} else {
			host = "localhost"
		}
	}

	// Construct full URL: scheme://host/path?query
	fullURL := scheme + "://" + host
	if req.URL.Path != "" {
		fullURL += req.URL.Path
	}
	if req.URL.RawQuery != "" {
		fullURL += "?" + req.URL.RawQuery
	}

	// Verify signature: HMAC-SHA256(method + url + body + timestamp)
	if !verifySignature(req.Method, fullURL, req.Body, tsHeader, sigHeader, secret) {
		return nil, errors.New("hubspot: signature mismatch")
	}

	// Parse body as JSON array of events
	var events []struct {
		EventID         int64  `json:"eventId"`
		PortalID        int64  `json:"portalId"`
		SubscriptionType string `json:"subscriptionType"`
	}
	if err := json.Unmarshal(req.Body, &events); err != nil {
		return nil, fmt.Errorf("hubspot: invalid JSON array body: %w", err)
	}

	// Emit one Event per array element
	out := make([]sources.Event, 0, len(events))
	for _, evt := range events {
		// Idempotency key: combine portalId and eventId for global uniqueness
		idempotencyKey := fmt.Sprintf("%d:%d", evt.PortalID, evt.EventID)

		out = append(out, sources.Event{
			Type:           evt.SubscriptionType,
			IdempotencyKey: idempotencyKey,
			Raw:            req.Body,
			Normalized:     req.Body,
		})
	}

	return out, nil
}

// verifySignature checks if the base64-decoded signature matches the HMAC-SHA256
// computed over (method + url + body + timestamp).
func verifySignature(method, url string, body []byte, timestamp, sigHeader, secret string) bool {
	// Reconstruct the signed string: method + url + body + timestamp
	signed := method + url + string(body) + timestamp

	// Compute expected HMAC-SHA256, base64-encode
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signed))
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	// Decode the provided signature and compare
	decodedSig, err := base64.StdEncoding.DecodeString(sigHeader)
	if err != nil {
		return false
	}
	decodedExpected, err := base64.StdEncoding.DecodeString(expected)
	if err != nil {
		return false
	}

	return hmac.Equal(decodedSig, decodedExpected)
}
