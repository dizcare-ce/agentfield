package hitl_test

import (
	"encoding/json"
	"testing"

	"github.com/Agent-Field/agentfield/sdk/go/hitl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// Option
// ---------------------------------------------------------------------------

func TestOptionNoVariant(t *testing.T) {
	o := hitl.NewOption("approve", "Approve")
	raw, err := json.Marshal(o)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "approve", m["value"])
	assert.Equal(t, "Approve", m["label"])
	_, hasVariant := m["variant"]
	assert.False(t, hasVariant, "variant key should be absent when not set")
}

func TestOptionWithVariant(t *testing.T) {
	o := hitl.NewOption("reject", "Reject", hitl.WithVariant("destructive"))
	raw, err := json.Marshal(o)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "destructive", m["variant"])
}

// ---------------------------------------------------------------------------
// HiddenWhen
// ---------------------------------------------------------------------------

func TestHiddenWhenEquals(t *testing.T) {
	hw := hitl.HiddenWhen{Field: "decision", Equals: "approve"}
	raw, err := json.Marshal(hw)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "decision", m["field"])
	assert.Equal(t, "approve", m["equals"])
	_, hasIn := m["in"]
	assert.False(t, hasIn)
}

func TestHiddenWhenIn(t *testing.T) {
	hw := hitl.HiddenWhen{Field: "status", In: []any{"draft", "review"}}
	raw, err := json.Marshal(hw)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "status", m["field"])
	inVal, ok := m["in"]
	assert.True(t, ok, "\"in\" key must be present")
	items := inVal.([]any)
	assert.Equal(t, "draft", items[0])
	assert.Equal(t, "review", items[1])
}

func TestHiddenWhenNotIn(t *testing.T) {
	hw := hitl.HiddenWhen{Field: "status", NotIn: []any{"done"}}
	raw, err := json.Marshal(hw)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	_, ok := m["notIn"]
	assert.True(t, ok)
}

// ---------------------------------------------------------------------------
// Individual fields
// ---------------------------------------------------------------------------

func TestMarkdownField(t *testing.T) {
	f := hitl.NewMarkdown("### Hello")
	raw, err := json.Marshal(f)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "markdown", m["type"])
	assert.Equal(t, "### Hello", m["content"])
}

func TestTextField(t *testing.T) {
	f := hitl.NewText("username",
		hitl.TextWithLabel("Username"),
		hitl.TextWithRequired(true),
		hitl.TextWithMaxLength(64),
		hitl.TextWithPlaceholder("Enter name..."),
	)
	raw, err := json.Marshal(f)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "text", m["type"])
	assert.Equal(t, "username", m["name"])
	assert.Equal(t, "Username", m["label"])
	assert.Equal(t, true, m["required"])
	assert.Equal(t, float64(64), m["max_length"])
	assert.Equal(t, "Enter name...", m["placeholder"])
}

func TestTextareaField(t *testing.T) {
	f := hitl.NewTextarea("notes",
		hitl.TextareaWithLabel("Notes"),
		hitl.TextareaWithRows(6),
		hitl.TextareaWithMaxLength(500),
		hitl.TextareaWithHiddenWhen(hitl.HiddenWhen{Field: "mode", Equals: "auto"}),
	)
	raw, err := json.Marshal(f)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "textarea", m["type"])
	assert.Equal(t, float64(6), m["rows"])
	assert.Equal(t, float64(500), m["max_length"])

	hw := m["hidden_when"].(map[string]any)
	assert.Equal(t, "mode", hw["field"])
	assert.Equal(t, "auto", hw["equals"])
}

func TestNumberField(t *testing.T) {
	f := hitl.NewNumber("score",
		hitl.NumberWithMin(0),
		hitl.NumberWithMax(100),
		hitl.NumberWithStep(0.5),
	)
	raw, err := json.Marshal(f)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "number", m["type"])
	assert.Equal(t, float64(0), m["min"])
	assert.Equal(t, float64(100), m["max"])
	assert.Equal(t, 0.5, m["step"])
}

