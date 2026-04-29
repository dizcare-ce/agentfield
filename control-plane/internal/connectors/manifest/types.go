package manifest

// Manifest describes a single connector and its operations.
type Manifest struct {
	SchemaVersion string `json:"schema_version" yaml:"schema_version"`
	Name          string `json:"name" yaml:"name"`
	Display       string `json:"display" yaml:"display"`
	Category      string `json:"category" yaml:"category"`
	Version       string `json:"version" yaml:"version"`
	Description   string `json:"description" yaml:"description"`
	UI            ConnectorUI `json:"ui" yaml:"ui"`
	Auth          AuthBlock `json:"auth" yaml:"auth"`
	Inbound       *InboundBlock `json:"inbound,omitempty" yaml:"inbound,omitempty"`
	Operations    map[string]Operation `json:"operations" yaml:"operations"`
	Concurrency   *ConnectorConcurrency `json:"concurrency,omitempty" yaml:"concurrency,omitempty"`
}

// ConnectorUI provides UI presentation hints.
type ConnectorUI struct {
	Icon       IconRef  `json:"icon" yaml:"icon"`
	BrandColor string   `json:"brand_color,omitempty" yaml:"brand_color,omitempty"`
	HoverBlurb string   `json:"hover_blurb,omitempty" yaml:"hover_blurb,omitempty"`
	Highlights []string `json:"highlights,omitempty" yaml:"highlights,omitempty"`
	DocsURL    string   `json:"docs_url,omitempty" yaml:"docs_url,omitempty"`
}

// IconRef is a tagged union for icon source: either a file path or a lucide icon name.
type IconRef struct {
	File   string `json:"file,omitempty" yaml:"file,omitempty"`
	Lucide string `json:"lucide,omitempty" yaml:"lucide,omitempty"`
}

// AuthBlock configures outbound authentication.
type AuthBlock struct {
	Strategy    string `json:"strategy" yaml:"strategy"`
	SecretEnv   string `json:"secret_env" yaml:"secret_env"`
	Description string `json:"description,omitempty" yaml:"description,omitempty"`
}

// InboundBlock describes the inbound/webhook half of a connector (optional).
type InboundBlock struct {
	SourceKind string                 `json:"source_kind" yaml:"source_kind"`
	Signature  *SignatureBlock        `json:"signature,omitempty" yaml:"signature,omitempty"`
	EventTypes []string               `json:"event_types" yaml:"event_types"`
	Options    map[string]interface{} `json:"options,omitempty" yaml:"options,omitempty"`
}

// SignatureBlock configures webhook signature verification.
type SignatureBlock struct {
	Strategy  string `json:"strategy" yaml:"strategy"`
	SecretEnv string `json:"secret_env" yaml:"secret_env"`
}

// Operation describes one executable outbound operation.
type Operation struct {
	Display     string `json:"display" yaml:"display"`
	Description string `json:"description" yaml:"description"`
	Method      string `json:"method" yaml:"method"`
	URL         string `json:"url" yaml:"url"`
	Inputs      map[string]Input `json:"inputs,omitempty" yaml:"inputs,omitempty"`
	Output      Output `json:"output" yaml:"output"`
	Paginate    *Paginate `json:"paginate,omitempty" yaml:"paginate,omitempty"`
	Concurrency *OperationConcurrency `json:"concurrency,omitempty" yaml:"concurrency,omitempty"`
	UI          *OperationUI `json:"ui,omitempty" yaml:"ui,omitempty"`
}

// Input describes one input parameter to an operation.
//
// WireName overrides the on-the-wire key name. Input keys must be snake_case
// (per schema regex), but real APIs use mixed casing (maxRecords, X-API-Key,
// orderBy). Set wire_name to the literal name the API expects. When omitted:
// query/body use the input key verbatim; headers translate underscores to
// dashes (notion_version → Notion-Version).
type Input struct {
	Type        string      `json:"type" yaml:"type"`
	In          string      `json:"in" yaml:"in"` // path, query, body, header
	Description string      `json:"description" yaml:"description"`
	Default     interface{} `json:"default,omitempty" yaml:"default,omitempty"`
	Enum        []interface{} `json:"enum,omitempty" yaml:"enum,omitempty"`
	Example     interface{} `json:"example,omitempty" yaml:"example,omitempty"`
	Items       *InputItems `json:"items,omitempty" yaml:"items,omitempty"`
	Sensitive   bool        `json:"sensitive,omitempty" yaml:"sensitive,omitempty"`
	WireName    string      `json:"wire_name,omitempty" yaml:"wire_name,omitempty"`
}

// InputItems describes array element type for array inputs.
type InputItems struct {
	Type string `json:"type" yaml:"type"`
}

// Output describes how the operation result is shaped.
// Schema is flexible: for type=object it maps field names to OutputField.
// For type=array it has an "items" key with field mappings.
type Output struct {
	Type   string                 `json:"type" yaml:"type"` // object or array
	Schema map[string]interface{} `json:"schema" yaml:"schema"`
}

// Paginate configures pagination for an operation.
type Paginate struct {
	Strategy string `json:"strategy" yaml:"strategy"`
	MaxPages int    `json:"max_pages,omitempty" yaml:"max_pages,omitempty"`
}

// OperationConcurrency configures per-operation in-flight limits.
type OperationConcurrency struct {
	MaxInFlight int `json:"max_in_flight,omitempty" yaml:"max_in_flight,omitempty"`
}

// ConnectorConcurrency configures per-connector in-flight limits.
type ConnectorConcurrency struct {
	MaxInFlight       int `json:"max_in_flight,omitempty" yaml:"max_in_flight,omitempty"`
	DefaultOpMaxInFlight int `json:"default_op_max_in_flight,omitempty" yaml:"default_op_max_in_flight,omitempty"`
}

// OperationUI provides UI hints for operations.
type OperationUI struct {
	OperationIcon IconRef  `json:"operation_icon,omitempty" yaml:"operation_icon,omitempty"`
	Tags          []string `json:"tags,omitempty" yaml:"tags,omitempty"`
}
