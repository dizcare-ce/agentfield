# System Health Dashboard — Design Spec

**Document:** `01-system-health-dashboard.md`
**Status:** Draft
**Serves:** Journey 1 (Monitor & Observe) + Journey 2 (Diagnose & Fix)
**Route:** `/ui/health`

---

## Purpose

The System Health Dashboard is the operator's single-pane-of-glass view of the entire AgentField stack. It answers the three core questions in order:

1. **Is my system healthy right now?** — top section, < 2 seconds
2. **Where exactly is the problem?** — mid section, < 5 seconds
3. **What do I do about it?** — inline actions, < 30 seconds to act

This page surfaces six backend health systems that have no current UI representation: the LLM circuit breaker, the agent concurrency limiter, the health monitor, the presence manager, the status manager, and the execution cleanup service.

---

## Page Layout Overview

The page is structured in three horizontal bands: a system status bar (always visible, top), a diagnostic grid (primary content, middle), and a live event feed (secondary, right rail on desktop or below on mobile).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SYSTEM STATUS BAR                                              [Last sync: 3s ago] │
│  ● HEALTHY  │  LLM: 3/3 up  │  Agents: 12/14 active  │  Queue: 4 pending   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────┐  ┌──────────────────────────────┐
│  LAYER STATUS CARDS (2x3 grid)           │  │  LIVE EVENT FEED             │
│                                          │  │                              │
│  ┌──────────────┐  ┌──────────────┐      │  │  ● 14:32  Circuit closed:    │
│  │ LLM Health   │  │ Agent Fleet  │      │  │    gpt-4o-mini               │
│  │ ● 3 closed   │  │ ● 12 active  │      │  │  ● 14:31  Agent offline:     │
│  │ ○ 0 open     │  │ ◑  1 degraded│      │  │    worker-7                  │
│  │              │  │ ✗  1 offline │      │  │  ● 14:29  Execution timeout: │
│  └──────────────┘  └──────────────┘      │  │    exec-a4f2                 │
│                                          │  │  ● 14:28  Backpressure:      │
│  ┌──────────────┐  ┌──────────────┐      │  │    summarizer (8/8 slots)    │
│  │ Queue Status │  │ Exec Health  │      │  │  ...                         │
│  │ 4 pending    │  │ 2 running    │      │  │                              │
│  │ 0 backpres.  │  │ 0 timed out  │      │  │  [View all events →]         │
│  └──────────────┘  └──────────────┘      │  └──────────────────────────────┘
│                                          │
│  ┌──────────────┐  ┌──────────────┐      │
│  │ Presence &   │  │ Cleanup      │      │
│  │ Leases       │  │ Service      │      │
│  │ 14 active    │  │ 0 stuck      │      │
│  │ 0 expiring   │  │ Last run: 2m │      │
│  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  DETAIL PANELS  (expand on card click)                                      │
│  [LLM Endpoints Table]  /  [Agent Health Table]  /  [Queue Per-Agent]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 1: System Status Bar

**Position:** Fixed to top of content area (below global nav). Always visible while on this page.

**Purpose:** 5-second answer to "is everything OK?" — a horizontal strip of summarized health signals.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ● HEALTHY   LLM 3/3   Agents 12/14   Queue 4   Executions 2 running   3s ago   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

The leftmost pill is the aggregate status — the worst state of any subsystem. States are: `HEALTHY` (all green), `DEGRADED` (any yellow), `CRITICAL` (any red), `UNKNOWN` (no data).

### Data Sources

| Display Field | API Endpoint | Field |
|---|---|---|
| LLM count | `GET /api/ui/v1/llm/health` | count of endpoints where `state == "closed"` / total |
| Agent count | `GET /api/ui/v1/nodes` | count where `status == "active"` / total |
| Queue depth | `GET /api/ui/v1/queue/status` | sum of `in_flight` across all agents |
| Execution count | `GET /api/ui/v1/executions?status=running` | total count |
| Last sync | client-side timestamp of last successful poll | — |

