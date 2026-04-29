package auth

import (
	"fmt"
	"net/http"
	"strings"
)

// Bearer is a strategy that applies a Bearer token to the Authorization header.
type Bearer struct{}

// Apply adds "Authorization: Bearer <secret>" to the request.
func (b *Bearer) Apply(req *http.Request, secret string, opts map[string]interface{}) error {
	if strings.TrimSpace(secret) == "" {
		return fmt.Errorf("bearer auth: secret is empty")
	}
	req.Header.Set("Authorization", "Bearer "+secret)
	return nil
}
