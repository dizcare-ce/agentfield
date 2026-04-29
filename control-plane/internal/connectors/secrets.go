package connectors

import (
	"fmt"
	"os"
	"strings"
)

// SecretResolver resolves a secret value by environment variable name.
type SecretResolver interface {
	Resolve(envVar string) (string, error)
}

// EnvSecretResolver reads secrets from process environment variables.
type EnvSecretResolver struct{}

// Resolve reads envVar from os.Getenv.
func (EnvSecretResolver) Resolve(envVar string) (string, error) {
	envVar = strings.TrimSpace(envVar)
	if envVar == "" {
		return "", fmt.Errorf("resolve secret: environment variable name is required")
	}
	value, ok := os.LookupEnv(envVar)
	if !ok {
		return "", fmt.Errorf("resolve secret: environment variable %q not found", envVar)
	}
	if strings.TrimSpace(value) == "" {
		return "", fmt.Errorf("resolve secret: environment variable %q is empty", envVar)
	}
	return value, nil
}

// Resolve reads envVar from os.Getenv.
func Resolve(envVar string) (string, error) {
	return EnvSecretResolver{}.Resolve(envVar)
}