### Aggregate Status Logic

```
CRITICAL  if: any LLM circuit is OPEN
              OR any agent is offline with executions in its queue
              OR any execution has been running > 30min (stuck)
              OR queue backpressure active on any agent

DEGRADED  if: any LLM circuit is HALF-OPEN
              OR any agent is in degraded/unhealthy state
              OR queue depth > 80% of concurrency limit on any agent
              OR last successful sync > 30s ago

HEALTHY   otherwise
```

### Color Palette

| State | Background | Text | Dot color |
|---|---|---|---|
| HEALTHY | `#052e16` (dark green) | `#bbf7d0` | `#4ade80` |
| DEGRADED | `#422006` (dark amber) | `#fde68a` | `#fbbf24` |
| CRITICAL | `#450a0a` (dark red) | `#fecaca` | `#f87171` |
| UNKNOWN | `#1c1917` (dark stone) | `#d6d3d1` | `#a8a29e` |

This follows AgentField's existing dark-primary palette.

---

## Section 2: Layer Status Cards

**Position:** Main content area, 2-column grid (3 rows = 6 cards).
**Purpose:** One card per health subsystem. Each card is a drilldown trigger.

### Card Anatomy

```
┌────────────────────────────────────┐
│  [icon]  Card Title      [status pill] │
│  ────────────────────────────────  │
│  Primary metric (large)            │
│  Secondary metric                  │
│  ────────────────────────────────  │
│  [Action button if degraded]       │
└────────────────────────────────────┘
```

Card border color = derived status (green/amber/red/gray). A healthy card has a subtle gray border. A degraded card has an amber left border (4px). A critical card has a red left border (4px) and a faint red background tint.

---

### Card 1: LLM Health

**Icon:** `zap` (lightning bolt)
**Data source:** `GET /api/ui/v1/llm/health`

**Expected response shape (inferred from backend docs):**
```json
{
  "endpoints": [
    {
      "id": "gpt-4o",
      "url": "https://api.openai.com/v1/chat/completions",
      "state": "closed",          // closed | open | half_open
      "consecutive_failures": 0,
      "last_failure_at": null,
      "recovery_at": null,
      "total_requests": 1240,
      "total_failures": 2
    }
  ]
}
```

**Card display:**
```
┌────────────────────────────────────┐
│  ⚡ LLM Health              ● HEALTHY │
│  ──────────────────────────────── │
│  3 endpoints                       │
│  3 closed  ·  0 half-open  ·  0 open │
│  ──────────────────────────────── │
│  (no action — all healthy)         │
└────────────────────────────────────┘
```

**Degraded state (1 half-open):**
```
┌────────────────────────────────────┐
│  ⚡ LLM Health            ◑ DEGRADED │
│  ──────────────────────────────── │
│  3 endpoints                       │
│  2 closed  ·  1 half-open  ·  0 open │
│  gpt-4o-mini recovering (18s left)  │
│  ──────────────────────────────── │
│  [View endpoint details →]         │
└────────────────────────────────────┘
```

**Critical state (1+ open):**
- Action button: `[View failures →]` — scrolls to detail panel showing the open circuit's endpoint URL, consecutive failure count, and time since failure.

**Status derivation:**
- `HEALTHY` — all endpoints `closed`
- `DEGRADED` — any endpoint `half_open`
- `CRITICAL` — any endpoint `open`

---

### Card 2: Agent Fleet

**Icon:** `cpu` (processor chip)
**Data sources:**
- `GET /api/ui/v1/nodes` — agent list with status
- `GET /api/ui/v1/nodes/{id}/health` — per-agent health score

**Card display:**
```
┌────────────────────────────────────┐
│  ◻ Agent Fleet             ● HEALTHY │
│  ──────────────────────────────── │
│  14 registered                     │
│  12 active  ·  1 degraded  ·  1 offline │
│  Avg health score: 94/100          │
│  ──────────────────────────────── │
│  [View degraded agents →]          │
└────────────────────────────────────┘
```

