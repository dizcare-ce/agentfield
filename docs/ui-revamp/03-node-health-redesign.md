# AgentField UI — Node Health Redesign Spec

**Document:** 03 — Agent Nodes Page
**Status:** Draft
**Scope:** Node list view, node detail page, health visualization, active execution display, health timeline, action prominence, status stability, MCP integration

---

## Problem Statement

The current Nodes page serves Journey 3 (Deploy & Configure) reasonably well but almost completely fails Journey 2 (Diagnose & Fix) and Journey 1 (Monitor & Observe). The specific failure modes:

1. **Status flicker.** A node toggling between "active" and "inactive" every few seconds destroys operator trust. The display reflects raw poll results without any debounce or stability window.
2. **No operational context.** A card shows that an agent is "active" but not whether it's idle, processing 12 concurrent tasks, or stuck. Kubernetes shows pod resource usage inline — we show nothing.
3. **Actions are buried.** Start/Stop/Reconcile exist in a dropdown on the detail page. When an operator sees a degraded node, the action they need should be front and center — not hidden under a menu.
4. **Three health layers collapsed into one badge.** The backend maintains separate signals — connectivity (presence lease), health check (HTTP poll result), and lifecycle state machine — but the UI collapses them into a single status badge. When something is wrong, the operator cannot tell which layer failed.
5. **No temporal context.** "Inactive" is shown as a current fact but offers no answer to: "Has it been down for 10 seconds or 3 hours?"

---

## Design Principles for This Page (Specific)

These extend the global principles from `00-product-philosophy.md`:

- **Trust through stability.** Operators stop trusting a status display the moment it flickers. Every state shown must have earned its way into the display through a stability window.
- **Layered health, not binary health.** A node can be reachable but returning errors (health check failing). It can pass health checks but be over-committed (concurrency saturated). Show which layer is the source of truth for the current status.
- **Action gravity.** Actions should appear where attention already is. If the operator is looking at a degraded node, the Reconcile button should be on the card, not 3 clicks away.
- **Execution as primary signal.** An "active" node with 0 in-flight executions and one with 8 are fundamentally different operational states. In-flight count is a first-class display element, not a detail.

---

## Backend Data Model Reference

Understanding the backend systems is required to design the right display:

| System | Mechanism | Signal Produced |
|--------|-----------|----------------|
| PresenceManager | In-memory lease, 15s TTL, 5s sweep | Connected / Disconnected |
| HealthMonitor | HTTP GET /status every 10s, 3 consecutive failures = inactive | Health score 0–100, fail count |
| StatusManager | Combines presence + health + lifecycle, reconciles every 30s | Unified status, transition events |
| ConcurrencyTracker | Per-agent in-flight counter | Active execution count |
| SSE Event Bus | Pushes events on status change | node_online, node_offline, node_health_changed, node_unified_status_changed, node_state_transition |

Valid lifecycle transitions: `inactive → starting → active → stopping → inactive`

The three layers map to three independently-failing subsystems:
- **Layer 1 — Connectivity:** Is the agent's presence lease alive? (PresenceManager)
- **Layer 2 — Health:** Is the agent passing HTTP health checks? (HealthMonitor)
- **Layer 3 — Lifecycle:** Is the agent in a valid, expected lifecycle state? (StatusManager)

---

## Part 1: Node List View Redesign

### 1.1 Layout Structure

