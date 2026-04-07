package agent

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func verifierTestServer(t *testing.T, failPolicies *atomic.Bool, pubKey ed25519.PublicKey) *httptest.Server {
	t.Helper()

	jwkX := base64.RawURLEncoding.EncodeToString(pubKey)

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/api/v1/policies":
			if failPolicies != nil && failPolicies.Load() {
				http.Error(w, "boom", http.StatusInternalServerError)
				return
			}
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"policies": []map[string]any{
					{
						"name":            "allow-read",
						"allow_functions": []string{"read"},
						"action":          "allow",
						"priority":        10,
					},
				},
			}))
		case "/api/v1/revocations":
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"revoked_dids": []string{"did:example:revoked"},
			}))
		case "/api/v1/registered-dids":
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"registered_dids": []string{"did:example:registered"},
			}))
		case "/api/v1/admin/public-key":
			require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
				"issuer_did": "did:example:issuer",
				"public_key_jwk": map[string]any{
					"kty": "OKP",
					"crv": "Ed25519",
					"x":   jwkX,
				},
			}))
		default:
			t.Fatalf("unexpected verifier request %s %s", r.Method, r.URL.Path)
		}
	}))
}

func TestLocalVerifier_RefreshPopulatesCaches(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)

	server := verifierTestServer(t, nil, pub)
	defer server.Close()

	v := NewLocalVerifier(server.URL, time.Minute, "api-key")

	err = v.Refresh()
	require.NoError(t, err)

	require.Len(t, v.policies, 1)
	assert.Equal(t, "allow-read", v.policies[0].Name)
	assert.True(t, v.CheckRevocation("did:example:revoked"))
	assert.False(t, v.CheckRevocation("did:example:unknown"))
	_, registered := v.registeredDIDs["did:example:registered"]
	assert.True(t, registered)
	assert.Equal(t, pub, v.adminPublicKey)
	assert.Equal(t, "did:example:issuer", v.issuerDID)
	assert.True(t, v.initialized)
	assert.False(t, v.lastRefresh.IsZero())
}

func TestLocalVerifier_RefreshFailureLeavesPreviousCacheIntact(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)

	var failPolicies atomic.Bool
	server := verifierTestServer(t, &failPolicies, pub)
	defer server.Close()

	v := NewLocalVerifier(server.URL, time.Minute, "")
	require.NoError(t, v.Refresh())

	wantPolicies := append([]PolicyEntry(nil), v.policies...)
	wantLastRefresh := v.lastRefresh
	wantIssuer := v.issuerDID
	wantAdminKey := append(ed25519.PublicKey(nil), v.adminPublicKey...)

	failPolicies.Store(true)

	// Refresh itself returns the error and keeps the previous cache untouched.
	err = v.Refresh()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "fetch policies")
	assert.Equal(t, wantPolicies, v.policies)
	assert.Equal(t, wantLastRefresh, v.lastRefresh)
	assert.Equal(t, wantIssuer, v.issuerDID)
	assert.Equal(t, wantAdminKey, v.adminPublicKey)
	assert.True(t, v.CheckRevocation("did:example:revoked"))
}

func TestLocalVerifier_NeedsRefreshTracksLastRefresh(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)

	server := verifierTestServer(t, nil, pub)
	defer server.Close()

	v := NewLocalVerifier(server.URL, 50*time.Millisecond, "")
	require.NoError(t, v.Refresh())
	assert.False(t, v.NeedsRefresh())

	v.mu.Lock()
	v.lastRefresh = time.Now().Add(-2 * v.refreshInterval)
	v.mu.Unlock()

	assert.True(t, v.NeedsRefresh())
}

func TestLocalVerifier_ConcurrentRefreshAndCheckRevocation(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)

	server := verifierTestServer(t, nil, pub)
	defer server.Close()

	v := NewLocalVerifier(server.URL, time.Minute, "")
	require.NoError(t, v.Refresh())

	// 4 refreshers * 10 calls each = 40 sends; channel must hold them all
	// because the consumer drains only after wg.Wait().
	errCh := make(chan error, 40)
	var wg sync.WaitGroup

	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				errCh <- v.Refresh()
			}
		}()
	}

	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_ = v.CheckRevocation("did:example:revoked")
				_ = v.CheckRevocation("did:example:unknown")
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		assert.NoError(t, err)
	}
}

func TestLocalVerifier_CheckRegistrationBeforeFirstRefreshAllowsCaller(t *testing.T) {
	v := NewLocalVerifier("http://example.invalid", time.Minute, "")

	assert.True(t, v.CheckRegistration("did:example:anything"))
	assert.False(t, v.CheckRevocation("did:example:anything"))
}

func TestLocalVerifier_ResolvePublicKeyForDidKeyAndMalformedInput(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)

	v := NewLocalVerifier("http://example.invalid", time.Minute, "")

	encoded := base64.RawURLEncoding.EncodeToString(append([]byte{0xed, 0x01}, pub...))
	resolved := v.resolvePublicKey("did:key:z" + encoded)
	require.NotNil(t, resolved)
	assert.Equal(t, pub, resolved)

	var malformed ed25519.PublicKey
	assert.NotPanics(t, func() {
		malformed = v.resolvePublicKey("did:key:z%%%")
	})
	assert.Nil(t, malformed)
}

func TestLocalVerifier_RefreshUsesProvidedAPIKey(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)

	var seenAPIKey atomic.Value
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAPIKey.Store(r.Header.Get("X-API-Key"))
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/policies":
			_, _ = io.WriteString(w, `{"policies":[]}`)
		case "/api/v1/revocations":
			_, _ = io.WriteString(w, `{"revoked_dids":[]}`)
		case "/api/v1/registered-dids":
			_, _ = io.WriteString(w, `{"registered_dids":[]}`)
		case "/api/v1/admin/public-key":
			_, _ = io.WriteString(w, `{"issuer_did":"did:example:issuer","public_key_jwk":{"kty":"OKP","crv":"Ed25519","x":"`+base64.RawURLEncoding.EncodeToString(pub)+`"}}`)
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	v := NewLocalVerifier(server.URL, time.Minute, "secret-key")
	require.NoError(t, v.Refresh())
	assert.Equal(t, "secret-key", seenAPIKey.Load())
}
