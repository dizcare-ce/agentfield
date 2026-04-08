// Package hitl provides typed form builder helpers for the AgentField native
// HITL portal.  Use the builders to construct form schemas that can be passed
// to agent.Pause via agent.WithFormSchema.
//
// Example:
//
//	form := hitl.NewForm("Review PR #1138",
//	    hitl.WithDescription("Please review the following change."),
//	    hitl.WithTags("pr-review", "team:platform"),
//	    hitl.WithPriority("normal"),
//	    hitl.WithField(hitl.NewMarkdown("### Diff\n```go\n- old\n+ new\n```")),
//	    hitl.WithField(hitl.NewButtonGroup("decision",
//	        hitl.NewOption("approve", "Approve", hitl.WithVariant("default")),
//	        hitl.NewOption("reject",  "Reject",  hitl.WithVariant("destructive")),
//	    ).WithRequired(true)),
//	    hitl.WithField(hitl.NewTextarea("comments",
//	        hitl.TextareaWithLabel("Comments"),
//	        hitl.TextareaWithHiddenWhen(hitl.HiddenWhen{Field: "decision", Equals: "approve"}),
//	    )),
//	    hitl.WithSubmitLabel("Submit review"),
//	)
//
//	raw, err := json.Marshal(form)
package hitl

import "encoding/json"

// ---------------------------------------------------------------------------
// Option
// ---------------------------------------------------------------------------

// Option is a selectable item used in select, radio, multiselect, and
// button_group fields.
type Option struct {
	Value   string `json:"value"`
	Label   string `json:"label"`
	Variant string `json:"variant,omitempty"`
}

// OptionConfig configures an Option.
type OptionConfig func(*Option)

// WithVariant sets the button variant for ButtonGroup options.
// Accepted values: "default", "secondary", "destructive", "outline", "ghost".
func WithVariant(v string) OptionConfig {
	return func(o *Option) { o.Variant = v }
}

// NewOption creates a new Option.
func NewOption(value, label string, opts ...OptionConfig) Option {
	o := Option{Value: value, Label: label}
	for _, opt := range opts {
		opt(&o)
	}
	return o
}

// ---------------------------------------------------------------------------
// HiddenWhen
// ---------------------------------------------------------------------------

// HiddenWhen defines a conditional visibility rule for a field.
// Exactly one condition field should be set.
type HiddenWhen struct {
	Field     string `json:"field"`
	Equals    any    `json:"equals,omitempty"`
	NotEquals any    `json:"notEquals,omitempty"`
	In        []any  `json:"in,omitempty"`
	NotIn     []any  `json:"notIn,omitempty"`
}

// ---------------------------------------------------------------------------
// Field interface
// ---------------------------------------------------------------------------

// Field is the sealed interface implemented by all concrete HITL field types.
// Call json.Marshal on any Field to get its schema representation.
type Field interface {
	fieldType() string
}

// ---------------------------------------------------------------------------
// Concrete field types
// ---------------------------------------------------------------------------

// MarkdownField is a read-only markdown block.
type MarkdownField struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

func (f MarkdownField) fieldType() string { return "markdown" }

// NewMarkdown creates a markdown display field.
func NewMarkdown(content string) MarkdownField {
	return MarkdownField{Type: "markdown", Content: content}
}

// TextField is a single-line text input.
type TextField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    string      `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	Placeholder string     `json:"placeholder,omitempty"`
	MaxLength  int         `json:"max_length,omitempty"`
	Pattern    string      `json:"pattern,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f TextField) fieldType() string { return "text" }

// TextOption configures a TextField.
type TextOption func(*TextField)

// TextWithLabel sets the field label.
func TextWithLabel(l string) TextOption { return func(f *TextField) { f.Label = l } }

// TextWithHelp sets help text.
func TextWithHelp(h string) TextOption { return func(f *TextField) { f.Help = h } }

// TextWithRequired marks the field as required.
func TextWithRequired(r bool) TextOption { return func(f *TextField) { f.Required = r } }

// TextWithDefault sets the default value.
func TextWithDefault(d string) TextOption { return func(f *TextField) { f.Default = d } }