The list view uses a card-per-node layout with a persistent filter/search bar at the top. The key change from the current design: each card surfaces operational state, not just identity + status badge.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Agent Nodes                                           [+ Register Agent]   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search nodes...    [All] [Active] [Degraded] [Inactive]  Sort ▾  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ ● ACTIVE                            │  │ ⚠ DEGRADED                  │  │
│  │ research-agent                       │  │ summarizer-agent             │  │
│  │ node-abc123                          │  │ node-def456                  │  │
│  │                                      │  │                              │  │
│  │  ████████████████░░░░  8/10 running  │  │  ████░░░░░░░░░░░░░  2/10    │  │
│  │                                      │  │                              │  │
│  │  Health  ●●● 92/100                  │  │  Health  ●●○ 41/100          │  │
│  │  Uptime  6h 23m                      │  │  Health check failing (2/3)  │  │
│  │                                      │  │  Uptime  14m (was up 2h)     │  │
│  │  Last seen  just now                 │  │  Last seen  8s ago           │  │
│  │                                      │  │                              │  │
│  │                    [View Details]    │  │  [Reconcile]  [View Details] │  │
│  └─────────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ ○ INACTIVE                          │  │ ◌ STARTING                  │  │
│  │ classifier-agent                    │  │ ingestion-agent              │  │
│  │ node-ghi789                         │  │ node-jkl012                  │  │
│  │                                     │  │                              │  │
│  │  ░░░░░░░░░░░░░░░░░░░  0/10 running  │  │  Waiting for first heartbeat │  │
│  │                                     │  │  Started 12s ago             │  │
│  │  Health  ○○○ —                      │  │                              │  │
│  │  Down for  47m 12s                  │  │                              │  │
│  │                                     │  │                              │  │
│  │  [Start]  [View Details]            │  │                  [View Det.] │  │
│  └─────────────────────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Card Anatomy

Each card contains exactly these elements, always in this order:

**Row 1 — Status + Name**
- Status dot (color + shape, see section 3)
- Unified status label (ACTIVE / DEGRADED / INACTIVE / STARTING / STOPPING)
- Node display name (large, prominent)
- Node ID (small, secondary, truncated with tooltip for full value)

**Row 2 — Execution Bar**
- Horizontal bar showing in-flight executions / concurrency limit
- Filled segments = active executions, empty = available slots
- Numeric label: "8/10 running"
- Color: green when < 70%, amber when 70–90%, red when at limit
- Hidden (shown as dashed) when node is inactive or starting

**Row 3 — Health Summary**
- Three dots representing the three health layers (connectivity, health check, lifecycle)
  - Filled dot = layer healthy
  - Half-filled = layer degraded
  - Empty = layer failed
- Health score number (0–100) from HealthMonitor
- If any layer is failing: one-line explanation of the worst failure ("Health check failing (2/3)")

**Row 4 — Temporal**
- Uptime (if active): "Uptime 6h 23m"
- Down for (if inactive): "Down for 47m 12s"
- Recently degraded: "Uptime 14m (was up 2h)" — shows that the node recently recovered or is newly degraded
- Last seen: relative time of last heartbeat

**Row 5 — Actions**
- Context-sensitive action buttons (see section 6 for full logic)
- Always-present "View Details" link

### 1.3 Card Sort Order

Default sort: operational priority descending
1. DEGRADED nodes first (need attention)
2. ACTIVE nodes with high execution load (near concurrency limit)
3. ACTIVE nodes normal load
4. STARTING nodes
5. STOPPING nodes
6. INACTIVE nodes (least urgent if intentionally stopped)

Secondary sort within each group: alphabetical by name.

Users can override sort via the sort control.

### 1.4 Filter Tabs

- **All** — all nodes
- **Active** — lifecycle = active, all health layers passing
- **Degraded** — active lifecycle but one or more health layers failing, or health score < 60
- **Inactive** — lifecycle = inactive (covers stopped, failed to start, lost presence)
- **Busy** — active nodes where in-flight >= 70% of concurrency limit

The "Degraded" filter is the most operationally useful and should be visually distinct (amber accent on the tab when non-zero).

---

## Part 2: Node Detail Page Restructure

### 2.1 Page Header

The detail page header replaces the current minimal title + dropdown with a full operational context bar:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Agent Nodes                                                              │
│                                                                              │
│  ● research-agent                              [Reconcile ▾]  [Stop]       │
│  node-abc123 · python-3.11 · registered 6 days ago                         │
│                                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │  ● ACTIVE   │  │  8 running   │  │  92 health     │  │  6h 23m uptime │ │
│  │             │  │  of 10 slots │  │  score         │  │                │ │
│  └─────────────┘  └──────────────┘  └────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

The four KPI chips are always visible. Their values update via SSE without page reload.

Actions in the header are context-sensitive: when active, show Stop (destructive, secondary) with a Reconcile dropdown. When inactive, show Start as primary. When degraded, show Reconcile as primary. (See section 6 for full action logic.)

