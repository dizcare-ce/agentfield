# Webhook / Trigger Plugin System — Implementation Checklist

Companion to `plan-webhook.md` (architecture). Track every remaining piece across backend, SDKs, UI, docs, and ops. Phases ordered by dependency, not time-to-ship.

**Branch:** `feat/webhooks` (Phase 0 `5c9ecd44`+`1ef9eac7`; Phase 1 `189c2c38`+`b1b85284`; Phase 2 in progress)

**Legend:** ✅ done · 🟡 partial · ⬜ not started · 🚫 explicitly out of v1 scope

---

## 0a. Final acceptance demo — end-to-end smoke (TODO after UI work)

After §6 UI is shipped, package a one-command **Docker demo** showing a webhook-triggered reasoner happening live in the UI. Request from the user 2026-04-28: "launch the built Docker container with the UI and sample agent node, reasoner with trigger and we can launch as if a new webhook has reached to our control plane as GitHub or cron or other things and I can look at it in the UI happening."

### Demo composition
- [ ] **Docker compose** at `examples/triggers-demo/docker-compose.yml`:
  - `agentfield-server` — control plane with embedded UI (single binary built via `make build`)
  - `sample-agent` — Python SDK agent with **deterministic** reasoners (no LLM): `handle_payment` (logs amount), `handle_pr` (logs repo + title), `handle_tick` (writes a counter to memory)
  - All wired via `@on_event(...)` and `@on_schedule(...)` so triggers register automatically on agent startup
- [ ] **Pre-seeded triggers**: Stripe (generic_hmac variant for the demo), GitHub, cron — created via `af triggers create` in the agent's startup script OR auto-registered via `@on_event` decorators
- [ ] **Replay-script** at `examples/triggers-demo/scripts/fire-events.sh`:
  - Sends a signed Stripe-style HMAC payload to `/sources/<trigger_id>` for the payment trigger
  - Sends a signed GitHub `pull_request.opened` payload
  - (Cron fires by itself once per minute)
- [ ] **README.md** at `examples/triggers-demo/README.md` walking through: bring up compose, open browser to `http://localhost:8080/triggers`, run the fire-events script, watch events appear live in the UI
- [ ] All reasoners are **deterministic** — no AI, no external API calls. Just enough to demonstrate the dispatch path lights up.

### What to look at in the UI (cross-page tour)

When demoing, point to **all the places the trigger feature surfaces** so the operator/dev sees the full integration story:

| UI surface | What you should see when a webhook fires |
|---|---|
| **`/triggers` (list page)** | Three trigger rows (Stripe, GitHub, cron), each with public URL + copy button + secret-status pill + enabled toggle. Last-event-at column updates live; 24h count increments. |
| **`/triggers` → click row → right Sheet** (when §6 ships) | Header: source icon, public URL, enabled switch. Drift card showing `code_origin: examples/triggers-demo/agent.py:42`. Tabs: Events / Configuration / Secrets / Dispatch logs. |
| **Sheet → Events tab → expand row** | Verification result, raw + normalized payload via `UnifiedJsonViewer`, **VC chain card** linking trigger event VC ↔ execution VC (deep-link into `VerifyProvenancePage`), Replay button. |
| **`/runs` (executions list page)** | New "Triggered by Stripe" / "Triggered by GitHub" / "Triggered by cron" badge on rows that came from inbound events (per §6.7.1). |
| **`/runs/:id` (run detail)** | New "Trigger" Card section showing source, event_type, idempotency_key, received_at. Run input panel shows the inbound event payload (per §6.7.2). |
| **Reasoner detail page** | "Bound triggers" card listing the @on_event/@on_schedule bindings (per §6.7.3). |
| **Dashboard tile** | "Inbound events (24h)" `MetricCard` with sparkline + dispatch-success-rate (per §6.7.5). |
| **`af verify audit.json` (CLI)** | Walks the chain back to the trigger event VC, surfacing source name + verification result. |

### Acceptance criteria
- [ ] `docker compose up` from clean state → control plane + agent both green within 30s
- [ ] Run `fire-events.sh` → ≥3 inbound events appear in UI within 2s of the script completing
- [ ] Click any event → see verified signature evidence, payload, and VC chain links (when §6 ships VC links)
- [ ] Click a triggered run from `/runs` → see Trigger card + input panel
- [ ] Demo runs in under 90 seconds wall-clock from `up` to "I see the chain"

**This demo locks down the integration story.** It's the artifact someone can hand to a stakeholder to show "AgentField has webhooks." It's also the smoke test we run before tagging any release.

---

## 0. Status snapshot — what's already shipped

### Backend (Go control-plane)
- ✅ `internal/sources/` — `Source` interface, registry, `KindHTTP`/`KindLoop`, `RawRequest`/`Event` types
- ✅ Six first-party sources: `stripe`, `github`, `slack`, `generic_hmac`, `generic_bearer`, `cron`
- ✅ Blank-import aggregator at `internal/sources/all/all.go`
- ✅ Inline cron parser (no external dep) with IANA timezone support
- ✅ `pkg/types/triggers.go` — `Trigger`, `InboundEvent`, `TriggerBinding`, `ManagedBy`
- ✅ Migration `029_create_triggers.sql` — `triggers` + `inbound_events` tables
- ✅ DLQ generalized with `kind` column (`'observability' | 'inbound_dispatch'`)
- ✅ `services/trigger_dispatcher.go` — always-200, async dispatch with target-node + reasoner lookup
- ✅ `services/source_manager.go` — cron lifecycle, goroutine-per-trigger, idempotent emit dedup
- ✅ `handlers/triggers.go` — `IngestSource`, full CRUD, list events, replay, sources catalog
- ✅ `handlers/triggers_register.go` — code-managed trigger upsert from `RegisterNodeHandler`
- ✅ Routes wired in `server/routes_triggers.go`
- ✅ Source manager started in `server.go`, stopped on shutdown

### SDKs
- ✅ Python `agentfield/triggers.py` — `EventTrigger` / `ScheduleTrigger` dataclasses
- ✅ Python `@reasoner(triggers=[...])` canonical + `@on_event` / `@on_schedule` sugar
- ✅ Python registration payload threads triggers per reasoner
- ✅ Go `types.TriggerBinding` + `Triggers` field on `ReasonerDefinition`
- ✅ Go `WithTriggers` canonical + `WithEventTrigger` / `WithScheduleTrigger` / `WithTriggerSecretEnv` / `WithTriggerConfig` sugar
- ✅ Go registration payload threads triggers

### UI (React/TS)
- ✅ `pages/TriggersPage.tsx` — table, code/UI badge, copy-URL, enabled toggle, new-trigger dialog, events dialog, replay button
- ✅ Sidebar nav + route in `App.tsx`
- ✅ Sources catalog driven by `GET /api/v1/sources`

