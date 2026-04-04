# Dashboard Redesign — Design Spec

**File:** `05-dashboard-redesign.md`
**Status:** Draft
**Depends on:** `00-product-philosophy.md`

---

## Problem Statement

The current dashboard is a weekly-review screen masquerading as a live operations view. It answers "how did we do over the last 7 days?" when the operator's actual first question is "is anything broken right now?"

The result: operators open the dashboard, see green sparklines and a 94% success rate, and have no idea that two agents are deadlocked, the LLM circuit breaker opened 8 minutes ago, and 47 executions are queued behind a concurrency limit.

**The redesign answers the three product philosophy questions in order:**

1. "Is my system healthy right now?" — answered in the first viewport, within 2 seconds of page load
2. "What's happening right now?" — answered by scrolling or glancing at live activity below the fold
3. "What went wrong and how do I fix it?" — answered by clicking any red/yellow indicator, which leads to the right diagnosis screen

---

## Design Principles (Dashboard-Specific)

- **Status before metrics.** Show state (healthy / degraded / down) before numbers. Numbers contextualize state; state is never implied by numbers.
- **Red demands action.** No decoration. Every red element is a problem with a next step.
- **Live by default.** The dashboard is always live. Historical mode is an explicit toggle, not the default.
- **Single scroll.** Everything critical fits above the fold on a 1280px screen. Analytics are below-the-fold supplements, not primary content.

---

## Page Layout — Full Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SYSTEM HEALTH STRIP  (always visible, sticky, 48px)                    │
│  ● LLM: 3/3 healthy   ● Agents: 12/12 active   ● Queue: 0   ● Live ●   │
└─────────────────────────────────────────────────────────────────────────┘
│
│  [ALERT BANNER — only when issues exist]
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │  ⚠ 1 circuit breaker open · 2 agents degraded  [View All Issues]   │
│  └─────────────────────────────────────────────────────────────────────┘
│
│  SECTION 1 — SYSTEM HEALTH  (primary viewport)
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│  │  LLM ENDPOINTS       │ │  AGENT FLEET         │ │  EXECUTION      │
│  │  3 healthy / 0 down  │ │  12 active / 0 down  │ │  PRESSURE       │
│  │  [circuit breakers]  │ │  [health grid]       │ │  [queue + conc] │
│  └──────────────────────┘ └──────────────────────┘ └─────────────────┘
│
│  SECTION 2 — LIVE ACTIVITY  (always-updating)
│  ┌───────────────────────────────────────┐ ┌──────────────────────────┐
│  │  LIVE EXECUTION FEED                  │ │  ACTIVE RUNS             │
│  │  [SSE-driven event stream]            │ │  [running workflows]     │
│  └───────────────────────────────────────┘ └──────────────────────────┘
│
│  SECTION 3 — ANALYTICS  (below the fold, supplemental)
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────┐
│  │  EXECUTION TRENDS    │ │  ERROR BREAKDOWN     │ │  TOP REASONERS  │
│  │  7-day area chart    │ │  by category         │ │  by volume      │
│  └──────────────────────┘ └──────────────────────┘ └─────────────────┘
```

**Viewport allocation (1280px height):**

| Section | Height | Visibility |
|---------|--------|------------|
| Health Strip | 48px sticky | Always |
| Alert Banner | 48px conditional | Only when issues |
| Section 1: System Health | ~220px | Above the fold |
| Section 2: Live Activity | ~320px | Above/at fold |
| Section 3: Analytics | remaining | Below the fold |

---

## Component 1 — System Health Strip

The strip is the dashboard's heartbeat indicator. It lives at the top of the global layout (not just the dashboard page) — it is always visible regardless of which page the operator is on.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ● LLM Endpoints: 3/3    ● Agents: 12 active, 0 down    ● Queue: 0 pending │
│                                                            Last updated: 2s  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Degraded state:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠ LLM: 2/3 healthy    ● Agents: 10 active, 2 degraded  ● Queue: 47        │
│  [1 circuit breaker open]                                  Last updated: 1s  │
└─────────────────────────────────────────────────────────────────────────────┘
```
(strip background shifts from neutral to amber when any indicator is degraded)