### 2.2 Tab Structure Redesign

Current tabs: Overview, MCP Servers, Tools, Performance (placeholder), Configuration

**Proposed tabs:**

| Tab | Purpose | Replaces |
|-----|---------|---------|
| **Health** | 3-layer health, health score chart, health timeline | Overview (split) |
| **Activity** | Live in-flight executions, recent execution history | New |
| **Reasoners** | Registered reasoners/skills with test capability | Tools |
| **Connections** | MCP servers, external API connectivity | MCP Servers |
| **Configuration** | Env vars, concurrency limits, webhook settings | Configuration |

"Performance" placeholder is removed — its content will surface in Health and Activity once implemented.

The tab order represents the Priority order for Journey 2 (Diagnose & Fix). Health is the first thing an operator checks. Activity is second. Configuration is last.

### 2.3 Health Tab Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Health                                                    Last updated: 2s │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  THREE-LAYER HEALTH                                                  │   │
│  │                                                                      │   │
│  │  Layer 1 — Connectivity       ● Connected                           │   │
│  │  Presence lease active · renewed 3s ago · 15s TTL                   │   │
│  │                                                                      │   │
│  │  Layer 2 — Health Check       ● Passing                             │   │
│  │  HTTP /status · last 200 in 142ms · 10s poll · 0/3 failures         │   │
│  │                                                                      │   │
│  │  Layer 3 — Lifecycle          ● Active                              │   │
│  │  State: active · last transition: inactive→active 6h 23m ago        │   │
│  │  Next reconcile: 18s                                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  HEALTH SCORE  92/100                                                │   │
│  │                                                                      │   │
│  │  100 ┤                                                               │   │
│  │   80 ┤▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │   │
│  │   60 ┤                                                               │   │
│  │   40 ┤                                                               │   │
│  │   20 ┤                                                               │   │
│  │    0 ┤                                                               │   │
│  │      └───────────────────────────────────────────────────────────── │   │
│  │        -6h          -4h          -2h          -1h         now       │   │
│  │                                                    [1h] [6h] [24h]  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  HEALTH TIMELINE                                         (see §5)   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Activity Tab Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Activity                                                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  LIVE EXECUTIONS  8 active  ████████████████░░░░  (8/10 slots used)  │   │
│  │                                                                      │   │
│  │  exec-uuid-1  · workflow-abc  · classify   · running 4s   [Cancel]  │   │
│  │  exec-uuid-2  · workflow-abc  · classify   · running 12s  [Cancel]  │   │
│  │  exec-uuid-3  · direct        · summarize  · running 1s   [Cancel]  │   │
│  │  exec-uuid-4  · workflow-def  · extract    · running 28s  [Cancel]  │   │
│  │  exec-uuid-5  · workflow-def  · extract    · running 31s  [Cancel]  │   │
│  │  exec-uuid-6  · direct        · classify   · running 45s  [Cancel]  │   │
│  │  exec-uuid-7  · workflow-ghi  · analyze    · running 2m3s [Cancel]  │   │
│  │  exec-uuid-8  · workflow-ghi  · analyze    · running 2m8s [Cancel]  │   │
│  │                                                 [Cancel All Active]  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  RECENT EXECUTIONS  (last 50)                    [View All Executions →]   │
│                                                                              │
│  ✓ exec-uuid-0  classify   completed  1s ago   142ms duration              │
│  ✓ exec-uuid-z  summarize  completed  4s ago   891ms duration              │
│  ✗ exec-uuid-y  extract    failed     12s ago  timeout after 30s  [Retry]  │
│  ✓ exec-uuid-x  classify   completed  15s ago  201ms duration              │
│  ...                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

The "Live Executions" section subscribes to the SSE event stream and updates without reload. Executions that have been running longer than 2x their average duration are highlighted in amber (indicating they may be stuck).

---

## Part 3: Health Score Visualization

### 3.1 The Three-Layer Model

The backend produces three independent health signals. They must be shown independently — collapsing them into a single score loses diagnostic value.

**Visual vocabulary for the three layers:**

```
● Passing    ◐ Degraded    ○ Failing    — Unknown/N/A
```

