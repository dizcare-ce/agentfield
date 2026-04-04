# Execution Queue / Live Operations View

**Design Spec — AgentField UI Revamp**
**Document:** 02 of the UI Revamp series
**Addresses:** Journey 1 (Monitor & Observe) + Journey 2 (Diagnose & Fix)
**Pain Point:** User had jobs running, submitted more, everything froze. No way to see queue state or what was stuck.

---

## Problem Statement

The current Executions page is a historical table. It answers "what happened" — but when a system is under stress (queue saturating, agents stuck, backpressure kicking in), operators need to answer "what is happening and why is it stuck" in under 5 seconds. That question is completely unanswered today.

The backend is ready: SSE streaming, cancel/pause/resume endpoints, per-agent concurrency limits, queue status API — all exist. The UI just doesn't expose them operationally.

---

## Design Decision: Kanban vs. Unified Live Table

Two approaches were considered.

### Option A — Kanban Board (Queued | Running | Waiting | Done/Failed)

**Pros:** Immediately visual, matches mental model of pipeline stages, easy to see bottlenecks (one column piles up).

**Cons:** Done/Failed is unbounded — the rightmost column becomes a wall of cards. Cards lack the density operators need when there are 50+ executions. Filtering and sorting are awkward in Kanban. Cross-column bulk selection is non-obvious.

### Option B — Live Operations Table with a Status Lane Header (CHOSEN)

A filterable, sortable table where each row is an execution — but the page is headed by a status lane summary (the "queue strip") that gives the Kanban-like at-a-glance view without sacrificing table density. The strip is clickable to filter the table to that lane.

**Why this wins:** Operators managing 100+ executions need density and filtering, not cards. The status strip gives the visual overview. The table gives the power. SSE updates both in place without re-rendering a Kanban layout.

---

## Page Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LIVE QUEUE                                   ● Live  [Pause Updates]  [⚙]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  QUEUE STATS STRIP                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐│
│  │  QUEUED      │ │  RUNNING     │ │  WAITING     │ │  TERMINAL (1h)       ││
│  │  ● 12        │ │  ● 8 / 20   │ │  ⏸ 3         │ │  ✓ 847  ✗ 23        ││
│  │              │ │  slots used  │ │  HITL        │ │                      ││
│  │  [Cancel All]│ │              │ │  [View All]  │ │  [Retry Failed]      ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────────────┘│
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  STUCK DETECTION BANNER  (only shown when stuck executions exist)    │    │
│  │  ⚠  4 executions have been Running for >5 min without progress       │    │
│  │     [View Stuck]  [Cancel All Stuck]  [Dismiss]                      │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  FILTER BAR                                                                   │
│  [Status ▾] [Agent ▾] [Workflow ▾] [Reasoner ▾]  🔍 Search...   [⋮ Columns] │
│                                                                               │
│  CONCURRENCY RAIL  (per-agent usage bars, shown when agent filter is active) │
│  agent-a  ████████░░  8/10  ·  agent-b  ███░░░░░░░  3/20  ·  ...           │
│                                                                               │
│  EXECUTION TABLE                                                              │
│  ┌────┬──────────────┬────────────┬────────────┬──────────┬──────┬────────┐ │
│  │ ☐  │ ID           │ Agent      │ Reasoner   │ Status   │ Age  │ Action │ │
│  ├────┼──────────────┼────────────┼────────────┼──────────┼──────┼────────┤ │
│  │ ☐  │ exec-a1b2    │ doc-agent  │ summarize  │ ● queued │ 2s   │  ✕     │ │
│  │ ☐  │ exec-c3d4    │ doc-agent  │ summarize  │ ● running│ 3m   │ ⏸  ✕   │ │
│  │ ☐  │ exec-e5f6 ⚠  │ doc-agent  │ summarize  │ ● running│ 8m ⚠ │ ⏸  ✕   │ │
│  │ ☐  │ exec-g7h8    │ mail-agent │ compose    │ ⏸ waiting│ 12m  │ ▶  ✕   │ │
│  │ ☐  │ exec-i9j0    │ mail-agent │ send       │ ✓ done   │ 18m  │        │ │
│  │ ☐  │ exec-k1l2    │ doc-agent  │ index      │ ✗ failed │ 22m  │ ↺      │ │
│  └────┴──────────────┴────────────┴────────────┴──────────┴──────┴────────┘ │
│                                                                               │
│  BULK ACTION BAR  (appears when rows are selected)                           │
│  2 selected  [Cancel Selected]  [Retry Selected]  [Clear Selection]          │
│                                                                               │
│  ← Older executions  [Load more]                     Showing 50 of 892      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section Specifications