**Critical state:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✕ LLM: 1/3 healthy    ✕ Agents: 4 active, 8 DOWN       ✕ Queue: 203       │
│  [SYSTEM DEGRADED — 2 circuit breakers open]               Last updated: 0s  │
└─────────────────────────────────────────────────────────────────────────────┘
```
(strip background shifts to red)

### Indicator Definitions

| Indicator | Source | Healthy | Degraded | Critical |
|-----------|--------|---------|----------|----------|
| LLM Endpoints | Circuit breaker state per endpoint | All CLOSED | Any HALF-OPEN | Any OPEN |
| Agents | Unified agent health score | All score ≥ 0.8 | Any 0.4–0.8 | Any < 0.4 or offline |
| Queue | Execution queue depth (sum) | 0–10 | 11–50 | > 50 |

### Behavior

- Updates via SSE subscription — no polling, zero latency
- Each indicator is clickable, jumping to the relevant section or page:
  - LLM → System Health page, LLM section
  - Agents → Nodes page
  - Queue → Executions page, filtered to queued status
- The strip persists across navigation — if operator is on the Executions page and an LLM goes down, the strip turns red immediately
- "Last updated" shows time since last SSE event to confirm the stream is alive

---

## Component 2 — Alert/Issue Banner

The banner sits between the strip and the main dashboard content. It renders only when active issues exist. It is not a notification system — it is a summary of current operational problems.

### Wireframe — Single Issue

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠ Circuit breaker OPEN on endpoint "openai-prod" — 23 failures in 5m      │
│     Affects: 3 agents  |  Open since: 4 min ago   [View Details]  [Dismiss] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe — Multiple Issues

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  3 active issues require attention                           [View All ↓]    │
│  ✕ Circuit breaker OPEN: openai-prod (4 min)                                │
│  ⚠ Agent "pdf-processor" degraded: health 0.41 (12 min)                    │
│  ⚠ Queue depth elevated: 47 pending (5 min)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Issue Types and Severity

| Severity | Icon | Color | Issue Type |
|----------|------|-------|------------|
| Critical | ✕ | Red | Circuit breaker OPEN, agent offline, queue > 100 |
| Warning | ⚠ | Amber | Circuit breaker HALF-OPEN, agent degraded, queue 50–100 |
| Info | ℹ | Blue | Agent recently restarted, queue recovering |

### Behavior

- Issues auto-dismiss from the banner when resolved (SSE-driven)
- "Dismiss" hides an issue for the current session but it reappears if severity increases
- "View Details" navigates directly to the System Health page anchored to the specific issue
- Banner appears/disappears with a smooth transition (200ms) — not a jarring flash
- Maximum 3 issues shown inline; additional issues shown as "+N more" with expand control
- Banner is absent (zero height, no DOM element) when system is clean

---

## Component 3 — System Health Cards (Section 1)

Three cards occupying the first content row. Each answers one layer of the stack.

### Card 1 — LLM Endpoints

```
┌──────────────────────────────────────┐
│  LLM Endpoints                        │
│                                       │
│  ● openai-prod      HEALTHY    23ms  │
│  ● anthropic-prod   HEALTHY    41ms  │
│  ● openai-fallback  HEALTHY   108ms  │
│                                       │
│  3 endpoints · 0 circuit breakers    │
└──────────────────────────────────────┘
```

**Degraded variant:**
```
┌──────────────────────────────────────┐
│  LLM Endpoints          ⚠ 1 issue    │
│                                       │
│  ✕ openai-prod    OPEN CB   ───       │
│    23 failures · since 4m ago        │
│    [View] [Reset CB]                  │
│  ● anthropic-prod  HEALTHY   41ms   │
│  ● openai-fallback HEALTHY  108ms   │
│                                       │
│  2/3 healthy · 1 circuit breaker open│
└──────────────────────────────────────┘
```

Data shown per endpoint:
- Name
- Circuit breaker state (CLOSED / HALF-OPEN / OPEN)
- Response latency (when healthy) or failure count (when degraded)
- Time since state change
- Inline action: "Reset CB" (re-closes a manually-held-open breaker)

### Card 2 — Agent Fleet

```
┌──────────────────────────────────────┐
│  Agent Fleet                          │
│                                       │
│  [●][●][●][●][●][●][●][●][●][●][●][●] │
│   12 agents · all active              │
│                                       │
│  ┌─────────────┬────────────────────┐ │
│  │ Active      │ 12                 │ │
│  │ Degraded    │  0                 │ │
│  │ Offline     │  0                 │ │
│  └─────────────┴────────────────────┘ │
│                                       │
│  Avg health: 0.94    [View All Nodes] │
└──────────────────────────────────────┘
```

The grid of dots is the agent health grid — each dot represents one agent, colored by health score:
- Green (≥ 0.8)
- Amber (0.4–0.79)
- Red (< 0.4)
- Gray (offline / no heartbeat)

Hovering a dot shows the agent name and health score as a tooltip.

**Degraded variant (2 down):**
```
┌──────────────────────────────────────┐
│  Agent Fleet            ⚠ 2 issues   │
│                                       │
│  [●][●][●][●][●][●][●][●][●][●][✕][✕] │
│                                       │
│  Active: 10  Degraded: 0  Offline: 2 │
│                                       │
│  pdf-processor  ✕ OFFLINE  since 8m  │
│  email-agent    ✕ OFFLINE  since 3m  │
│  [Reconcile All]                      │
└──────────────────────────────────────┘
```

### Card 3 — Execution Pressure

```
┌──────────────────────────────────────┐
│  Execution Pressure                   │
│                                       │
│  Running    ████████░░   8/20        │
│  Queued           0                  │
│  Stuck            0                  │
│                                       │
│  Throughput: 142/min (last 5m)       │
│  Avg wait: <1s                        │
│                                       │
│  [View Execution Queue]               │
└──────────────────────────────────────┘
```

The bar shows current concurrent executions as a fraction of the total concurrency limit (per-agent limits summed). It turns amber at 80% utilization and red at 95%.

**High-pressure variant:**
```
┌──────────────────────────────────────┐
│  Execution Pressure     ⚠ Saturated  │
│                                       │
│  Running    ████████████  20/20 FULL │
│  Queued          47  (+12/min)       │
│  Stuck            3  [Review]        │
│                                       │
│  Throughput:  89/min (↓ from 142)    │
│  Avg wait: 34s (↑)                    │
│                                       │
│  [Bulk Cancel Queued] [View Queue]    │
└──────────────────────────────────────┘
```

"Stuck" = executions in running state beyond 3× their average duration. These surface inline with a direct "Review" link to the filtered executions page.

---

## Component 4 — Live Activity Feed (Section 2)

This replaces the static "Activity Summary" and the "Agent Health Summary" from the current dashboard. It is a real-time event stream showing what the system is actually doing.

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Live Activity                               ● LIVE  [Pause] │
│  ─────────────────────────────────────────────────────────── │
│                                                               │
│  00:03s  ✓ pdf-processor  extract_text     12ms    #a3f2     │
│  00:07s  ✓ email-agent    classify_intent  89ms    #b901     │
│  00:09s  ✗ openai-client  embed_text       FAILED  #c442     │
│           └─ Error: rate_limit  [Retry]  [View]              │
│  00:14s  ✓ pdf-processor  extract_text     14ms    #a3f3     │
│  00:18s  ⟳ email-agent    send_reply      running  #b902     │
│  00:21s  ✓ analyst        generate_report 234ms    #d001     │
│  00:26s  ✓ pdf-processor  extract_text      9ms    #a3f4     │
│  ─────────────────────────────────────────────────────────── │
│                    [Load older events]                        │
└─────────────────────────────────────────────────────────────┘
```

