package connectors

import (
	"context"
	"fmt"
	"sync"

	"golang.org/x/sync/semaphore"
)

// Limiter enforces concurrency limits per (connector, operation) tuple.
type Limiter struct {
	mu         sync.RWMutex
	semaphores map[string]*semaphore.Weighted
}

// NewLimiter creates an empty concurrency limiter.
func NewLimiter() *Limiter {
	return &Limiter{
		semaphores: make(map[string]*semaphore.Weighted),
	}
}

// key returns the semaphore key for a (connector, operation) pair.
func (l *Limiter) key(connector, operation string) string {
	return connector + "::" + operation
}

// Acquire acquires a concurrency slot, returning a release function and any error.
func (l *Limiter) Acquire(ctx context.Context, connector, operation string, limit int64) (func(), error) {
	if limit <= 0 {
		limit = 10 // default per-operation limit
	}

	key := l.key(connector, operation)

	// Get or create semaphore
	l.mu.Lock()
	sem, ok := l.semaphores[key]
	if !ok {
		sem = semaphore.NewWeighted(limit)
		l.semaphores[key] = sem
	}
	l.mu.Unlock()

	// Acquire
	if err := sem.Acquire(ctx, 1); err != nil {
		return nil, fmt.Errorf("acquire concurrency slot for %s/%s: %w", connector, operation, err)
	}

	// Return release function
	return func() {
		sem.Release(1)
	}, nil
}