**Status derivation:**
- `HEALTHY` — all agents `active` (or no agents registered yet)
- `DEGRADED` — any agent `degraded` or health score < 70
- `CRITICAL` — any agent `offline` / `inactive` after 3 consecutive failures

**Action when degraded/critical:** `[Reconcile agents]` — triggers `POST /api/ui/v1/nodes/reconcile` (if endpoint exists) or navigates to the Nodes page filtered to unhealthy agents.

---

### Card 3: Queue Status

**Icon:** `layers` (stacked layers)
**Data source:** `GET /api/ui/v1/queue/status`

**Expected response shape:**
```json
{
  "agents": [
    {
      "agent_id": "summarizer",
      "in_flight": 8,
      "max_concurrent": 8,
      "queued_waiters": 3,
      "backpressure_active": true,
      "backpressure_events_total": 12
    }
  ],
  "totals": {
    "in_flight": 14,
    "queued_waiters": 3,
    "backpressure_active_count": 1
  }
}
```

**Card display (healthy):**
```
┌────────────────────────────────────┐
│  ≡ Queue Status             ● HEALTHY │
│  ──────────────────────────────── │
│  14 in-flight  ·  0 waiting        │
│  0 agents at capacity              │
│  ──────────────────────────────── │
│  (no action)                       │
└────────────────────────────────────┘
```

**Card display (backpressure active):**
```
┌────────────────────────────────────┐
│  ≡ Queue Status           ⚠ DEGRADED │
│  ──────────────────────────────── │
│  14 in-flight  ·  3 waiting        │
│  1 agent at capacity               │
│  summarizer: 8/8 slots used        │
│  ──────────────────────────────── │
│  [View per-agent queue →]          │
└────────────────────────────────────┘
```

**Status derivation:**
- `HEALTHY` — no backpressure active, all agents below 80% of max
- `DEGRADED` — any agent > 80% of max concurrent OR any waiters queued
- `CRITICAL` — any agent at 100% capacity with waiters queued for > 30s

---

### Card 4: Execution Health

**Icon:** `play-circle`
**Data sources:**
- `GET /api/ui/v1/executions?status=running` — count
- `GET /api/ui/v1/executions?status=timeout` — stuck count (running > 30min)
- Prometheus metric: `execution_timeout_total` via `GET /api/ui/v1/metrics/summary`

**Card display:**
```
┌────────────────────────────────────┐
│  ▶ Execution Health         ● HEALTHY │
│  ──────────────────────────────── │
│  2 running  ·  47 completed today  │
│  0 timed out  ·  0 stuck           │
│  ──────────────────────────────── │
│  (no action)                       │
└────────────────────────────────────┘
```

**With stuck executions:**
```
┌────────────────────────────────────┐
│  ▶ Execution Health         ✗ CRITICAL │
│  ──────────────────────────────── │
│  2 running  ·  47 completed today  │
│  3 timed out (> 30min)             │
│  ──────────────────────────────── │
│  [Cancel stuck executions]         │
└────────────────────────────────────┘
```

**Action when critical:** `[Cancel stuck executions]` — opens a confirmation modal listing the stuck execution IDs and their ages, then calls `POST /api/ui/v1/executions/bulk-cancel` with the timeout list.

**Status derivation:**
- `HEALTHY` — 0 stuck/timed-out executions
- `DEGRADED` — 1-2 stuck executions
- `CRITICAL` — 3+ stuck executions OR any execution running > 2 hours

---

### Card 5: Presence & Leases

**Icon:** `radio` (signal/heartbeat)
**Data source:** `GET /api/ui/v1/nodes` (presence info embedded in node objects, or a dedicated presence endpoint if available)

**Purpose:** Surface the Presence Manager's 15s TTL lease map — shows which agents have recently heartbeated and whether any leases are about to expire.