### Event Row Anatomy

```
[time-ago]  [status-icon]  [agent-name]  [reasoner-name]  [duration/status]  [exec-id]
```

Status icons:
- `✓` green — completed successfully
- `✗` red — failed
- `⟳` amber spinning — currently running
- `⊘` gray — cancelled

Clicking any row opens the execution detail flyover (not a full page navigation).

Failed rows expand inline to show error category, message snippet, and inline actions (Retry, View Full Detail).

### Feed Behavior

- Driven by SSE — events arrive in real-time with zero polling
- New events prepend at the top with a subtle slide-in animation (150ms)
- Feed buffer: 50 events shown, older events pushed off bottom
- "Pause" button freezes the feed so the operator can read a specific event without it scrolling away; a counter shows "N new events" while paused
- Click on agent name filters the feed to that agent only (inline filter, no page navigation)
- Filter chips: by status (failed only), by agent, by reasoner
- "Load older events" fetches historical executions from the REST API to extend the feed backward

### Active Runs Panel (right column)

```
┌──────────────────────────────────────┐
│  Active Runs                     3   │
│  ──────────────────────────────────── │
│                                       │
│  ⟳ research-workflow    2m 14s        │
│    analyst · summarize_findings       │
│    [3/5 steps complete]               │
│                                       │
│  ⟳ ingest-pipeline       43s         │
│    pdf-processor · chunk_doc          │
│    [1/3 steps complete]               │
│                                       │
│  ⟳ email-workflow        12s         │
│    email-agent · draft_reply          │
│    [2/4 steps complete]               │
│                                       │
│                   [View All Workflows] │
└──────────────────────────────────────┘
```