### Tests
- ✅ 51 unit tests across all six sources + the registry (`source_test.go`)

### Known not-yet-shipped (drives this checklist)
- ⬜ Trigger event VC + chain extension
- ⬜ Per-source HTTP integration tests (handler-level, not just unit)
- ⬜ Production hardening (rate limit, body cap, replay-window enforcement, audit log)
- ⬜ Local-dev DX (`af triggers test`, simulate event, tunnel info)
- ⬜ TypeScript SDK trigger support
- ⬜ Docs & examples

---

## 1. P0 — VC chain extension ✅ SHIPPED (commits `189c2c38` + `b1b85284`)

Closes the audit chain so `af verify audit.json` walks back past the first reasoner to a CP-rooted credential. Shipped.

### Backend
- [x] `pkg/types/trigger_event_vc.go` — `TriggerEventVCSubject` + `VCTriggerVerification`
- [x] Migration `030_vc_kind_discriminator.sql` — `kind` column + trigger metadata on `execution_vcs`
- [x] `services/vc_issuance_trigger.go` — `GenerateTriggerEventVC` signs with CP root DID
- [x] Storage interface gains `StoreExecutionVCRecord` (writes new fields); legacy scalar `StoreExecutionVC` unchanged
- [x] `services/trigger_dispatcher.go` — mints VC after target lookup, best-effort, logs on failure, dispatches anyway
- [x] `X-Parent-VC-ID` header on dispatched reasoner request
- [x] Replay reuses original event's `vc_id` so chain still terminates at original payload
- [x] `GenerateExecutionVC` sets `Kind='execution'` and reads `ParentVCID` from `ExecutionContext`
- [x] DID disabled → clean nil-VC no-op; dispatch still works
- [ ] Verifier CLI extension to recognize `kind='trigger_event'` as a chain root (deferred to docs/CLI polish phase)

### Python SDK
- [x] `execution_context.py` reads/emits `X-Parent-VC-ID`, exposes `ctx.parent_vc_id`
- [x] `vc_generator.py` includes `parent_vc_id` in `/api/v1/execution/vc` payload
- [x] `agent.py` propagates on outbound `app.call()`
- [x] 12 SDK tests passing in worktree

### Tests
- [x] 4 unit tests on `GenerateTriggerEventVC` (happy path, DID disabled, persist disabled, ParentVCID propagation)
- [x] 3 dispatcher integration tests (full ingest→mint→header→back-write, DID disabled, replay reuses VC)

---

## 2. P0 — Per-source HTTP integration tests ✅ SHIPPED (Phase 2)

Three parallel subagents in worktrees + cleanup pass. 25 integration tests covering all six sources.

### Sources covered
- [x] **Stripe** — 5 tests: happy path + idempotency dedup + bad signature + expired timestamp + dispatched-status update
- [x] **GitHub** — 4 tests: pull_request.opened with action concat + bare ping (no action) + tampered body + missing signature header
- [x] **Slack** — 4 tests: app_mention event_callback unwrap + URL verification challenge filter + tampered body + expired timestamp (anti-replay)
- [x] **generic_hmac** — 4 tests: default header + custom header/prefix + tampered body + missing signature
- [x] **generic_bearer** — 4 tests: default Bearer scheme + custom header empty scheme + wrong token + missing header
- [x] **cron** — 5 tests: lifecycle + invalid expression Validate + start/stop cleanup + multiple triggers independent + cleanup on StopAll

### Each test asserts
- [x] Public 200 response shape and timing (no waiting on dispatcher)
- [x] `inbound_events` row contents (raw + normalized payload, idempotency_key, status)
- [x] Dispatcher invoked target reasoner with documented headers (`X-Source-Name`, `X-Event-Type`, `X-Trigger-ID`, `X-Event-ID`)
- [x] Failure modes: bad signature → 401, no row, no dispatch

### Known FIXMEs surfaced for future phases
- ⬜ Slack URL-verification body should echo the `challenge` token (current handler returns 200 + received=0 only; spec wants the challenge value back in the response body) — Phase 3+
- ⬜ Cron parser is 1-minute floor; lacks faked-clock injection so we test lifecycle, not scheduled-fire timing — Phase 3+
- ⬜ Dispatcher does not propagate source-level `idempotency_key` as an outbound header — design decision for §3 hardening
- ⬜ `generic_*` filter-by-event-type requires `event_type_header` config; default-config triggers can't filter on type — document in §6 Configuration tab

---

## 3. P1 — Production hardening