**Card display:**
```
┌────────────────────────────────────┐
│  ◎ Presence & Leases        ● HEALTHY │
│  ──────────────────────────────── │
│  14 active leases                  │
│  Last sweep: 3s ago (every 5s)     │
│  0 leases expiring in < 15s        │
│  ──────────────────────────────── │
│  (no action)                       │
└────────────────────────────────────┘
```

**With expiring leases:**
```
┌────────────────────────────────────┐
│  ◎ Presence & Leases       ◑ DEGRADED │
│  ──────────────────────────────── │
│  13 active leases                  │
│  2 leases expiring in < 15s        │
│  worker-7, analyzer-2              │
│  ──────────────────────────────── │
│  [View agents →]                   │
└────────────────────────────────────┘
```

**Status derivation:**
- `HEALTHY` — all leases active, last sweep < 10s ago
- `DEGRADED` — any lease expiring within next 15s (about to disconnect)
- `CRITICAL` — sweep last ran > 30s ago (sweep process may have stalled) OR > 20% of known agents have no active lease

**Note:** If the backend does not expose presence data as a discrete endpoint, this card is populated from node `last_heartbeat` timestamps on the nodes list response, computing "seconds since last heartbeat" on the client.

---

### Card 6: Cleanup Service

**Icon:** `trash-2` (trash can)
**Data source:** Dedicated `GET /api/ui/v1/cleanup/status` if available, otherwise `GET /api/ui/v1/executions?status=running&min_age=30m` for stuck count

**Purpose:** Surface the Execution Cleanup Service — tracks whether stuck executions are being automatically resolved.

**Card display:**
```
┌────────────────────────────────────┐
│  🗑 Cleanup Service          ● HEALTHY │
│  ──────────────────────────────── │
│  Last run: 2 min ago               │
│  0 executions timed out today      │
│  Auto-cleanup: active              │
│  ──────────────────────────────── │
│  (no action)                       │
└────────────────────────────────────┘
```

**Status derivation:**
- `HEALTHY` — auto-cleanup running, last run < 5 min ago, < 5 timeouts today
- `DEGRADED` — last run > 10 min ago OR 5-20 timeouts today
- `CRITICAL` — last run > 30 min ago (service may have stalled) OR > 20 timeouts today (systematic problem)
- `UNKNOWN` — no cleanup status endpoint available (card shows "Monitoring unavailable" with gray border)

---

## Section 3: Detail Panels

**Position:** Below the card grid. Hidden by default. Expand when a card is clicked.

**Behavior:** Clicking a card opens its detail panel in an accordion below the grid. Only one panel is open at a time. A second click collapses it. The URL updates to `/ui/health#llm` / `#agents` / `#queue` etc. to support deep-linking.

---

### Detail Panel: LLM Endpoints

**Trigger:** Click on LLM Health card

```
LLM Endpoints                                                    [Collapse ▲]
────────────────────────────────────────────────────────────────────────────
Endpoint             State        Failures   Recovery ETA    Actions
────────────────────────────────────────────────────────────────────────────
gpt-4o               ● closed     0/3        —               —
gpt-4o-mini          ◑ half-open  3/3        18s             [Force close]
claude-3-haiku       ● closed     0/3        —               —
────────────────────────────────────────────────────────────────────────────
```

**Columns:**
- **Endpoint** — display name or URL hostname
- **State** — colored pill: `closed` (green), `half-open` (amber), `open` (red)
- **Failures** — `consecutive_failures / 3` (threshold to open)
- **Recovery ETA** — countdown to when circuit will attempt half-open (only shown if open/half-open). Computed as `recovery_at - now`.
- **Actions** — `[Force close]` resets the circuit breaker (if API supports it). `[Test endpoint]` fires a health probe.

**State pill details for `open` circuits:** Show a tooltip/expandable row with:
- Last failure timestamp
- Last failure reason (if available)
- Total failures this session

---

### Detail Panel: Agent Fleet

**Trigger:** Click on Agent Fleet card

