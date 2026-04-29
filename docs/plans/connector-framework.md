# Connector Framework — Plan

**Status:** Design locked. Implementation lives on branch `feat/connector-framework-plan`. Will land as one PR when complete (no draft / tracking issue — this doc is the contract).

**Tracks:** Builds on the trigger system shipped in #506 (`feat/webhooks`). Triggers cover the inbound half (provider → CP → agent). This plan covers the symmetric outbound half (agent → CP → provider) **and unifies both halves under one connector definition** so a single YAML drives both inbound + outbound for a service.

## Decisions locked

The six open questions in §8 are resolved. Each answer below shapes Phases 1–3 directly.

| # | Question | Decision |
|---|---|---|
| 1 | Manifest source format | **YAML** for editing, JSON Schema for validation |
| 2 | Manifest packaging | **Embed only** via Go `embed`. All manifests in-tree under `connectors/manifests/<name>/`. No on-disk loader in v1 |
| 3 | Versioning | `version: "1.0"` per manifest. SDK codegen produces `v1.<connector>` namespace. Major bumps land as new files; old surface stays callable until deprecated |
| 4 | Per-operation rate limiting | **Reactive only in v1** — honor `Retry-After` and `X-RateLimit-Reset` response headers. Active per-op limits deferred to v2 |
| 5 | Operator sideloading of custom manifests | **Out of v1.** The loader reads exclusively from the embedded set. Adding a connector = PR. Sideloading is on the v2/v3 roadmap if customer demand surfaces |
| 6 | Concurrency limits | Per-connector and per-operation `max_in_flight` declared in the manifest. Default `max_in_flight: 10` per op, `50` per connector. Implemented as a semaphore per `(connector, op)` tuple in the executor |

These decisions are referenced inline through the rest of the doc.

---

## 1. Problem statement

Today, an AgentField agent can:

- Receive signed webhooks via the trigger system (Stripe, GitHub, Slack, generic_hmac, generic_bearer, cron).
- Call internal reasoners via `app.call(...)`.
- Call LLMs via `app.ai(...)`.

It cannot, in a unified way, call back out to external services (post a Slack message, comment on a GitHub issue, refund a Stripe charge, query a Postgres database) without each agent author hand-writing the HTTP client, secret handling, retry logic, and audit trail. We have one half of the picture (inbound triggers); we lack the other (outbound connectors).

We want:

- A single connector definition per external service that owns **both halves** when relevant (GitHub receives webhooks AND lets the agent comment back).
- Operator-grade secret handling: secrets stay on the control plane, the agent never sees them.
- A single binary as the user-facing artifact. No subprocesses, no separate user-managed services, no plugin install, no node/python runtime requirement on the host beyond what AgentField already ships.
- A path to a large catalog of services (~50+ within a quarter of GA) without exploding the maintenance surface.
- Type-safe SDK ergonomics (autocomplete, compile errors) on the user side.
- Drop-in to the existing operator UI (Integrations / Triggers pages) without bespoke per-service surfaces.
- Drop-in to `app.ai(tools=[...])` so an LLM-driven reasoner can use any connector operation as a tool.

## 2. Why not the obvious off-the-shelf options

| Option | Why it doesn't fit |
|---|---|
| **MCP (Model Context Protocol)** | Spec is fine, ecosystem is fine, but every MCP server is an external Node/Python process. Bundling them in the Docker image breaks the "one OS process, no plugin install" stance the maintainers want. Also pushes runtime dependencies the user can't see but can break |
| **Composio** | Open-source SDK exists but the catalog and OAuth gateway are gated by a managed cloud. We'd be betting our connector roadmap on their company. Not pure-OSS in the spirit that matters here |
| **n8n** | Sustainable Use License — explicit commercial restrictions on hosting it as a service. Disqualifying |
| **Trigger.dev / Kestra / Apache Camel** | Either wrong runtime (JVM / JS) or wrong shape (workflow orchestrators, not connector libraries we can embed) |
| **Pipedream OSS components** | ~2000 actions, MIT, no commercial entanglement on the components repo. But each action is a thin Node.js wrapper — running them requires shipping a Node runtime. We use Pipedream as **inspiration** (their action JSON tells us how to talk to each service) but don't depend on their runtime |
| **Hand-port Pipedream actions to Go** | Tempting but maintenance-prohibitive at 2000-action scale. Targeted curation only |
| **Singer / Airbyte / Meltano** | ELT-shaped (read-only data ingestion, not bidirectional API calls). Wrong layer |

