package auth

import (
	"fmt"
	"net/http"
	"strings"
)

// APIKeyHeader is a strategy that adds an API key to a request header.
type APIKeyHeader struct{}

// Apply adds the secret as a header value.
// opts["header"] specifies the header name (default "X-API-Key").
// opts["prefix"] specifies an optional value prefix (e.g., "Bearer ").
func (a *APIKeyHeader) Apply(req *http.Request, secret string, opts map[string]interface{}) error {
	if strings.TrimSpace(secret) == "" {
		return fmt.Errorf("apikey_header auth: secret is empty")
	}

	headerName := "X-API-Key"
	value := secret
	if opts != nil {
		if h, ok := opts["header"].(string); ok && strings.TrimSpace(h) != "" {
			headerName = strings.TrimSpace(h)
		}
		if prefix, ok := opts["prefix"].(string); ok && strings.TrimSpace(prefix) != "" {
			value = strings.TrimSpace(prefix) + secret
		}
	}

	req.Header.Set(headerName, value)
	return nil
}