Layer dots appear in a fixed left-to-right order: [Connectivity] [Health Check] [Lifecycle]

This lets operators develop muscle memory: left dot = network, middle dot = app health, right dot = state machine.

**Combined status derivation (visible in tooltip):**

| Connectivity | Health Check | Lifecycle | Displayed Status |
|-------------|-------------|-----------|-----------------|
| ● | ● | ● | ACTIVE |
| ● | ◐ | ● | DEGRADED |
| ● | ○ | ● | DEGRADED |
| ○ | — | ● | DEGRADED (transitioning to inactive) |
| ○ | — | ○ | INACTIVE |
| ● | ● | ◌ STARTING | STARTING |
| ● | ● | ◑ STOPPING | STOPPING |

"Degraded" is the status when the node is still reachable and in lifecycle=active but health checks are failing. This is the most important distinction — it means the agent process is up but misbehaving, and reconcile is the right action.

### 3.2 Health Score Ring (Card Summary)

On the node list card, the health score is shown as a small ring/arc rather than raw numbers. This makes it scannable across many cards.

```
  Full ring = 100     Three-quarter = 75     Half ring = 50
       ●                    ◕                     ◑
      ╱╲                   ╱╲                    │
     ╱  ╲                 ╱  ╲                   │
```

Score thresholds:
- 80–100: green ring
- 60–79: amber ring
- 0–59: red ring

The numeric score appears inside the ring on hover/focus.

### 3.3 Health Score Chart (Detail Page)

The time-series chart on the Health tab shows:
- Score line (0–100, continuous)
- Downtime bands: solid red overlay for periods where lifecycle = inactive
- Degraded bands: amber overlay for periods where health < 60
- Event markers: vertical ticks for state transitions (labeled on hover)

Window options: 1h, 6h, 24h. Default: 6h.

The chart is rendered client-side from a `/api/v1/nodes/{id}/health/history` endpoint that returns time-bucketed health scores and state transitions. If the endpoint doesn't exist yet, it falls back to showing only the current score with "History unavailable" in the chart area.

---

## Part 4: Active Execution Display Per Node

### 4.1 Execution Bar (List Card)

The execution bar is a linear progress-style visualization of concurrency slot utilization:

```
  ████████████████░░░░  8/10 running
```

- Each segment represents one concurrency slot
- Filled (█) = slot occupied by an active execution
- Empty (░) = available slot
- The bar width scales to the concurrency limit (10 slots = 10 segments, 100 slots = 100 segments capped at visual max)
- Color mapping:
  - 0–69%: green fill
  - 70–89%: amber fill
  - 90–100%: red fill
- When at 100% (concurrency limit hit): the bar pulses to draw attention, and the tooltip explains that new executions are being queued/rejected

When the node is inactive, the bar is shown as all-dashed with the label "0 running" in muted text.

### 4.2 Execution Count in Header KPIs

The detail page header always shows `N running / M slots` as the second KPI chip. Clicking this chip scrolls to the Activity tab.

### 4.3 Stuck Execution Detection

An execution is considered "stuck" when its elapsed time exceeds 3x the p95 duration for that reasoner (if history exists) or a configurable absolute timeout (default: 5 minutes).

Stuck executions are highlighted in the Activity tab with an amber background and a "May be stuck" label. The [Cancel] button becomes visually prominent (from ghost to filled amber).

This requires client-side computation from the execution start time and cached p95 stats. No new backend API required.

---

## Part 5: Health Timeline

### 5.1 What It Shows

The health timeline is a horizontal Gantt-style strip showing the node's operational history: when it was up, down, degraded, and for how long.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HEALTH TIMELINE                                                         │
│                                                                          │
│  Now ◄──────────────────────────────────────────────────────── -24h    │
│       ██████████████████████████████████████▓▓▓▓▓▓▓░░░░░░███████████  │
│                                             ↑          ↑               │
│                                         degraded    inactive           │
│                                          2h ago     for 47m            │
│                                                                          │
│  ● Active (18.5h)    ⚠ Degraded (2.1h)    ○ Inactive (3.4h total)     │
│                                                                          │
│  INCIDENTS                                                               │
│  ↑ 47m ago   Went inactive · Down for 47m                               │
│  ↑ 2h ago    Went degraded · Health check failures (3/3 failed)         │
│  ↑ 4h ago    Recovered · inactive→active transition                     │
│  ↑ 5h ago    Went inactive · Presence lease expired                     │
│                                                                          │
│                                              [View full history →]      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Timeline Segments