Shows currently running multi-step workflows with:
- Workflow name and total elapsed time
- Current step (agent + reasoner)
- Progress indication (N/M steps)
- Clicking opens the Workflow Detail page (DAG view)

---

## Component 5 — Analytics Section (Section 3, Below Fold)

These components are retained but demoted. They exist for operators who want to understand trends, not as the primary view.

### Execution Trends Chart — Retained

Keep the 7-day area+line chart (Recharts). Minor changes:
- Default time range: 24 hours (not 7 days) — more operationally relevant
- Toggle: 24h / 7d / 30d
- Add a secondary line for failure rate on the right axis
- Remove the full-width treatment — it now shares a row with two other cards

### Error Breakdown — Replaces Activity Heatmap

The heatmap (hourly patterns) is analytically interesting but operationally useless. Replace with an error breakdown by category:

```
┌──────────────────────────────────────┐
│  Error Breakdown (last 24h)           │
│                                       │
│  rate_limit     ████████████  41%    │
│  timeout        ████████       27%   │
│  parse_error    ████           14%   │
│  auth_failed    ██              8%   │
│  other          ██              7%   │
│                      3%  context_len │
│                                       │
│  Total: 89 failures                   │
└──────────────────────────────────────┘
```

This directly answers "what kind of errors am I getting?" and guides action (41% rate_limit → throttle down or add fallback endpoint).

### Top Reasoners — Retained (Simplified)

Keep the hotspot panel but flatten it. Remove the "top failing reasoners" framing — replace with "reasoners by volume" with a secondary indicator for error rate.

```
┌──────────────────────────────────────┐
│  Reasoner Activity (last 24h)         │
│                                       │
│  extract_text     2,401  1.2% err    │
│  classify_intent  1,890  0.8% err    │
│  embed_text         943  4.1% err ⚠  │
│  generate_report    412  0.0% err    │
│  send_reply         201  2.1% err    │
│                                       │
│                      [View All →]     │
└──────────────────────────────────────┘
```

---

## What to Keep

| Current Component | Disposition | Rationale |
|------------------|-------------|-----------|
| 7-day execution trends chart | Keep, demote to Section 3, default to 24h | Useful for trend awareness but not operational |
| Hotspot panel (top failing reasoners) | Keep as "Reasoner Activity", simplify | Useful, just needs error rate alongside volume |
| Active workflow runs | Keep, promote to Section 2 as "Active Runs" panel | Critical for live operations |
| Success rate KPI card | Keep as sparkline in Section 3, not primary | Good supplemental metric |

---

## What to Remove or Demote

