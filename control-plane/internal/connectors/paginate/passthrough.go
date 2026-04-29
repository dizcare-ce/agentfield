package paginate

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

// Passthrough returns the first response without following pagination links.
type Passthrough struct{}

// Do executes a single request and reads its response body.
func (Passthrough) Do(ctx context.Context, req *http.Request, do DoFunc, _ map[string]interface{}) ([]Page, error) {
	if req == nil {
		return nil, fmt.Errorf("passthrough pagination: request is nil")
	}
	if do == nil {
		return nil, fmt.Errorf("passthrough pagination: do function is nil")
	}
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("passthrough pagination: context error: %w", err)
	}

	resp, err := do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}
	return []Page{{
		StatusCode: resp.StatusCode,
		Header:     resp.Header.Clone(),
		Body:       body,
	}}, nil
}
