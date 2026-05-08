// Package agui implements a minimal subset of the AG-UI protocol
// (https://docs.ag-ui.com/concepts/events) so the control plane can emit an
// AG-UI-compatible Server-Sent Events stream that frontends like CopilotKit
// can consume.
//
// This is the POC subset — lifecycle + a single TextMessage carrying the
// reasoner's final result. Token-level streaming, tool-call frames, and
// state deltas are not yet implemented; see the ToolCall/State event stubs
// below for the next iteration.
package agui

import (
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// Event is implemented by every AG-UI event payload. The Type method returns
// the canonical AG-UI event name used in both the SSE `event:` line and the
// JSON `type` field.
type Event interface {
	Type() string
}

// RunStarted signals the beginning of an agent run.
// AG-UI: https://docs.ag-ui.com/concepts/events#run-started
type RunStarted struct {
	ThreadID    string         `json:"threadId"`
	RunID       string         `json:"runId"`
	ParentRunID string         `json:"parentRunId,omitempty"`
	Input       map[string]any `json:"input,omitempty"`
	Timestamp   string         `json:"timestamp,omitempty"`
}

func (RunStarted) Type() string { return "RunStarted" }

// MarshalJSON injects the discriminator `type` field. We do this in
// MarshalJSON rather than as a struct field so callers can construct events
// without manually setting the type each time.
func (e RunStarted) MarshalJSON() ([]byte, error) {
	type alias RunStarted
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// RunFinished signals a successful (or interrupted) run completion.
type RunFinished struct {
	Outcome   *Outcome `json:"outcome,omitempty"`
	Result    any      `json:"result,omitempty"`
	Timestamp string   `json:"timestamp,omitempty"`
}

func (RunFinished) Type() string { return "RunFinished" }

func (e RunFinished) MarshalJSON() ([]byte, error) {
	type alias RunFinished
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// Outcome is a discriminated union ({type: "success"} | {type: "interrupt", interrupts: [...]}).
type Outcome struct {
	Type       string      `json:"type"`
	Interrupts []Interrupt `json:"interrupts,omitempty"`
}

// Interrupt represents a pause point requiring external resolution
// (e.g. human approval). Not used by the POC but reserved for HITL flows.
type Interrupt struct {
	ID     string `json:"id"`
	Reason string `json:"reason,omitempty"`
}

// RunError signals an unrecoverable failure. Terminates the stream.
type RunError struct {
	Message   string `json:"message"`
	Code      string `json:"code,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
}

func (RunError) Type() string { return "RunError" }

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
	Role      string `json:"role,omitempty"` // typically "assistant"
	Timestamp string `json:"timestamp,omitempty"`
}

func (TextMessageStart) Type() string { return "TextMessageStart" }

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
	Timestamp string `json:"timestamp,omitempty"`
}

func (TextMessageContent) Type() string { return "TextMessageContent" }

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
	Timestamp string `json:"timestamp,omitempty"`
}

func (TextMessageEnd) Type() string { return "TextMessageEnd" }

func (e TextMessageEnd) MarshalJSON() ([]byte, error) {
	type alias TextMessageEnd
	return json.Marshal(struct {
		Type string `json:"type"`
		alias
	}{Type: e.Type(), alias: alias(e)})
}

// Now returns an RFC3339 timestamp. Wrapped so tests can replace it.
var Now = func() string { return time.Now().UTC().Format(time.RFC3339) }

// WriteSSE writes one AG-UI event to w in SSE wire format:
//
//	event: <Type>
//	data: {<json>}
//
// (trailing blank line). Returns an error if the JSON encode or the write
// fails. Caller is responsible for flushing.
func WriteSSE(w io.Writer, ev Event) error {
	payload, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshal %s: %w", ev.Type(), err)
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type(), payload); err != nil {
		return fmt.Errorf("write %s: %w", ev.Type(), err)
	}
	return nil
}
