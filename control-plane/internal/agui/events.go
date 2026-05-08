// Package agui implements a minimal subset of the AG-UI protocol
// (https://docs.ag-ui.com/concepts/events) so the control plane can emit an
// AG-UI-compatible Server-Sent Events stream that frontends like CopilotKit
// can consume.
//
// Wire format and field shapes are kept faithful to the reference TypeScript
// and Python SDKs at https://github.com/ag-ui-protocol/ag-ui:
//
//   - SSE frames are `data: <json>\n\n` only — no `event:` line. The TS
//     EventEncoder.encodeSSE and the Python EventEncoder._encode_sse both
//     emit exactly this; the discriminator lives in the JSON `type` field.
//   - Event type values are UPPER_SNAKE_CASE (RUN_STARTED, TEXT_MESSAGE_CONTENT, …),
//     matching the EventType enum the reference clients validate against.
//   - `timestamp` is an optional Unix-millisecond integer.
//   - Optional fields are omitted when empty (mirrors `exclude_none=True`).
//
// This is the POC subset — lifecycle + a single TextMessage carrying the
// reasoner's final result. Token-level streaming, tool-call frames, and
// state deltas land in subsequent iterations.
package agui

import (
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// Event is implemented by every AG-UI event payload. The Type method returns
// the canonical AG-UI event name used in the JSON `type` field (e.g.
// "RUN_STARTED"). It is exposed so the SSE writer can name the frame in
// errors and logs without re-marshaling.
type Event interface {
	Type() string
}

// RunStarted signals the beginning of an agent run.
//
// The `input` field is intentionally omitted from this struct: the reference
// schema types it as RunAgentInput (threadId/runId/state/messages/tools/
// context/forwardedProps), not a freeform map. Until we plumb that structured
// shape through, we surface `threadId` and `runId` only — strict clients
// validating against RunAgentInputSchema would reject a freeform map here.
type RunStarted struct {
	ThreadID    string `json:"threadId"`
	RunID       string `json:"runId"`
	ParentRunID string `json:"parentRunId,omitempty"`
	Timestamp   int64  `json:"timestamp,omitempty"`
}

func (RunStarted) Type() string { return "RUN_STARTED" }

func (e RunStarted) MarshalJSON() ([]byte, error) {
	type alias RunStarted
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// RunFinished signals a successful (or interrupted) run completion.
// Per the reference schema both threadId and runId are required.
type RunFinished struct {
	ThreadID  string   `json:"threadId"`
	RunID     string   `json:"runId"`
	Outcome   *Outcome `json:"outcome,omitempty"`
	Result    any      `json:"result,omitempty"`
	Timestamp int64    `json:"timestamp,omitempty"`
}

func (RunFinished) Type() string { return "RUN_FINISHED" }

func (e RunFinished) MarshalJSON() ([]byte, error) {
	type alias RunFinished
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// Outcome is a discriminated union: {type: "success"} | {type: "interrupt", interrupts: [...]}.
type Outcome struct {
	Type       string      `json:"type"`
	Interrupts []Interrupt `json:"interrupts,omitempty"`
}

// Interrupt represents a pause point requiring external resolution
// (e.g. human approval). Reserved for HITL flows; not used by the POC.
type Interrupt struct {
	ID     string `json:"id"`
	Reason string `json:"reason,omitempty"`
}

// RunError signals an unrecoverable failure. Terminates the stream.
type RunError struct {
	Message   string `json:"message"`
	Code      string `json:"code,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
}

func (RunError) Type() string { return "RUN_ERROR" }

func (e RunError) MarshalJSON() ([]byte, error) {
	type alias RunError
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// TextMessageStart opens an assistant text message. Subsequent
// TextMessageContent events with the same messageId carry the body.
type TextMessageStart struct {
	MessageID string `json:"messageId"`
	Role      string `json:"role,omitempty"` // defaults to "assistant" client-side when omitted
	Timestamp int64  `json:"timestamp,omitempty"`
}

func (TextMessageStart) Type() string { return "TEXT_MESSAGE_START" }

func (e TextMessageStart) MarshalJSON() ([]byte, error) {
	type alias TextMessageStart
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// TextMessageContent carries one chunk of the assistant message body.
// The POC emits a single content event with the full reasoner result;
// once reasoner-side streaming lands, this will be emitted per token chunk.
type TextMessageContent struct {
	MessageID string `json:"messageId"`
	Delta     string `json:"delta"`
	Timestamp int64  `json:"timestamp,omitempty"`
}

func (TextMessageContent) Type() string { return "TEXT_MESSAGE_CONTENT" }

func (e TextMessageContent) MarshalJSON() ([]byte, error) {
	type alias TextMessageContent
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// TextMessageEnd closes a text message.
type TextMessageEnd struct {
	MessageID string `json:"messageId"`
	Timestamp int64  `json:"timestamp,omitempty"`
}

func (TextMessageEnd) Type() string { return "TEXT_MESSAGE_END" }

func (e TextMessageEnd) MarshalJSON() ([]byte, error) {
	type alias TextMessageEnd
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// NowMillis returns the current Unix time in milliseconds. Wrapped so tests
// can replace it. Milliseconds match the JS `Date.now()` convention that
// AG-UI clients are most likely to interpret correctly.
var NowMillis = func() int64 { return time.Now().UnixMilli() }

// WriteSSE writes one AG-UI event to w in the canonical wire format used by
// the reference TS and Python encoders:
//
//	data: <json>
//
// (followed by a blank line). The discriminator is in the JSON `type` field,
// not in an SSE `event:` line — clients dispatch on the JSON `type`. Caller
// is responsible for flushing.
func WriteSSE(w io.Writer, ev Event) error {
	payload, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", ev.Type(), err)
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
		return fmt.Errorf("write %s: %w", ev.Type(), err)
	}
	return nil
}
