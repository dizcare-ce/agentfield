# Connector manifests

Each subdirectory here is one connector. AgentField bundles them into the
`af` binary at build time via Go `embed`. **A new connector is a directory
in this folder + a PR** — no Go code required for the common case.

## Layout

```
connectors/manifests/
├── _template/                 # copy this to scaffold a new connector
│   ├── manifest.yaml
│   └── icon.svg
├── github/
│   ├── manifest.yaml          # the connector definition
│   └── icon.svg               # branded SVG, ~3KB
├── slack/
│   ├── manifest.yaml
│   └── icon.svg
└── ...
```

## Adding a connector

```bash
cp -R connectors/manifests/_template connectors/manifests/<your-name>
$EDITOR connectors/manifests/<your-name>/manifest.yaml
# Replace icon.svg with the branded glyph (or leave the placeholder if no brand).
```

Then validate locally:

```bash
make connector-lint
```

The linter is a thin wrapper around the JSON Schema at
`connectors/schema/connector.schema.json`. It also checks that:

- `name` matches the directory name
- Every `auth.strategy`, `paginate.strategy`, and named transformer
  referenced in the manifest exists in the binary
- The icon resolves (file present or lucide name valid)
- Every URL template variable matches an input declared `in: path`
- Every input has a `description` field (so the SDK codegen produces
  non-empty docstrings)

## What this drives

One YAML edit ripples to:

| Surface | What it reads |
|---|---|
| Go HTTP executor | `auth`, `inbound`, `operations.*.{method, url, inputs, paginate, output, concurrency}` |
| SDK codegen (Python / TS / Go) | `name`, `operations.*.{display, description, inputs, output}` → typed bindings |
| Integrations page UI | `display`, `category`, `description`, `ui.{icon, brand_color, hover_blurb, highlights}` |
| Triggers page UI (when `inbound:` present) | `inbound.*` |
| Connector detail page UI | `operations.*.{display, description, ui.operation_icon, ui.tags}` |
| `agentfield-multi-reasoner-builder` skill reference | `description`, `operations.*` summary |
| `app.ai(tools=...)` schemas | `operations.*.{display, description, inputs}` |

Single-source-of-truth is non-negotiable — drift is structurally impossible
when there's nowhere else to put metadata.

## Out of scope (v1)

- **Operator sideloading.** v1 reads only from the embedded set. Adding
  a connector requires rebuilding the binary. v2 may support
  `/etc/agentfield/connectors/*` or a registry pull.
- **Dynamic auth strategies / paginators / transformers.** These are
  registered Go function tables (in `control-plane/internal/connectors/`).
  Manifests reference them by name. New strategies require Go code +
  PR review.
- **Active rate-limit caps.** v1 is reactive only (honors response
  headers). Active per-op `max_calls_per_minute` lands in v2.
- **Streaming responses.** Out of v1 entirely.

See `docs/plans/connector-framework.md` for the full design.
