package auth

import "net/http"

// Strategy applies authentication credentials to an HTTP request.
type Strategy interface {
	// Apply adds authentication to the request using the given secret.
	// opts contains strategy-specific options (e.g., header name for apikey_header).
	Apply(req *http.Request, secret string, opts map[string]interface{}) error
}