```
Agent Fleet                                           [Show: All ▼]   [Collapse ▲]
──────────────────────────────────────────────────────────────────────────────────
Agent                Status       Health Score   Last Heartbeat   Failures   Actions
──────────────────────────────────────────────────────────────────────────────────
summarizer           ● active     98/100         3s ago           0          —
worker-7             ✗ offline    0/100          4m 12s ago       3          [Reconcile]
analyzer-2           ◑ degraded   62/100         28s ago          1          [Reconcile]
...
──────────────────────────────────────────────────────────────────────────────────
```

**Status filter dropdown:** All / Active / Degraded / Offline

**Columns:**
- **Agent** — display name, click navigates to the agent's detail page
- **Status** — `active` / `degraded` / `offline` / `starting`
- **Health Score** — 0-100 from the health monitor. Color-coded: ≥80 green, 50-79 amber, <50 red.
- **Last Heartbeat** — relative time. Turns amber at > 20s (approaching 30s threshold), red at > 30s.
- **Failures** — consecutive HTTP poll failures. Turns red at 3 (threshold for marking inactive).
- **Actions** — `[Reconcile]` for degraded/offline agents. `[View →]` for all.

**Row click:** Navigates to the agent's `/ui/nodes/{id}` detail page.

---

### Detail Panel: Queue Per-Agent

**Trigger:** Click on Queue Status card

```
Queue Status                                                      [Collapse ▲]
────────────────────────────────────────────────────────────────────────────
Agent              In-Flight   Limit   Utilization   Waiters   Backpressure
────────────────────────────────────────────────────────────────────────────
summarizer         8           8       ████████ 100%  3         ⚠ active
worker-7           0           4       ░░░░░░░░  0%   0         —
analyzer-2         2           8       ██░░░░░░  25%  0         —
────────────────────────────────────────────────────────────────────────────
Total              10          20      ████░░░░  50%  3
────────────────────────────────────────────────────────────────────────────
```

**Utilization bar:** 8-character block progress bar. Color: green below 75%, amber 75-99%, red at 100%.

**Backpressure column:** Empty when inactive. Shows `⚠ active` (amber) when backpressure is happening. Clicking expands to show `backpressure_events_total` (lifetime count).

**Actions (per row when at capacity):** `[Cancel queued]` — cancels the waiting executions for that agent. `[Adjust limit →]` — navigates to agent settings (if concurrency limit is configurable from UI).

---

### Detail Panel: Stuck Executions

**Trigger:** Click on Execution Health card when stuck count > 0

```
Stuck Executions (running > 30 min)                  [Cancel all]   [Collapse ▲]
────────────────────────────────────────────────────────────────────────────────
Execution ID     Agent         Started        Running For   Status     Actions
────────────────────────────────────────────────────────────────────────────────
exec-a4f2        summarizer    13:58          36 min        ⚠ stuck    [Cancel]
exec-b9c1        analyzer-2    12:45          1h 49m        ✗ critical [Cancel]
────────────────────────────────────────────────────────────────────────────────
```

**"Running For" color:** Amber at 30-60 min, red at > 60 min.

**"Cancel all" button:** Opens a confirmation modal. On confirm, calls `POST /api/ui/v1/executions/bulk-cancel` with the full list of stuck IDs.

**Row click:** Opens the execution detail page in a side panel (or navigates to `/ui/executions/{id}`).

---

## Section 4: Live Event Feed

**Position:** Right rail on desktop (320px wide), below card grid on tablet/mobile.

**Purpose:** A real-time log of meaningful health state changes — not every event, only the ones that change the system health picture.

```
Live Events                                    [Pause]  [Clear]
──────────────────────────────────────────────────────────────
14:32  ● Circuit closed     gpt-4o-mini recovered
14:31  ✗ Agent offline      worker-7 — 3 failures
14:29  ⚠ Execution timeout  exec-a4f2 — 36 min
14:28  ⚠ Backpressure       summarizer — 8/8 slots full
14:25  ◑ Circuit half-open  gpt-4o-mini — testing recovery
14:20  ● Agent recovered    analyzer-2 — health 62 → 89
──────────────────────────────────────────────────────────────
[Load more...]
```

