package paginate

import (
	"context"
	"net/http"
)

// Page represents one page of results.
type Page struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

// DoFunc executes a single request and returns the response.
type DoFunc func(*http.Request) (*http.Response, error)

// Strategy implements pagination for a particular strategy (cursor, offset, link header, etc.).
type Strategy interface {
	// Do executes the request and returns pages.
	// It may call doFunc multiple times to fetch subsequent pages.
	Do(ctx context.Context, req *http.Request, doFunc DoFunc, opts map[string]interface{}) ([]Page, error)
}
