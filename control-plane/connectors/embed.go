package connectors

import "embed"

//go:embed manifests/*/manifest.yaml manifests/*/icon.svg schema/connector.schema.json
var FS embed.FS