**Event types and icons:**

| Event | Icon | Color |
|---|---|---|
| Circuit opened | `✗` | red |
| Circuit half-open | `◑` | amber |
| Circuit closed (recovered) | `●` | green |
| Agent offline | `✗` | red |
| Agent degraded | `◑` | amber |
| Agent active (recovered) | `●` | green |
| Backpressure started | `⚠` | amber |
| Backpressure ended | `●` | green |
| Execution timeout | `⚠` | amber |
| Execution stuck (> 60 min) | `✗` | red |
| Lease expired | `○` | amber |

**Pause button:** Stops scrolling new events into view (user is reading old ones). New events accumulate and an "N new events" banner appears at the top.

**Row click:** Opens the relevant detail panel (circuit event opens LLM detail, agent event opens agent detail, etc.).

---

## Real-Time Behavior

### SSE vs Polling Strategy

AgentField's backend has SSE infrastructure (used for execution log streaming). The health dashboard uses a hybrid approach:

| Data | Update mechanism | Interval | Rationale |
|---|---|---|---|
| System status bar (aggregate) | Polling | 5s | Aggregate can be derived client-side from subsystem data |
| LLM circuit states | Polling | 10s | Circuit state changes are infrequent; polling sufficient |
| Agent fleet status | SSE (if available) / polling | 10s | Agent status changes are meaningful; prefer SSE |
| Queue depths | Polling | 5s | Queue moves fast; 5s gives good responsiveness |
| Execution health | Polling | 15s | Stuck execution check aligns with backend 30min threshold |
| Live event feed | SSE | real-time | Feed is only valuable if events are near-instant |
| Presence leases | Polling | 5s | Matches the backend's 5s sweep interval |

**SSE endpoint for events:**
`GET /api/ui/v1/health/events/stream`

Expected event format:
```
event: health_change
data: {
  "type": "circuit_opened",
  "timestamp": "2026-04-04T14:31:00Z",
  "subject_id": "gpt-4o-mini",
  "subject_type": "llm_endpoint",
  "message": "3 consecutive failures",
  "severity": "critical"
}
```

If SSE is not available for health events, the event feed falls back to polling `GET /api/ui/v1/health/events?since={ts}&limit=50` every 5 seconds.

### Stale Data Handling

If any poll fails or the SSE connection drops:
- The "Last sync" indicator in the status bar turns amber after 15s of no update
- It turns red after 30s
- A banner appears: "Health data may be stale — reconnecting..."
- Individual card timestamps show "Updated Xs ago" in amber/red when data is old

### Optimistic Updates

When an operator takes an action (cancel execution, reconcile agent):
- The UI immediately updates the relevant card to reflect the expected outcome
- A spinner appears on the affected row
- If the action fails, the state reverts and an error toast is shown
- If confirmed by the next poll, the spinner disappears

---

## Alert / Warning Thresholds

These thresholds determine card status colors and the aggregate system status:

| Signal | Warning (amber) | Critical (red) |
|---|---|---|
| LLM circuit state | any `half_open` | any `open` |
| LLM consecutive failures | 1-2 out of 3 | 3 (circuit open) |
| Agent health score | 50-79 | < 50 |
| Agent consecutive HTTP failures | 1-2 | 3 (marked inactive) |
| Agent last heartbeat age | > 20s | > 30s |
| Queue utilization per agent | > 75% | 100% (backpressure) |
| Queued waiters count | > 0 | > 5 |
| Execution running time | > 30 min | > 60 min |
| Stuck execution count | 1-2 | 3+ |
| Presence lease age | approaching 15s TTL (> 10s) | expired |
| Cleanup service last run | > 10 min ago | > 30 min ago |
| Health data staleness | > 15s since last poll | > 30s since last poll |
| Cleanup timeouts today | 5-20 | > 20 |

---

## Interaction Design

### Card Click → Detail Panel

