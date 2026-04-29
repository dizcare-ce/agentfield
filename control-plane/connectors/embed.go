package connectors

import "embed"

//go:embed manifests/*/manifest.yaml schema/connector.schema.json
var FS embed.FS
