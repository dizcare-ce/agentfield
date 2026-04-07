package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Agent-Field/agentfield/control-plane/internal/events"
	"github.com/Agent-Field/agentfield/control-plane/internal/storage"
	"github.com/Agent-Field/agentfield/control-plane/pkg/types"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

type memoryEventSubscription struct {
	scope   string
	scopeID string
	ch      chan types.MemoryChangeEvent
}

type memoryEventStorageStub struct {
	storage.StorageProvider
	mu           sync.Mutex
	subs         map[int]*memoryEventSubscription
	nextID       int
	subscribeErr error
}

func newMemoryEventStorageStub() *memoryEventStorageStub {
	return &memoryEventStorageStub{
		subs: make(map[int]*memoryEventSubscription),
	}
}

func (s *memoryEventStorageStub) SubscribeToMemoryChanges(ctx context.Context, scope, scopeID string) (<-chan types.MemoryChangeEvent, error) {
	if s.subscribeErr != nil {
		return nil, s.subscribeErr
	}

	sub := &memoryEventSubscription{
		scope:   scope,
		scopeID: scopeID,
		ch:      make(chan types.MemoryChangeEvent, 16),
	}

	s.mu.Lock()
	id := s.nextID
	s.nextID++
	s.subs[id] = sub
	s.mu.Unlock()

	go func() {
		<-ctx.Done()
		s.mu.Lock()
		if existing, ok := s.subs[id]; ok {
			delete(s.subs, id)
			close(existing.ch)
		}
		s.mu.Unlock()
	}()

	return sub.ch, nil
}

func (s *memoryEventStorageStub) publish(event types.MemoryChangeEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, sub := range s.subs {
		if sub.scope != "" && sub.scope != event.Scope {
			continue
		}
		if sub.scopeID != "" && sub.scopeID != event.ScopeID {
			continue
		}

		select {
		case sub.ch <- event:
		default:
		}
	}
}

func (s *memoryEventStorageStub) ActiveSubscriptions() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.subs)
}

func (s *memoryEventStorageStub) GetExecutionEventBus() *events.ExecutionEventBus {
	return events.NewExecutionEventBus()
}

func (s *memoryEventStorageStub) GetWorkflowExecutionEventBus() *events.EventBus[*types.WorkflowExecutionEvent] {
	return events.NewEventBus[*types.WorkflowExecutionEvent]()
}

func (s *memoryEventStorageStub) GetExecutionLogEventBus() *events.EventBus[*types.ExecutionLogEntry] {
	return events.NewEventBus[*types.ExecutionLogEntry]()
}

func newMemoryEvent(scope, scopeID, key string) types.MemoryChangeEvent {
	return types.MemoryChangeEvent{
		ID:        fmt.Sprintf("%s:%s:%s", scope, scopeID, key),
		Type:      "memory.changed",
		Timestamp: time.Now().UTC(),
		Scope:     scope,
		ScopeID:   scopeID,
		Key:       key,
		Action:    "set",
		Data:      json.RawMessage(`{"ok":true}`),
	}
}

func newMemoryEventsRouter(store storage.StorageProvider) *gin.Engine {
	handler := NewMemoryEventsHandler(store)
	router := gin.New()
	router.GET("/ws", handler.WebSocketHandler)
	router.GET("/sse", handler.SSEHandler)
	return router
}

func waitForCondition(t *testing.T, timeout time.Duration, fn func() bool, msg string) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if fn() {
			return
		}
		runtime.Gosched()
	}
	t.Fatalf("condition not met: %s", msg)
}

func startSSERead(body io.Reader) (<-chan string, <-chan error) {
	dataCh := make(chan string, 1)
	errCh := make(chan error, 1)

	go func() {
		reader := bufio.NewReader(body)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				errCh <- err
				return
			}
			if strings.HasPrefix(line, "data:") {
				dataCh <- strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				return
			}
		}
	}()

	return dataCh, errCh
}

