# Trigger / Source Plugin System

## Context

AgentField currently has no inbound event surface. Reasoners are code-defined and can only be invoked synchronously through the control plane's reasoner-proxy route. The existing "webhook" code is outbound-only (control plane → external observability sink). To support production agent use cases — Stripe payments, GitHub events, Slack messages, scheduled jobs — we need a generic, modular **Trigger/Source** system that:

- Ships first-party Go plugins compiled into the single binary (Caddy-style), with `Source` interface for community PRs.
- Is generic enough to cover webhooks **and** cron/schedule **and** future polling/queue sources under one abstraction.
- Provides both **code-first DX** (Python/Go SDK decorators alongside `@reasoner`) and a **UI** for managing instances, secrets-by-env-var-name, and event replay — without the two surfaces conflicting.
- Persists every inbound event and mints a Verifiable Credential, so the existing audit/VC chain extends from "this Stripe event arrived" → "it triggered this reasoner run" → "which produced this output."

**Resolution to the dual UI/code DX question:** code declares **capability** (a reasoner says "I handle Stripe `payment.succeeded`"); UI/API declares **instances** (Trigger rows with config + secret env var + target reasoner). Code-declared bindings auto-create `managed_by='code'` instances on agent registration that UI cannot delete. UI may add additional `managed_by='ui'` instances pointed at the same reasoner. No conflict, both surfaces coexist.

## Scope (v1)

**In:** Stripe, GitHub, Slack, generic-HMAC, generic-bearer, cron — first-party Go impls. Inbound event store. VC for every event chained into downstream execution VC. Triggers UI page. Python `@on_event` / `@on_schedule` decorators. Go `WithEventTrigger` / `WithScheduleTrigger` reasoner options. Replay button. Always-200-to-provider semantics with async dispatch + DLQ.

**Out (future):** encrypted secret store (env vars only), multi-tenant scoping, queue/SQS/Kafka sources, `stripe listen`-style local tunnel, batch ingestion, per-trigger retry policy, plugin hot-reload.

## Implementation

### 1. Go `Source` interface and registry

New tree at `control-plane/internal/sources/`:

```
sources/
  source.go         # interfaces, types, registry
  registry.go       # Register / Get / List
  all/all.go        # blank-import aggregator (single import in server.go fires all init())
  stripe/stripe.go
  github/github.go
  slack/slack.go
  generichmac/hmac.go
  genericbearer/bearer.go
  cron/cron.go
```

Interface signatures in `sources/source.go`:

```go
type Kind int
const ( KindHTTP Kind = iota; KindLoop )

type Source interface {
    Name() string
    Kind() Kind
    ConfigSchema() json.RawMessage   // JSON schema for UI form
    SecretRequired() bool
    Validate(cfg json.RawMessage) error
}

type HTTPSource interface {
    Source
    HandleRequest(ctx context.Context, req *RawRequest, cfg json.RawMessage, secret string) ([]Event, error)
}

type LoopSource interface {
    Source
    Run(ctx context.Context, cfg json.RawMessage, secret string, emit func(Event)) error
}

type RawRequest struct { Headers http.Header; Body []byte; URL *url.URL; Method string }
type Event struct {
    Type           string
    IdempotencyKey string         // provider event id; used for dedup
    Raw            json.RawMessage
    Normalized     json.RawMessage
    ReceivedAt     time.Time
}
```

Each impl registers in its `init()`: `sources.Register("stripe", New())`. `HTTPSource` impls own signature verification (Stripe `Stripe-Signature`, GitHub `X-Hub-Signature-256`, Slack `X-Slack-Signature`, generic HMAC, generic bearer). Verification failure → error → 401. Cron's `LoopSource.Run` ticks per cron expression and emits one `Event{Type:"tick"}` per fire.

### 2. Storage schema

New goose migration `control-plane/migrations/029_create_triggers.sql`:

- `triggers (id TEXT PK, source_name, config_json, secret_env_var, target_node_id, target_reasoner, managed_by CHECK IN ('code','ui'), enabled, created_at, updated_at)` with unique partial index `(target_node_id, target_reasoner, source_name) WHERE managed_by='code'` for code-managed upsert idempotency.
- `inbound_events (id PK, trigger_id FK, source_name, event_type, raw_payload, normalized_payload, idempotency_key, vc_id, status, received_at, processed_at)` with unique `(source_name, idempotency_key)` for dedup.