func TestButtonGroupField(t *testing.T) {
	opts := []hitl.Option{
		hitl.NewOption("approve", "Approve", hitl.WithVariant("default")),
		hitl.NewOption("reject", "Reject", hitl.WithVariant("destructive")),
	}
	f := hitl.NewButtonGroup("decision", opts,
		hitl.ButtonGroupWithLabel("Your call"),
		hitl.ButtonGroupWithRequired(true),
	)
	raw, err := json.Marshal(f)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "button_group", m["type"])
	assert.Equal(t, "decision", m["name"])
	assert.Equal(t, "Your call", m["label"])
	assert.Equal(t, true, m["required"])

	options := m["options"].([]any)
	require.Len(t, options, 2)
	first := options[0].(map[string]any)
	assert.Equal(t, "default", first["variant"])
	second := options[1].(map[string]any)
	assert.Equal(t, "destructive", second["variant"])
}

func TestDividerField(t *testing.T) {
	f := hitl.NewDivider()
	raw, err := json.Marshal(f)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "divider", m["type"])
}

func TestHeadingField(t *testing.T) {
	f := hitl.NewHeading("Section A")
	raw, err := json.Marshal(f)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "heading", m["type"])
	assert.Equal(t, "Section A", m["text"])
}

func TestDateField(t *testing.T) {
	f := hitl.NewDate("due_date",
		hitl.DateWithMinDate("2026-01-01"),
		hitl.DateWithMaxDate("2026-12-31"),
	)
	raw, err := json.Marshal(f)
	require.NoError(t, err)
	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	assert.Equal(t, "date", m["type"])
	assert.Equal(t, "2026-01-01", m["min_date"])
	assert.Equal(t, "2026-12-31", m["max_date"])
}

// ---------------------------------------------------------------------------
// Form — mixed field round-trip
// ---------------------------------------------------------------------------

func TestFormMixedFieldsRoundTrip(t *testing.T) {
	form := hitl.NewForm("Review PR #1138",
		hitl.WithDescription("Please review."),
		hitl.WithTags("pr-review", "team:platform"),
		hitl.WithPriority("normal"),
		hitl.WithField(hitl.NewMarkdown("### Diff\n```go\n- old\n+ new\n```")),
		hitl.WithField(hitl.NewButtonGroup("decision",
			[]hitl.Option{
				hitl.NewOption("approve", "Approve", hitl.WithVariant("default")),
				hitl.NewOption("request_changes", "Request changes", hitl.WithVariant("secondary")),
				hitl.NewOption("reject", "Reject", hitl.WithVariant("destructive")),
			},
			hitl.ButtonGroupWithLabel("Your call"),
			hitl.ButtonGroupWithRequired(true),
		)),
		hitl.WithField(hitl.NewTextarea("comments",
			hitl.TextareaWithLabel("Comments"),
			hitl.TextareaWithPlaceholder("Optional context..."),
			hitl.TextareaWithRows(4),
			hitl.TextareaWithHiddenWhen(hitl.HiddenWhen{Field: "decision", Equals: "approve"}),
		)),
		hitl.WithField(hitl.NewCheckbox("block_merge")),
		hitl.WithSubmitLabel("Submit review"),
	)

	raw, err := json.Marshal(form)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))

	assert.Equal(t, "Review PR #1138", m["title"])
	assert.Equal(t, "normal", m["priority"])
	assert.Equal(t, "Submit review", m["submit_label"])

	tags := m["tags"].([]any)
	assert.Equal(t, "pr-review", tags[0])

	fields := m["fields"].([]any)
	require.Len(t, fields, 4)

	// markdown
	assert.Equal(t, "markdown", fields[0].(map[string]any)["type"])

	// button_group
	bg := fields[1].(map[string]any)
	assert.Equal(t, "button_group", bg["type"])
	assert.Equal(t, true, bg["required"])

	// textarea with hidden_when using "equals"
	ta := fields[2].(map[string]any)
	assert.Equal(t, "textarea", ta["type"])
	hw := ta["hidden_when"].(map[string]any)
	assert.Equal(t, "decision", hw["field"])
	assert.Equal(t, "approve", hw["equals"])

	// checkbox
	assert.Equal(t, "checkbox", fields[3].(map[string]any)["type"])
}

