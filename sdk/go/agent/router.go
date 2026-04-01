package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
)

// ReasonerGroup represents a logical grouping of reasoners with optional configuration.
type ReasonerGroup struct {
	Name        string
	Description string
	Tags        []string
}

// RouterOption configures an AgentRouter.
type RouterOption func(*AgentRouter)

// WithRouterMemory attaches a Memory backend to the router for router-level persistence.
func WithRouterMemory(memory *Memory) RouterOption {
	return func(r *AgentRouter) {
		r.memory = memory
	}
}

// WithRouterBackend attaches a MemoryBackend directly to the router.
func WithRouterBackend(backend MemoryBackend) RouterOption {
	return func(r *AgentRouter) {
		r.backend = backend
	}
}

// AgentRouter provides modular organization of reasoners with support for nested routers.
// It extends the flat map[string]*Reasoner pattern in Agent with hierarchical routing,
// enabling namespaced reasoner registration and group-based organization.
//
// AgentRouter supports:
//   - Namespaced reasoner registration (e.g., "auth/login", "auth/logout")
//   - Nested sub-routers for complex agent architectures
//   - Optional memory backend for router-level state persistence
//   - Group-based reasoner organization with metadata
//
// The router maintains backward compatibility by also supporting flat reasoner lookup.
type AgentRouter struct {
	mu sync.RWMutex

	// reasoners stores named reasoners in this router's namespace
	reasoners map[string]*Reasoner

	// groups stores named groups with optional metadata
	groups map[string]*ReasonerGroup

	// subRouters provides hierarchical routing for nested routers
	subRouters map[string]*AgentRouter

	// parent links to a parent router for hierarchical traversal
	parent *AgentRouter

	// name is this router's identifier in its parent's namespace
	name string

	// memory provides optional router-level persistence
	memory *Memory

	// backend provides optional storage backend
	backend MemoryBackend

	// defaultCLIReasoner tracks the default CLI reasoner within this router
	defaultCLIReasoner string
}

// NewRouter creates a new AgentRouter with the given name and options.
func NewRouter(name string, opts ...RouterOption) *AgentRouter {
	router := &AgentRouter{
		reasoners:  make(map[string]*Reasoner),
		groups:     make(map[string]*ReasonerGroup),
		subRouters: make(map[string]*AgentRouter),
		name:       name,
	}
	for _, opt := range opts {
		opt(router)
	}
	return router
}

// RegisterReasoner registers a handler with the given name in this router.
// The name can be a simple name or a namespaced path (e.g., "login" or "auth/login").
// If a parent router is set and the name contains '/', the registration may be
// delegated to an appropriate sub-router.
//
// Returns an error if a reasoner with the given name already exists.
func (r *AgentRouter) RegisterReasoner(name string, handler HandlerFunc, opts ...ReasonerOption) error {
	if handler == nil {
		return fmt.Errorf("nil handler supplied for reasoner %q", name)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Check for existing reasoner
	if _, exists := r.reasoners[name]; exists {
		return fmt.Errorf("reasoner %q already registered", name)
	}

	// Check if this should be delegated to a sub-router
	if r.parent != nil && containsPathSep(name) {
		r.mu.Unlock()
		seg, rest := splitFirstSegment(name)
		sub, ok := r.subRouters[seg]
		if !ok {
			// Auto-create sub-router for the path segment
			sub = &AgentRouter{
				reasoners:  make(map[string]*Reasoner),
				groups:     make(map[string]*ReasonerGroup),
				subRouters: make(map[string]*AgentRouter),
				parent:     r,
				name:       seg,
				backend:    r.backend,
			}
			r.mu.Lock()
			r.subRouters[seg] = sub
			r.mu.Unlock()
		}
		return sub.RegisterReasoner(rest, handler, opts...)
	}

	meta := &Reasoner{
		Name:         name,
		Handler:      handler,
		InputSchema:  json.RawMessage(`{"type":"object","additionalProperties":true}`),
		OutputSchema: json.RawMessage(`{"type":"object","additionalProperties":true}`),
	}
	for _, opt := range opts {
		opt(meta)
	}

	if meta.DefaultCLI {
		if r.defaultCLIReasoner != "" && r.defaultCLIReasoner != name {
			// Log warning if needed, for now just don't set as default
		} else {
			r.defaultCLIReasoner = name
		}
	}

	if meta.RequireRealtimeValidation && r.parent != nil {
		// Propagate to parent for realtime validation tracking
		_ = r.parent.trackRealtimeValidation(name)
	}

	r.reasoners[name] = meta
	return nil
}

// RegisterGroup registers a named group with optional metadata.
// Groups provide logical organization of related reasoners.
func (r *AgentRouter) RegisterGroup(name string, opts ...GroupOption) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.groups[name]; exists {
		return fmt.Errorf("group %q already registered", name)
	}

	group := &ReasonerGroup{Name: name}
	for _, opt := range opts {
		opt(group)
	}

	r.groups[name] = group
	return nil
}