Mirror into the SQLite local backend. Storage interface additions in `control-plane/internal/storage/storage.go`: `CreateTrigger`, `GetTrigger`, `ListTriggers`, `UpdateTrigger`, `DeleteTrigger`, `UpsertCodeManagedTrigger`, `InsertInboundEvent`, `GetInboundEvent`, `ListInboundEvents`, `MarkInboundEventProcessed`.

### 3. HTTP routes

Wire from `control-plane/internal/server/routes.go` (existing pattern around `reasoners.go:80`). Two new handler files: `internal/handlers/triggers.go` (auth-gated UI CRUD) and `internal/handlers/sources_ingest.go` (public ingest, no auth middleware).

- `POST /sources/{trigger_id}` — public. Look up trigger → resolve `Source` from registry → `os.Getenv(trigger.SecretEnvVar)` → `HandleRequest` → for each event: dedup by `(source_name, idempotency_key)`, persist `inbound_events`, mint trigger event VC, async-dispatch to reasoner. **Always 200** after persistence; dispatch failures go to DLQ.
- `GET/POST/PUT/DELETE /api/v1/triggers[/:id]` — UI CRUD; reject delete when `managed_by='code'`.
- `GET /api/v1/triggers/{id}/events` — paginated history.
- `POST /api/v1/triggers/{id}/events/{event_id}/replay` — re-dispatch; new execution VC chained to original trigger event VC.
- `GET /api/v1/sources` — list registered plugins with `{name, kind, secret_required, config_schema}` from `sources.List()`.

### 4. SDK code-first binding

**Design rule**: `@reasoner` kwargs are *declarative facts about the reasoner* (schema, tags, triggers). Behavior modifiers (auth, retry, rate-limit) stay as separate decorators. This prevents `@reasoner` from drifting into a god-decorator while keeping triggers — which describe what the reasoner *is for* — co-located with its definition.

**Python** (`sdk/python/agentfield/decorators.py`, alongside `@reasoner` at line 26-93).

**Canonical form** — typed dataclasses passed via `triggers=` kwarg on `@reasoner`:

```python
from agentfield import reasoner, EventTrigger, ScheduleTrigger

@reasoner(triggers=[
    EventTrigger(source="stripe", types=["payment_intent.succeeded"], secret_env="STRIPE_WEBHOOK_SECRET"),
])
async def handle_payment(input, ctx): ...

@reasoner(triggers=[ScheduleTrigger("*/5 * * * *")])
async def poll_inventory(input, ctx): ...
```

**Sugar** (optional, desugars to the canonical form) — keeps the cron-one-liner ergonomic:

```python
@reasoner()
@on_schedule("*/5 * * * *")
async def poll_inventory(input, ctx): ...

@reasoner()
@on_event(source="stripe", types=["payment_intent.succeeded"], secret_env="STRIPE_WEBHOOK_SECRET")
async def handle_payment(input, ctx): ...
```

`@on_event` / `@on_schedule` append a `Trigger` instance to `fn._pending_triggers`. The outer `@reasoner(...)` consumes that list and merges it with any `triggers=` kwarg, then clears the staging attribute. `@reasoner` MUST be the outermost decorator; if `_pending_triggers` is found on something that isn't being wrapped by `@reasoner` (e.g., user forgot the outer decorator), raise a clear error at module import — no silent no-op.

`EventTrigger` and `ScheduleTrigger` are typed dataclasses in `sdk/python/agentfield/triggers.py`:

```python
@dataclass
class EventTrigger:
    source: str
    types: list[str] = field(default_factory=list)
    secret_env: str | None = None
    config: dict[str, Any] = field(default_factory=dict)

@dataclass
class ScheduleTrigger:
    cron: str
    timezone: str = "UTC"
```

The agent's registration step (`sdk/python/agentfield/client.py:630-683`) currently builds `reasoners: [{id, input_schema, output_schema, tags}]` — extend to include `triggers: [{source, event_types, config, secret_env}]` per reasoner. Wire-format mirrors the canonical decorator form 1:1.

**Go** (`sdk/go/agent/agent.go:522-552` next to existing `WithReasonerTags`). Same canonical-with-sugar split:

```go
// Canonical
agent.RegisterReasoner("handlePayment", handler,
    agentfieldagent.WithTriggers(
        agentfieldagent.EventTrigger{Source: "stripe", Types: []string{"payment_intent.succeeded"}, SecretEnv: "STRIPE_WEBHOOK_SECRET"},
    ),
)

// Sugar (single trigger, common case)
agent.RegisterReasoner("handlePayment", handler,
    agentfieldagent.WithEventTrigger("stripe", "payment_intent.succeeded"),
    agentfieldagent.WithTriggerSecretEnv("STRIPE_WEBHOOK_SECRET"),
)
```

Add `TriggerBinding` and `Triggers []TriggerBinding` to `ReasonerDefinition` in `sdk/go/types/types.go:33-50`.

Control plane's node-register handler calls `storage.UpsertCodeManagedTrigger` for each binding (idempotent on `node_id+reasoner+source`). Extend the `/nodes/register` response to include the assigned `trigger_id`s so the SDK can log the public URL on `af run` startup ("Stripe webhook URL: {base}/sources/{id} — paste into Stripe dashboard").

### 5. UI

New `control-plane/web/client/src/pages/TriggersPage.tsx`, mirror the plain-fetch + state-driven form style of `NewSettingsPage.tsx:179-283` (no React Query — repo convention is direct fetch in this area). Components:

- Table of triggers with columns: source, target reasoner, enabled toggle, managed-by badge, public URL with copy button, recent event count.
- "New Trigger" modal: source dropdown from `GET /api/v1/sources`, dynamic form rendered from `config_schema` using `@rjsf/core` (new dep — chosen for community-source extensibility), env-var-name input for secret, target reasoner picker.
- Per-row actions: copy URL, view events drawer, replay event, toggle enabled, delete (disabled with tooltip when `managed_by='code'`).
- Events drawer: raw + normalized JSON panes, links to trigger event VC and resulting execution VC.
- Sidebar nav entry next to Settings.

### 6. Dispatch + VC chain

Extend `control-plane/internal/services/vc_issuance.go:16` (existing `GenerateExecutionVC`). Add:

```go
func (s *VCService) GenerateTriggerEventVC(ctx, sourceName, eventType, payloadHash, triggerID) (*types.TriggerEventVC, error)
```

Reuse the existing VC table by adding a `kind` discriminator column (cheaper than a parallel `trigger_event_vcs` table; the existing storage helpers can switch on `kind`). New `pkg/types/trigger_event_vc.go`. Storage method `vcStorage.StoreTriggerEventVC`.

When dispatching, populate `ExecutionContext.ParentVCID = triggerEventVC.ID` so `GenerateExecutionVC` chains it. New `services/trigger_dispatcher.go` reuses the proxy logic from `handlers/reasoners.go:80-156` (lookup node, POST to `{node.BaseURL}/reasoners/{name}` with event payload as input). On dispatch failure after persistence, write to the existing DLQ — generalize `migrations/017_create_observability_dead_letter_queue.sql` to add a `kind` column (`'observability'|'inbound_dispatch'`) rather than introducing a parallel table; update `services/observability_forwarder.go` accordingly.

### 7. Cron / LoopSource lifecycle

New `control-plane/internal/services/source_manager.go`. Constructed in `server.go:88-200` after storage init. On startup it loads all enabled `LoopSource` triggers and spawns a goroutine per trigger with per-trigger `context.WithCancel`. CRUD handlers call `manager.Start(triggerID)` / `manager.Stop(triggerID)` on create / update / delete / toggle. Server shutdown cancels the parent context and `WaitGroup.Wait()`. Each `emit(event)` funnels through the same persistence + VC + dispatch pipeline as HTTP ingest.

### 8. Critical files to modify