The conclusion drove us to a manifest-driven framework with a Go executor.

## 3. Architecture

### 3.1 Single source of truth: the connector manifest

One YAML file per service. Drives **six downstream consumers** with no metadata duplication:

```
manifest.yaml ──┬── Go executor (operational fields: auth, URL, paginate, output)
                ├── SDK codegen → typed Python/TS/Go bindings (inputs/outputs/docstrings)
                ├── Integrations page UI (icon, display name, description, category)
                ├── Triggers page UI (when manifest declares an inbound block)
                ├── Connector detail / call-history UI (per-operation icon, tags, descriptions)
                ├── agentfield-multi-reasoner-builder skill reference (which connectors exist + ops)
                └── app.ai(tools=...) JSON Schema (operation description for LLM tool selection)
```

Single edit in YAML ripples to all six. Drift becomes structurally impossible.

### 3.2 Manifest schema (sketch)

Real schema lives in `control-plane/internal/connectors/manifest/schema.json` (JSON Schema, validated at load + linted in CI). High-level shape:

```yaml
# connectors/manifests/github/manifest.yaml
name: github
display: GitHub
category: Provider                             # Provider | Schedule | Generic | Internal
description: |
  Repository, pull-request, and workflow events. Comment back on issues,
  open PRs, react to webhook events, all signed with X-Hub-Signature-256.

# UI presentation — read by Integrations page + Connector detail page
ui:
  icon: { file: "./icon.svg" }                 # see §3.3
  brand_color: "#181717"
  hover_blurb: "Comment on issues, open PRs, react to repo events"
  highlights:                                  # the chips on the catalog card
    - pull_request
    - issues
    - push
    - workflow_run
  docs_url: "https://docs.agentfield.ai/connectors/github"

# Auth — references a strategy registered in the Go executor
auth:
  strategy: bearer                             # registered name; finite enum
  secret_env: GITHUB_PAT
  description: |
    GitHub personal access token with at least `repo:status` and
    `public_repo` scope. Generate at https://github.com/settings/tokens.

# Inbound — when this connector also receives webhooks
inbound:
  source_kind: http
  signature:
    strategy: hub_signature_256
    secret_env: GITHUB_WEBHOOK_SECRET
  event_types:
    - pull_request
    - issues
    - push
    - workflow_run

# Outbound operations — what the agent calls
operations:
  create_comment:
    display: Create comment on issue or PR
    description: |
      Adds a comment to an existing GitHub issue or pull request.
      Returns the created comment's ID and HTML URL.
    method: POST
    url: "https://api.github.com/repos/{owner}/{repo}/issues/{number}/comments"
    inputs:
      owner:
        type: string
        in: path
        description: Repository owner (org or user login)
        example: "octocat"
      repo:
        type: string
        in: path
        description: Repository name
        example: "hello-world"
      number:
        type: integer
        in: path
        description: Issue or PR number
        example: 42
      body:
        type: string
        in: body
        description: Markdown content of the comment
        example: "Thanks for the report — looking into it now."
    output:
      type: object
      schema:
        id:         { type: integer, jsonpath: "$.id" }
        html_url:   { type: string,  jsonpath: "$.html_url" }
        created_at: { type: string,  jsonpath: "$.created_at" }
    ui:
      operation_icon: { lucide: MessageSquare }
      tags: [write, social]

  list_issues:
    display: List issues in a repository
    description: Returns issues, optionally filtered by state.
    method: GET
    url: "https://api.github.com/repos/{owner}/{repo}/issues"
    inputs:
      owner: { type: string,  in: path }
      repo:  { type: string,  in: path }
      state:
        type: string
        in: query
        default: open
        enum: [open, closed, all]
    paginate:
      strategy: github_link_header               # registered named paginator
      max_pages: 10
    output:
      type: array
      schema:
        items:
          number:   { jsonpath: "$.number"   }
          title:    { jsonpath: "$.title"    }
          state:    { jsonpath: "$.state"    }
          html_url: { jsonpath: "$.html_url" }
    concurrency:
      max_in_flight: 5                            # per-op cap; default 10
    ui:
      operation_icon: { lucide: List }
      tags: [read]

# Per-connector concurrency (default 50)
concurrency:
  max_in_flight: 25                                # caps total in-flight ops
  default_op_max_in_flight: 10                     # default for ops that omit it
```