| Current Component | Disposition | Rationale |
|------------------|-------------|-----------|
| 4 KPI cards (total executions, avg duration, etc.) | Remove from primary view; move to Section 3 or dedicated Analytics page | Numbers without context create false confidence |
| Activity heatmap (hourly patterns) | Remove | Interesting but not operational; zero action triggers from heatmap |
| Incidents list | Demote — merge into Alert Banner | Static list of incidents replaced by live banner + SSE feed |
| Agent health summary | Remove as standalone component | Replaced by Agent Fleet card (Card 2) + health strip |
| Execution trends as primary content | Demote to Section 3 | Historical trend is secondary to current state |

---

## Mobile / Responsive Layout

### Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| ≥ 1280px | Full 3-column Section 1, 2-column Section 2 |
| 1024–1279px | 2-column Section 1 (pressure card wraps), 1-column Section 2 |
| 768–1023px | 1-column stacked, all sections full width |
| < 768px | Mobile layout (see below) |

### Mobile Layout (< 768px)

On mobile, the dashboard prioritizes the health strip and alert banner above everything:

```
┌────────────────────────────────┐
│  ● LLM: 3/3  ● Agents: 12     │  ← health strip (sticky, 40px)
│  ● Queue: 0          ● Live   │
├────────────────────────────────┤
│  [ALERT BANNER if issues]      │  ← dismissible
├────────────────────────────────┤
│  SYSTEM STATUS                 │  ← single card, summarizes all 3
│  ● LLM Endpoints: 3/3         │
│  ● Agents: 12 active          │
│  ● Queue: 0  Concurrency: 40% │
│                                │
│  [View Details]                │
├────────────────────────────────┤
│  LIVE ACTIVITY                 │  ← feed, compact rows
│  ✓ pdf-processor 12ms  3s ago │
│  ✗ openai-client FAILED 7s ago│
│  ✓ email-agent   89ms  9s ago │
│  [Load more]                   │
├────────────────────────────────┤
│  ACTIVE RUNS          3        │
│  ⟳ research-workflow  2m14s   │
│  ⟳ ingest-pipeline    43s     │
│  [View All]                    │
└────────────────────────────────┘
```

Analytics (Section 3) is hidden by default on mobile, accessible via a "Show Analytics" toggle at the bottom.

### Touch Targets

All interactive elements (indicators, row clicks, action buttons) minimum 44px touch target height.

---

## Polling / SSE Strategy for Real-Time Updates

### Data Sources and Update Mechanisms

| Data | Mechanism | Frequency | Fallback |
|------|-----------|-----------|---------|
| Health strip indicators | SSE event stream | Real-time push | Poll every 5s |
| Alert banner issues | SSE event stream | Real-time push | Poll every 5s |
| LLM circuit breaker state | SSE + initial REST fetch | Real-time push | Poll every 10s |
| Agent fleet health scores | SSE + initial REST fetch | Real-time push | Poll every 10s |
| Execution queue depth | SSE + initial REST fetch | Real-time push | Poll every 5s |
| Live activity feed | SSE event stream | Real-time push | No polling fallback (show "stream disconnected") |
| Active runs | SSE + initial REST fetch | Real-time push | Poll every 15s |
| Analytics charts (Section 3) | REST only | Initial load + manual refresh | No auto-refresh |

### SSE Connection Management

```
On dashboard mount:
  1. Fetch initial state via REST (parallel requests, one per card)
  2. Open SSE connection to /api/v1/events/stream
  3. Subscribe to event types:
       - agent.health_changed
       - llm.circuit_breaker_state_changed
       - execution.status_changed
       - execution.queued / execution.dequeued
       - workflow.step_completed
  4. Apply events as diffs to local state (never re-fetch on SSE event)

On SSE disconnect:
  1. Show "stream disconnected" indicator in health strip (replace "Live ●" with "⚠ Reconnecting")
  2. Fall back to polling at intervals defined above
  3. On reconnect: re-fetch full state via REST to catch any events missed during disconnect
  4. Resume SSE-driven updates

On tab hidden (document.visibilityState === 'hidden'):
  1. Pause live feed animation (still buffer events)
  2. Reduce polling frequency by 4× to save resources
  3. On tab visible: flush buffered events, resume normal frequency
```