// GetReasoner retrieves a reasoner by name, searching this router and all sub-routers.
// The name can be a simple name or a namespaced path.
func (r *AgentRouter) GetReasoner(name string) (*Reasoner, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getReasonerUnlocked(name)
}

// getReasonerUnlocked retrieves a reasoner without locking.
// Caller must hold the lock.
func (r *AgentRouter) getReasonerUnlocked(name string) (*Reasoner, bool) {
	// Direct lookup in this router
	if reasoner, ok := r.reasoners[name]; ok {
		return reasoner, true
	}

	// Check sub-routers if this is a path
	if containsPathSep(name) {
		seg, rest := splitFirstSegment(name)
		if sub, ok := r.subRouters[seg]; ok {
			return sub.getReasonerUnlocked(rest)
		}
	}

	return nil, false
}

// GetGroup retrieves a group by name.
func (r *AgentRouter) GetGroup(name string) (*ReasonerGroup, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if group, ok := r.groups[name]; ok {
		return group, true
	}
	return nil, false
}

// ListReasoners returns all reasoners in this router, optionally including sub-routers.
func (r *AgentRouter) ListReasoners(includeSubRouters bool) []*Reasoner {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*Reasoner, 0, len(r.reasoners))
	for _, reasoner := range r.reasoners {
		result = append(result, reasoner)
	}

	if includeSubRouters {
		for _, sub := range r.subRouters {
			result = append(result, sub.ListReasoners(true)...)
		}
	}

	return result
}

// ListGroups returns all groups in this router.
func (r *AgentRouter) ListGroups() []*ReasonerGroup {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*ReasonerGroup, 0, len(r.groups))
	for _, group := range r.groups {
		result = append(result, group)
	}
	return result
}

// GetSubRouter returns a sub-router by name, creating it if it doesn't exist.
func (r *AgentRouter) GetSubRouter(name string) *AgentRouter {
	r.mu.Lock()
	defer r.mu.Unlock()

	if sub, ok := r.subRouters[name]; ok {
		return sub
	}

	sub := &AgentRouter{
		reasoners:  make(map[string]*Reasoner),
		groups:     make(map[string]*ReasonerGroup),
		subRouters: make(map[string]*AgentRouter),
		parent:     r,
		name:       name,
		backend:    r.backend,
	}
	r.subRouters[name] = sub
	return sub
}

// Execute looks up and executes a reasoner by name.
func (r *AgentRouter) Execute(ctx context.Context, reasonerName string, input map[string]any) (any, error) {
	reasoner, ok := r.GetReasoner(reasonerName)
	if !ok {
		return nil, fmt.Errorf("unknown reasoner %q", reasonerName)
	}

	if input == nil {
		input = make(map[string]any)
	}
	return reasoner.Handler(ctx, input)
}

// Memory returns the router's memory backend if configured.
func (r *AgentRouter) Memory() *Memory {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.memory
}

// Backend returns the router's storage backend if configured.
func (r *AgentRouter) Backend() MemoryBackend {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.backend
}

// Set stores a value in the router's memory backend if configured.
func (r *AgentRouter) Set(ctx context.Context, key string, value any) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.memory != nil {
		return r.memory.GlobalScope().Set(ctx, key, value)
	}
	if r.backend != nil {
		return r.backend.Set(ScopeGlobal, "", key, value)
	}
	return fmt.Errorf("no memory backend configured for router")
}

// Get retrieves a value from the router's memory backend.
func (r *AgentRouter) Get(ctx context.Context, key string) (any, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.memory != nil {
		return r.memory.GlobalScope().Get(ctx, key)
	}
	if r.backend != nil {
		val, found, err := r.backend.Get(ScopeGlobal, "", key)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, nil
		}
		return val, nil
	}
	return nil, fmt.Errorf("no memory backend configured for router")
}

