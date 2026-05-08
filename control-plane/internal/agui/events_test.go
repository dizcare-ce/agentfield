package agui

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// TestWriteSSE_FrameShape pins the canonical AG-UI wire format:
//   - frame is `data: <json>\n\n` only (no `event:` line — see encoder.ts /
//     encoder.py in ag-ui-protocol/ag-ui)
//   - `type` field carries the UPPER_SNAKE_CASE event name
//   - timestamp, when present, is a number (Unix ms)
func TestWriteSSE_FrameShape(t *testing.T) {
	cases := []struct {
		name       string
		ev         Event
		wantTyp    string
		wantFields []string
	}{
		{
			name:       "RunStarted",
			ev:         RunStarted{ThreadID: "thread-1", RunID: "run-1", Timestamp: 1700000000000},
			wantTyp:    "RUN_STARTED",
			wantFields: []string{`"threadId":"thread-1"`, `"runId":"run-1"`, `"timestamp":1700000000000`},
		},
		{
			name:       "RunFinished_success_carriesIDs",
			ev:         RunFinished{ThreadID: "thread-1", RunID: "run-1", Outcome: &Outcome{Type: "success"}, Result: map[string]any{"answer": 42}},
			wantTyp:    "RUN_FINISHED",
			wantFields: []string{`"threadId":"thread-1"`, `"runId":"run-1"`, `"outcome":{"type":"success"}`, `"answer":42`},
		},
		{
			name:       "RunError",
			ev:         RunError{Message: "boom", Code: "ERR_X"},
			wantTyp:    "RUN_ERROR",
			wantFields: []string{`"message":"boom"`, `"code":"ERR_X"`},
		},
		{
			name:       "TextMessageStart",
			ev:         TextMessageStart{MessageID: "msg-1", Role: "assistant"},
			wantTyp:    "TEXT_MESSAGE_START",
			wantFields: []string{`"messageId":"msg-1"`, `"role":"assistant"`},
		},
		{
			name:       "TextMessageContent",
			ev:         TextMessageContent{MessageID: "msg-1", Delta: "hello"},
			wantTyp:    "TEXT_MESSAGE_CONTENT",
			wantFields: []string{`"messageId":"msg-1"`, `"delta":"hello"`},
		},
		{
			name:       "TextMessageEnd",
			ev:         TextMessageEnd{MessageID: "msg-1"},
			wantTyp:    "TEXT_MESSAGE_END",
			wantFields: []string{`"messageId":"msg-1"`},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			if err := WriteSSE(&buf, tc.ev); err != nil {
				t.Fatalf("WriteSSE: %v", err)
			}
			frame := buf.String()

			// Canonical wire shape: `data: <json>\n\n`. No `event:` line.
			if !strings.HasPrefix(frame, "data: ") {
				t.Fatalf("frame must start with `data: `:\n%s", frame)
			}
			if !strings.HasSuffix(frame, "\n\n") {
				t.Fatalf("frame must end with blank-line terminator:\n%s", frame)
			}
			if strings.Contains(frame, "\nevent:") || strings.HasPrefix(frame, "event:") {
				t.Fatalf("frame must not include an `event:` line (canonical encoder omits it):\n%s", frame)
			}

			body := strings.TrimSuffix(strings.TrimPrefix(frame, "data: "), "\n\n")
			var decoded map[string]any
			if err := json.Unmarshal([]byte(body), &decoded); err != nil {
				t.Fatalf("data line is not JSON: %v\nbody: %s", err, body)
			}
			if got := decoded["type"]; got != tc.wantTyp {
				t.Fatalf("json type field = %v, want %q", got, tc.wantTyp)
			}
			for _, want := range tc.wantFields {
				if !strings.Contains(body, want) {
					t.Fatalf("expected field %s in payload:\n%s", want, body)
				}
			}
		})
	}
}

// TestWriteSSE_OmitsZeroOptionalFields confirms our `omitempty` tags drop
// timestamp / role / outcome / code when they're at zero values, matching
// the Python encoder's `exclude_none=True` semantics.
func TestWriteSSE_OmitsZeroOptionalFields(t *testing.T) {
	var buf bytes.Buffer
	if err := WriteSSE(&buf, TextMessageStart{MessageID: "m"}); err != nil {
		t.Fatal(err)
	}
	body := buf.String()
	if strings.Contains(body, `"role":""`) {
		t.Errorf("empty role should be omitted: %s", body)
	}
	if strings.Contains(body, `"timestamp":0`) {
		t.Errorf("zero timestamp should be omitted: %s", body)
	}
}

// unmarshalableEvent fails JSON encoding deterministically so we can exercise
// the marshal-error branch in WriteSSE.
type unmarshalableEvent struct{}

func (unmarshalableEvent) Type() string                  { return "BAD_EVENT" }
func (unmarshalableEvent) MarshalJSON() ([]byte, error)  { return nil, errBoom }

var errBoom = &boomError{}

type boomError struct{}

func (b *boomError) Error() string { return "boom" }

// TestWriteSSE_MarshalErrorIsReturned ensures encode failures surface to the
// caller rather than producing a silently-malformed frame.
func TestWriteSSE_MarshalErrorIsReturned(t *testing.T) {
	var buf bytes.Buffer
	err := WriteSSE(&buf, unmarshalableEvent{})
	if err == nil {
		t.Fatalf("expected marshal error, got nil; buf=%q", buf.String())
	}
	if !strings.Contains(err.Error(), "marshal BAD_EVENT") {
		t.Errorf("error should name the event type: %v", err)
	}
	if buf.Len() != 0 {
		t.Errorf("nothing should be written on marshal failure; got %q", buf.String())
	}
}

// failingWriter returns an error on every Write — used to cover the
// write-error branch of WriteSSE.
type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errBoom }

// TestWriteSSE_WriteErrorIsReturned confirms a flaky writer surfaces to the
// caller (the handler uses this to bail out cleanly on client disconnect).
func TestWriteSSE_WriteErrorIsReturned(t *testing.T) {
	err := WriteSSE(failingWriter{}, RunStarted{ThreadID: "t", RunID: "r"})
	if err == nil {
		t.Fatalf("expected write error, got nil")
	}
	if !strings.Contains(err.Error(), "write RUN_STARTED") {
		t.Errorf("error should name the event type: %v", err)
	}
}