// TextWithDisabled disables the field.
func TextWithDisabled(d bool) TextOption { return func(f *TextField) { f.Disabled = d } }

// TextWithPlaceholder sets placeholder text.
func TextWithPlaceholder(p string) TextOption { return func(f *TextField) { f.Placeholder = p } }

// TextWithMaxLength sets the maximum character length.
func TextWithMaxLength(n int) TextOption { return func(f *TextField) { f.MaxLength = n } }

// TextWithPattern sets a regex validation pattern.
func TextWithPattern(p string) TextOption { return func(f *TextField) { f.Pattern = p } }

// TextWithHiddenWhen sets the conditional visibility rule.
func TextWithHiddenWhen(hw HiddenWhen) TextOption {
	return func(f *TextField) { f.HiddenWhen = &hw }
}

// NewText creates a text input field.
func NewText(name string, opts ...TextOption) TextField {
	f := TextField{Type: "text", Name: name}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// TextareaField is a multi-line text area.
type TextareaField struct {
	Type        string      `json:"type"`
	Name        string      `json:"name"`
	Label       string      `json:"label,omitempty"`
	Help        string      `json:"help,omitempty"`
	Required    bool        `json:"required,omitempty"`
	Default     string      `json:"default,omitempty"`
	Disabled    bool        `json:"disabled,omitempty"`
	Placeholder string      `json:"placeholder,omitempty"`
	Rows        int         `json:"rows,omitempty"`
	MaxLength   int         `json:"max_length,omitempty"`
	HiddenWhen  *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f TextareaField) fieldType() string { return "textarea" }

// TextareaOption configures a TextareaField.
type TextareaOption func(*TextareaField)

// TextareaWithLabel sets the label.
func TextareaWithLabel(l string) TextareaOption { return func(f *TextareaField) { f.Label = l } }

// TextareaWithHelp sets help text.
func TextareaWithHelp(h string) TextareaOption { return func(f *TextareaField) { f.Help = h } }

// TextareaWithRequired marks as required.
func TextareaWithRequired(r bool) TextareaOption { return func(f *TextareaField) { f.Required = r } }

// TextareaWithDefault sets the default value.
func TextareaWithDefault(d string) TextareaOption { return func(f *TextareaField) { f.Default = d } }

// TextareaWithDisabled disables the field.
func TextareaWithDisabled(d bool) TextareaOption { return func(f *TextareaField) { f.Disabled = d } }

// TextareaWithPlaceholder sets placeholder text.
func TextareaWithPlaceholder(p string) TextareaOption {
	return func(f *TextareaField) { f.Placeholder = p }
}

// TextareaWithRows sets the number of visible rows.
func TextareaWithRows(r int) TextareaOption { return func(f *TextareaField) { f.Rows = r } }

// TextareaWithMaxLength sets the maximum character length.
func TextareaWithMaxLength(n int) TextareaOption { return func(f *TextareaField) { f.MaxLength = n } }

// TextareaWithHiddenWhen sets the conditional visibility rule.
func TextareaWithHiddenWhen(hw HiddenWhen) TextareaOption {
	return func(f *TextareaField) { f.HiddenWhen = &hw }
}

// NewTextarea creates a multi-line text area field.
func NewTextarea(name string, opts ...TextareaOption) TextareaField {
	f := TextareaField{Type: "textarea", Name: name}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// NumberField is a numeric input.
type NumberField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    *float64    `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	Min        *float64    `json:"min,omitempty"`
	Max        *float64    `json:"max,omitempty"`
	Step       *float64    `json:"step,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f NumberField) fieldType() string { return "number" }

// NumberOption configures a NumberField.
type NumberOption func(*NumberField)

// NumberWithLabel sets the label.
func NumberWithLabel(l string) NumberOption { return func(f *NumberField) { f.Label = l } }

// NumberWithRequired marks as required.
func NumberWithRequired(r bool) NumberOption { return func(f *NumberField) { f.Required = r } }

// NumberWithMin sets the minimum value.
func NumberWithMin(v float64) NumberOption { return func(f *NumberField) { f.Min = &v } }

// NumberWithMax sets the maximum value.
func NumberWithMax(v float64) NumberOption { return func(f *NumberField) { f.Max = &v } }

// NumberWithStep sets the step increment.
func NumberWithStep(v float64) NumberOption { return func(f *NumberField) { f.Step = &v } }

// NumberWithHiddenWhen sets the conditional visibility rule.
func NumberWithHiddenWhen(hw HiddenWhen) NumberOption {
	return func(f *NumberField) { f.HiddenWhen = &hw }
}

// NewNumber creates a numeric input field.
func NewNumber(name string, opts ...NumberOption) NumberField {
	f := NumberField{Type: "number", Name: name}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// SelectField is a dropdown select.
type SelectField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Options    []Option    `json:"options"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    string      `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f SelectField) fieldType() string { return "select" }

// NewSelect creates a dropdown select field.
func NewSelect(name string, options []Option, opts ...func(*SelectField)) SelectField {
	f := SelectField{Type: "select", Name: name, Options: options}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// MultiSelectField is a multi-select field.
type MultiSelectField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Options    []Option    `json:"options"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    []string    `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	MinItems   int         `json:"min_items,omitempty"`
	MaxItems   int         `json:"max_items,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f MultiSelectField) fieldType() string { return "multiselect" }

// NewMultiSelect creates a multi-select field.
func NewMultiSelect(name string, options []Option, opts ...func(*MultiSelectField)) MultiSelectField {
	f := MultiSelectField{Type: "multiselect", Name: name, Options: options}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// RadioField is a radio button group.
type RadioField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Options    []Option    `json:"options"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    string      `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f RadioField) fieldType() string { return "radio" }

// NewRadio creates a radio group field.
func NewRadio(name string, options []Option, opts ...func(*RadioField)) RadioField {
	f := RadioField{Type: "radio", Name: name, Options: options}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// CheckboxField is a single boolean checkbox.
type CheckboxField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    bool        `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f CheckboxField) fieldType() string { return "checkbox" }

// NewCheckbox creates a boolean checkbox field.
func NewCheckbox(name string, opts ...func(*CheckboxField)) CheckboxField {
	f := CheckboxField{Type: "checkbox", Name: name}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// SwitchField is a toggle switch.
type SwitchField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    bool        `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f SwitchField) fieldType() string { return "switch" }

// NewSwitch creates a toggle switch field.
func NewSwitch(name string, opts ...func(*SwitchField)) SwitchField {
	f := SwitchField{Type: "switch", Name: name}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// DateField is a date picker.
type DateField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	Default    string      `json:"default,omitempty"`
	Disabled   bool        `json:"disabled,omitempty"`
	MinDate    string      `json:"min_date,omitempty"`
	MaxDate    string      `json:"max_date,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f DateField) fieldType() string { return "date" }

// DateOption configures a DateField.
type DateOption func(*DateField)

// DateWithLabel sets the label.
func DateWithLabel(l string) DateOption { return func(f *DateField) { f.Label = l } }

// DateWithRequired marks as required.
func DateWithRequired(r bool) DateOption { return func(f *DateField) { f.Required = r } }

// DateWithMinDate sets the minimum selectable date (ISO 8601).
func DateWithMinDate(d string) DateOption { return func(f *DateField) { f.MinDate = d } }

// DateWithMaxDate sets the maximum selectable date (ISO 8601).
func DateWithMaxDate(d string) DateOption { return func(f *DateField) { f.MaxDate = d } }

// DateWithHiddenWhen sets the conditional visibility rule.
func DateWithHiddenWhen(hw HiddenWhen) DateOption {
	return func(f *DateField) { f.HiddenWhen = &hw }
}

// NewDate creates a date picker field.
func NewDate(name string, opts ...DateOption) DateField {
	f := DateField{Type: "date", Name: name}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// ButtonGroupField renders a row of buttons; clicking one submits the form.
type ButtonGroupField struct {
	Type       string      `json:"type"`
	Name       string      `json:"name"`
	Options    []Option    `json:"options"`
	Label      string      `json:"label,omitempty"`
	Help       string      `json:"help,omitempty"`
	Required   bool        `json:"required,omitempty"`
	HiddenWhen *HiddenWhen `json:"hidden_when,omitempty"`
}

func (f ButtonGroupField) fieldType() string { return "button_group" }

// ButtonGroupOption configures a ButtonGroupField.
type ButtonGroupOption func(*ButtonGroupField)

// ButtonGroupWithLabel sets the label.
func ButtonGroupWithLabel(l string) ButtonGroupOption {
	return func(f *ButtonGroupField) { f.Label = l }
}

// ButtonGroupWithRequired marks as required.
func ButtonGroupWithRequired(r bool) ButtonGroupOption {
	return func(f *ButtonGroupField) { f.Required = r }
}

// ButtonGroupWithHiddenWhen sets the conditional visibility rule.
func ButtonGroupWithHiddenWhen(hw HiddenWhen) ButtonGroupOption {
	return func(f *ButtonGroupField) { f.HiddenWhen = &hw }
}

// NewButtonGroup creates a button-group field.  Clicking a button immediately
// submits the whole form with that button's value.
func NewButtonGroup(name string, options []Option, opts ...ButtonGroupOption) ButtonGroupField {
	f := ButtonGroupField{Type: "button_group", Name: name, Options: options}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// DividerField is a horizontal separator with no value.
type DividerField struct {
	Type string `json:"type"`
}

func (f DividerField) fieldType() string { return "divider" }

// NewDivider creates a horizontal separator field.
func NewDivider() DividerField { return DividerField{Type: "divider"} }

// HeadingField is a sub-title heading block.
type HeadingField struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func (f HeadingField) fieldType() string { return "heading" }

// NewHeading creates a heading field.
func NewHeading(text string) HeadingField { return HeadingField{Type: "heading", Text: text} }

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

// Form is the top-level HITL form schema.
// Marshal it to JSON to produce a form_schema suitable for
// agent.WithFormSchema(raw).
type Form struct {
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Priority    string   `json:"priority,omitempty"`
	Fields      []Field  `json:"fields"`
	SubmitLabel string   `json:"submit_label,omitempty"`
	CancelLabel string   `json:"cancel_label,omitempty"`
}

// FormOption configures a Form.
type FormOption func(*Form)

// WithDescription sets the markdown description shown above the fields.
func WithDescription(d string) FormOption { return func(f *Form) { f.Description = d } }

// WithTags sets metadata tags for inbox filtering.
func WithTags(tags ...string) FormOption { return func(f *Form) { f.Tags = tags } }

// WithPriority sets the priority badge: "low", "normal", "high", "urgent".
func WithPriority(p string) FormOption { return func(f *Form) { f.Priority = p } }

// WithField appends a field to the form.
func WithField(field Field) FormOption { return func(f *Form) { f.Fields = append(f.Fields, field) } }

// WithSubmitLabel overrides the submit button label.
func WithSubmitLabel(l string) FormOption { return func(f *Form) { f.SubmitLabel = l } }

// WithCancelLabel adds a cancel button with the given label.
func WithCancelLabel(l string) FormOption { return func(f *Form) { f.CancelLabel = l } }

// NewForm creates a Form with the given title and options.
func NewForm(title string, opts ...FormOption) Form {
	f := Form{Title: title, Fields: []Field{}}
	for _, opt := range opts {
		opt(&f)
	}
	return f
}

// MarshalJSON implements json.Marshaler, serialising each Field by its
// concrete type so the JSON tags on each struct are used correctly.
func (f Form) MarshalJSON() ([]byte, error) {
	type Alias struct {
		Title       string            `json:"title"`
		Description string            `json:"description,omitempty"`
		Tags        []string          `json:"tags,omitempty"`
		Priority    string            `json:"priority,omitempty"`
		Fields      []json.RawMessage `json:"fields"`
		SubmitLabel string            `json:"submit_label,omitempty"`
		CancelLabel string            `json:"cancel_label,omitempty"`
	}

	a := Alias{
		Title:       f.Title,
		Description: f.Description,
		Tags:        f.Tags,
		Priority:    f.Priority,
		SubmitLabel: f.SubmitLabel,
		CancelLabel: f.CancelLabel,
	}

	for _, field := range f.Fields {
		raw, err := json.Marshal(field)
		if err != nil {
			return nil, err
		}
		a.Fields = append(a.Fields, raw)
	}

	return json.Marshal(a)
}