A linter validates: every `auth.strategy`, `paginate.strategy`, and `output.transformer` references something registered in code; every input has a description; the icon resolves; the URL template variables match the inputs declared `in: path`.

### 3.3 Icon strategy — two source types

Lucide alone is insufficient — it covers ~3 of the 10 priority brands (GitHub, Slack, generics). For Stripe, Linear, Notion, Twilio, Google APIs, etc., users recognize the brand glyph; replacing them with generic icons hurts the catalog page's usability.

| Source | When | What ships |
|---|---|---|
| `{ file: "./icon.svg" }` | **Branded services** — most connectors | A ~3KB SVG sits next to the manifest, embedded in the binary at build-time via Go `embed` |
| `{ lucide: "Clock" }` | **Generic operations / categories** — cron, http, smtp, schedule strips, per-operation row icons | Reuses the lucide set already imported in `components/ui/icon-bridge.tsx` |

Two source types instead of three; we drop the simple-icons-database approach because (a) it's 10MB, (b) per-manifest SVG is more maintainable per-service. Adding a new connector means adding `manifest.yaml + icon.svg` in the same directory — one mental unit.

CP exposes `GET /api/v1/connectors/:name/icon[/:operation]` returning the resolved SVG. UI: `<img src=...>`. Single line.

### 3.4 Go executor — narrow extension surface

The executor is a single Go package, `control-plane/internal/connectors/`:

| Concern | Where it lives |
|---|---|
| Manifest load + validate | `manifest/loader.go` — reads YAML from the **embedded `connectors/manifests/` tree only**, validates against JSON Schema, registers operations into the runtime registry. No disk fallback in v1 |
| Auth strategies | `auth/{bearer.go, apikey_header.go, apikey_query.go, hmac.go, oauth2.go, aws_sigv4.go}` — registered Go function table. Manifest references by name. **Finite, slow-growing set (~10 ever)** |
| Pagination | `paginate/{github_link_header.go, cursor.go, offset.go}` — registered named paginators. Manifest references by name |
| Response transformers | `transform/{jsonpath.go, github_link_merge.go, ...}` — for the rare case where a response needs flattening or accumulation. Used by ~5% of operations |
| Concurrency gate | `concurrency.go` — per-`(connector, op)` semaphore enforcing `max_in_flight`. Default 10 per op / 50 per connector when manifest omits the field |
| Reactive rate-limit handler | inside `executor.go` — parses `Retry-After`, `X-RateLimit-Reset`, `X-RateLimit-Remaining` on the response and either returns a typed `RateLimitedError` or sleeps-and-retries based on manifest `retry` policy |
| Request executor | `executor.go` — builds HTTP request from manifest op + inputs, injects auth, sends, runs paginator if declared, runs transformers, returns shaped output |
| Audit | `audit.go` — writes `connector_invocations` row per call (run_id, reasoner_id, connector, operation, redacted inputs, status, duration, error) |
| Secret resolution | `secrets.go` — reads from CP host env at request time. Same posture as the trigger system |

The format-creep risk is contained by the named-strategy / named-transformer pattern. Anything the manifest can express stays declarative; the few things that can't escape into a registered Go function with a name. **5% of operations need an escape hatch; the other 95% are pure YAML.**

### 3.5 SDK codegen — typed bindings without unifying the runtime

Manifests describe operation shapes with full input + output schemas. A codegen step at SDK build time converts each `operations.*` block into typed bindings:

```python
# generated by `make generate-sdk-connectors`
# sdk/python/agentfield/connectors/github.py

class CreateCommentOutput(TypedDict):
    id: int
    html_url: str
    created_at: str

async def create_comment(
    *,
    owner: str,
    repo: str,
    number: int,
    body: str,
) -> CreateCommentOutput:
    """Adds a comment to an existing GitHub issue or pull request.

    Returns the created comment's ID and HTML URL.
    """
    return await _connector_call("github", "create_comment",
        owner=owner, repo=repo, number=number, body=body,
    )
```

The runtime stays unified (one Go executor, one HTTP path, one audit row per call). The SDK stays typed. Best of both.

### 3.6 SDK surface — three usage modes, one backend

```python
# Generic — works for any operation, dynamic
result = await app.connector.call(
    "airtable", "list_records",
    base_id="appXXX", table="Tasks", view="Open",
)

# Typed (codegen'd from manifest) — autocomplete, compile errors
from agentfield.connectors import github
comment = await github.create_comment(
    owner="octocat", repo="hello-world", number=42,
    body=f"AgentField summary: {summary}",
)

# Tool-style for app.ai — connector ops auto-converted to tool schemas
await app.ai(
    system="You triage GitHub issues",
    user=issue_body,
    tools=[github.create_comment, slack.post_message],
)
```

All three paths terminate at the same `POST /api/v1/connectors/:name/:op` CP endpoint. Same audit log. Same secret model. Same error surface.

### 3.7 Database schema additions

```sql
CREATE TABLE connector_invocations (
    id                TEXT PRIMARY KEY,
    run_id            TEXT NOT NULL,           -- workflow that issued the call
    execution_id      TEXT NOT NULL,           -- reasoner step that issued the call
    agent_node_id     TEXT NOT NULL,
    connector_name    TEXT NOT NULL,
    operation_name    TEXT NOT NULL,
    inputs_redacted   TEXT,                    -- JSON, with secret-marked fields removed
    status            TEXT NOT NULL,           -- pending | succeeded | failed
    http_status       INTEGER,
    error_message     TEXT,
    duration_ms       INTEGER,
    started_at        TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ,
    -- VC chain hooks for provenance
    parent_vc_id      TEXT,
    invocation_vc_id  TEXT
);

CREATE INDEX idx_connector_invocations_run   ON connector_invocations(run_id);
CREATE INDEX idx_connector_invocations_conn  ON connector_invocations(connector_name, operation_name);
CREATE INDEX idx_connector_invocations_time  ON connector_invocations(started_at DESC);
```

## 4. UI integration

### 4.1 Integrations page (existing, extends)

The catalog cards already exist for trigger sources. Connector manifests slot in as the same kind of card; the `category` field decides where they sort. A connector with both `inbound` AND `operations` (like GitHub) gets one card that surfaces both halves on the detail sheet.

### 4.2 Active connectors page (new, sibling to `/triggers`)

Mirrors the operator surface for triggers but for outbound:

- Source / target / latest call / 24h success rate / enabled / kebab.
- Click a row → sheet with per-call audit history, inputs (redacted), outputs, retry status.
- Same table grammar as `/triggers` so an operator's mental model is "every wiring on this surface looks the same."

### 4.3 Run detail page (existing, extends)

The Webhooks card already shows Inbound + Outbound (callbacks). It gains a third row group: **Connector calls** — every `connector_invocations` row tied to this run, click-through to the connector sheet.

## 5. Skill integration

The `agentfield-multi-reasoner-builder` skill needs to know:

- That connectors exist and when to reach for them (vs hand-rolling HTTP from a reasoner).
- Which connectors are bundled and what each one's top operations are.
- The DX shape (typed import vs generic call vs tool-style).

A new reference `skills/agentfield-multi-reasoner-builder/references/connectors.md` lists the bundled connector names + key operations + when-to-use guidance. The reference is **generated from the manifests** at skill-build time so it stays in sync; the writeup is per-manifest in the `description` field.

## 6. Phased rollout