Each segment maps to a time range with a status:

| Status | Visual | Color |
|--------|--------|-------|
| Active | ██ (dense fill) | green |
| Degraded | ▓▓ (medium fill) | amber |
| Inactive | ░░ (light fill) | red |
| Unknown (gap in data) | ── (line) | gray |

Hovering a segment shows: status label, start time, duration.

### 5.3 Incident List

Below the timeline strip, the last N state transitions are listed as an incident log:
- Timestamp (relative: "47m ago")
- What changed (e.g., "Went inactive")
- Why it changed — the backend's `node_state_transition` SSE event includes the triggering reason (presence lease expired, health check threshold hit, manual stop)
- Duration of the resulting state (if state has ended) or "ongoing" if current

This directly answers the user question: "When did it go down and why?"

### 5.4 Data Source

The health timeline is built from:
1. `node_state_transition` SSE events buffered client-side during the session
2. On initial load: `/api/v1/nodes/{id}/transitions?limit=50` endpoint (to be added if not existing)
3. Fallback: show only current state with "Timeline requires history data. Collecting from this session."

The timeline stores events in local browser state while the detail page is open, accumulating a live picture as SSE events arrive.

---

## Part 6: Action Prominence

### 6.1 Principle

Actions must appear at the point of recognition. When an operator sees a degraded node, the action to fix it should be visible without any additional navigation.

Current problem: actions are in a "..." dropdown on the detail page only.

### 6.2 Action Surface Points

**On the list card:**
- Show 1–2 context-appropriate action buttons directly on the card
- Never more than 2 — if more actions are relevant, the second becomes "More ▾"
- "View Details" is always present as a link, not a button (lower visual weight)

**On the detail page header:**
- Primary action: the most important action for the current state (large, always visible)
- Secondary actions: a dropdown from "..." for less common actions

**In the Activity tab:**
- [Cancel] per execution (ghost button, becomes prominent when execution is stuck)
- [Cancel All Active] for bulk cancel (destructive, requires confirmation)

### 6.3 Action Decision Table

| Node State | Health Score | Card Actions | Header Primary | Header Secondary |
|------------|-------------|--------------|----------------|-----------------|
| ACTIVE | 80–100 | (none) | Stop | Reconcile, Force restart |
| ACTIVE | 60–79 | Reconcile | Reconcile | Stop, Force restart |
| ACTIVE | 0–59 | Reconcile | Reconcile | Stop, Force restart |
| DEGRADED | any | Reconcile | Reconcile | Stop, Force restart |
| INACTIVE | — | Start | Start | Force restart, Delete |
| STARTING | — | (none) | (loading state) | Cancel start |
| STOPPING | — | (none) | (loading state) | Force stop |

### 6.4 Action Confirmation Patterns

| Action | Confirmation Required | Pattern |
|--------|-----------------------|---------|
| Reconcile | No | Button click → immediate + toast feedback |
| Start | No | Button click → immediate + status updates live |
| Stop | Yes (if executions in-flight) | Confirm modal: "N executions are running. Stop anyway?" |
| Force restart | Yes | Confirm modal: brief explanation |
| Cancel execution | No | Button click → immediate |
| Cancel all active | Yes | Confirm modal: "Cancel N active executions?" |
| Delete node | Yes + type name | Two-step: confirm dialog + type node name |

### 6.5 Action Feedback

After any action, the header KPI chips and list card update in real-time via SSE. No manual refresh required.

A toast notification confirms the action was received by the control plane. The toast for "Reconcile" includes: "Reconcile requested. Next status update in ~30s."

This sets expectations — reconciliation is not instantaneous, and the operator shouldn't assume silence means failure.

---

## Part 7: Status Stability (Preventing Flicker)

### 7.1 The Root Cause of Flicker

