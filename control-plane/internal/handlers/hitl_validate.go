package handlers

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
)

type hitlSchema struct {
	Title       string      `json:"title"`
	Description string      `json:"description"`
	Tags        []string    `json:"tags"`
	Priority    string      `json:"priority"`
	Fields      []hitlField `json:"fields"`
	SubmitLabel string      `json:"submit_label"`
	CancelLabel string      `json:"cancel_label"`
}

type hitlField struct {
	Type       string            `json:"type"`
	Name       string            `json:"name"`
	Label      string            `json:"label"`
	Required   bool              `json:"required"`
	Pattern    string            `json:"pattern"`
	MaxLength  *int              `json:"max_length"`
	Min        *float64          `json:"min"`
	Max        *float64          `json:"max"`
	MinItems   *int              `json:"min_items"`
	MaxItems   *int              `json:"max_items"`
	HiddenWhen *hitlHiddenWhen   `json:"hidden_when"`
	Options    []hitlFieldOption `json:"options"`
}

type hitlFieldOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type hitlHiddenWhen struct {
	Field     string `json:"field"`
	Equals    any    `json:"equals"`
	NotEquals any    `json:"notEquals"`
	In        []any  `json:"in"`
	NotIn     []any  `json:"notIn"`
}

func parseHitlSchema(schemaJSON string) (*hitlSchema, error) {
	var schema hitlSchema
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return nil, err
	}
	return &schema, nil
}

func validateHitlResponse(schemaJSON string, response map[string]any) (map[string]any, map[string]string) {
	schema, err := parseHitlSchema(schemaJSON)
	if err != nil {
		return nil, map[string]string{"form": "invalid stored form schema"}
	}

	cleaned := make(map[string]any)
	errs := make(map[string]string)

	for _, field := range schema.Fields {
		if field.Name == "" {
			continue
		}
		if field.HiddenWhen != nil && isHitlFieldHidden(field.HiddenWhen, response) {
			continue
		}

		value, exists := response[field.Name]
		if !exists || value == nil {
			if field.Required {
				errs[field.Name] = "field is required"
			}
			continue
		}

		cleanValue, errMsg := validateHitlFieldValue(field, value)
		if errMsg != "" {
			errs[field.Name] = errMsg
			continue
		}
		cleaned[field.Name] = cleanValue
	}

	if len(errs) > 0 {
		return nil, errs
	}
	return cleaned, nil
}

func isHitlFieldHidden(rule *hitlHiddenWhen, values map[string]any) bool {
	if rule == nil || rule.Field == "" {
		return false
	}
	current, exists := values[rule.Field]
	if !exists {
		current = nil
	}

	switch {
	case rule.Equals != nil:
		return fmt.Sprint(current) == fmt.Sprint(rule.Equals)
	case rule.NotEquals != nil:
		return fmt.Sprint(current) != fmt.Sprint(rule.NotEquals)
	case len(rule.In) > 0:
		for _, candidate := range rule.In {
			if fmt.Sprint(current) == fmt.Sprint(candidate) {
				return true
			}
		}
	case len(rule.NotIn) > 0:
		for _, candidate := range rule.NotIn {
			if fmt.Sprint(current) == fmt.Sprint(candidate) {
				return false
			}
		}
		return true
	}
	return false
}

func validateHitlFieldValue(field hitlField, value any) (any, string) {
	switch field.Type {
	case "text", "textarea":
		s, ok := value.(string)
		if !ok {
			return nil, "must be a string"
		}
		if field.MaxLength != nil && len(s) > *field.MaxLength {
			return nil, fmt.Sprintf("must be at most %d characters", *field.MaxLength)
		}
		if field.Pattern != "" {
			re, err := regexp.Compile(field.Pattern)
			if err != nil {
				return nil, "invalid field pattern"
			}
			if !re.MatchString(s) {
				return nil, "does not match required pattern"
			}
		}
		return s, ""
	case "number":
		n, ok := toFloat64(value)
		if !ok {
			return nil, "must be a number"
		}
		if field.Min != nil && n < *field.Min {
			return nil, fmt.Sprintf("must be at least %v", *field.Min)
		}
		if field.Max != nil && n > *field.Max {
			return nil, fmt.Sprintf("must be at most %v", *field.Max)
		}
		return n, ""
	case "select", "radio", "button_group":
		s, ok := value.(string)
		if !ok {
			return nil, "must be a string"
		}
		if !hitlOptionAllowed(field.Options, s) {
			return nil, "must be one of the allowed values"
		}
		return s, ""
	case "multiselect":
		items, ok := value.([]any)
		if !ok {
			return nil, "must be an array"
		}
		values := make([]string, 0, len(items))
		for _, item := range items {
			s, ok := item.(string)
			if !ok {
				return nil, "must contain only strings"
			}
			if !hitlOptionAllowed(field.Options, s) {
				return nil, "must contain only allowed values"
			}
			values = append(values, s)
		}
		if field.MinItems != nil && len(values) < *field.MinItems {
			return nil, fmt.Sprintf("must include at least %d items", *field.MinItems)
		}
		if field.MaxItems != nil && len(values) > *field.MaxItems {
			return nil, fmt.Sprintf("must include at most %d items", *field.MaxItems)
		}
		return values, ""
	case "checkbox", "switch":
		b, ok := value.(bool)
		if !ok {
			return nil, "must be a boolean"
		}
		return b, ""
	case "date":
		s, ok := value.(string)
		if !ok {
			return nil, "must be a string"
		}
		if _, err := time.Parse(time.RFC3339, s); err == nil {
			return s, ""
		}
		if _, err := time.Parse("2006-01-02", s); err == nil {
			return s, ""
		}
		return nil, "must be a valid date"
	default:
		return value, ""
	}
}

func hitlOptionAllowed(options []hitlFieldOption, value string) bool {
	allowed := make([]string, 0, len(options))
	for _, option := range options {
		allowed = append(allowed, option.Value)
	}
	return slices.Contains(allowed, value)
}

func toFloat64(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		n, err := v.Float64()
		return n, err == nil
	default:
		return 0, false
	}
}

func extractHitlFeedback(response map[string]any) string {
	for _, key := range []string{"reason", "comments", "comment"} {
		if value, ok := response[key].(string); ok {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