### Phase 0 — design lock (this document)

Review, iterate, lock the manifest schema. **Output:** the `[Epic] Connector Framework` issue with all sub-issues filed.

### Phase 1 — Framework (4 weeks)

- Manifest schema + JSON Schema validator + linter
- Go executor (auth dispatcher, manifest loader **(embed-only)**, request builder, JSONPath response mapper, audit writer)
- Auth strategies: `bearer`, `apikey_header`, `apikey_query`, `hmac`, `oauth2_with_refresh` (5 of the eventual ~10)
- Pagination: `cursor`, `offset`, `link_header`, `github_link_header` (named, registered)
- **Concurrency control:** semaphore-per-`(connector, op)` enforcing `max_in_flight` from manifest (defaults 10 per op / 50 per connector)
- **Reactive rate-limit handling:** parse `Retry-After` + `X-RateLimit-Reset` and back off; no active per-op caps yet
- CP API: `POST /api/v1/connectors/:name/:op`, `GET /api/v1/connectors`, `GET /api/v1/connectors/:name/icon`
- DB migration for `connector_invocations`
- Secret resolution layer
- SDK shim: `app.connector.call(name, op, **kw)` (Python first, Go and TS in Phase 1.5)
- One full reference connector (**GitHub**) end-to-end as the validation target

**Out of Phase 1 scope (locked):** disk-based manifest loading, `/etc/agentfield/connectors/` sideloading, hot-reload, active per-op `max_calls_per_minute`. All deferred to v2 if real demand surfaces.

**Acceptance:** an agent can `await app.connector.call("github", "create_comment", ...)` with `GITHUB_PAT` set on the CP host, the call lands as a real comment on a GitHub issue, the audit row appears in `connector_invocations`, the operator UI shows the card. Concurrency cap demonstrably holds under a `gather`-of-50 load test.

### Phase 2 — UI surfaces + codegen (3 weeks)

- Integrations page extends to render connector cards alongside trigger sources
- Active connectors page (`/connectors`) — list + sheet + audit history
- Run detail page Webhooks card extends with Connector calls block
- SDK codegen for typed Python bindings (`from agentfield.connectors import github`)
- `app.ai(tools=...)` integration: pass a typed binding, get a tool schema for free

**Acceptance:** the operator can browse the catalog, view per-call audit history, replay failed calls; agent code can use either the typed or generic SDK with the same backend.

### Phase 3 — Connector catalog v1 (3 weeks)

10 hand-curated manifests covering 90% of agent use cases:

| Connector | Top operations |
|---|---|
| github | create_comment, list_issues, create_issue, list_prs, create_pr |
| slack | post_message, react, list_channels, file_upload |
| linear | create_issue, comment, transition |
| notion | create_page, append_block, query_database |
| stripe | refund, list_charges, create_customer |
| postgres (over CP HTTP proxy) | query, exec |
| http_generic | get, post, put, delete |
| email_smtp | send |
| email_resend | send |
| twilio | send_sms |

Each manifest ships `manifest.yaml` + `icon.svg` in `connectors/manifests/<name>/`.

**Acceptance:** `make connector-lint` passes on all 10. End-to-end test: `app.connector.call("slack", "post_message", channel="...", text="...")` posts to a real demo workspace.

### Phase 4 — TS / Go SDK codegen + skill reference

- TS codegen from manifests
- Go codegen from manifests
- Skill reference `connectors.md` auto-generated from manifests
- `agentfield-multi-reasoner-builder` skill updated to teach connectors

**Acceptance:** the skill emits correct connector usage in scaffolds across all three SDKs without follow-up corrections.

### Phase 5 — Community manifest path

