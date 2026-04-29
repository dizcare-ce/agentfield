package paginate

import (
	"fmt"
	"strings"
	"sync"
)

// Registry holds registered pagination strategies by name.
type Registry struct {
	mu         sync.RWMutex
	strategies map[string]Strategy
}

// NewRegistry creates a registry with built-in pagination strategies.
func NewRegistry() *Registry {
	passthrough := &Passthrough{}
	r := &Registry{
		strategies: map[string]Strategy{
			"":                  passthrough,
			"none":              passthrough,
			"passthrough":       passthrough,
			"cursor":             passthrough,
			"offset":             passthrough,
			"link_header":        passthrough,
			"github_link_header": passthrough,
			"page_token":         passthrough,
		},
	}
	return r
}

// Get returns a pagination strategy by name.
func (r *Registry) Get(name string) (Strategy, error) {
	if r == nil {
		return nil, fmt.Errorf("paginate registry is nil")
	}
	name = strings.ToLower(strings.TrimSpace(name))
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.strategies[name]
	if !ok {
		return nil, fmt.Errorf("paginate strategy %q not found", name)
	}
	return s, nil
}

// Register adds a custom pagination strategy.
func (r *Registry) Register(name string, s Strategy) error {
	if name == "" {
		return fmt.Errorf("register paginate strategy: name is required")
	}
	if s == nil {
		return fmt.Errorf("register paginate strategy %q: strategy is nil", name)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.strategies[strings.ToLower(strings.TrimSpace(name))] = s
	return nil
}