### 1. Page Header

```
LIVE QUEUE                                   ● Live  [Pause Updates]  [⚙]
```

- **Title:** "Live Queue" — not "Executions". This is the operational view, not the audit view.
- **Live indicator:** Pulsing green dot when SSE connection is active. Amber dot + "Reconnecting..." when connection drops. Red dot + "Disconnected — [Reconnect]" on hard failure.
- **Pause Updates button:** Freezes SSE-driven updates in the UI without closing the SSE connection. Useful when operator is reading a row and updates keep re-sorting it. Changes to "Resume Updates" when paused. A counter badge shows "12 new events buffered" so operators know the pause is not a sync error.
- **Settings gear:** Opens a panel for display preferences (stuck threshold, visible columns, time format, default sort).

---

### 2. Queue Stats Strip

Four fixed-width tiles. Each tile is a clickable filter: clicking "QUEUED" filters the table to queued executions only.

#### Tile 1 — QUEUED
```
┌──────────────┐
│  QUEUED      │
│  ● 12        │
│              │
│  [Cancel All]│
└──────────────┘
```
- Count of executions in `queued` + `pending` status (both mean "not yet dispatched to an agent").
- Count turns amber at >10, red at >50 (configurable thresholds).
- "Cancel All" button: opens confirmation modal listing count and asking for confirmation. Does not appear when count is 0.

#### Tile 2 — RUNNING
```
┌──────────────┐
│  RUNNING     │
│  ● 8 / 20   │
│  slots used  │
│              │
└──────────────┘
```
- `running` count / total concurrency limit across all agents currently filtered (or global total when no filter active).
- The `/20` denominator is the sum of `concurrency_limit` from `GET /api/ui/v1/queue/status` for all agents in scope.
- Progress bar below the count: fills proportionally. Amber at 80%, red at 100%.
- At 100% utilization: tile gets a red tint and a tooltip: "No available slots — new executions will queue."

#### Tile 3 — WAITING (HITL)
```
┌──────────────┐
│  WAITING     │
│  ⏸ 3        │
│  HITL        │
│  [View All]  │
└──────────────┘
```
- Count of executions in `waiting` status (awaiting human-in-the-loop approval).
- "View All" links to the HITL Requests page filtered to pending items related to these executions.
- If HITL requests have breached their SLA timeout, the count turns amber.

#### Tile 4 — TERMINAL (last 1h)
```
┌──────────────────────┐
│  TERMINAL (1h)       │
│  ✓ 847  ✗ 23        │
│                      │
│  [Retry Failed]      │
└──────────────────────┘
```
- `succeeded` and `failed` counts for the sliding 1-hour window. This is not a lifetime count — it's a throughput signal.
- Failure rate shown as a small percentage if > 5%: `✗ 23 (2.6%)`.
- "Retry Failed" button: opens a confirmation that lists the 23 failed executions and allows bulk retry. Applies only to the currently filtered scope.
- The time window ("1h") is a dropdown: 15m / 1h / 6h / 24h.

---

### 3. Stuck Execution Detection and Banner

A "stuck" execution is one that has been in `running` status for longer than a configurable threshold without emitting a progress event. Default threshold: 5 minutes.

**Detection logic (frontend):**
- When an SSE `execution.updated` event arrives with `status: running`, record `(execution_id, timestamp)`.
- On a 30-second client-side tick, scan all running executions. If `now - last_event_timestamp > stuck_threshold`, mark as stuck.
- SSE events that include `progress` or `log` sub-types reset the stuck clock for that execution.