The current implementation reflects the raw `node_unified_status_changed` SSE event directly to the badge. A node transitioning repeatedly between active and inactive (due to intermittent health check failures) causes visible badge flicker.

The backend has built-in stability: HealthMonitor requires 3 consecutive failures before marking inactive. However, the SSE events for intermediate health score changes (health_changed) can fire before the threshold is crossed, and some event handlers may be incorrectly treating these as status changes.

### 7.2 Client-Side Stability Window

The UI applies a stability window before committing a status change to display:

**Rule:** A status change is displayed only after it has persisted for `STABILITY_WINDOW_MS` without reverting.

```
STABILITY_WINDOW_MS values by transition:
  active → degraded:   5,000ms  (5s)
  active → inactive:  15,000ms  (15s, matches PresenceManager TTL)
  degraded → inactive: 10,000ms
  any → starting:       0ms    (show immediately — intent is clear)
  any → active:         3,000ms (brief window to avoid false recoveries)
  any → stopping:       0ms    (show immediately)
```

During the stability window, the card shows:
- The previous confirmed status (no flicker)
- A subtle "updating..." indicator (small animated dot next to the status, visible on hover)

If the status reverts within the window, the window resets without showing any change.

### 7.3 Transient vs Persistent Distinction

Two signals must be distinguished:

| Signal | Type | Displayed As |
|--------|------|-------------|
| `node_health_changed` (score fluctuation) | Transient | Health score updates immediately; status badge only changes if score crosses a threshold for >5s |
| `node_unified_status_changed` | Persistent (after backend's own stability logic) | Apply stability window before display |
| `node_state_transition` | Authoritative (lifecycle state machine) | Show immediately — this is the source of truth |

The lifecycle state transition event (`node_state_transition`) bypasses the client stability window. If the backend's state machine has committed to "inactive", display it immediately.

### 7.4 Last Seen vs Status

"Last seen" (relative time of last heartbeat) updates every second from a locally-stored timestamp. It does NOT trigger a status change.

Showing "last seen 8s ago" while the badge shows "ACTIVE" is correct and expected behavior — it tells the operator the heartbeat is slightly delayed but the node hasn't crossed the failure threshold yet.

"Last seen" turns amber at 12s (approaching the 15s presence TTL) and red at 20s (past TTL — likely triggering a status change shortly).

### 7.5 Status Badge Visual Design

The status badge uses both color and shape (for accessibility):

```
● ACTIVE      — filled green circle + bold green text
◑ DEGRADED    — half-filled amber circle + amber text
○ INACTIVE    — empty red circle + red text
◌ STARTING    — animated pulsing circle + blue/gray text
◑ STOPPING    — half-filled gray circle + gray text
```

The badge never uses just color alone. The shape + icon encodes state independently of color for colorblind operators.

---

## Part 8: MCP Server Health Integration

### 8.1 Why MCP Servers Matter for Node Health

An agent node may depend on one or more MCP servers (external tool endpoints). If an MCP server is down, the agent's tool calls will fail, but the node itself will remain "active" from a lifecycle perspective. This creates a hidden failure mode: node looks healthy, executions silently fail.

MCP server health should be a contributing factor to the node's displayed health — not the primary one, but clearly visible.

### 8.2 MCP Health in the Card

When a node has MCP servers configured, the card gains a fourth indicator in the health summary row:

```
  Health  ●●● 92/100    MCP  ●●○  (2 of 3 servers reachable)
```

The MCP indicator shows:
- All servers reachable: single green dot
- Some servers unreachable: amber dot + "(N of M servers reachable)"
- All servers unreachable: red dot + "(MCP offline)"
- No MCP servers configured: hidden entirely

### 8.3 Connections Tab Layout

The "Connections" tab (renamed from "MCP Servers") shows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Connections                                                                 │
│                                                                              │
│  MCP SERVERS                                              [+ Add MCP]       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ● filesystem-mcp                                                     │   │
│  │ stdio · /usr/local/bin/mcp-filesystem                                │   │
│  │ Status: Connected · 4 tools registered                               │   │
│  │ Last used: 12s ago                                                   │   │
│  │ [View Tools]                              [Restart] [Remove]         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ● web-search-mcp                                                     │   │
│  │ http · http://mcp-server:3001                                        │   │
│  │ Status: Connected · 2 tools registered                               │   │
│  │ Last used: 4m ago                                                    │   │
│  │ [View Tools]                              [Restart] [Remove]         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ○ database-mcp                                                ⚠     │   │
│  │ http · http://db-mcp:5432                                            │   │
│  │ Status: Unreachable · Connection refused                             │   │
│  │ Last connected: 23m ago · 3 reconnect attempts                       │   │
│  │ [View Tools (cached)]             [Retry Connection] [Remove]        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  IMPACT ANALYSIS                                                             │
│  ⚠ database-mcp is offline. Reasoners that use database tools may fail:    │
│     · query-reasoner (uses: query_database, update_record)                  │
│     · report-reasoner (uses: fetch_metrics)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Impact Analysis

When one or more MCP servers are unreachable, the Connections tab shows an "Impact Analysis" section that cross-references:
- Which MCP server is down
- Which tools are provided by that server
- Which reasoners on this node are registered to use those tools

This is derivable from data already in the UI (registered tools per MCP server + tool usage in reasoner definitions). It turns a red dot into an actionable diagnosis: "This MCP server outage will break these specific reasoners."

### 8.5 MCP Health in Overall Node Health Score

The node's displayed health score is the backend's `HealthMonitor` score (0–100), which reflects HTTP /status polling. MCP server health is not currently factored into this score by the backend.

For display purposes, the UI can apply a client-side adjustment: if any MCP server is unreachable, display the health score with a ⚠ modifier: "92 ⚠ (MCP degraded)". This communicates that the base health score doesn't capture the full picture.

A backend change to include MCP health in the health score is the correct long-term fix, but the UI modifier provides immediate value without waiting for that change.

---

## Part 9: Implementation Notes

### 9.1 SSE Subscription Strategy

The node list subscribes to the global `/api/v1/events/nodes` SSE stream and applies updates to all visible cards. The node detail page subscribes to `/api/v1/events/nodes/{id}` for a single-node stream.

SSE reconnection: auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s). Show a "Live updates paused — reconnecting..." banner if SSE is disconnected for more than 10 seconds.