- Clicking a card expands its detail panel below the 2x3 grid
- The clicked card gets a highlighted border (white/primary color, 2px)
- The detail panel slides open (200ms ease-out)
- Only one detail panel open at a time; clicking a different card switches panels
- Clicking the active card again collapses the panel
- URL fragment updates: `/ui/health#llm`, `/ui/health#agents`, etc.
- On page load with a fragment, the corresponding panel opens automatically

### Action Buttons

All action buttons are secondary/outlined by default. When the system is in a critical state, the action button on the relevant card becomes a filled destructive or primary button to draw attention.

**Confirmation pattern:** Destructive actions (cancel executions, bulk cancel) require a modal confirmation. Non-destructive actions (reconcile agent, view details) execute immediately or navigate.

**Inline feedback:** After an action button is clicked:
1. Button changes to loading state (spinner, disabled)
2. On success: brief success toast, button returns to default or disappears if no longer needed
3. On failure: error toast with the error message, button returns to active state

### Keyboard Navigation

- `Tab` cycles through cards
- `Enter` on a card opens its detail panel
- `Escape` closes an open detail panel
- Arrow keys navigate rows within an open detail panel
- `C` shortcut (when detail panel is focused) triggers the primary action on the focused row

### Deep Links

All panels are deep-linkable via URL fragments. This allows operators to share direct links to specific health views in incident response channels:
- `/ui/health#llm` — opens LLM detail panel
- `/ui/health#agents` — opens agent fleet panel
- `/ui/health#queue` — opens queue panel
- `/ui/health#executions` — opens stuck executions panel

---

## Mobile / Responsive Design

### Breakpoints

| Breakpoint | Layout change |
|---|---|
| < 640px (mobile) | Single column. Cards stack vertically. Event feed moves below cards. Detail panels remain full-width. Status bar wraps to 2 lines. |
| 640-1024px (tablet) | 2-column card grid. Event feed moves below grid. Status bar single line. |
| > 1024px (desktop) | 2-column card grid + right-rail event feed. Full detail panels. |

### Mobile-Specific Adaptations

**Status bar (mobile):** Reduces to: aggregate pill + 2 highest-priority signals + last sync. Lower-priority signals accessible via "More →" chip.

**Card compactness:** On mobile, secondary metrics in cards collapse to a single summary line. Tapping a card still opens the full detail panel (bottom sheet on mobile, not inline accordion).

**Bottom sheet pattern (mobile):** Detail panels render as bottom sheets (slide up from bottom of screen) instead of inline accordions. This preserves scroll position in the card grid.

**Event feed (mobile):** Collapsed to a single "X new events" badge on the page header. Tapping opens a full-screen event log modal.

**Action buttons (mobile):** Full-width within cards for easier tap targets.

### Touch Interactions

- Tap card: open detail panel (bottom sheet on mobile)
- Long press card: show quick actions without navigating to detail
- Swipe down on bottom sheet: dismiss

---

## Empty States

**No agents registered:**
```
┌────────────────────────────────────┐
│  ◻ Agent Fleet             ● HEALTHY │
│  ──────────────────────────────── │
│  No agents registered yet          │
│                                    │
│  [Get started →]                   │
└────────────────────────────────────┘
```
"Get started" links to the agent registration documentation or the `af init` quickstart.

**No executions running:**
The execution health card shows "0 running · 0 timed out" with a green status — this is correct and expected behavior, not an empty state that needs explanation.

**LLM health endpoint unavailable:**
Card shows `UNKNOWN` (gray) status with: "LLM health data unavailable. Endpoint may not be configured." with a link to configuration docs.

---

## Data Freshness Indicators

Each card footer shows a small timestamp: "Updated 3s ago" in gray. This text:
- Stays gray when data is < 15s old
- Turns amber when 15-30s old
- Turns red when > 30s old
- Shows a spinner while a request is in-flight

This gives operators confidence in data freshness without being intrusive.

---

## Navigation & Page Discovery

