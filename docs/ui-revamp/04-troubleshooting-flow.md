# AgentField UI — Troubleshooting Flow

## The Problem This Solves

> "My jobs are stuck. I don't know if it's the LLM, the agent, the queue, or something else. I restarted LiteLLM, the agents, AgentField itself — nothing helped. I had to delete the stuck requests and lost my work."

This is the highest-severity failure mode in AgentField: a user observes symptoms (nothing is moving) but cannot trace the cause across four independent failure layers. Without systematic diagnosis, recovery becomes destructive — deleting work rather than resuming it.

The troubleshooting flow solves this by collapsing a multi-layer diagnostic process into a guided, actionable UI experience with a target of: **symptom noticed → root cause identified → fix applied → recovery confirmed in under 2 minutes**.

---

## The Four Failure Layers

Every stuck-system scenario originates in exactly one layer. The UI must identify which one.

| Layer | What fails | Observable symptom | Error category |
|---|---|---|---|
| **LLM** | LiteLLM/model endpoint frozen or overloaded | Executions start but never get LLM responses | `llm_unavailable` |
| **Agent** | Agent process crashed, unresponsive, or at concurrency limit | Executions dispatched but agent never picks them up | `agent_unreachable`, `agent_error`, `concurrency_limit` |
| **Queue** | Async queue saturated; executions piling up | Executions created but never dispatched | Queue depth rising, throughput zero |
| **Execution** | Individual execution stalled after dispatch | Single execution running > 30 min, no callback | `agent_timeout` |

These layers are ordered: LLM failure causes Agent failures which cause Queue backup which causes Execution stalls. Diagnosing from the wrong layer leads to wasted restarts. The UI must always trace to the root layer.

---

## 1. Issue Detection

### Automatic Detection Rules

The control plane continuously evaluates health signals and classifies issues. No user action required.

**LLM Layer**

- Circuit breaker transitions from `closed` → `open`: immediate alert
- Circuit breaker in `half-open` for > 5 minutes without recovering: escalate to degraded
- Source: `GET /api/ui/v1/llm/health` — polled every 10 seconds

**Agent Layer**

- Health score drops below 0.4: degraded
- Health score drops below 0.1 or consecutive failures ≥ 5: critical
- Presence lease expired (last heartbeat > lease duration ago): offline
- Concurrency usage ≥ 90% of limit for > 2 minutes: saturated
- Source: agent registry with health scores, heartbeat lease checks

**Queue Layer**

- Queue depth > 50 and throughput = 0 for > 2 minutes: saturated
- Queue depth growing faster than it is draining for > 5 minutes: trending toward saturation
- Source: queue depth + throughput metrics

**Execution Layer**

- Execution in `running` state for > 30 minutes: stale/timeout candidate
- Execution in `pending` state for > 10 minutes (agent online, queue draining): dispatch failure
- Source: stale execution detector (backend already runs this)

### Severity Classification

| Severity | Criteria | Visual treatment |
|---|---|---|
| `critical` | Circuit open, agent offline, or > 10 stale executions | Red banner, pulsing dot |
| `degraded` | Health score < 0.4, concurrency saturated, queue trending | Yellow indicator, persistent badge |
| `warning` | Single stale execution, circuit half-open | Yellow dot, no banner |
| `informational` | Circuit recently recovered, agent restarting | Blue indicator |

---

## 2. Issue Presentation

### 2.1 System Health Bar (Global, Always Visible)

A persistent horizontal strip at the top of every page — never below the fold, never hidden. Modeled on Kubernetes dashboard's cluster status indicator.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ● LLM  ⚠ DEGRADED    ● Agents  3/4 UP    ● Queue  12 pending    ● Execs  2 STUCK  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Each cell is:
- Color-coded (green / yellow / red)
- A single number or state word — no prose
- Clickable: goes directly to the relevant diagnostic view

When everything is healthy, the bar collapses to a single green "All systems operational" line to reduce visual noise.

### 2.2 Dashboard Alert Panel

Below the health strip on the main dashboard, a prioritized alert list shows active issues. Each alert is a single line with three parts:

```
[CRITICAL]  LLM circuit breaker OPEN — 47 executions blocked since 14:23  [Diagnose →]
[DEGRADED]  Agent "worker-2" unreachable — last heartbeat 8 min ago        [Diagnose →]
[WARNING]   Execution exec_a3f9 stuck for 42 minutes                        [Diagnose →]
```

Rules:
- At most 5 alerts shown; "View all" link opens the full issue history
- Alerts are ordered by severity then age
- Each alert has a single "Diagnose" call-to-action that launches the diagnostic tree for that specific issue
- Resolved alerts disappear automatically within 30 seconds of resolution

### 2.3 In-Context Indicators

Issues also surface contextually on the pages where they are relevant, so users encountering a problem during normal navigation are immediately guided toward diagnosis.

| Page | In-context treatment |
|---|---|
| Nodes list | Agent row shows red/yellow health badge + "Diagnose" button inline |
| Execution detail | Stuck execution shows "This execution has been running for 47 min" + "Retry / Cancel" |
| Queue view | Saturated queue shows depth trend + "View affected agents" |
| Workflows page | Workflow with stuck steps shows layer badge on stuck step node |

---

## 3. Diagnostic Tree

The diagnostic tree is a guided modal/panel that opens from any "Diagnose" link. It is not a generic help page — it is dynamically populated based on the specific issue detected, working through the layers top-down.

### Entry Points

1. Click "Diagnose" on a dashboard alert
2. Click a red/yellow indicator in the health bar
3. Click "Diagnose" on an agent row in the Nodes list
4. Click the warning banner on a stuck execution detail page

### Step 1: Symptom Confirmation

The tree opens with a plain-language statement of what was detected, not a raw status code.

```
┌─────────────────────────────────────────────────────────┐
│  What we detected                                       │
│                                                         │
│  47 executions have been queued for over 10 minutes     │
│  and none have completed since 14:23 (28 minutes ago).  │
│                                                         │
│  We'll check each layer to find the root cause.         │
│                           [Start Diagnosis →]           │
└─────────────────────────────────────────────────────────┘
```

### Step 2: LLM Layer Check

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1 of 4: LLM                                      │
│                                                         │
│  ✗ Circuit breaker: OPEN                                │
│    Endpoint: http://litellm:4000/v1                     │
│    Opened at: 14:22:08                                  │
│    Failure count: 12 consecutive failures               │
│    Last error: 503 Service Unavailable                  │
│                                                         │
│  ► ROOT CAUSE FOUND                                     │
│    Agents cannot get LLM responses. Executions that     │
│    reached an agent are stalled waiting for model       │
│    output. New executions will queue indefinitely.      │
│                                                         │
│  [Skip to Fix →]        [Continue checking other layers]│
└─────────────────────────────────────────────────────────┘
```

If LLM is healthy, the check shows a green pass and advances automatically to the Agent layer.

### Step 3: Agent Layer Check

```
┌─────────────────────────────────────────────────────────┐
│  Layer 2 of 4: Agents                                   │
│                                                         │
│  ✓ worker-1    healthy   concurrency 3/5                │
│  ✗ worker-2    OFFLINE   last heartbeat: 9 min ago      │
│  ⚠ worker-3    degraded  health score: 0.3              │
│                           consecutive failures: 4       │
│                                                         │
│  ► ISSUE FOUND                                          │
│    1 agent offline, 1 agent degraded.                   │
│    worker-2 is not processing executions at all.        │
│    worker-3 is processing but failing 4 in 5 attempts.  │
│                                                         │
│  [Skip to Fix →]        [Continue checking queue]       │
└─────────────────────────────────────────────────────────┘
```

### Step 4: Queue Layer Check

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3 of 4: Queue                                    │
│                                                         │
│  Depth:        47 executions                            │
│  Throughput:   0 completions in last 10 min             │
│                                                         │
│  ► CONSEQUENCE (not root cause)                         │
│    Queue is saturated because agents are offline.       │
│    Fixing the agent layer will drain this automatically. │
│                                                         │
│  [Continue]                                             │
└─────────────────────────────────────────────────────────┘
```

This step is critical: it distinguishes root causes from downstream consequences. If the LLM or agent layer has an issue, queue saturation is labeled as a consequence, not a cause. This prevents users from trying to fix the queue when the actual problem is upstream.