**Banner (shown only when stuck executions exist):**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⚠  4 executions have been Running for >5 min without progress           │
│     [View Stuck]  [Cancel All Stuck]  [Dismiss]                          │
└──────────────────────────────────────────────────────────────────────────┘
```
- Amber background, warning icon.
- "View Stuck" applies a `stuck: true` filter to the table, showing only those executions.
- "Cancel All Stuck" opens a confirmation with the list of stuck execution IDs before acting.
- "Dismiss" hides the banner for the current session only; it returns if new stuck executions appear.

**Per-row stuck indicators:**
- Rows of stuck executions get an amber `⚠` badge on the ID and the Age cell turns amber with a tooltip: "Running 8m 22s — no progress events".
- Row background gets a subtle amber tint (not disruptive, but scannable at a glance).

**Stuck threshold configuration:** Accessible via the page settings gear. Stored in `localStorage`. Default 5 minutes. Range: 1–60 minutes.

---

### 4. Filter Bar

```
[Status ▾] [Agent ▾] [Workflow ▾] [Reasoner ▾]  🔍 Search...   [⋮ Columns]
```

**Status filter (multi-select dropdown):**
- Options: All, Pending, Queued, Running, Waiting, Paused, Succeeded, Failed, Cancelled, Timeout
- Special group: "Active" (selects Pending + Queued + Running + Waiting + Paused in one click)
- Special group: "Stuck" (applies stuck detection filter)
- Active non-default selections shown as removable chips: `Status: Running, Queued ✕`

**Agent filter (multi-select + search):**
- Searchable list of agents. Shows count of active executions per agent in parentheses.
- When an agent is selected, the Concurrency Rail (see section 5) activates.

**Workflow filter:**
- Filter to executions that belong to a specific workflow run.

**Reasoner filter:**
- Filter to executions for a specific reasoner/skill name.

**Search box:**
- Free-text search against execution ID, input payload (first 200 chars), error message, and workflow ID.
- Debounced 300ms. Searches client-side on already-loaded rows; triggers a server query for deeper results.

**Columns toggle:**
- Show/hide optional columns: Workflow ID, Input Preview, Error Summary, Started At, Duration.

**Active filter indicator:**
- When any non-default filter is active: filter bar gets a subtle highlight and a "Clear all filters" link appears on the right.

---

### 5. Concurrency Rail

Shown below the filter bar only when one or more agents are selected in the filter, or always if fewer than 5 agents exist globally.

```
doc-agent    ████████░░  8/10  ·  mail-agent  ███░░░░░░░  3/20  ·  ingest-agent  ░░░░░░░░░░  0/5
```

- Each agent shown as: `name  [progress bar]  used/limit`.
- Bar fills proportionally. Color: green <70%, amber 70–90%, red >90%.
- Clicking an agent name in the rail adds it to the Agent filter.
- At 100% utilization: bar turns solid red and a tooltip appears: "Agent at capacity — executions are queuing."
- Concurrency limit is sourced from `GET /api/ui/v1/queue/status` response field `per_agent_concurrency`.
- A pencil icon on hover opens an inline edit for the concurrency limit (PUT to the appropriate config endpoint).

---

### 6. Execution Table

#### Columns

| Column | Default | Description |
|---|---|---|
| Checkbox | Always | Row selection for bulk actions |
| ID | Always | Short execution ID (e.g. `exec-a1b2`), links to execution detail page. Stuck badge `⚠` prepended if stuck. |
| Agent | Always | Agent name, links to agent detail page |
| Reasoner | Always | Reasoner/skill name |
| Status | Always | Color-coded pill (see status colors below) |
| Age | Always | Time since execution was created (e.g. `2s`, `3m`, `1h 22m`). For running/queued executions, this is the time the execution has been waiting or running. Cell turns amber for stuck executions. |
| Workflow | Optional | Workflow ID if this execution is part of a multi-step workflow. Clicking opens workflow DAG. |
| Input | Optional | First 60 chars of input payload, truncated. On hover shows full tooltip. |
| Error | Optional | For failed/timeout executions: first line of error message. |
| Duration | Optional | Wall clock time from start to terminal state (shown only for terminal executions) |
| Actions | Always | Contextual action buttons (see below) |

#### Status Colors and Pills

```
● pending     — gray
● queued      — blue
● running     — green (pulsing dot)
⏸ waiting    — amber (HITL)
⏸ paused     — amber
✓ succeeded  — green (no dot)
✗ failed     — red
✕ cancelled  — gray (muted)
⏱ timeout   — red (with clock icon)
```

#### Per-Row Actions (Actions column)

Actions are contextual — only relevant buttons appear:

| Status | Available Actions |
|---|---|
| queued / pending | Cancel (✕) |
| running | Pause (⏸), Cancel (✕) |
| waiting | View HITL request (↗), Cancel (✕) |
| paused | Resume (▶), Cancel (✕) |
| failed / timeout | Retry (↺), View Error (!) |
| succeeded | View Output (↗) |
| cancelled | Retry (↺) |

Actions use icon buttons with tooltips. Destructive actions (cancel) require a single confirm click — not a modal — for speed. The button turns red on first click with "Confirm?" text; a second click executes.

#### Row Interaction

- **Click row body:** Expands an inline detail drawer below the row (not a full navigation). Shows: full input, partial output (streaming if running), duration timeline, error details. A "View Full Detail" link at the bottom navigates to the existing execution detail page.
- **Cmd+Click:** Opens execution detail in a new tab.
- **Sticky header:** Table header stays fixed on scroll.
- **Virtual scroll:** For large result sets (>100 rows), use virtual scrolling. Rows outside viewport are not rendered but their height is reserved.

#### Loading and Pagination

- Initial load: 50 rows, most-recent first for terminal states, oldest first for active states (so stuck items float to top).
- "Load more" button at bottom loads the next 50.
- SSE updates prepend new rows (or update existing rows in-place) without resetting scroll position.
- When "Pause Updates" is active, incoming SSE events are buffered; a "12 new events — click to apply" chip appears above the table.

---

### 7. Bulk Actions Bar

Appears as a sticky bottom bar when one or more rows are checked.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  2 selected   [Cancel Selected]  [Retry Selected]  [Pause Selected]        │
│               [Clear Selection]                             Select All (892)│
└────────────────────────────────────────────────────────────────────────────┘
```

