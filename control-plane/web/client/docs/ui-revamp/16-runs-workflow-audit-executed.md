# Runs / workflow UI — audit executed

**Executed:** 2026-04-04  
**Scope:** `/runs`, `/runs/:runId`, supporting APIs (`/api/ui/v2/workflow-runs`, `/api/ui/v1/executions/.../details`, DAG, DID VC chain), `StepDetail`, `RunDetailPage`, `RunsPage`.  
**Method:** Static code review + Go/TS contract tracing (no live browser session in this pass).

---

## Confidence legend

| Tag | Meaning |
|-----|---------|
| **Verified** | Traced in source; high confidence |
| **Likely** | Strong inference; confirm with one manual test |
| **Unknown** | Needs your product decision or runtime check |

---

## Verified findings

### A. Runs list (`RunsPage.tsx` + `workflow_runs.go`)

| Topic | Finding | Confidence |
|-------|---------|------------|
| Server query params | `ListWorkflowRunsHandler` accepts `page`, `page_size`, `sort_by`, `sort_order`, `status`, `session_id`, `actor_id`, `since`, `run_id` — **no `agent_id` / `agent_node_id`** | Verified |
| Agent filter UX | Selected agents filter **`pageRows` client-side only** after each server page fetch. Empty pages are possible when matching runs sit on other pages. | Verified |
| Sort / pagination | Server-backed sort + pagination are wired via `useRuns` → `getWorkflowsSummary`. | Verified |
| Bulk actions | Compare (exactly 2) and Cancel running are implemented (not stubs). | Verified |
| Navigation | Row click uses `navigate(\`/runs/${run.run_id}\`)`. `NewDashboardPage` uses `/runs/${runId}` (legacy `/workflows/...` dashboard bug appears **fixed** in current source). | Verified |

### B. Run detail (`RunDetailPage.tsx`)

| Topic | Finding | Confidence |
|-------|---------|------------|
| VC chain link | Opens `/api/v1/did/workflow/${runId}/vc-chain` (public v1 DID API, not UI prefix). | Verified |
| Audit export | Client-built JSON: `run_id`, full lightweight DAG payload, `exported_at`. Not necessarily byte-identical to `af verify` inputs. | Verified |
| Header DID | Display uses `title={did:web:agentfield:run:${runId}}` and truncated suffix — **cosmetic** unless you guarantee this matches stored run/workflow DID semantics. | Likely |
| Graph | `WorkflowDAGViewer` delegates to `components/WorkflowDAG` (React Flow + DeckGL stack). **Not** the old “coming soon” stub described in older UX notes. | Verified |
| Breadcrumb | `AppLayout` still shows a **single** segment (e.g. “Runs”) for `/runs/:id` — no “Runs / run_abc” trail. | Verified |

### C. Step detail API + UI

| Topic | Finding | Confidence |
|-------|---------|------------|
| Execution details | `GET /api/ui/v1/executions/:execution_id/details` → `toExecutionDetails`. | Verified |
| Notes in API | **Bug (fixed in this audit):** `toExecutionDetails` always set `Notes: nil` even though `GetExecutionRecord` loads `notes` from DB. Response now returns `notes`, `notes_count`, `latest_note`. | Verified |
| Approval in UI | **Bug (fixed in this audit):** `transformExecutionDetailsResponse` omitted approval and `status_reason`; `StepDetail` HITL could not receive them from the client transform. | Verified |
| DIDs / hashes per step | `ExecutionDetailsResponse` has **no** caller/target DID or input/output hash fields. Old “Workflow Path” style UI would need **API + types + UI** work. | Verified |
| `parent_workflow_id` JSON | Populated from `exec.ParentExecutionID` (parent **execution** id). Name is misleading vs pure workflow id. | Verified |

### D. Settings / identity

| Topic | Finding | Confidence |
|-------|---------|------------|
| Identity tab | `NewSettingsPage` includes **Identity** tab (`getDIDSystemStatus`, server DID display). Gap row “UNKNOWN” in `14-feature-gap-audit.md` is **outdated**. | Verified |