If queue saturation is the **primary** issue (all agents healthy, LLM healthy, but queue still not draining), it surfaces as root cause with a different message: "Queue depth is high and agents are available — possible dispatch failure."

### Step 5: Execution Layer Check

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4 of 4: Stuck Executions                         │
│                                                         │
│  3 executions running > 30 minutes:                     │
│  exec_a3f9  — started 14:01  agent: worker-2  42 min    │
│  exec_b72c  — started 14:08  agent: worker-2  35 min    │
│  exec_d114  — started 14:19  agent: worker-3  24 min    │
│                                                         │
│  These will be auto-timed-out in 18 minutes.            │
│                                                         │
│  [Continue to Fix]                                      │
└─────────────────────────────────────────────────────────┘
```

### Step 6: Summary and Fix

After all layers are checked, the tree presents a ranked summary of issues and an action plan — ordered by root cause first.

```
┌─────────────────────────────────────────────────────────┐
│  Diagnosis complete                                     │
│                                                         │
│  Root cause #1  LLM circuit breaker OPEN                │
│  Root cause #2  Agent worker-2 offline                  │
│  Consequence    47 executions queued (will drain)       │
│  Consequence    3 executions stalled (will timeout)     │
│                                                         │
│  Recommended fix order:                                 │
│  1. Reset LLM circuit breaker (or verify LiteLLM)       │
│  2. Reconcile / restart worker-2                        │
│  3. Retry the 3 stuck executions after agents recover   │
│                                                         │
│  [Apply recommended fixes →]                            │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Remediation Actions

Each identified issue has a specific, one-click remediation. Actions are presented in the diagnostic tree and also accessible from the relevant detail pages.

### LLM Layer Remediations

| Issue | Action | What it does | API call |
|---|---|---|---|
| Circuit breaker OPEN | **Reset circuit breaker** | Forces circuit to `half-open`, allows one probe request | `POST /api/ui/v1/llm/health/reset` |
| Circuit in half-open, not recovering | **Force close circuit** | Closes circuit, resumes normal LLM traffic | `POST /api/ui/v1/llm/health/force-close` |
| Endpoint unreachable | **View endpoint config** | Opens LLM endpoint configuration for editing | Navigate to Settings > LLM Endpoints |

**Reset circuit breaker** is the most common action and should be surfaced prominently. After reset, the system automatically retries LLM requests; if they succeed, the circuit closes. If not, it reopens and the user sees fresh failure data.

### Agent Layer Remediations

| Issue | Action | What it does | API call |
|---|---|---|---|
| Agent offline | **Reconcile agent** | Sends reconcile signal; agent should re-register | `POST /api/v1/nodes/{id}/reconcile` |
| Agent offline > 10 min | **Mark as inactive + retry orphaned** | Marks offline, retries executions that were assigned to it | `POST /api/v1/nodes/{id}/deactivate` + bulk retry |
| Agent degraded (health score low) | **View agent errors** | Shows the last N consecutive errors inline | Navigate to Agent > Executions tab filtered to failures |
| Concurrency saturated | **Increase concurrency limit** | Opens inline editor for concurrency limit | `PATCH /api/v1/nodes/{id}/config` |
| Concurrency saturated | **Cancel excess queue** | Cancels queued executions beyond current capacity | Bulk cancel with confirmation |

**Reconcile** should be the first action for any offline agent. It is non-destructive — it asks the agent to re-announce itself without terminating running work. "Restart" (if available) is a separate, more destructive action that should require confirmation.

### Queue Layer Remediations

| Issue | Action | What it does |
|---|---|---|
| Queue saturated (upstream cause) | *(treat upstream issue first)* | Shown as consequence, not an action target |
| Queue saturated (no upstream cause) | **Drain queue** | Retries dispatch for all pending executions |
| Queue backed up with cancelled agents | **Bulk cancel pending** | Cancels all pending executions with confirmation dialog |
| Old queue entries (> 1h pending) | **Expire stale pending** | Marks as failed with reason `queue_timeout` |

The bulk cancel action must show a confirmation with an exact count: "This will cancel 47 queued executions. This cannot be undone." It should require a typed confirmation ("cancel 47") for counts above 20 to prevent accidental work loss — precisely the situation the motivating user story describes.

### Execution Layer Remediations