**Available bulk actions:**

| Action | Applies to | Behavior |
|---|---|---|
| Cancel Selected | Any non-terminal status | Issues cancel to each; shows progress as SSE confirms |
| Retry Selected | failed, timeout, cancelled | Submits new execution with same input; links old to new |
| Pause Selected | running | Issues pause to each |
| Resume Selected | paused | Issues resume to each |
| Cancel All Queued | (tile shortcut) | Cancels all queued in current filter scope, not just selection |
| Retry All Failed | (tile shortcut) | Retries all failed in current filter scope (1h window) |

**Bulk action execution:**
- Bulk actions are dispatched in parallel (Promise.all), not sequentially.
- A progress indicator shows `3/8 done` during execution.
- Errors are surfaced inline: "2 succeeded, 1 failed (exec-e5f6: permission denied)".
- "Select All (892)" selects all matching the current filter, not just the visible 50 rows — a common pattern from email clients. A warning is shown for destructive bulk actions when count > 100: "You are about to cancel 892 executions. Type CONFIRM to proceed."

---

### 8. Real-Time Updates (SSE Integration)

SSE endpoint: `GET /api/ui/v1/executions/events`

**Connection lifecycle:**
- Connect on page mount. Store `EventSource` in a ref.
- On `error` event: exponential backoff reconnect (1s, 2s, 4s, 8s, max 30s). Update live indicator to amber.
- On successful reconnect: fetch `GET /api/ui/v1/executions/enhanced` with `?updated_after=<last_event_timestamp>` to catch events missed during disconnection. Merge into current state.
- On page unmount or tab visibility change to hidden: close connection. Reopen on visible.

**Event handling:**

```
execution.created   → Prepend new row to table. Increment relevant tile count.
execution.updated   → Find row by ID, update status/age/fields in-place. No reorder unless sort is by status.
execution.completed → Update row to terminal status. Move from active counts to terminal tile count.
execution.cancelled → Update row. Decrement relevant counts.
queue.status        → Update tile counts and concurrency rail directly (authoritative update).
```

**Optimistic updates:**
- When an operator clicks "Cancel" on a row, immediately show the row as "cancelling..." (greyed, spinner) without waiting for SSE confirmation. If SSE confirms within 5s, update to "cancelled". If SSE does not confirm within 5s, revert and show an error toast.

**State merging strategy:**
- SSE events are treated as patches, not full replacements.
- The local state is a Map<execution_id, ExecutionRecord>.
- Events update fields on the record. New fields from events are merged in; existing fields not mentioned in the event are preserved.
- Sort is re-applied on a 1s debounce after updates to avoid thrashing.

---

### 9. Relationship to Existing Executions Page

The existing Executions page (`/executions`) serves Journey 4 (Review & Audit): it's a historical table optimized for filtering past executions by time range, searching for specific runs, and drilling into execution detail.

**This new page is not a replacement — it is a separate operational view.**

| | Live Queue View (`/queue`) | Executions Page (`/executions`) |
|---|---|---|
| Purpose | See what's happening NOW, act on it | Review what happened, audit |
| Default time scope | Last few minutes to hours, live | All time, historical |
| Default sort | Active first (queued/running at top) | Most recent first |
| SSE | Yes — real-time updates | No — static snapshot |
| Bulk actions | Yes — cancel, retry, pause, resume | No (or minimal) |
| Stuck detection | Yes | No |
| Queue stats strip | Yes | No |
| Concurrency rail | Yes | No |
| Entry point | Header nav, Dashboard alert links | Header nav |

**Navigation integration:**
- Add "Queue" to the top-level nav alongside "Executions". Use a live badge on the nav item showing the count of queued+running executions (e.g. `Queue (20)`).
- From execution detail pages, add a "Back to Queue" breadcrumb that returns to the live queue view with the same agent filter active.
- Dashboard stuck/queue alerts link to `/queue?filter=stuck` and `/queue?filter=queued` respectively.
- The Executions history page gets a "View Live Queue →" link in its header for discoverability.