### 9.2 Polling Fallback

If SSE is unavailable (firewall, proxy), the list falls back to polling `/api/v1/nodes` every 15s. Cards show a small "~" prefix on timestamps to indicate polling mode vs live mode.

### 9.3 New API Endpoints Required

| Endpoint | Purpose | Priority |
|----------|---------|---------|
| `GET /api/v1/nodes/{id}/health/history` | Health score time series for chart | P1 |
| `GET /api/v1/nodes/{id}/transitions` | State transition history for timeline | P1 |
| `GET /api/v1/nodes/{id}/executions/active` | Live in-flight execution list | P0 (needed for Activity tab) |

The activity feed may already be derivable from the existing executions endpoint filtered by node + status=running. Confirm before building a new endpoint.

### 9.4 Data That Does Not Require New APIs

- Health score current value: already in node status response
- Unified status: already in node status response
- MCP server list and status: already in node detail response
- Concurrency in-flight count: already tracked per-agent
- Last heartbeat timestamp: already in node status response
- Reasoner list: already in node detail response

The redesign is primarily a UI/data presentation change. The core data exists. The gaps are the historical/time-series endpoints.

---

## Part 10: Phased Rollout

### Phase 1 (No new backend APIs)
- Implement stability window (section 7) — fixes flicker immediately
- Redesign list card layout with execution bar and layer dots using current data
- Move actions to card and header (section 6)
- Rename "Performance" tab to a placeholder stub; rename "MCP Servers" to "Connections"
- Add MCP health indicator to card (derives from existing MCP server data)
- Impact Analysis section in Connections tab

### Phase 2 (Requires new endpoints)
- Health score time-series chart (needs `/health/history`)
- Health timeline and incident log (needs `/transitions`)
- Live execution list in Activity tab (may need `/executions/active` or filter on existing)

### Phase 3 (Stretch)
- Stuck execution detection with amber highlighting
- Backend MCP health contribution to health score (backend change)
- Health score chart with event markers
- Configurable stability window per operator preference
