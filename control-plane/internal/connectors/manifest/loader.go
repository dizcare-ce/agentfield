package manifest

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v5"
	"gopkg.in/yaml.v3"
	"github.com/Agent-Field/agentfield/control-plane/connectors"
)

// Registry stores loaded connector manifests indexed by name.
type Registry struct {
	mu         sync.RWMutex
	byName     map[string]Manifest
	operations map[string]map[string]Operation // [connectorName][operationName]Operation
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{
		byName:     make(map[string]Manifest),
		operations: make(map[string]map[string]Operation),
	}
}

// Get returns a manifest by connector name.
func (r *Registry) Get(name string) (*Manifest, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.byName[name]
	if !ok {
		return nil, false
	}
	return &m, true
}

// All returns all registered manifests.
func (r *Registry) All() []*Manifest {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Manifest, 0, len(r.byName))
	for _, m := range r.byName {
		m := m // copy
		out = append(out, &m)
	}
	return out
}

// Operation returns an operation by connector and operation name.
func (r *Registry) Operation(connector, op string) (*Operation, *Manifest, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ops, ok := r.operations[connector]
	if !ok {
		return nil, nil, false
	}
	operation, ok := ops[op]
	if !ok {
		return nil, nil, false
	}
	m := r.byName[connector]
	return &operation, &m, true
}

// Register stores a manifest into the registry.
func (r *Registry) Register(m *Manifest) error {
	if m == nil || m.Name == "" {
		return fmt.Errorf("register: manifest name is required")
	}
	if len(m.Operations) == 0 {
		return fmt.Errorf("register manifest %q: at least one operation is required", m.Name)
	}

	ops := make(map[string]Operation)
	for opName, op := range m.Operations {
		if opName == "" {
			return fmt.Errorf("register manifest %q: operation name cannot be empty", m.Name)
		}
		if op.Method == "" {
			return fmt.Errorf("register manifest %q operation %q: method is required", m.Name, opName)
		}
		if op.URL == "" {
			return fmt.Errorf("register manifest %q operation %q: url is required", m.Name, opName)
		}
		ops[opName] = op
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.byName[m.Name] = *m
	r.operations[m.Name] = ops
	return nil
}

// LoadEmbedded loads all manifests from the embedded filesystem.
func LoadEmbedded() (*Registry, error) {
	reg := NewRegistry()
	if err := LoadEmbeddedInto(reg); err != nil {
		return nil, err
	}
	return reg, nil
}

// LoadEmbeddedInto loads all manifests into an existing registry.
func LoadEmbeddedInto(reg *Registry) error {
	if reg == nil {
		return fmt.Errorf("load embedded manifests: registry is nil")
	}

	schemaData, err := connectors.FS.ReadFile("schema/connector.schema.json")
	if err != nil {
		return fmt.Errorf("load embedded manifests: read schema: %w", err)
	}

	schema, err := jsonschema.CompileString("https://agentfield.ai/schemas/connector/v1.0.json", string(schemaData))
	if err != nil {
		return fmt.Errorf("load embedded manifests: compile schema: %w", err)
	}

	if err := fs.WalkDir(connectors.FS, "manifests", func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk manifests %q: %w", path, walkErr)
		}
		if d.IsDir() {
			// Skip directories that start with "_" — these are scaffolds
			// (e.g. _template/) and must not load as runtime connectors.
			if strings.HasPrefix(d.Name(), "_") && path != "manifests" {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, "manifest.yaml") {
			return nil
		}

		data, err := connectors.FS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read manifest %q: %w", path, err)
		}

		// Parse YAML
		var m Manifest
		if err := yaml.Unmarshal(data, &m); err != nil {
			return fmt.Errorf("parse manifest %q as yaml: %w", path, err)
		}

		// Validate against JSON Schema
		jsonData, err := json.Marshal(m)
		if err != nil {
			return fmt.Errorf("marshal manifest %q for validation: %w", path, err)
		}
		var obj interface{}
		if err := json.Unmarshal(jsonData, &obj); err != nil {
			return fmt.Errorf("unmarshal manifest %q for validation: %w", path, err)
		}
		if err := schema.Validate(obj); err != nil {
			return fmt.Errorf("validate manifest %q: %w", path, err)
		}

		// Register
		if err := reg.Register(&m); err != nil {
			return fmt.Errorf("register manifest %q: %w", path, err)
		}

		return nil
	}); err != nil {
		return fmt.Errorf("load embedded manifests: %w", err)
	}

	return nil
}