**Long-term:** The Executions page may be demoted to a sub-tab of a unified "Executions" section, with "Live Queue" as the default tab and "History" as the secondary. But this is not required for the initial implementation.

---

### 10. Concurrency Limit Display Per Agent (Detail)

Beyond the concurrency rail in the filter bar area, concurrency is surfaced in two additional places:

**In the Running tile:**
- `8 / 20` is the aggregate across all agents. Tooltip on hover breaks it down: "doc-agent: 5/10, mail-agent: 3/10".

**In the Agent filter dropdown:**
- Each agent option shows its concurrency usage: `doc-agent (5/10 slots)`.
- Agents at 100% capacity are shown at the top of the list with a red indicator.

**Inline edit of concurrency limits:**
- In the concurrency rail, hovering an agent shows a pencil icon. Clicking opens an inline spinner: `doc-agent  [8] ↑↓  /  [10 ✎]  slots`. The limit field is editable; pressing Enter sends the update. This surfaces a capacity management action inside the operational view, satisfying Journey 5 without requiring navigation away.

---

## Edge Cases and Empty States

**No active executions:**
```
┌─────────────────────────────────────────────────────────┐
│  All queues are empty                                    │
│  No pending, queued, or running executions.             │
│                                                          │
│  [View execution history →]                             │
└─────────────────────────────────────────────────────────┘
```

**SSE disconnected with stale data:**
- A yellow banner at the top: "Live updates paused — reconnecting. Data may be stale."
- All row age timestamps stop counting up and show a "⚠ stale" indicator after 30s.

**Queue saturated (503 from backend):**
- The Queued tile shows a red badge: "Queue full — new submissions rejected (503)".
- Tooltip: "The execution queue has reached its backpressure limit. Cancel queued executions or wait for running executions to complete."

**Many stuck executions (>20):**
- The stuck banner changes to: "⚠ 24 executions appear stuck. This may indicate an agent health issue."
- Links to the System Health page for the relevant agent.

**Agent with 0 concurrency limit:**
- Concurrency rail shows: `doc-agent  ░░░░░░░░░░  —  (limit: 0 — paused)`. Executions queue indefinitely.

---

## Component Architecture Notes (for implementors)

The implementation should separate three concerns:

1. **SSE Manager** — A singleton service (or React context) that owns the EventSource connection, handles reconnection, and publishes parsed events. Consumers subscribe to event types; they do not directly manage the SSE connection.

2. **Execution Store** — An immutable Map-based store (Zustand or React Context with useReducer) holding the current state of all executions in view. SSE events dispatch actions to this store. The store exposes derived views: `activeExecutions`, `stuckExecutions`, `queueStats`.

3. **Display Layer** — React components that read from the store and render. They do not fetch data directly; they subscribe to store slices.

This separation ensures that "Pause Updates" is trivially implemented (stop flushing the event buffer to the store), that optimistic updates are cleanly reverted (dispatch a revert action if SSE doesn't confirm), and that filtering is always applied on derived views from the store — not on the raw fetch.

---

## API Surface Used by This Page

| Endpoint | Purpose |
|---|---|
| `GET /api/ui/v1/executions/enhanced` | Initial load + refetch after SSE reconnect |
| `GET /api/ui/v1/queue/status` | Initial concurrency data + updated via queue.status SSE events |
| `GET /api/ui/v1/executions/events` | SSE stream for all live updates |
| `POST /api/v1/executions/{id}/cancel` | Cancel action |
| `POST /api/v1/executions/{id}/pause` | Pause action |
| `POST /api/v1/executions/{id}/resume` | Resume action |
| `POST /api/v1/executions` (inferred) | Retry: submit new execution with same input |

No new backend endpoints are required for the initial implementation of this page.

---

## Open Questions

1. **Retry semantics:** When retrying a failed execution, should the new execution be linked to the old one (same workflow context)? Or is it a fresh independent submission? Backend needs to clarify whether there is a `retry_of` field on the execution model.

2. **Stuck threshold — server or client?** Currently specced as client-side. If backend emits a `execution.stuck` event type (detectable server-side via heartbeat absence), that is strictly better. Worth checking if the backend already has this.

3. **Concurrency limit editing:** What endpoint handles per-agent concurrency limit updates? Spec assumes it exists; needs verification against the actual agent config API.

4. **Queue status granularity:** Does `GET /api/ui/v1/queue/status` return per-agent breakdowns, or only global counts? The concurrency rail design requires per-agent data.

5. **SSE event schema:** The spec assumes events have `type` (execution.created, execution.updated, etc.) and a `data` payload with an execution object. Need to verify the actual SSE event format from the backend.
