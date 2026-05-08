package agui

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// TestWriteSSE_FrameShape asserts the SSE wire format the AG-UI spec requires:
// each event must be `event: <Type>\ndata: <json>\n\n`, and the JSON body must
// carry a `type` discriminator matching the event line.
func TestWriteSSE_FrameShape(t *testing.T) {
	cases := []struct {
		name    string
		ev      Event
		wantTyp string
		// Field paths that must appear in the JSON payload.
		wantFields []string
	}{
		{
			name:       "RunStarted",
			ev:         RunStarted{ThreadID: "thread-1", RunID: "run-1", Input: map[string]any{"q": "hi"}},
			wantTyp:    "RunStarted",
			wantFields: []string{`"threadId":"thread-1"`, `"runId":"run-1"`},
		},
		{
			name:       "RunFinished_success",
			ev:         RunFinished{Outcome: &Outcome{Type: "success"}, Result: map[string]any{"answer": 42}},
			wantTyp:    "RunFinished",
			wantFields: []string{`"outcome":{"type":"success"}`, `"answer":42`},
		},
		{
			name:       "RunError",
			ev:         RunError{Message: "boom", Code: "ERR_X"},
			wantTyp:    "RunError",
			wantFields: []string{`"message":"boom"`, `"code":"ERR_X"`},
		},
		{
			name:       "TextMessageStart",
			ev:         TextMessageStart{MessageID: "msg-1", Role: "assistant"},
			wantTyp:    "TextMessageStart",
			wantFields: []string{`"messageId":"msg-1"`, `"role":"assistant"`},
		},
		{
			name:       "TextMessageContent",
			ev:         TextMessageContent{MessageID: "msg-1", Delta: "hello"},
			wantTyp:    "TextMessageContent",
			wantFields: []string{`"messageId":"msg-1"`, `"delta":"hello"`},
		},
		{
			name:       "TextMessageEnd",
			ev:         TextMessageEnd{MessageID: "msg-1"},
			wantTyp:    "TextMessageEnd",
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

			// Wire format: must begin with the event line, then data line, then blank line.
			wantPrefix := "event: " + tc.wantTyp + "\ndata: "
			if !strings.HasPrefix(frame, wantPrefix) {
				t.Fatalf("frame missing %q prefix:\n%s", wantPrefix, frame)
			}
			if !strings.HasSuffix(frame, "\n\n") {
				t.Fatalf("frame must end with blank-line terminator:\n%s", frame)
			}

			// Extract the JSON body and assert it parses + carries a matching type.
			body := strings.TrimSuffix(strings.TrimPrefix(frame, wantPrefix), "\n\n")
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