func TestMemoryEventsHandler_WebSocketUpgradeFailureReturnsBadRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := newMemoryEventStorageStub()
	router := newMemoryEventsRouter(store)

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	resp := httptest.NewRecorder()

	router.ServeHTTP(resp, req)

	require.Equal(t, http.StatusBadRequest, resp.Code)
}

func TestMemoryEventsHandler_WebSocketUpgradeAndPatternFilter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := newMemoryEventStorageStub()
	server := httptest.NewServer(newMemoryEventsRouter(store))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws?patterns=user.*", nil)
	require.NoError(t, err)
	defer conn.Close()

	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 1
	}, "websocket subscription should become active")

	store.publish(newMemoryEvent("session", "s1", "system.name"))
	store.publish(newMemoryEvent("session", "s1", "user.name"))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(time.Second)))

	var event types.MemoryChangeEvent
	require.NoError(t, conn.ReadJSON(&event))
	require.Equal(t, "user.name", event.Key)
	require.Equal(t, "session", event.Scope)
	require.Equal(t, "s1", event.ScopeID)
}

func TestMemoryEventsHandler_SSEHappyPathHonorsScopeFilter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := newMemoryEventStorageStub()
	server := httptest.NewServer(newMemoryEventsRouter(store))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/sse?scope=session&scope_id=s1", nil)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, resp.Header.Get("Content-Type"), "text/event-stream")

	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 1
	}, "sse subscription should become active")

	dataCh, errCh := startSSERead(resp.Body)

	store.publish(newMemoryEvent("session", "s2", "user.blocked"))
	store.publish(newMemoryEvent("session", "s1", "user.allowed"))

	select {
	case line := <-dataCh:
		require.Contains(t, line, "user.allowed")
		require.NotContains(t, line, "user.blocked")
	case err := <-errCh:
		t.Fatalf("unexpected SSE read error: %v", err)
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for SSE event")
	}

	cancel()
	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 0
	}, "sse subscription should be released after cancel")
}

func TestMemoryEventsHandler_SSEInvalidPatternDropsEventsAndDisconnectCleansUp(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := newMemoryEventStorageStub()
	server := httptest.NewServer(newMemoryEventsRouter(store))
	defer server.Close()

	baseline := runtime.NumGoroutine()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/sse?patterns=[invalid", nil)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 1
	}, "invalid-pattern subscription should still connect")

	dataCh, errCh := startSSERead(resp.Body)
	store.publish(newMemoryEvent("session", "s1", "user.allowed"))

	select {
	case line := <-dataCh:
		t.Fatalf("unexpected SSE event for invalid pattern: %s", line)
	case err := <-errCh:
		t.Fatalf("unexpected SSE read error before disconnect: %v", err)
	case <-time.After(200 * time.Millisecond):
	}

	cancel()
	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 0 && runtime.NumGoroutine() <= baseline+8
	}, "disconnect should release subscription without leaking goroutines")
}

func TestMemoryEventsHandler_WebSocketBackpressureDisconnectsCleanly(t *testing.T) {
	gin.SetMode(gin.TestMode)

	store := newMemoryEventStorageStub()
	server := httptest.NewServer(newMemoryEventsRouter(store))
	defer server.Close()

	baseline := runtime.NumGoroutine()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/ws", nil)
	require.NoError(t, err)

	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 1
	}, "websocket subscription should become active")

	for i := 0; i < 100; i++ {
		store.publish(newMemoryEvent("session", "s1", fmt.Sprintf("user.%d", i)))
	}

	require.NoError(t, conn.Close())
	server.CloseClientConnections()
	store.publish(newMemoryEvent("session", "s1", "user.after-close"))

	waitForCondition(t, time.Second, func() bool {
		return store.ActiveSubscriptions() == 0 && runtime.NumGoroutine() <= baseline+10
	}, "closing websocket should release subscription after burst publish")
}
