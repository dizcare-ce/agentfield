// Package calendly implements the Calendly webhook Source.
//
// Verification follows Calendly's documented scheme: the Calendly-Webhook-Signature
// header carries a timestamp and v1 HMAC-SHA256 signature of "<timestamp>.<raw_body>"
// computed with the webhook signing key. Format is "t=<unix_seconds>,v1=<hex>".
package calendly

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

const (
	// defaultToleranceSeconds is the maximum age of a timestamp before rejection
	// (3 minutes = 180 seconds, per Calendly docs).
	defaultToleranceSeconds = 180
)

type source struct{}

func init() {
	sources.Register(&source{})
}

func (s *source) Name() string         { return "calendly" }
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
		return nil, errors.New("calendly: missing webhook secret")
	}

	sig := req.Headers.Get("Calendly-Webhook-Signature")
	if sig == "" {
		return nil, errors.New("calendly: missing Calendly-Webhook-Signature header")
	}

	if err := verifySignature(req.Body, sig, secret, defaultToleranceSeconds, time.Now()); err != nil {
		return nil, err
	}

	// Parse the Calendly webhook payload.
	var envelope struct {
		Event string `json:"event"`
		CreatedAt string `json:"created_at"`
		Payload struct {
			URI string `json:"uri"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(req.Body, &envelope); err != nil {
		return nil, fmt.Errorf("calendly: invalid event JSON: %w", err)
	}

	return []sources.Event{{
		Type:           envelope.Event,
		IdempotencyKey: envelope.Payload.URI,
		Raw:            req.Body,
		Normalized:     req.Body,
	}}, nil
}

// verifySignature parses the Calendly-Webhook-Signature header and confirms the
// v1 signature matches HMAC-SHA256(secret, "<t>.<body>"). It also enforces the
// tolerance window (3 minutes) so replayed signatures past their freshness are rejected.
func verifySignature(body []byte, header, secret string, toleranceSeconds int, now time.Time) error {
	var (
		ts  int64
		sig string
	)

	// Parse header: "t=<unix_seconds>,v1=<hex>"
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			parsed, err := strconv.ParseInt(kv[1], 10, 64)
			if err != nil {
				return fmt.Errorf("calendly: invalid timestamp: %w", err)
			}
			ts = parsed
		case "v1":
			sig = kv[1]
		}
	}

	if ts == 0 || sig == "" {
		return errors.New("calendly: signature header missing required fields (t and v1)")
	}

	// Enforce tolerance window: reject if timestamp is older than 3 minutes.
	if toleranceSeconds > 0 {
		if diff := now.Unix() - ts; diff > int64(toleranceSeconds) || diff < 0 {
			return errors.New("calendly: signature timestamp outside tolerance window")
		}
	}

	// Compute expected signature: HMAC-SHA256("<t>.<body>", secret).
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(ts, 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return errors.New("calendly: signature mismatch")
	}

	return nil
}