- `control-plane/internal/server/server.go` (wire source manager + register `sources/all` blank import)
- `control-plane/internal/server/routes.go` (mount new routes)
- `control-plane/internal/services/vc_issuance.go` (add `GenerateTriggerEventVC`)
- `control-plane/internal/services/observability_forwarder.go` (generalize DLQ)
- `control-plane/internal/storage/storage.go` (interface methods + SQLite impl)
- `control-plane/internal/handlers/reasoners.go` (extract proxy fn for reuse by dispatcher)
- `control-plane/migrations/029_create_triggers.sql` (new)
- `control-plane/migrations/030_dlq_kind_column.sql` (new — generalize existing DLQ)
- `control-plane/web/client/src/pages/TriggersPage.tsx` (new)
- `control-plane/web/client/src/App.tsx` and sidebar component (nav entry)
- `sdk/python/agentfield/triggers.py` (new — `EventTrigger`, `ScheduleTrigger` dataclasses)
- `sdk/python/agentfield/decorators.py` (add `triggers=` kwarg to `@reasoner`; add `@on_event`, `@on_schedule` sugar)
- `sdk/python/agentfield/__init__.py` (export `EventTrigger`, `ScheduleTrigger`, `on_event`, `on_schedule`)
- `sdk/python/agentfield/client.py` (include triggers in registration payload + parse response trigger IDs)
- `sdk/go/types/types.go` (`TriggerBinding`, `Triggers` field on `ReasonerDefinition`)
- `sdk/go/agent/agent.go` (add `WithTriggers` canonical; `WithEventTrigger`, `WithScheduleTrigger`, `WithTriggerSecretEnv`, `WithTriggerConfig` sugar)

### 9. Reusable existing pieces (do not reinvent)

- Reasoner proxy logic in `control-plane/internal/handlers/reasoners.go:80-156` — extract the proxy call into `services/reasoner_proxy.go` and reuse from both the existing handler and the new dispatcher.
- Outbound webhook DLQ infrastructure in `control-plane/internal/services/observability_forwarder.go` and migration `017` — generalize with a `kind` column.
- Settings UI pattern (form + secret toggle + headers list + plain fetch) in `control-plane/web/client/src/pages/NewSettingsPage.tsx:179-283`.
- VC issuance service in `control-plane/internal/services/vc_issuance.go:16` — add a sibling method, do not fork.
- Reasoner-decorator attribute pattern in `sdk/python/agentfield/decorators.py:71-83` — same `_*` attribute style for `_triggers`.

### 10. Recorded defaults for the impl forks

These were called out as decision forks; recording the chosen defaults so impl can proceed. Override in review if needed.

| Fork | Default chosen |
|---|---|
| `/nodes/register` returns assigned trigger IDs | **Yes** — required for SDK to log public URLs |
| Trigger event VC storage | **Reuse existing VC table** with `kind` discriminator |
| DLQ | **Generalize** existing observability DLQ with `kind` column |
| UI dynamic form | **`@rjsf/core`** for community-source extensibility |
| Public URL slug | **Random `trigger_id`** (not predictable from node+reasoner+source) — survives reasoner rename, no info leak |
| Decorator shape | **Canonical: `@reasoner(triggers=[...])`** with typed dataclasses; `@on_event` / `@on_schedule` are sugar that desugars to the same internal model. Mirrors wire format, eliminates silent ordering footgun, matches code-platform peers (Inngest, Trigger.dev, Dagster). |

## Verification

End-to-end:
1. **Unit:** per-Source signature-verification table tests under `sources/<name>/<name>_test.go` — valid sig, tampered body, expired timestamp, missing header.
2. **Integration:** `control-plane/internal/.../triggers_integration_test.go` — POST a signed Stripe payload to `/sources/{id}` against a fake target node server, assert (a) `inbound_events` row, (b) trigger event VC stored, (c) reasoner endpoint invoked with event payload, (d) execution VC's `parent_vc_id` matches trigger event VC ID.
3. **Idempotency:** same Stripe `event.id` posted twice → one row, one VC, one dispatch.
4. **Cron:** register `*/1 * * * *` trigger with a faked clock, advance, assert N events emitted and dispatched.
5. **Manual UI:** start control plane + a Python agent with `@on_event(source="generic_hmac")`, copy public URL from Triggers page, `curl` a signed payload, observe event in UI events drawer with linked VC chain.
6. **Replay:** click replay on an event → new execution VC created, chained to original trigger event VC, original event row unchanged.

Run the full pipeline locally with:
```bash
make build && cd control-plane && go run ./cmd/agentfield-server
# in another shell:
cd sdk/python && pytest -m integration
cd control-plane && go test ./internal/sources/... ./internal/services/... ./internal/handlers/...
cd control-plane/web/client && npm run lint && npm run build
```