### Staleness Indicators

The health strip shows "Last updated: Ns" where N is seconds since last SSE event. If N > 10 and SSE is supposedly connected, display a warning to flag a potentially stale connection.

```
Healthy:   Last updated: 2s   (normal text)
Stale:     Last updated: 14s ⚠  (amber text)
Offline:   Stream disconnected — polling every 5s  (amber background)
```

### Section 3 Analytics — No Auto-Refresh

Analytics charts are explicitly not live. They show a snapshot at page load. A manual "Refresh" button and a timestamp ("Data as of 2m ago") make the staleness explicit. This is correct — trend charts that auto-refresh every 5 seconds are distracting and meaningless.

---

## State Machine — Dashboard Loading

```
LOADING
  → Initial REST fetches in parallel (health + queue + agents + LLM state)
  → Skeleton UI shown (not spinners — layout placeholders)

LOADED
  → All cards rendered with real data
  → SSE connection established
  → Live feed begins populating

SSE_CONNECTED (steady state)
  → All updates via push
  → "Last updated: Ns" counting up from each event

SSE_DEGRADED
  → Fell back to polling
  → Strip shows "⚠ Reconnecting" or "Polling every 5s"

ERROR
  → If initial REST fetch fails entirely
  → Show error state with retry button
  → Do not show skeleton or stale data silently
```

---

## Implementation Notes

### Component Dependencies

- **System Health Strip** — new component, lives in global layout shell (not dashboard page)
- **Alert Banner** — new component, dashboard-page-scoped
- **LLM Endpoints Card** — new component, uses circuit breaker state endpoint
- **Agent Fleet Card** — refactors existing agent health summary
- **Execution Pressure Card** — new component, uses queue depth + concurrency endpoints
- **Live Activity Feed** — new component, replaces static activity summary; SSE-driven
- **Active Runs Panel** — refactors existing active workflow runs component
- **Analytics charts** — existing Recharts components, moved and restyled

### Data Endpoints Required

All exist on the backend per the brief:

| Endpoint | Used By |
|----------|---------|
| `GET /api/v1/health/llm` | LLM Endpoints card |
| `GET /api/v1/nodes` with health scores | Agent Fleet card |
| `GET /api/v1/executions/queue` | Execution Pressure card |
| `GET /api/v1/executions?status=running` | Execution Pressure card, Active Runs |
| `GET /api/v1/events/stream` (SSE) | All real-time updates + Live Feed |
| `GET /api/v1/executions?limit=50` | Live Feed initial load |
| `GET /api/v1/workflows?status=running` | Active Runs panel |
| `GET /api/v1/executions/stats` | Analytics Section 3 |

### Animation Budget

To avoid a dashboard that feels chaotic with constant motion:

- Health strip color transitions: 300ms ease
- Alert banner appear/dismiss: 200ms slide
- Live feed new row: 150ms slide-in from top
- Card state changes (healthy → degraded): 200ms background color transition
- NO continuous animations on healthy state (no pulsing dots, no spinning indicators)
- Spinning `⟳` icon only on actively-running executions (not on the health strip)

---

## Open Questions

1. **Circuit breaker reset action** — Should operators be able to reset a circuit breaker from the dashboard card, or is that too consequential an action for a glanceable surface? Proposal: allow it but with a confirmation popover.

2. **Alert banner persistence** — Should dismissed alerts persist across page refreshes (stored in localStorage)? Proposal: yes, with a 1-hour TTL per alert ID.

3. **Live feed retention** — 50 events in buffer is a guess. Needs validation against real traffic — high-throughput systems may need a lower cap (20) to keep the feed readable; low-throughput systems may want 100.

4. **Section 3 visibility** — Should analytics be completely hidden (collapsed) by default for operators who use dashboards purely for triage? Proposal: user-preference toggle, defaulting to visible.

5. **Health strip in non-dashboard pages** — The strip should appear globally (on Nodes, Executions, Workflows pages too). This is a layout-level change that needs coordination with other page designs.
