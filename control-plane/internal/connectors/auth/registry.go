package auth

import (
	"fmt"
	"strings"
	"sync"
)

// Registry holds registered auth strategies by name.
type Registry struct {
	mu         sync.RWMutex
	strategies map[string]Strategy
}

// NewRegistry creates an empty auth strategy registry and registers built-in strategies.
func NewRegistry() *Registry {
	r := &Registry{
		strategies: make(map[string]Strategy),
	}
	// Register built-in strategies
	r.strategies["bearer"] = &Bearer{}
	r.strategies["apikey_header"] = &APIKeyHeader{}
	r.strategies["api_key_header"] = &APIKeyHeader{}
	return r
}

// Get returns a strategy by name.
func (r *Registry) Get(name string) (Strategy, error) {
	if r == nil {
		return nil, fmt.Errorf("auth registry is nil")
	}
	name = strings.ToLower(strings.TrimSpace(name))
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.strategies[name]
	if !ok {
		return nil, fmt.Errorf("auth strategy %q not found", name)
	}
	return s, nil
}

// Register adds a custom strategy to the registry.
func (r *Registry) Register(name string, s Strategy) error {
	if name == "" {
		return fmt.Errorf("register auth strategy: name is required")
	}
	if s == nil {
		return fmt.Errorf("register auth strategy %q: strategy is nil", name)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.strategies[strings.ToLower(strings.TrimSpace(name))] = s
	return nil
}