**Entry points to this page:**
1. Global nav: "Health" link (new item in left sidebar, positioned between Dashboard and Nodes)
2. Dashboard health summary card: "View details →" link
3. Any agent status indicator in the Nodes list: clicking "degraded" or "offline" status navigates to this page with the agents panel pre-opened
4. Incident banners / toast notifications: "View health →" action

**From this page, navigation out:**
- Agent name in Agent Fleet panel → `/ui/nodes/{id}` (agent detail)
- Execution ID in Stuck Executions panel → `/ui/executions/{id}` (execution detail)
- "View all events →" in event feed → `/ui/events` (event log page, if exists)
- "Adjust limit →" in queue panel → agent settings page

---

## API Endpoints Summary

| Card | Primary Endpoint | Notes |
|---|---|---|
| System Status Bar | Derived from all below | Client-side aggregation |
| LLM Health | `GET /api/ui/v1/llm/health` | Poll every 10s |
| Agent Fleet | `GET /api/ui/v1/nodes` | Poll every 10s |
| Queue Status | `GET /api/ui/v1/queue/status` | Poll every 5s |
| Execution Health | `GET /api/ui/v1/executions?status=running` | Poll every 15s |
| Presence & Leases | `GET /api/ui/v1/nodes` (last_heartbeat field) | Derived from nodes |
| Cleanup Service | `GET /api/ui/v1/cleanup/status` (TBD) | Poll every 30s |
| Live Event Feed | `GET /api/ui/v1/health/events/stream` (SSE) | Real-time |
| Force close circuit | `POST /api/ui/v1/llm/{id}/reset` (TBD) | Action |
| Reconcile agent | `POST /api/ui/v1/nodes/{id}/reconcile` (TBD) | Action |
| Cancel execution | `POST /api/ui/v1/executions/{id}/cancel` | Existing |
| Bulk cancel | `POST /api/ui/v1/executions/bulk-cancel` (TBD) | Action |

Endpoints marked `(TBD)` do not yet exist in the backend and will need to be added as part of this feature. They are listed here to make the backend work explicit.

---

## Backend Work Required

The following backend additions are needed to fully power this dashboard:

| Priority | Work | Endpoint |
|---|---|---|
| P0 | LLM health endpoint (already exists per spec) | `GET /api/ui/v1/llm/health` |
| P0 | Queue status endpoint (already exists per spec) | `GET /api/ui/v1/queue/status` |
| P1 | Health events SSE stream | `GET /api/ui/v1/health/events/stream` |
| P1 | Cleanup service status endpoint | `GET /api/ui/v1/cleanup/status` |
| P2 | Force-close circuit breaker | `POST /api/ui/v1/llm/{id}/reset` |
| P2 | Agent reconcile trigger | `POST /api/ui/v1/nodes/{id}/reconcile` |
| P2 | Bulk execution cancel | `POST /api/ui/v1/executions/bulk-cancel` |

---

## Open Questions

1. **Cleanup service introspection:** Does the Execution Cleanup Service expose any status? If not, the cleanup card must be derived from querying for long-running executions directly.

2. **Presence endpoint:** Is presence/lease data available as a discrete endpoint, or must it be derived from `last_heartbeat` on the nodes list? If the latter, the "Presence & Leases" card may be merged into "Agent Fleet" to avoid showing redundant data under a confusing label.

3. **LLM endpoint display names:** Does the LLM health response include a human-readable name, or only a URL? The table needs something readable in the "Endpoint" column.

4. **Circuit breaker reset:** Is force-closing a circuit a supported operation? This requires careful consideration — a misconfigured endpoint would immediately start failing again if the underlying problem hasn't been resolved.

5. **Prometheus metrics exposure:** Are Prometheus metrics (queue depth, backpressure events, waiter count) already exposed via a JSON endpoint (`/api/ui/v1/metrics/summary`), or only in Prometheus scrape format? The dashboard needs JSON.

6. **Health events SSE:** The backend has SSE infrastructure for execution logs. Can the same mechanism be reused for health state change events, or does a new SSE handler need to be built?