| Issue | Action | What it does | API call |
|---|---|---|---|
| Single execution stuck | **Retry execution** | Cancels current attempt, re-queues with same input | `POST /api/v1/executions/{id}/retry` |
| Single execution stuck | **Cancel execution** | Cancels cleanly, marks as cancelled | `POST /api/v1/executions/{id}/cancel` |
| Multiple executions stuck on same agent | **Retry all on this agent** | Bulk retry all stale executions assigned to one agent | Bulk retry scoped to agent |
| All stale executions | **Auto-timeout preview** | Shows when they will be auto-timed-out if no action taken | Informational |

**Retry** is always preferred over cancel. It preserves the input data and re-runs the work once the root cause is fixed. The UI should default to "Retry" and make "Cancel" a secondary option that requires an extra click.

### Action Sequencing

The "Apply recommended fixes" button in the diagnostic summary executes actions in the correct dependency order:

1. Reset LLM circuit breaker (if open)
2. Reconcile offline agents (if any)
3. Retry stale executions (after a 10-second wait to confirm agents are re-registering)

Each step shows its status inline as it executes, with a spinner for pending and a checkmark for complete.

---

## 5. Recovery Verification

After applying a fix, the UI must confirm that the system actually recovered — not just that the command was sent. Blind "action applied" toasts are insufficient.

### Verification Panel

A persistent verification panel appears after any remediation action, replacing the diagnostic tree. It shows real-time status of the specific signals that were broken.

```
┌─────────────────────────────────────────────────────────┐
│  Verifying recovery...                                  │
│                                                         │
│  ⟳ LLM circuit breaker  half-open → checking...        │
│  ⟳ Agent worker-2        offline → waiting for heartbeat│
│  ● Queue throughput       0/min → monitoring...         │
│                                                         │
│  [Cancel verification]                                  │
└─────────────────────────────────────────────────────────┘
```

Signals update in real-time as the system recovers:

```
┌─────────────────────────────────────────────────────────┐
│  Recovery status                                        │
│                                                         │
│  ✓ LLM circuit breaker  CLOSED  (recovered in 8s)      │
│  ✓ Agent worker-2        ONLINE (heartbeat received)    │
│  ✓ Queue throughput       12/min (draining)             │
│                                                         │
│  System is recovering.                                  │
│  3 retried executions are now running.                  │
│                                                         │
│  [Dismiss]  [Watch queue drain →]                       │
└─────────────────────────────────────────────────────────┘
```

### Verification Timeout

If a signal does not recover within a timeout window, the panel escalates:

- LLM circuit: 30 seconds (should recover immediately if LiteLLM is healthy)
- Agent heartbeat: 90 seconds (agent needs time to restart and re-register)
- Queue throughput: 3 minutes (allow time for dispatch to resume)

After timeout:

```
┌─────────────────────────────────────────────────────────┐
│  worker-2 did not recover within 90 seconds             │
│                                                         │
│  The agent is still offline. This usually means:        │
│  • The agent process has crashed and needs a restart    │
│  • The agent cannot reach the control plane             │
│  • The agent host is down                               │
│                                                         │
│  Last known error: connection refused :8001             │
│                                                         │
│  [View agent logs]  [Deactivate agent + retry work]     │
└─────────────────────────────────────────────────────────┘
```

This secondary escalation is important: the first-pass action (reconcile) is non-destructive. If it fails, the UI guides the user to the next level of intervention (deactivate + reassign work) rather than leaving them stranded.

---

## 6. Issue History

### Issue Log Page

A dedicated issue log (`/system/issues`) shows all detected issues with their resolution status. This addresses the "what went wrong in the past" need and enables pattern identification (e.g., "the LLM circuit opens every night at 2am").

**Schema per issue record:**

| Field | Content |
|---|---|
| ID | Auto-generated |
| Detected at | Timestamp |
| Layer | LLM / Agent / Queue / Execution |
| Severity | Critical / Degraded / Warning |
| Description | Plain-language summary |
| Affected | Count of executions / agents affected |
| Resolution | Auto-resolved / User action / Unresolved |
| Resolved at | Timestamp (if resolved) |
| TTR | Time to resolution |
| Action taken | What remediation was applied |

**Filters:** Layer, severity, time range, resolution status.

**Table view:**