- `tools/connector-scaffold` CLI generates a manifest skeleton
- CONTRIBUTING-CONNECTORS.md documents the manifest format with examples
- CI `connector-lint` job runs on every PR touching `connectors/manifests/`
- Tier 1 manifests get a "core" badge in the UI; community manifests carry their author attribution

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Format creep — manifest grows into a Turing-complete DSL | Hold the line: anything not declarative goes into a named registered Go function. Auditable. Finite. **Reject any PR that makes the manifest schema express logic.** |
| Bundle size — embedding SVGs and YAML in the binary | Per-manifest SVG ~3KB; 30 connectors = ~100KB SVG. Manifests ~5KB each = ~150KB YAML. Negligible compared to the ~50MB Go binary |
| OAuth token refresh for connectors that need it | Register `oauth2_with_refresh` as a named auth strategy. Manifest declares refresh URL + slot for refresh-token secret. Executor handles 401 → refresh → retry once |
| Streaming responses (SSE / chunked LLM completions) | Out of scope for v1. When needed, register a named `stream` transformer that yields chunks back to the agent. Document the limitation explicitly in the connector manifest |
| Per-service quirks we didn't anticipate | Named transformer escape hatch absorbs them. If 30%+ of new connectors need a custom transformer, the manifest format is missing something — revisit the schema |
| Maintenance of bundled manifests | Tier 1 connectors get integration tests in `tests/functional/connectors/`. Each runs against the real service in a sandbox tenant. Failures are CI alerts |
| Secret leakage via audit log | `inputs_redacted` excludes any field marked `sensitive: true` in the manifest. Linter enforces that auth-related fields are marked. Audit log is queryable only by operators with the `connector:audit` capability |
| Drift between bundled `icon.svg` and the brand's actual logo | Quarterly visual-diff CI job compares each `icon.svg` against the brand's known canonical URL. Drift triggers a PR (manual review for trademark concerns) |

## 8. Open questions — RESOLVED

All six are locked. Recorded here for audit.

1. **Manifest source format** — ✅ YAML for human edits, JSON Schema for the validator. Trigger-source-plugin shape extended.
2. **Manifest packaging** — ✅ Embed only via Go `embed`. No sideload path in v1; loader reads exclusively from the embedded set. Operators wanting custom connectors fork the repo or wait for the v2 sideload story.
3. **Connector versioning** — ✅ `version: "1.0"` per manifest. Codegen emits `agentfield.connectors.v1.<name>`. Major bumps live alongside the prior major until deprecated.
4. **Per-operation rate limiting** — ✅ Reactive only in v1 (response-header-driven `Retry-After` + `X-RateLimit-Reset`). Active per-op caps land in v2 when a real customer hits a bound.
5. **Authoring workflow / sideloading** — ✅ Out of v1. Adding a connector means opening a PR with the new manifest dir. Simpler executor, simpler audit story, simpler security review.
6. **Concurrency limits** — ✅ Per-connector + per-operation `max_in_flight` in the manifest. Defaults: `10` per op, `50` per connector. Semaphore per `(connector, op)` tuple in the executor.

## 9. Out of scope (to be scoped separately if requested)

- **Streaming responses.** Not in v1.
- **Per-tenant rate limit budgets.** Multi-tenant scenarios.
- **Connector marketplace.** Even if we build the manifest format such that a marketplace is possible, the marketplace itself is a separate product surface.
- **Workflow primitives that span multiple connector calls.** That's already what reasoners are; connectors are leaves under reasoners, not orchestration.
- **Inbound webhook auth strategies beyond the six already in the trigger system.** Add new ones via the existing trigger source plugin path.

## 10. References

- Trigger system reference implementation: `examples/triggers-demo/`, `sdk/python/agentfield/triggers.py`, `internal/sources/`
- Trigger-parity epics for SDK precedent: #507 (TypeScript), #508 (Go)
- Pipedream open-source action catalog (used as inspiration, not dependency): https://github.com/PipedreamHQ/pipedream/tree/master/components
- MCP spec (considered, deferred for the reasons in §2): https://modelcontextprotocol.io
- simple-icons (considered, deferred for the reasons in §3.3): https://github.com/simple-icons/simple-icons

---

**Next step:** convert this plan into the `[Epic] Connector Framework` GitHub issue with sub-issues per phase, file under the **SDK Feature Parity** milestone, label `enhancement, area:sdk, ai-friendly, epic`. Don't start Phase 1 implementation until the open questions in §8 are resolved.
