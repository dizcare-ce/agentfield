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