// FullPath returns the fully qualified path of a reasoner in the router hierarchy.
// For example, for "login" in sub-router "auth" of root router "api", returns "api/auth/login".
func (r *AgentRouter) FullPath(name string) string {
	if r.parent == nil {
		if r.name == "" {
			return name
		}
		return r.name + "/" + name
	}
	return r.parent.FullPath(r.name + "/" + name)
}

// Parent returns the parent router, if any.
func (r *AgentRouter) Parent() *AgentRouter {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.parent
}

// Name returns the router's name.
func (r *AgentRouter) Name() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.name
}

// GroupOption configures a ReasonerGroup.
type GroupOption func(*ReasonerGroup)

// WithGroupDescription sets the description for a group.
func WithGroupDescription(desc string) GroupOption {
	return func(g *ReasonerGroup) {
		g.Description = desc
	}
}

// WithGroupTags sets tags for a group.
func WithGroupTags(tags ...string) GroupOption {
	return func(g *ReasonerGroup) {
		g.Tags = tags
	}
}

// trackRealtimeValidation tracks a reasoner requiring realtime validation.
func (r *AgentRouter) trackRealtimeValidation(name string) error {
	// This would integrate with the parent's realtime validation system
	return nil
}

// containsPathSep checks if a name contains a path separator.
func containsPathSep(name string) bool {
	for _, c := range name {
		if c == '/' || c == '.' {
			return true
		}
	}
	return false
}

// splitFirstSegment splits a path at the first separator.
func splitFirstSegment(name string) (first, rest string) {
	for i, c := range name {
		if c == '/' || c == '.' {
			return name[:i], name[i+1:]
		}
	}
	return name, ""
}

// MergeFrom merges reasoners, groups, and sub-routers from another router into this one.
func (r *AgentRouter) MergeFrom(other *AgentRouter) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	other.mu.RLock()
	defer other.mu.RUnlock()

	// Merge reasoners
	for name, reasoner := range other.reasoners {
		if _, exists := r.reasoners[name]; exists {
			return fmt.Errorf("conflict: reasoner %q already exists", name)
		}
		r.reasoners[name] = reasoner
	}

	// Merge groups
	for name, group := range other.groups {
		if _, exists := r.groups[name]; exists {
			return fmt.Errorf("conflict: group %q already exists", name)
		}
		r.groups[name] = group
	}

	// Merge sub-routers recursively
	for name, sub := range other.subRouters {
		if existing, ok := r.subRouters[name]; ok {
			if err := existing.mergeFromUnlocked(sub); err != nil {
				return fmt.Errorf("conflict in sub-router %q: %w", name, err)
			}
		} else {
			// Clone the sub-router to avoid circular reference issues
			cloned := sub.clone()
			cloned.parent = r
			r.subRouters[name] = cloned
		}
	}

	return nil
}

// mergeFromUnlocked merges from another router without locking.
// Caller must hold locks for both routers.
func (r *AgentRouter) mergeFromUnlocked(other *AgentRouter) error {
	for name, reasoner := range other.reasoners {
		if _, exists := r.reasoners[name]; exists {
			return fmt.Errorf("conflict: reasoner %q already exists", name)
		}
		r.reasoners[name] = reasoner
	}

	for name, group := range other.groups {
		if _, exists := r.groups[name]; exists {
			return fmt.Errorf("conflict: group %q already exists", name)
		}
		r.groups[name] = group
	}

	for name, sub := range other.subRouters {
		if existing, ok := r.subRouters[name]; ok {
			if err := existing.mergeFromUnlocked(sub); err != nil {
				return fmt.Errorf("conflict in sub-router %q: %w", name, err)
			}
		} else {
			cloned := sub.clone()
			cloned.parent = r
			r.subRouters[name] = cloned
		}
	}

	return nil
}

// clone creates a deep copy of the router without parent reference.
func (r *AgentRouter) clone() *AgentRouter {
	r.mu.RLock()
	defer r.mu.RUnlock()

	cloned := &AgentRouter{
		reasoners:           make(map[string]*Reasoner, len(r.reasoners)),
		groups:              make(map[string]*ReasonerGroup, len(r.groups)),
		subRouters:          make(map[string]*AgentRouter, len(r.subRouters)),
		name:                r.name,
		memory:              r.memory,
		backend:             r.backend,
		defaultCLIReasoner: r.defaultCLIReasoner,
	}

	for name, reasoner := range r.reasoners {
		cloned.reasoners[name] = reasoner
	}

	for name, group := range r.groups {
		cloned.groups[name] = group
	}

	for name, sub := range r.subRouters {
		cloned.subRouters[name] = sub.clone()
	}

	return cloned
}
