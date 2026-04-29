package calendly

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/sources"
)

func TestCalendlySource(t *testing.T) {
	s := &source{}

	t.Run("Name", func(t *testing.T) {
		if got := s.Name(); got != "calendly" {
			t.Errorf("Name() = %q, want %q", got, "calendly")
		}
	})

	t.Run("Kind", func(t *testing.T) {
		if got := s.Kind(); got != sources.KindHTTP {
			t.Errorf("Kind() = %v, want %v", got, sources.KindHTTP)
		}
	})

	t.Run("SecretRequired", func(t *testing.T) {
		if !s.SecretRequired() {
			t.Error("SecretRequired() = false, want true")
		}
	})

	t.Run("ConfigSchema", func(t *testing.T) {
		schema := s.ConfigSchema()
		if len(schema) == 0 {
			t.Error("ConfigSchema() returned empty")
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal(schema, &parsed); err != nil {
			t.Fatalf("ConfigSchema() not valid JSON: %v", err)
		}
	})

	t.Run("Validate", func(t *testing.T) {
		if err := s.Validate([]byte("{}")); err != nil {
			t.Errorf("Validate() = %v, want nil", err)
		}
	})
}

func TestHandleRequest(t *testing.T) {
	s := &source{}
	secret := "test_signing_secret"

	tests := []struct {
		name            string
		body            map[string]interface{}
		timestamp       int64
		secret          string
		signature       string // explicit signature to use (overrides computed one)
		expectEvent     bool
		expectError     bool
		errorContains   string
		validateEvent   func(t *testing.T, evt sources.Event)
	}{
		{
			name: "happy path: valid signature, invitee.created",
			body: map[string]interface{}{
				"event": "invitee.created",
				"created_at": "2024-01-15T10:00:00Z",
				"payload": map[string]interface{}{
					"uri": "https://api.calendly.com/scheduled_events/AAA/invitees/BBB",
					"email": "test@example.com",
					"name": "Test User",
				},
			},
			timestamp:   time.Now().Unix(),
			secret:      secret,
			expectEvent: true,
			validateEvent: func(t *testing.T, evt sources.Event) {
				if evt.Type != "invitee.created" {
					t.Errorf("Event.Type = %q, want %q", evt.Type, "invitee.created")
				}
				if evt.IdempotencyKey != "https://api.calendly.com/scheduled_events/AAA/invitees/BBB" {
					t.Errorf("Event.IdempotencyKey = %q, want %q", evt.IdempotencyKey, "https://api.calendly.com/scheduled_events/AAA/invitees/BBB")
				}
			},
		},
		{
			name: "happy path: invitee.canceled",
			body: map[string]interface{}{
				"event": "invitee.canceled",
				"created_at": "2024-01-15T10:00:00Z",
				"payload": map[string]interface{}{
					"uri": "https://api.calendly.com/scheduled_events/AAA/invitees/CCC",
				},
			},
			timestamp:   time.Now().Unix(),
			secret:      secret,
			expectEvent: true,
			validateEvent: func(t *testing.T, evt sources.Event) {
				if evt.Type != "invitee.canceled" {
					t.Errorf("Event.Type = %q, want %q", evt.Type, "invitee.canceled")
				}
			},
		},
		{
			name: "happy path: routing_form_submission.created",
			body: map[string]interface{}{
				"event": "routing_form_submission.created",
				"created_at": "2024-01-15T10:00:00Z",
				"payload": map[string]interface{}{
					"uri": "https://api.calendly.com/routing_form_submissions/DDD",
				},
			},
			timestamp:   time.Now().Unix(),
			secret:      secret,
			expectEvent: true,
			validateEvent: func(t *testing.T, evt sources.Event) {
				if evt.Type != "routing_form_submission.created" {
					t.Errorf("Event.Type = %q, want %q", evt.Type, "routing_form_submission.created")
				}
			},
		},
		{
			name:          "missing secret",
			body:          map[string]interface{}{"event": "invitee.created", "payload": map[string]interface{}{"uri": "test"}},
			timestamp:     time.Now().Unix(),
			secret:        "",
			expectError:   true,
			errorContains: "missing webhook secret",
		},
		{
			name:          "missing signature header",
			body:          map[string]interface{}{"event": "invitee.created", "payload": map[string]interface{}{"uri": "test"}},
			timestamp:     time.Now().Unix(),
			secret:        secret,
			signature:     "", // no header
			expectError:   true,
			errorContains: "missing Calendly-Webhook-Signature header",
		},
		{
			name: "expired timestamp (> 180 seconds old)",
			body: map[string]interface{}{
				"event": "invitee.created",
				"payload": map[string]interface{}{"uri": "test"},
			},
			timestamp:   time.Now().Unix() - 181,
			secret:      secret,
			expectError: true,
			errorContains: "timestamp outside tolerance window",
		},
		{
			name: "signature mismatch",
			body: map[string]interface{}{
				"event": "invitee.created",
				"payload": map[string]interface{}{"uri": "test"},
			},
			timestamp:     time.Now().Unix(),
			secret:        secret,
			signature:     "t=" + strconv.FormatInt(time.Now().Unix(), 10) + ",v1=wrongsignature",
			expectError:   true,
			errorContains: "signature mismatch",
		},
		{
			name:          "missing payload.uri (should still emit event with empty IdempotencyKey)",
			body:          map[string]interface{}{"event": "invitee.created", "payload": map[string]interface{}{}},
			timestamp:     time.Now().Unix(),
			secret:        secret,
			expectEvent:   true,
			validateEvent: func(t *testing.T, evt sources.Event) {
				if evt.IdempotencyKey != "" {
					t.Errorf("Event.IdempotencyKey = %q, want empty string", evt.IdempotencyKey)
				}
			},
		},
		{
			name: "malformed header (timestamp non-numeric)",
			body: map[string]interface{}{
				"event": "invitee.created",
				"payload": map[string]interface{}{"uri": "test"},
			},
			timestamp:     time.Now().Unix(),
			secret:        secret,
			signature:     "t=not-a-number,v1=somesig",
			expectError:   true,
			errorContains: "invalid timestamp",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)

			// Build header
			var headerValue string
			if tt.signature != "" {
				// Use explicit signature from test
				headerValue = tt.signature
			} else if tt.name != "missing signature header" {
				// Compute signature for valid cases
				mac := hmac.New(sha256.New, []byte(tt.secret))
				mac.Write([]byte(strconv.FormatInt(tt.timestamp, 10)))
				mac.Write([]byte("."))
				mac.Write(bodyBytes)
				expectedSig := hex.EncodeToString(mac.Sum(nil))
				headerValue = "t=" + strconv.FormatInt(tt.timestamp, 10) + ",v1=" + expectedSig
			}

			headers := http.Header{}
			if headerValue != "" {
				headers.Set("Calendly-Webhook-Signature", headerValue)
			}

			req := &sources.RawRequest{
				Headers: headers,
				Body:    bodyBytes,
				URL:     &url.URL{},
				Method:  "POST",
			}

			events, err := s.HandleRequest(context.Background(), req, []byte("{}"), tt.secret)

			if tt.expectError {
				if err == nil {
					t.Errorf("HandleRequest() = nil, want error containing %q", tt.errorContains)
				} else if tt.errorContains != "" && !strings.Contains(err.Error(), tt.errorContains) {
					t.Errorf("HandleRequest() error = %q, want to contain %q", err.Error(), tt.errorContains)
				}
			} else if err != nil {
				t.Errorf("HandleRequest() = %v, want nil", err)
			}

			if tt.expectEvent {
				if len(events) != 1 {
					t.Errorf("HandleRequest() returned %d events, want 1", len(events))
				} else if tt.validateEvent != nil {
					tt.validateEvent(t, events[0])
				}
			}
		})
	}
}