```
Time        Layer    Severity   Description                         TTR      Status
2026-04-04  LLM      Critical   Circuit breaker open (28 min)       34 min   Resolved
2026-04-04  Agent    Degraded   worker-2 offline (43 min)           48 min   Resolved
2026-04-03  Queue    Degraded   Queue saturated, 63 queued          2h 12m   Resolved
2026-04-03  Exec     Warning    exec_a3f9 stale — timed out         —        Auto-resolved
```

Each row is clickable and expands to show: the full diagnostic state at detection time, the actions taken (with timestamps), and how the signals recovered.

### Issue Patterns Summary

Above the table, a summary panel shows aggregate patterns over the selected time window:

```
Last 7 days:  8 issues  |  Avg TTR: 22 min  |  Most common: LLM (5)  |  Work lost: 3 executions
```

"Work lost" counts executions that were cancelled or timed-out during issue windows without being retried. This is the metric that makes the business impact of incidents visible.

---

## 7. Integration with Other Pages

### Dashboard

The dashboard is the primary entry point for incident response. It must:

1. Show the global health bar at the top (always visible, real-time)
2. Show an alert panel with the top 5 active issues, each with a "Diagnose" link
3. Show queue throughput as a live sparkline — not a static count
4. Surface a "System recovering" state when fixes are in progress

The dashboard should not require the user to navigate to another page to understand that something is wrong. The health bar and alert panel must together answer "is my system healthy?" in under 2 seconds.

### System Health Page

The System Health page (`/system/health`) is the deep-dive destination for the diagnostics. It shows all four layers simultaneously with their current state and history.

Each layer has a section:

- **LLM** — Circuit breaker state, endpoint, failure count, last 10 errors, reset action
- **Agents** — Table of all agents with health scores, heartbeat times, concurrency bars, individual diagnose/reconcile
- **Queue** — Depth by agent, throughput trend (last 1h), drain rate
- **Executions** — Count by status, stale execution list with age and retry/cancel actions

The System Health page is linked from the health bar on every page via "View details."

### Nodes / Agents List

Each agent row in the Nodes list shows:
- Health indicator (green/yellow/red dot)
- Current concurrency: `3 / 5 running`
- A "Diagnose" button that opens the diagnostic tree pre-filtered to that agent

When an agent is in a problem state, the row should expand inline (or via a quick details panel) to show the most recent errors without requiring navigation to the agent detail page.

### Execution Detail Page

A stuck execution detail page shows a contextual warning banner at the top:

```
⚠ This execution has been running for 47 minutes. The assigned agent (worker-2) is offline.
  [Retry on available agent]  [Cancel execution]  [View agent health]
```

This surfaces the issue in context — the user doesn't need to navigate to the health page to know why their execution is stuck.

### Queue View

The queue view (live execution list) shows:
- A depth indicator at the top: `47 pending — queue is backing up`
- If throughput is zero, a banner: `No executions completing — possible agent or LLM issue [Diagnose →]`
- Per-agent pending counts inline

The queue view is diagnostic context, not a root cause page. The banner links to the diagnostic tree rather than trying to surface root cause directly from the queue view.

---

## UX Principles for This Flow

**1. Layer-first, not symptom-first.** The user sees "47 jobs stuck" as their symptom. The UI must translate this into a layer diagnosis before offering actions. Giving the user a list of actions without layer diagnosis leads to the exact scenario in the user story — restarting everything and getting nowhere.

**2. Non-destructive actions first.** The diagnostic tree always offers the safest action first (reconcile before deactivate, retry before cancel). Destructive actions require explicit confirmation with counts.

**3. Recovery is a loop, not a one-shot.** After applying a fix, the verification panel keeps the user in the diagnostic context until the signals recover. If they don't recover, escalation options appear automatically — the user is never left with a "we tried, good luck" outcome.

**4. Preserve work wherever possible.** The motivating user story ends with "I had to delete the stuck requests and lost my work." The flow must make retry the default path and cancel/delete the last resort, with explicit work-loss warnings on destructive actions.

**5. Explain consequences, not just causes.** Queue saturation is a consequence, not a root cause. Execution timeouts are consequences of upstream failures. The diagnostic tree must distinguish these clearly so users do not waste effort fixing downstream symptoms instead of root causes.