### E. Legacy code paths

| Topic | Finding | Confidence |
|-------|---------|------------|
| `/workflows/...` navigation | Still present inside **unrouted** legacy pages (`WorkflowsPage`, `ExecutionDetailPage`, `WorkflowBreadcrumb`, etc.). Safe only while those routes redirect; harmful if linked from shipped UI. | Verified |

---

## Fixes applied during this audit (code)

1. **`control-plane/internal/handlers/ui/executions.go`** — `toExecutionDetails` now returns execution `notes`, `notes_count`, and `latest_note` from storage.
2. **`control-plane/web/client/src/services/executionsApi.ts`** — `transformExecutionDetailsResponse` now maps `status_reason` and all `approval_*` fields so `StepDetail` can show HITL state from the global details endpoint.

`go test ./internal/handlers/ui/...` passed after the Go change.

---

## Targeted questions for you (please answer when you can)

1. **Runs list agent filter (product)**  
   Is **client-side-only** filtering on the current page acceptable until v2, or do you want **`agent_node_id` on `GET /api/ui/v2/workflow-runs`** (and storage support in `QueryRunSummaries`) so counts and pagination stay correct?  
   *Confidence we need:* **Unknown** — this is a product/perf tradeoff.

2. **Run header DID string**  
   Should the UI show **only** a stable server-issued identifier (from an API field), or is the **synthetic** `did:web:agentfield:run:{runId}` acceptable for marketing/consistency?  
   *Confidence we need:* **Likely** — confirm against DID issuance docs.

3. **Audit bundle vs CLI**  
   Should “Audit bundle (JSON)” **download the same artifact shape** as `af verify` / VC export expects, or is a **debug-oriented DAG snapshot** enough? If parity is required, do we add **`GET .../audit-bundle` server-signed** JSON?  
   *Confidence we need:* **Unknown**.

4. **Workflow-wide tabs (Notes / Identity / Insights / I/O matrix)**  
   Under the new philosophy, do you want **any** run-level tab strip again, or **only** step-first UI + optional **single “Run overview”** drawer (aggregates + VC link)?  
   *Confidence we need:* **Unknown** — drives a large chunk of roadmap.

5. **Per-step provenance (caller/target DID, content hashes)**  
   Are these **required in v1** for compliance demos, or **nice-to-have** behind a “Technical” disclosure in `StepDetail`? If required, does the control plane already persist them on execution records or only inside VC documents?  
   *Confidence we need:* **Unknown** — may need backend discovery.

6. **VC chain URL identifier**  
   Can **`run_id` from the URL** ever differ from the **workflow id** the DID handler expects? If yes, should export use **`dag.root_workflow_id`** from the lightweight DAG response instead of `runId`?  
   *Confidence we need:* **Likely** — worth one integration test on a multi-root-edge case.

---

## Suggested next engineering steps (after your answers)

| Priority | Item |
|----------|------|
| P0 | If you need correct agent filtering: extend `ListWorkflowRunsHandler` + `QueryRunSummaries` + `useRuns` query params. |
| P1 | Breadcrumb + optional run subtitle (`session_id`, `actor_id`, absolute `started_at`) per `15-ux-review.md`. |
| P1 | In-run step search (client-side over `dag.timeline` reasoner/agent) — cheap win if API unchanged. |
| P2 | Run-level “Overview”: note count, webhook failure count, link to VC + insights placeholder. |
| P2 | Align or document `parent_workflow_id` vs `parent_execution_id` in API. |

---

## Document maintenance

- **`14-feature-gap-audit.md`** — updated with a short “Re-audit 2026-04-04” delta; full row-by-row rewrite deferred until product answers above.
- **`15-ux-review.md`** — graph “coming soon” and dashboard `/workflows/` nav items may be stale; treat this file as **review needed** against current `RunDetailPage` / `NewDashboardPage`.