func TestVerifySignature(t *testing.T) {
	secret := "test_secret"
	ts := time.Now().Unix()
	body := []byte(`{"event":"invitee.created"}`)

	// Compute correct signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(ts, 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	correctSig := hex.EncodeToString(mac.Sum(nil))

	tests := []struct {
		name        string
		body        []byte
		header      string
		secret      string
		tolerance   int
		now         time.Time
		expectError bool
		errorMsg    string
	}{
		{
			name:      "valid signature",
			body:      body,
			header:    "t=" + strconv.FormatInt(ts, 10) + ",v1=" + correctSig,
			secret:    secret,
			tolerance: 180,
			now:       time.Unix(ts, 0),
		},
		{
			name:        "missing t",
			body:        body,
			header:      "v1=" + correctSig,
			secret:      secret,
			tolerance:   180,
			now:         time.Unix(ts, 0),
			expectError: true,
			errorMsg:    "missing required fields",
		},
		{
			name:        "missing v1",
			body:        body,
			header:      "t=" + strconv.FormatInt(ts, 10),
			secret:      secret,
			tolerance:   180,
			now:         time.Unix(ts, 0),
			expectError: true,
			errorMsg:    "missing required fields",
		},
		{
			name:        "timestamp too old",
			body:        body,
			header:      "t=" + strconv.FormatInt(ts-181, 10) + ",v1=" + correctSig,
			secret:      secret,
			tolerance:   180,
			now:         time.Unix(ts, 0),
			expectError: true,
			errorMsg:    "outside tolerance window",
		},
		{
			name:        "invalid timestamp",
			body:        body,
			header:      "t=not-a-number,v1=" + correctSig,
			secret:      secret,
			tolerance:   180,
			now:         time.Unix(ts, 0),
			expectError: true,
			errorMsg:    "invalid timestamp",
		},
		{
			name:        "signature mismatch",
			body:        body,
			header:      "t=" + strconv.FormatInt(ts, 10) + ",v1=wrongsignature",
			secret:      secret,
			tolerance:   180,
			now:         time.Unix(ts, 0),
			expectError: true,
			errorMsg:    "signature mismatch",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := verifySignature(tt.body, tt.header, tt.secret, tt.tolerance, tt.now)
			if tt.expectError {
				if err == nil {
					t.Errorf("verifySignature() = nil, want error")
				} else if tt.errorMsg != "" && !strings.Contains(err.Error(), tt.errorMsg) {
					t.Errorf("verifySignature() error = %q, want to contain %q", err.Error(), tt.errorMsg)
				}
			} else if err != nil {
				t.Errorf("verifySignature() = %v, want nil", err)
			}
		})
	}
}

var _ sources.HTTPSource = (*source)(nil)