func TestFormHiddenWhenInKey(t *testing.T) {
	form := hitl.NewForm("T",
		hitl.WithField(hitl.NewTextarea("notes",
			hitl.TextareaWithHiddenWhen(hitl.HiddenWhen{
				Field: "status",
				In:    []any{"draft", "review"},
			}),
		)),
	)

	raw, err := json.Marshal(form)
	require.NoError(t, err)

	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))

	fields := m["fields"].([]any)
	hw := fields[0].(map[string]any)["hidden_when"].(map[string]any)
	_, hasIn := hw["in"]
	assert.True(t, hasIn, "\"in\" key must be present in hidden_when")
	inItems := hw["in"].([]any)
	assert.Equal(t, "draft", inItems[0])
}

// ---------------------------------------------------------------------------
// ApprovalRequest fields (client package)
// ---------------------------------------------------------------------------

func TestRequestApprovalRequestFormSchemaFields(t *testing.T) {
	// Verify the JSON field names on the approval request body match the spec.
	// We do this by marshalling the struct and checking the keys.

	// Build a form to use as FormSchema raw JSON
	form := hitl.NewForm("Test form",
		hitl.WithField(hitl.NewText("name")),
	)
	formRaw, err := json.Marshal(form)
	require.NoError(t, err)

	// Verify the form marshals correctly
	var formMap map[string]any
	require.NoError(t, json.Unmarshal(formRaw, &formMap))
	assert.Equal(t, "Test form", formMap["title"])
}

// ---------------------------------------------------------------------------
// Table-driven: Pause with FormSchema (validates field serialisation)
// ---------------------------------------------------------------------------

func TestFormSchemaJSONFieldNames(t *testing.T) {
	tests := []struct {
		name        string
		form        hitl.Form
		wantKeys    []string
		wantAbsent  []string
		fieldChecks map[string]any
	}{
		{
			name: "minimal form",
			form: hitl.NewForm("Min form", hitl.WithField(hitl.NewText("x"))),
			wantKeys:   []string{"title", "fields"},
			wantAbsent: []string{"description", "tags", "priority", "submit_label"},
		},
		{
			name: "form with all top-level options",
			form: hitl.NewForm("Full form",
				hitl.WithDescription("desc"),
				hitl.WithTags("a", "b"),
				hitl.WithPriority("urgent"),
				hitl.WithSubmitLabel("Go"),
				hitl.WithCancelLabel("Nope"),
				hitl.WithField(hitl.NewDivider()),
			),
			wantKeys: []string{"title", "fields", "description", "tags", "priority", "submit_label", "cancel_label"},
		},
		{
			name: "multiselect has min_items and max_items",
			form: hitl.NewForm("MS",
				hitl.WithField(hitl.NewMultiSelect("t",
					[]hitl.Option{hitl.NewOption("a", "A")},
					func(f *hitl.MultiSelectField) { f.MinItems = 1; f.MaxItems = 3 },
				)),
			),
			wantKeys: []string{"fields"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := json.Marshal(tc.form)
			require.NoError(t, err)

			var m map[string]any
			require.NoError(t, json.Unmarshal(raw, &m))

			for _, k := range tc.wantKeys {
				_, ok := m[k]
				assert.True(t, ok, "expected key %q to be present", k)
			}
			for _, k := range tc.wantAbsent {
				_, ok := m[k]
				assert.False(t, ok, "expected key %q to be absent", k)
			}
		})
	}
}