### Security
- [ ] **Replay-window enforcement** — uniform timestamp skew check across all `HTTPSource` impls (Stripe + Slack already have it; bake into the `Source` contract or a shared verifier helper). Default 5 min, per-source override via config
- [ ] **Body size limit** — `MaxBodyBytes` per-source (1 MB default, 256 KB for cron-pings, 5 MB for Slack file events). Reject with 413 before reading body
- [ ] **Per-trigger rate limit** — token bucket per `trigger_id` to prevent a misconfigured Stripe acct from melting the dispatcher. Returns 429 before persistence
- [ ] **Secret env-var existence check** — at trigger create time, warn (don't fail) if `os.Getenv(secret_env_var)` is empty; surface in UI as a "secret not set" badge on the trigger row
- [ ] **Audit log for trigger CRUD** — every create/update/delete/replay through `/api/v1/triggers` writes an `audit_log` entry (actor, before/after, IP)
- [ ] **Public URL slug entropy** — confirm `trigger_id` uses ≥128 bits of entropy (it should — random UUID-like — but verify and document; this is the only auth on the public ingest URL when `secret_required=false`)
- [ ] **Code-managed trigger guard** — UI cannot delete/edit code-managed triggers (already enforced); CLI parity (`af triggers delete <id>` blocks with friendly error)

### Reliability
- [ ] **Persistent dispatch retry** — currently fire-and-forget; on dispatch failure write to DLQ with retry policy (existing observability DLQ infrastructure with `kind='inbound_dispatch'`). Background worker drains with exponential backoff, max 5 attempts over 1 hour
- [ ] **Source manager restart** — on control-plane restart, re-spawn loop sources for all `enabled=true` cron triggers (verify wiring in `server.go`)
- [ ] **Graceful shutdown** — `WaitGroup` waits for in-flight dispatches up to 30s before forcing exit
- [ ] **Database connection pool exhaustion** — bound concurrent dispatches to `min(N_workers, db_pool_size - reserved)`
- [ ] **Idempotency-key conflict resolution** — explicit branch when `(source_name, idempotency_key)` already exists: return 200 with prior `event_id` so providers don't retry, log dedup hit

### Observability
- [ ] **Metrics** (Prometheus or whatever the CP uses today):
  - `triggers_ingest_total{source, trigger_id, result}` (result: accepted/duplicate/rejected)
  - `triggers_dispatch_duration_seconds{source, target_node}`
  - `triggers_dispatch_failures_total{source, reason}`
  - `triggers_dlq_depth` (gauge)
  - `triggers_active_loop_sources` (gauge for cron health)
- [ ] **Tracing** — OpenTelemetry span around ingest → dispatch → reasoner invocation, propagated via standard W3C trace context headers
- [ ] **Structured ingest log line** — one log per inbound event with `source`, `trigger_id`, `event_type`, `idempotency_key`, `result`, `duration_ms`
- [ ] **Loop source health** — `services/source_manager.go` exposes status endpoint or surfaces last-fired-at + error in UI

---

## 4. P1 — Developer experience ✅ SHIPPED (Phase 5, commits `9d26e619` + `69dbd23e` + `be07c857`)

DX core is live end-to-end:
- `TriggerContext` typed dataclass on `ExecutionContext.trigger` (None on direct calls)
- SDK auto-unwraps the dispatcher's `{event, _meta}` envelope so reasoners see the raw provider payload as `input`
- Signature-based parameter injection: `trigger:` and `webhook:` aliases auto-fill from the request context (same mechanism as `execution_context`)
- `transform=` kwarg on `EventTrigger` runs a sync function from raw provider event → reasoner input; matching rule mirrors the runtime (same source + prefix-matched event_type, most-specific wins). Async transforms rejected with actionable error at decoration time.
- `accepts_webhook` 3-state flag (`True` | `False` | `"warn"`) on `@reasoner`: auto-`True` when triggers declared, otherwise `"warn"`; CP rejects `POST /api/v1/triggers` with 400 when target reasoner has `accepts_webhook=False`
- `simulate_trigger()` + fixture library (`agentfield.testing` + `agentfield/fixtures/triggers/*.json`) for in-process unit tests — no CP, no HTTP, no spinning fixtures

Below is the design reference; the boxes are now retroactive.



### Python SDK (priority — this is the primary DX surface)

**Two equivalent decorator forms — both must work, both must be tested.** Pick whichever reads better in context.

**Form A — `triggers=` kwarg on `@reasoner` (canonical, all triggers in one place):**
```python
@reasoner(triggers=[
    EventTrigger(source="stripe", types=["payment_intent.succeeded"], secret_env="STRIPE_SECRET"),
    ScheduleTrigger("0 9 * * *"),
])
async def handle_payment(input, ctx): ...
```

**Form B — sugar decorators stacked below `@reasoner` (cleaner for the single-trigger common case):**
```python
@reasoner()
@on_event(source="stripe", types=["payment_intent.succeeded"], secret_env="STRIPE_SECRET")
async def handle_payment(input, ctx): ...

@reasoner()
@on_schedule("0 9 * * *")
async def daily_report(input, ctx): ...
```

Both desugar to the same internal `_pending_triggers` list which `@reasoner` consumes. `@reasoner` MUST be the outermost decorator; if `_pending_triggers` is found on a function not wrapped by `@reasoner`, raise `TypeError` at module import (no silent no-op).

- [ ] Tests assert wire-payload equivalence between Form A and Form B (same source, same event_types, same config, same secret_env)
- [ ] Tests assert the outer-decorator-missing error raises with an actionable message at import time
- [ ] Tests assert mixing both forms on the same reasoner merges (Form A `triggers=[...]` + stacked `@on_event` + stacked `@on_schedule` → all three appear in the registration payload)

**The rest of the Python DX:**
- [ ] **Trigger context injected into reasoner**: when invoked via dispatcher, `ctx.trigger` exposes `source`, `event_type`, `trigger_id`, `idempotency_key`, `received_at`, `vc_id` — currently the dispatcher passes `_meta` but it's untyped. Add `agentfield.TriggerContext` dataclass and parse `_meta` at SDK level
- [ ] **`app.simulate_trigger(source, payload, type=...)` helper** — fires the same dispatch path locally with a synthesized signed payload, no control plane required for unit tests
- [ ] **Pytest fixture** `agentfield_trigger_client` — spins up an in-process control plane + agent, exposes `client.send(source="stripe", body=...)` for end-to-end DX tests
- [ ] **Clear startup logging** — when an agent registers and the response includes assigned trigger IDs, print one line per binding: `"Stripe webhook URL: http://localhost:8080/sources/{id} — paste into Stripe dashboard"` (the response shape is already there per `triggers_register.go`)
- [ ] **`@on_event`/`@on_schedule` ordering footgun** — current code raises if `_pending_triggers` is found without outer `@reasoner`; add test confirming the error message is actionable
- [ ] **Trigger validation at decoration time** — invalid cron expression raises `ValueError` at module import, not at registration
- [ ] **Tests for trigger registration roundtrip** — assert `client.register()` payload includes triggers, response trigger IDs are stored on the reasoner for log printing
- [ ] **`agentfield.triggers` exported from package root** — confirm `from agentfield import EventTrigger, ScheduleTrigger, on_event, on_schedule` works
- [ ] **Type stubs / IDE completion** — `triggers=` kwarg on `@reasoner` shows up in IDE help (verify `.pyi` or inline annotations)
- [ ] **Examples directory**:
  - `examples/python_agent_nodes/stripe_webhook/` — full Stripe-on-payment example
  - `examples/python_agent_nodes/scheduled_report/` — cron `@on_schedule`
  - `examples/python_agent_nodes/github_pr_review/` — GitHub `@on_event`

### Go SDK
- [ ] Same `TriggerContext` pattern in `sdk/go/agent/context.go` (or wherever execution context lives)
- [ ] `agent.SimulateTrigger(...)` helper for unit tests
- [ ] `WithTriggers` validation at registration time — invalid cron / unknown source name returns error before agent.Run
- [ ] Tests for `WithEventTrigger`/`WithScheduleTrigger` option composition
- [ ] Examples mirroring Python:
  - `examples/go_agents/stripe_webhook/`
  - `examples/go_agents/scheduled_job/`

### TypeScript SDK
🚫 **Parked** — see §10 Parking Lot. Tracked but not on the v1 critical path.

### CLI (`af` binary) — consumes the **same** endpoints as the UI
Every UI action has a CLI equivalent because both call the same HTTP API (see §7 Shared API contract). No CLI-only endpoints. No UI-only endpoints. This guarantees parity for free.

- [ ] `af triggers list [--source X] [--reasoner Y] [--status enabled]` → `GET /api/v1/triggers`
- [ ] `af triggers describe <id>` → `GET /api/v1/triggers/:id` (full config + recent events + secret-env status)
- [ ] `af triggers create --source stripe --reasoner my_node.handle_payment --secret-env STRIPE_SECRET [--config @config.json]` → `POST /api/v1/triggers`
- [ ] `af triggers update <id> --enabled false` → `PATCH /api/v1/triggers/:id`
- [ ] `af triggers delete <id>` → `DELETE /api/v1/triggers/:id` (blocked for code-managed; returns friendly error from the same server-side guard the UI hits)
- [ ] `af triggers events <id> [--status failed] [--since 1h]` → `GET /api/v1/triggers/:id/events`
- [ ] `af triggers replay <event_id>` → `POST /api/v1/triggers/:id/events/:event_id/replay`
- [ ] `af triggers test <id> --body @fixture.json` → posts a synthesized signed payload to the trigger's own ingest URL (uses fixtures the SDK simulate helper also uses)
- [ ] `af triggers tail <id>` → SSE stream from `GET /api/v1/triggers/:id/events/stream` (new endpoint, see §7)
- [ ] `af sources list` → `GET /api/v1/sources` (catalog with config schemas)
- [ ] Output formats: `--output table|json|yaml` (default table, mirrors UI table columns; `--output json` matches the UI's wire shape exactly)

### Testing strategy for developers (replaces "local dev tunnel")

Tunnel is one of three layers. Most dev iterations should never need ngrok at all.

| Layer | Tool | When to use | What it verifies |
|---|---|---|---|
| 1. **Unit** — no network, no CP | `app.simulate_trigger(source, body, type=...)` (Python) / `agent.SimulateTrigger(...)` (Go) | While iterating on the reasoner handler logic | Handler logic with crafted-but-realistic payloads. Bypasses signature verification (you don't have the provider's secret in unit tests). |
| 2. **Integration** — local CP, no internet | `af triggers test <id> --body @fixture.json` against `af dev` | Verifying the full ingest → dispatch → VC chain locally | Real signature verification (test fixture is signed using a `STRIPE_TEST_SECRET` env var), real persistence, real dispatcher, real VC mint. The fixture library ships with one captured + signed payload per source. |
| 3. **End-to-end** — real provider hitting your machine | `ngrok http 8080` + paste the trigger's public URL into Stripe / GitHub / Slack dashboard | Final confidence before deploying | Real provider, real secrets, real network. Reserved for confidence checks, not the inner loop. |

Plan items:
- [ ] **Captured + signed fixture library** — `tests/fixtures/triggers/{stripe,github,slack,...}/` with one realistic signed payload per source. Used by `af triggers test`, `simulate_trigger`, the pytest fixture, and integration tests. Single source of truth.
- [ ] **`app.simulate_trigger` (Python)** — calls the dispatcher directly with a synthesized event, bypassing HTTP. Returns whatever the reasoner returns. Sync API for test ergonomics.
- [ ] **`pytest_plugins = ["agentfield.testing"]`** — pytest fixtures: `agentfield_app` (in-process CP), `signed_payload(source, body)`, `trigger_client.send(...)`. Marks: `@pytest.mark.trigger`.
- [ ] **`af triggers test`** — local-only short-circuit that signs a fixture using the env-var secret of the trigger's `secret_env_var`, then posts to `http://localhost:8080/sources/<id>`. Same code path the CI-fixture replay tool uses.
- [ ] **Tunnel** — documented in `docs/local-dev-triggers.md` as Layer 3, manual ngrok. `af dev --tunnel` is parked (§10).
- [ ] **Replay-from-prod** — once UI is in, "Replay this event locally" button copies a payload + signature fixture from production into your local fixtures dir so you can debug a real failed event without re-triggering the provider.

---

## 5. Source of truth — code-managed vs UI-managed ✅ SHIPPED (Phase 3)

Backend in commit `754c6954`. Python SDK in `919419b7`. Go SDK in `0e9d222d`.

Sticky-pause + orphan flow + code_origin drift card all working end-to-end. 3 integration tests cover the headline scenarios. Endpoints `POST /api/v1/triggers/:id/{pause,resume,convert-to-ui}` are mounted and tested.

Below is the design reference; the boxes are now retroactive.



Both code-declared and UI-created triggers exist as separate rows. Conflicts get resolved by these rules. The rules below dictate what the UI exposes (§6) and what the registration upsert does on the backend.

### 5.1 Mental model

- **Code-managed** (`managed_by='code'`): created by an agent's registration payload from `@reasoner(triggers=[...])` or `@on_event` / `@on_schedule`. Upserted on `(target_node_id, target_reasoner, source_name)` so re-registration is idempotent.
- **UI-managed** (`managed_by='ui'`): created via `POST /api/v1/triggers` from the UI or CLI. Independent identity, freely deletable.
- **Both kinds can coexist for the same target reasoner** — they're separate rows with separate IDs, separate secret env-var names, separate public URLs. Useful when ops wants a parallel side channel (e.g., staging-Stripe alongside the dev-declared prod-Stripe).

### 5.2 What each surface can do

| Action | Code-managed | UI-managed |
|---|---|---|
| Create | Agent registration | UI / CLI |
| Edit config | Code only (next registration applies) | UI / CLI |
| Edit name / description | Code only | UI / CLI |
| Delete | Code only (remove decorator → orphan flow §5.4) | UI / CLI |
| **Toggle enabled** | UI / CLI (operational override, sticky — §5.3) | UI / CLI |
| Replay events | Both | Both |
| View | Both surfaces show both kinds | Both |

The point: **config is owned by whoever created it; `enabled` is shared.** That single shared lever covers the 2am-incident "pause this webhook now" use case without forcing a code deploy.

### 5.3 Sticky-enable rule (the key design decision)

If an operator pauses a code-managed trigger in the UI, the next agent re-registration must NOT silently flip it back on.

- [ ] Add `manual_override_enabled BOOLEAN` (or `manual_disabled_at TIMESTAMP`) column to `triggers`
- [ ] Registration upsert refreshes config but PRESERVES `enabled` when the override is set
- [ ] UI shows a banner on overridden triggers: "Manually paused at T₀ — code declares this enabled. Resume to track code." Resume button clears the override.
- [ ] Audit log entry on every override set/clear (who, when, prior value)
- [ ] CLI: `af triggers resume <id>` clears the override; `af triggers pause <id>` sets it

**Why this rule:** Terraform-style ("code is source of truth, with a documented operational override") not Kubernetes-style ("code wins always"). Production webhooks misbehave at 2am. Forcing a code deploy + agent restart to pause one is an outage multiplier.

### 5.4 Orphan detection (decorator removed in code)

When an agent re-registers without a previously-declared trigger, don't silently delete — event history matters and the public URL may still be live in a provider's dashboard.

- [ ] Track `last_seen_in_registration_at` per code-managed trigger
- [ ] Mark `orphaned=true` when missing from a registration; keep the row, keep the events, stop dispatching
- [ ] UI surfaces orphaned triggers with badge: "Code no longer declares this. Convert to UI-managed, or delete?"
- [ ] CLI: `af triggers list --orphaned`, `af triggers convert-to-ui <id>`, `af triggers delete <id>`
- [ ] Provider-side warning on delete: "Deleting frees the URL. The provider (Stripe / GitHub / etc.) will start getting 404s — remove the URL there too."

### 5.5 Drift visibility

Every code-managed row carries metadata so operators understand what they're seeing:

- [ ] `code_origin` — `path/to/file.py:42` of the decorator (filled at registration time from agent SDK; SDK can introspect the decorated function)
- [ ] `last_registered_at` timestamp
- [ ] `agent_version` (if SDK can pass it — useful when debugging a rollback)
- [ ] UI displays all three on the trigger detail (in the right-side Sheet header — see §6)

### 5.6 Public-URL stability

- [ ] Trigger ID is **stable across re-registration** because the upsert key is `(node, reasoner, source)`, not the ID. Pasting the URL into Stripe's dashboard once is enough.
- [ ] Re-registration with a different `secret_env_var` rotates the secret reference but does NOT change the URL.
- [ ] Deleting a code-managed trigger and re-creating it (different decorator parameters) generates a fresh ID with a different URL. UI warns: "Deleting will require re-pasting the URL into the provider."

### 5.7 Race conditions handled

| Scenario | Resolution |
|---|---|
| Agent re-registers while operator is editing UI | Code-managed has no UI config edit; no conflict. UI-managed is untouched by registration; no conflict. |
| Agent A registers reasoner X with Stripe trigger; Agent B (different node) registers reasoner X with Stripe trigger | Different `target_node_id` → separate rows, no conflict. |
| Code declares trigger; UI-managed trigger already exists for same `(node, reasoner, source)` | Both coexist as separate rows. UI shows them stacked. |
| Operator deletes a UI-managed trigger while events are mid-dispatch | Existing dispatches finish; new ingests 404. Standard read-after-delete window. |
| Two agents register simultaneously (rare, single OSS team) | Idempotent upsert, last-write-wins on config; either result is internally consistent. |

---

## 6. UI — single Triggers page (no sub-pages)

**One left-nav entry, one page.** Everything else is right-side `Sheet` drawers, inline expansions, and integration into existing pages (runs, reasoner detail). Reasoner-side context lives where users already are.

### 6.1 Component vocabulary (reuse, no new deps)

| Need | Use | Reference page |
|---|---|---|
| List | `CompactTable` + `FastTableSearch` + `FilterSelect` + `segmented-status-filter` | `RunsPage` |
| Detail panel (replaces sub-pages) | `sheet.tsx` (right-side) + `Tabs` inside | various |
| JSON payload | `UnifiedJsonViewer` | `EnhancedExecutionDetailPage` |
| Status | `status-pill` / `status-indicator` / `Badge` | everywhere |
| Dashboard tile | `MetricCard` | `NewDashboardPage` |
| Copy URL | `copy-button` | already used |
| Toast | `notification.tsx` | global |
| Empty state | `empty.tsx` | nodes / reasoners |
| Confirm destructive | `alert-dialog.tsx` | settings |

**Rule:** no `@rjsf/core` until we genuinely need community-source extensibility. For v1, hand-build a small config form per source name (six small forms, total).

### 6.2 Page layout — single route `/triggers`

```
+----------------------------------------------------------+
| Triggers                                  [+ New Trigger] |
+----------------------------------------------------------+
| ▾ Available sources (collapsible, default expanded)      |
|   [stripe] [github] [slack] [generic_hmac] [bearer] [cron]|
|   each card: name, kind badge, "Create →" button         |
+----------------------------------------------------------+
| Active triggers     [filters: source | status | mgr_by]  |
|  +----------------------------------------------------+  |
|  | source  name      reasoner   mgr  secret enabled  |  |
|  | ...                                                |  |
|  +----------------------------------------------------+  |
|     row click → opens right-side Sheet with details      |
+----------------------------------------------------------+
```

Right-side `Sheet` (when a row is clicked):
- Header: source icon + name + public URL with copy + enabled `Switch` + Delete (disabled for code-managed)
- Drift card (code-managed only): "Declared in `path/to/file.py:42`, last registered 2m ago"
- Sticky-pause banner if override active: "Manually paused — code declares this enabled. [Resume tracking code]"
- Tabs: **Events** / **Configuration** / **Secrets** / **Dispatch logs**

### 6.3 Sources strip (top of page — discovery + entry point)

- [ ] Horizontal scroll of source cards from `GET /api/v1/sources`
- [ ] Each card: icon, name, kind badge (`http` / `loop`), `secret_required` indicator, "Create →" button
- [ ] Click "Create" → opens new-trigger dialog with that source pre-selected
- [ ] Collapsible; remembers user preference (collapsed once they have ≥1 trigger)
- [ ] Footer link: "Don't see your provider? See [Contributing a Source](/docs/contributing-a-source)"

### 6.4 Triggers table

- [ ] Filters: source (`FilterSelect`), enabled (`segmented-status-filter`), managed_by code/ui (`segmented-status-filter`), name search (`FastTableSearch`)
- [ ] Columns: source icon + name, target `node.reasoner` (clickable → reasoner detail page), `managed_by` badge, secret-status pill, public URL (`copy-button`), enabled `Switch`, last-event timestamp, 24h count
- [ ] Row click → opens detail Sheet (no navigation away)
- [ ] Empty state when no triggers: "Create your first trigger" + link to sources strip
- [ ] Skeleton loading state
- [ ] Cursor pagination (mirror `RunsPage`)
- [ ] Orphan rows visually de-emphasized + "Code no longer declares this" hint

### 6.5 Detail Sheet — replaces every sub-page

One `Sheet`, four tabs, no routing. All trigger-side detail lives here.

- [ ] **Header**:
  - Source icon + name (editable inline for UI-managed)
  - Public URL with `copy-button`
  - Enabled `Switch` with sticky-pause indicator per §5.3
  - Delete button (disabled with tooltip for code-managed)
- [ ] **Drift card** (code-managed only): code origin file:line, last registered, agent version
- [ ] **Tab: Events**
  - Filters: status, event_type, time range (`time-range-pills`)
  - Inline-expandable rows (no separate page): click row → expands with verification result, raw + normalized payload (`UnifiedJsonViewer`), VC chain (Trigger Event VC ↔ Execution VC, links into existing `VerifyProvenancePage`), Replay button, Copy-as-fixture button
  - Live SSE updates so new events stream in
  - Cursor pagination
- [ ] **Tab: Configuration**
  - Read-only for code-managed (with "edit in code at file:line")
  - Editable form for UI-managed (per-source field set, hand-built for v1)
- [ ] **Tab: Secrets**
  - `secret_env_var` name + status pill (`set` / `missing`)
  - Never displays the secret value
  - Instructions: "Set this env var on the CP host"
- [ ] **Tab: Dispatch logs** — tail of last 1000 structured log lines for this trigger via SSE, filter by level

### 6.6 New-trigger dialog (`dialog.tsx`)

- [ ] Step 1: source (pre-filled when entered from a Sources card)
- [ ] Step 2: target reasoner (`FilterSelect` of nodes → reasoners)
- [ ] Step 3: secret env var name (with "will read from CP host env" hint, validation warning if env var unset)
- [ ] Step 4: source-specific config fields
- [ ] On submit → toast → row appears at top of table → Sheet auto-opens for the new trigger

### 6.7 Cross-page integration (existing pages get small additions, NOT new pages)

This is what the user flagged: triggers must be visible where developers already are.

#### 6.7.1 Runs / Executions list (`RunsPage`)
- [ ] When an execution was triggered by an inbound event, show a small badge in the row: source icon + source name (e.g., "↪ Stripe")
- [ ] New filter chip: "Triggered by source"
- [ ] Hover badge → tooltip with event_type + idempotency_key

#### 6.7.2 Run detail (`RunDetailPage` / `EnhancedExecutionDetailPage`)
- [ ] New "Trigger" `Card` section (only when the run has one): source, event_type, idempotency_key, received_at
- [ ] **Trigger input panel** — show the inbound event payload that became this run's input (raw + normalized tabs via `UnifiedJsonViewer`); answers "what kicked off this run"
- [ ] Link "View this trigger →" deep-links into `/triggers?trigger=trg_xxx&event=evt_yyy` which auto-opens the Sheet at the right event

#### 6.7.3 Reasoner detail (`ReasonerDetailPage`)
- [ ] Small "Bound triggers" card listing them (public URL, status, source) — clickable to deep-link Sheet
- [ ] No CRUD here — read-only view, all editing happens on the Triggers page

#### 6.7.4 Node detail (`NodeDetailPage`)
- [ ] Aggregate "Triggers" small section across the node's reasoners (same deep-link pattern)

#### 6.7.5 Dashboard
- [ ] Single `MetricCard` tile: "Inbound events (24h)" with sparkline + dispatch-success-rate sub-line
- [ ] Click → `/triggers`

### 6.8 Sidebar navigation

- [ ] **Single "Triggers" entry** — no nested children, no separate "Sources" or "Events" entry
- [ ] Place under existing "Build" or "Observe" group (defer to current IA — match what `Sidebar.tsx` does for siblings)
- [ ] Optional small badge on nav item: DLQ depth when > 0

### 6.9 Deep-linking pattern

So integrations from other pages don't need new routes:

- [ ] `/triggers?trigger=<id>` → page loads, Sheet auto-opens for that trigger
- [ ] `/triggers?trigger=<id>&event=<event_id>` → Sheet opens with Events tab active and that event row pre-expanded
- [ ] Both query params survive page reload (good for sharing links)

### 6.10 Cross-cutting requirements

- [ ] Dark mode renders correctly (existing token system handles this)
- [ ] Responsive — list collapses columns on narrow viewports; Sheet becomes full-screen on mobile
- [ ] Accessibility — keyboard-reachable, aria-labels on icon-only buttons
- [ ] Every CRUD action confirms via `notification.tsx`
- [ ] Loading states use `skeleton.tsx` for tables, spinners on buttons during async actions
- [ ] Error states use `ErrorState.tsx` with retry

---

## 7. P1 — Shared API contract ✅ SHIPPED (Phase 4, commits `c7fcbe0f` + `b0300385`)

The endpoints needed before §6 UI deepening have all landed: 4 read/test handlers (sources/:name, single-event, secret-status, test), GetTriggerMetrics, run-detail trigger embedding, plus a global trigger event bus + SSE stream for live UI updates. Below is the design reference; the new endpoints are working and tested.



The non-negotiable rule: **no UI-only endpoints, no CLI-only endpoints.** Every action goes through one of the endpoints below or doesn't exist. CLI parity is a free side-effect of getting the API right.

### 7.1 Endpoints (every one consumed by both UI and CLI)

| Method + path | UI consumer | CLI command | Status |
|---|---|---|---|
| `POST /sources/:trigger_id` | (public ingest — providers only) | (n/a) | ✅ |
| `GET /api/v1/sources` | Sources strip + new-trigger dialog | `af sources list` | ✅ |
| `GET /api/v1/sources/:name` | Source card hover (full schema + example) | `af sources describe <name>` | ⬜ new |
| `GET /api/v1/triggers` | Triggers table | `af triggers list` | ✅ |
| `GET /api/v1/triggers/:id` | Sheet header + Configuration tab | `af triggers describe <id>` | ✅ |
| `POST /api/v1/triggers` | New-trigger dialog | `af triggers create` | ✅ |
| `PATCH /api/v1/triggers/:id` | Sheet config edit (UI-managed) + enabled toggle (both) | `af triggers update <id>` | ✅ |
| `POST /api/v1/triggers/:id/pause` | Sheet enabled `Switch` off on a code-managed row (sets sticky override) | `af triggers pause <id>` | ⬜ new (§5.3) |
| `POST /api/v1/triggers/:id/resume` | Sheet "Resume tracking code" button | `af triggers resume <id>` | ⬜ new (§5.3) |
| `POST /api/v1/triggers/:id/convert-to-ui` | Orphan row "Convert to UI-managed" action | `af triggers convert-to-ui <id>` | ⬜ new (§5.4) |
| `DELETE /api/v1/triggers/:id` | Sheet Delete (blocked for code-managed unless orphaned) | `af triggers delete <id>` | ✅ |
| `GET /api/v1/triggers/:id/events` | Sheet Events tab | `af triggers events <id>` | ✅ |
| `GET /api/v1/triggers/:id/events/:event_id` | Sheet Events tab → row expand | `af triggers event <id> <event_id>` | ⬜ new |
| `POST /api/v1/triggers/:id/events/:event_id/replay` | Replay button on expanded event row | `af triggers replay <event_id>` | ✅ |
| `POST /api/v1/triggers/:id/test` | "Send test event" header button | `af triggers test <id>` | ⬜ new |
| `GET /api/v1/triggers/:id/events/stream` (SSE) | Live event updates in Sheet | `af triggers tail <id>` | ⬜ new |
| `GET /api/v1/triggers/:id/secret-status` | Secret status pill in table + Sheet | (embedded in describe) | ⬜ new |
| `GET /api/v1/triggers/:id/dispatch-logs/stream` (SSE) | Sheet Dispatch logs tab | `af triggers logs <id>` | ⬜ new |
| `GET /api/v1/triggers/metrics` | Dashboard tile | `af triggers stats` | ⬜ new |
| `GET /api/v1/runs/:id` (existing, extend) | Run detail page — embed `trigger` field when applicable | (existing) | 🟡 extend response shape |

### 7.2 Response shape rules

- [ ] **Cursor pagination** — every list endpoint returns `{ items: [...], next_cursor: "..." | null }`
- [ ] **Filter parameters** — same query params for UI and CLI: `?source=stripe&status=failed&since=1h&until=now&trigger_id=...&event_type=...&cursor=...`
- [ ] **Output shape stability** — `--output json` returns exactly the JSON the UI fetched. No re-shaping in the CLI layer.
- [ ] **SSE shape** — every stream emits `{ type: "event" | "trigger.updated" | "ping", data: {...} }`. Mirrors existing event-bus shape.
- [ ] **Error shape** — `{ error: "code", message: "human readable", details?: {...} }`. UI surfaces `message` in toasts; CLI surfaces on stderr with non-zero exit.

### 7.3 Auth + RBAC

- [ ] All `/api/v1/triggers*` and `/api/v1/sources*` endpoints require auth (existing middleware)
- [ ] Run-detail extension exposing `trigger` field on existing `/api/v1/runs/:id` follows the same auth as the rest of `/api/v1/runs*`
- [ ] `/sources/:trigger_id` (public ingest) is the only unauthenticated endpoint — auth is via signature verification per source
- [ ] When RBAC ships (out of v1), same role checks cover UI and CLI — no per-surface permission logic

### 7.4 OpenAPI / SDK generation

- [ ] Document every endpoint above in the existing OpenAPI spec
- [ ] CLI uses the typed Go client generated from the spec (no hand-rolled HTTP calls)
- [ ] UI uses a typed TS client generated from the same spec (replaces ad-hoc `fetch` in `TriggersPage.tsx`)
- [ ] Backend-side endpoint changes force compile errors in both surfaces, not silent drift

---

## 8. P1 — Documentation

### User-facing
- [ ] `docs/triggers.md` — overview, mental model (Source vs Trigger vs Event), code-vs-UI binding, VC chain
- [ ] `docs/sources/stripe.md` — full setup walkthrough (where to paste the URL in Stripe dashboard, which events to enable, how to set `STRIPE_WEBHOOK_SECRET`)
- [ ] `docs/sources/github.md` — same for GitHub repo settings
- [ ] `docs/sources/slack.md` — Slack app config
- [ ] `docs/sources/generic-hmac.md` + `docs/sources/generic-bearer.md` — for in-house webhook providers
- [ ] `docs/sources/cron.md` — schedule expression reference + timezone notes
- [ ] `docs/local-dev-triggers.md` — testing locally with ngrok / `af triggers test` / pytest fixture
- [ ] `docs/migrations/from-outbound-webhooks.md` — existing observability webhooks vs new inbound triggers (clarify they're different)

### Contributor-facing
- [ ] `docs/contributing-a-source.md` — step-by-step for adding a community source: implement `Source` + `HTTPSource` (or `LoopSource`), register in `init()`, add to `sources/all/all.go`, write unit tests, write integration test, add docs
- [ ] Reference template — copyable skeleton at `internal/sources/_template/` to bootstrap new sources

### CLAUDE.md / README
- [ ] Update repo `README.md` with a "Triggers" feature blurb and link to docs
- [ ] Update `CLAUDE.md` with the trigger system architecture so future Claude sessions have context

---

## 9. P2 — Additional first-party sources

Order chosen by user demand frequency. Each follows the same shape: `internal/sources/<name>/<name>.go` + `<name>_test.go` + integration test + docs.

- [ ] **Linear** — issue events, comment events, signed via Linear webhook secret
- [ ] **Discord** — interaction endpoint signed via Ed25519 (different from HMAC — exercises the `Source` interface's flexibility)
- [ ] **PagerDuty** — incident triggered/resolved
- [ ] **Twilio** — SMS in / call status, signed via `X-Twilio-Signature`
- [ ] **SendGrid** — inbound parse / event webhook
- [ ] **S3 notifications** (via SQS or HTTP target) — SNS-signed envelope
- [ ] **Generic outgoing-poll source** — `LoopSource` that polls a URL on a schedule and emits events on diff (e.g., RSS, JSON endpoint) — exercises the `LoopSource` interface beyond cron

---

## 10. Parking lot — explicitly tracked but not on v1 path

These are real work items, just not blocking v1. Listed here so they're visible in the checklist without diluting the critical path.

### TypeScript SDK trigger parity
- [ ] `EventTrigger` / `ScheduleTrigger` types in `sdk/typescript/src/types/triggers.ts`
- [ ] Builder API (TS has no runtime decorators): `agent.reasoner("name", handler).onEvent({source, types}).onSchedule(cron)`
- [ ] Registration payload threads triggers
- [ ] Tests + example in `sdk/typescript/examples/`

### Local-dev tunnel automation
- [ ] `af dev --tunnel` flag that auto-starts ngrok or cloudflared if installed and prints public ingest URLs with trigger IDs substituted (Layer-3 testing convenience; Layer 1 + 2 cover most flows)

### Out of v1 scope (per `plan-webhook.md`, do not build)
- 🚫 Encrypted secret store (env vars only for v1)
- 🚫 Multi-tenant scoping (single-team setups for now)
- 🚫 Queue / SQS / Kafka sources (cron is the only loop source v1)
- 🚫 `stripe listen`-style built-in tunnel
- 🚫 Batch ingestion (one event per request)
- 🚫 Per-trigger retry policy (single global policy v1)
- 🚫 Plugin hot-reload (compile-time only — Caddy model)

Revisit when we have multi-tenant or 100+ triggers per deployment.

---

## 11. Verification matrix

Final acceptance — every row green before declaring done:

| Layer | Test | Status |
|---|---|---|
| Backend unit | 51 source + registry tests | ✅ |
| Backend integration | Per-source ingest → dispatch → reasoner | ⬜ |
| Backend integration | Idempotency dedup (Stripe id repeat) | ⬜ |
| Backend integration | Cron faked clock | ⬜ |
| Backend integration | Replay creates new execution VC chained to original trigger VC | ⬜ |
| Backend security | Replay-window enforcement across all sources | ⬜ |
| Backend security | Body size limit | ⬜ |
| Backend security | Rate limit | ⬜ |
| Python SDK | Form A `@reasoner(triggers=[...])` registration roundtrip | ⬜ |
| Python SDK | Form B `@on_event` / `@on_schedule` registration roundtrip | ⬜ |
| Python SDK | Form A and Form B produce identical wire payloads | ⬜ |
| Python SDK | Mixing Form A + Form B on same reasoner merges correctly | ⬜ |
| Python SDK | `@reasoner` not outermost → import-time error with actionable message | ⬜ |
| Python SDK | `simulate_trigger` helper (Layer-1 testing) | ⬜ |
| Python SDK | `TriggerContext` injection (`ctx.trigger.event_type`, `idempotency_key`, `vc_id`) | ⬜ |
| Python SDK | Pytest fixture (`agentfield_trigger_client`) | ⬜ |
| Go SDK | `WithTriggers` and `WithEventTrigger` / `WithScheduleTrigger` registration roundtrip | ⬜ |
| Go SDK | `SimulateTrigger` helper | ⬜ |
| TS SDK | Full trigger parity | 🚫 parked (§10) |
| Source of truth | Code re-registration upserts on `(node, reasoner, source)` idempotently | 🟡 (impl exists, test missing) |
| Source of truth | `manual_override_enabled` preserved across re-registration (sticky-pause §5.3) | ⬜ |
| Source of truth | Decorator removed in code → row marked `orphaned=true`, events preserved | ⬜ |
| Source of truth | `code_origin` (`file:line`) populated from SDK at registration | ⬜ |
| Source of truth | UI cannot edit code-managed config; CAN toggle enabled (sticky) | ⬜ |
| Source of truth | Code-managed and UI-managed coexist for same `(node, reasoner, source)` as separate rows | ⬜ |
| API contract | Every UI fetch maps to a documented §7 endpoint | ⬜ |
| API contract | Every `af triggers` command calls the same endpoint as the UI | ⬜ |
| API contract | OpenAPI spec covers every webhook endpoint | ⬜ |
| UI | Single-page `/triggers` with sources strip + table + Sheet detail | ⬜ |
| UI | Sheet tabs (Events / Configuration / Secrets / Dispatch logs) work for both code- and UI-managed | ⬜ |
| UI | Inline event row expand (no separate page) shows verification + payload + VC chain + replay | ⬜ |
| UI | Sticky-pause banner surfaces on overridden code-managed triggers | ⬜ |
| UI | Orphan badge + "Convert to UI-managed / Delete" actions | ⬜ |
| UI | Drift card shows `code_origin` and `last_registered_at` | ⬜ |
| UI | Run detail page shows "Trigger" Card with source + event payload as input | ⬜ |
| UI | Runs list shows "Triggered by Stripe" badge on rows that came from inbound events | ⬜ |
| UI | Reasoner detail surfaces bound triggers (read-only, deep-links to Sheet) | ⬜ |
| UI | Node detail surfaces aggregated triggers | ⬜ |
| UI | Dashboard tile: 24h events + dispatch success rate | ⬜ |
| UI | Live SSE updates in Sheet + dashboard | ⬜ |
| UI | Deep-links (`?trigger=X&event=Y`) auto-open Sheet at right state | ⬜ |
| UI | Dark mode + responsive + a11y | ⬜ |
| UI | Manual: create trigger → copy URL → curl signed payload → event appears live in Sheet → VC chain navigable | ⬜ |
| CLI | `af triggers` (incl. `pause`/`resume`/`convert-to-ui`) and `af sources` shipped | ⬜ |
| CLI | `--output json` returns exactly the UI's wire shape | ⬜ |
| Testing | Layer-1 (`simulate_trigger`) green per source | ⬜ |
| Testing | Layer-2 (`af triggers test` + fixture library) green per source | ⬜ |
| Testing | Layer-3 (ngrok docs) verified for one source manually | ⬜ |
| Docs | Per-source setup guides | ⬜ |
| Examples | Stripe + cron + GitHub for Python and Go | ⬜ |

---

## 12. Sequencing — build order, one phase at a time

Each phase = one commit (or one PR), then sweep the checkboxes here. Don't skip ahead. Each phase produces something demoable on its own.

| # | Phase | Why this order | Surfaces touched | Estimated size |
|---|---|---|---|---|
| 1 | **VC chain extension** (§1) | Unique value prop; cheapest to land while context is fresh; migrations should arrive before UI starts surfacing VC links | backend, migration | ~250 LOC + 1 migration |
| 2 | **Per-source integration tests** (§2) | Locks in current behavior. Without this, every later change risks silent regression on Stripe / GitHub / Slack ingest. | backend tests | ~600 LOC test code |
| 3 | **Source-of-truth backend** (§5.3, 5.4, 5.5) | Adds `manual_override_enabled`, `orphaned`, `code_origin`, `last_registered_at` to `triggers`. UI design assumes these fields exist. | backend, migration, SDK (origin capture) | ~150 LOC + 1 migration |
| 4 | **API contract gaps** (§7.1) | New endpoints: `pause`, `resume`, `convert-to-ui`, `test`, SSE streams, `secret-status`, `metrics`, single event GET. Plus OpenAPI documentation for everything. **Lands before UI rewrite to avoid rework.** | backend, OpenAPI | ~400 LOC |
| 5 | **Python SDK DX core** (§4 Python) | Two-form decorator validation tests, `TriggerContext`, `simulate_trigger`, fixture library, pytest fixture. Biggest DX lever, gates Layer-1 + Layer-2 testing. | python sdk, fixtures | ~500 LOC + fixtures |
| 6 | **UI rewrite — single page + Sheet** (§6.1–6.6) | Replace current page with sources strip + table + Sheet (events/config/secrets/logs tabs). Inline event expand. Sticky-pause banner. Drift card. | web client | ~800 LOC |
| 7 | **UI cross-page integration** (§6.7) | Run detail Trigger card + payload-as-input. Runs list "Triggered by" badge. Reasoner detail bound-triggers card. Node detail aggregated triggers. Dashboard tile. Deep-link query params. | web client (existing pages) | ~400 LOC across 5 pages |
| 8 | **CLI parity** (§4 CLI) | Every `af triggers` / `af sources` subcommand. Free once §4 endpoints are solid. | af binary | ~300 LOC |
| 9 | **Production hardening — security** (§3 security subset) | Rate limit, body cap, replay-window enforcement, audit log. Ship-blocker for first prod user. | backend | ~250 LOC |
| 10 | **Docs** (§8) | Per-source setup guides, `contributing-a-source.md`, local-dev testing layers, `docs/triggers.md` mental model. | docs | doc work |
| 11 | **Go SDK polish** (§4 Go) | `SimulateTrigger`, validation at registration, examples. | go sdk | ~300 LOC |
| 12 | **Production hardening — reliability + ops** (§3 reliability/observability) | DLQ retry worker, metrics, tracing. Coincides with first prod deployment. | backend | ~400 LOC |
| 13 | **Additional sources** (§9) | Linear first (proves the contributing-a-source flow on a fresh impl), then on demand. | sources | per-source ~200 LOC |
| 14 | **Parking lot** (§10) | TS SDK + `af dev --tunnel`. Pull in when real users ask. | typescript sdk + af binary | open |

Phase 1–4 are foundational (no user-visible polish, but everything later depends on them). Phase 5–8 deliver the headline feature: code DX + visible UI + CLI. Phases 9+ are hardening and breadth.

Each phase ends with: checkbox sweep here, single commit (or PR) to `feat/webhooks` branch. **This file is the canonical source of truth for what's in / out of scope.** Update it whenever scope changes.
