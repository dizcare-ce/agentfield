# AgentField UI — Revised Product Model

## What We Learned Through Grooming

### The User
An **AI builder** constructing multi-agent systems. Not an ops person, not a compliance officer. Someone who needs to understand where intelligence is working, where it's breaking, and why.

### The Core Questions (revised)
1. **Is my agent reasoning correctly?** (not "is my system healthy?")
2. **Where in the pipeline did reasoning go wrong?** (not "what's in the queue?")
3. **What exactly went in and came out at each step?** (not "what's the execution status?")
4. **How does this run compare to the last one?** (new — diffing is critical)

### What We're Removing
- MCP management (all tabs, tools, testing)
- Authorization page (RBAC between agents — not used)
- Packages page (already gone)
- Flat execution list as a standalone page
- DID Explorer / Credentials as standalone nav items
- Activity heatmap on dashboard
- Performance tab on node detail (placeholder)

### What We're Keeping but Repositioning
- DID/VC → core differentiator, but shown in context of runs, not as standalone pages
- Agent nodes → simplified (1-2 nodes typical), merged with reasoner inventory
- Dashboard → health-first, not metrics-first

---

## The Unified Data Model

### Before (Confusing)
```
"Workflow" page  ← shows runs grouped by run_id
"Execution" page ← shows flat list of all steps across all runs (decontextualized)
"Workflow detail" ← DAG + 6 tabs
"Execution detail" ← I/O + 7 tabs
```
Two concepts, two pages, two detail views — for what is actually ONE thing.

### After (Clear)

**There is one concept: a RUN.**

```
A RUN is one top-level invocation and everything it triggered.

RUN (run_id)
├── Step 0: hunt_strategies (root)     ← each step = one reasoner execution
│   ├── Step 1: analyze_section_1
│   ├── Step 2: analyze_section_2
│   │   └── Step 3: deep_dive_clause
│   └── Step 4: analyze_section_3
│
├── Status: succeeded / failed / running
├── Duration: 45s
├── Notes: [...developer annotations...]
└── VC Chain: [cryptographic provenance for entire run]
```

A run with **1 step** = simple reasoner test (no DAG needed)
A run with **N steps** = multi-agent pipeline (trace + DAG)

### Terminology Change
| Old (Backend/Current UI) | New (User-Facing) |
|---|---|
| Workflow | **Run** |
| Execution | **Step** |
| Workflow DAG | **Run Trace** |
| workflow_id / run_id | **Run ID** |
| execution_id | **Step ID** |
| Reasoner | **Reasoner** (keep — builders know this term) |

The backend types don't need to change — this is a UI labeling change only.

---

## The Four Screens

### Screen 1: Dashboard
**Purpose:** "Is anything broken? What's happening?"

```
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM HEALTH BAR (sticky, all pages)                           │
│ [LLM: ● Healthy] [Agents: 2/2 up] [Queue: 3 running, 0 stuck] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ⚠ ISSUES (only shows when something is wrong)                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ LLM circuit OPEN on endpoint "litellm-gpt4" — 3 failures,  │ │
│ │ recovering in 25s                          [View Details]   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ LIVE RUNS                                                       │
│ ┌──────────────────────────────────────────────────────┐        │
│ │ ▶ contract_analysis  ██████████░░  3/5 steps  42s    │        │
│ │ ▶ security_scan      ████░░░░░░░░  1/8 steps  12s    │        │
│ │ ✓ risk_assessment    completed     5/5 steps  1m23s  │        │
│ └──────────────────────────────────────────────────────┘        │
│                                                                 │
│ RECENT RUNS (last 24h)                                          │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Run           │ Root Reasoner    │ Steps │ Status │ Time   │  │
│ │ r-abc         │ hunt_strategies  │ 4     │ ✗ fail │ 45s    │  │
│ │ r-def         │ clause_analyst   │ 1     │ ✓ ok   │ 3s     │  │
│ │ r-ghi         │ full_review      │ 12    │ ✓ ok   │ 2m10s  │  │
│ └────────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ANALYTICS (below fold, secondary)                               │
│ [Execution trends] [Success rate] [Agent activity]              │
└─────────────────────────────────────────────────────────────────┘
```

---

### Screen 2: Runs
**Purpose:** "Show me all my runs. Let me find, filter, compare."

This replaces BOTH the current Executions page and Workflows page.

```
┌─────────────────────────────────────────────────────────────────┐
│ RUNS                                                    [filters]│
│                                                                  │
│ Filter: [Time ▾] [Status ▾] [Reasoner ▾] [Agent ▾] [Search...] │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ □ Run ID    │ Root Reasoner    │ Steps │ Status  │ Duration  │ │
│ │──────────────────────────────────────────────────────────────│ │
│ │ □ r-abc     │ hunt_strategies  │ 4     │ ✗ failed│ 45s       │ │
│ │ □ r-def     │ clause_analyst   │ 1     │ ✓ ok    │ 3.2s      │ │
│ │ □ r-ghi     │ full_review      │ 12    │ ✓ ok    │ 2m10s     │ │
│ │ □ r-jkl     │ hunt_strategies  │ 4     │ ✓ ok    │ 38s       │ │
│ │ □ r-mno     │ risk_scorer      │ 1     │ ▶ run   │ 12s...    │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Compare Selected (2)] [Retry Selected] [Cancel Running]         │
│                                                                  │
│ When "Reasoner" filter is applied, the table shows which STEP    │
│ within each run matched, with its status highlighted.            │
│ This replaces the flat execution list — you see steps IN CONTEXT │
│ of their run, not decontextualized.                              │
└──────────────────────────────────────────────────────────────────┘
```

**The "filter replaces flat execution list" idea:**

When you filter by reasoner (e.g., `clause_analyst`), the table still shows runs, but highlights which step matched:

```
│ r-abc │ hunt_strategies │ 4 steps │ failed │ 45s │
│       │ └─ step 2: clause_analyst ✗ (8s)        │
│ r-ghi │ full_review     │ 12 steps│ ok     │ 2m  │
│       │ └─ step 7: clause_analyst ✓ (4s)        │
```

You see every invocation of `clause_analyst` but always in context of which run it belonged to.

---

### Screen 3: Run Detail
**Purpose:** "What happened in this run? Where did reasoning go wrong?"

This is the most important screen in the product. Two views: **Trace** (default) and **Graph**.

#### Trace View (Default)

```
┌─────────────────────────────────────────────────────────────────┐
│ RUN r-abc                                                       │
│ Root: hunt_strategies │ Status: ✗ failed │ 45s │ 5 steps        │
│ [Replay] [Compare ▾] [Export VC Chain]              [Trace|Graph]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ TRACE                                          STEP DETAIL       │
│                                                                  │
│ hunt_strategies  ████████████████████████  45s ✓  │              │
│ ├─ analyze_s1    ██████████               12s ✓  │              │
│ ├─ analyze_s2    ████████                  8s ✗  │ ◄── selected │
│ │  └─ deep_dive  ███                       3s ✗  │              │
│ └─ analyze_s3    ████████████             10s ✓  │              │
│                                                   │              │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│ STEP: analyze_s2 (analyze_section_2)                ✗ failed     │
│ Agent: security-agent │ Duration: 8s │ Depth: 1                  │
│                                                                  │
│ ┌─ Input ──────────────────────────────────────────────────────┐ │
│ │ {                                                            │ │
│ │   "section": "14. Indemnification",                          │ │
│ │   "focus": ["liability_caps", "carve_outs"]                  │ │
│ │ }                                                            │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Error ──────────────────────────────────────────────────────┐ │
│ │ LLM rate limit exceeded after 3 retries                      │ │
│ │ Category: llm_unavailable                                    │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Notes (1) ─────────────────────────────────────────────────┐ │
│ │ 14:23:05 "Found unusual carve-out in 14.3(b)" [discovery]   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Provenance ────────────────────────────────────────────────┐ │
│ │ VC: ● verified │ Input hash: a3f2...│ Output hash: (none)   │ │
│ │ Issuer: did:web:af-server │ Target: did:web:security-agent  │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Replay This Step] [View Full I/O]                               │
└──────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Left side = trace (always visible, shows the whole run structure)
- Right side / below = step detail (shows detail for the selected step)
- Click any step in the trace to see its detail
- Root step is pre-selected by default (shows run-level I/O)

#### Graph View (Toggle)

Same page, replace the trace pane with the ReactFlow DAG. Step detail panel remains the same. Used when the DAG topology matters (parallel branches, complex fan-out).

#### VC Chain — Integrated, Not Standalone

The VC chain maps perfectly onto the run structure because each step has its own `ExecutionVC` linked via `parent_vc_id` / `child_vc_ids`, and the whole run has a `WorkflowVC`.

Instead of a separate "Identity" page, VCs appear in two places:

**1. Per-step provenance section** (shown above) — a collapsible section showing:
- VC status (verified/unverified)
- Input hash + output hash (tamper detection)
- Issuer DID → target DID (who called whom)
- Link to download raw VC JSON

**2. Run-level VC chain** — accessible via `[Export VC Chain]` button:
```
┌─ VC Chain for Run r-abc ──────────────────────────────────────┐
│                                                                │
│ WorkflowVC: wvc-xyz                                            │
│ Status: ● complete │ 5 component VCs │ All verified            │
│                                                                │
│ ┌─ hunt_strategies ──── vc-001 ✓ ─────────────────────────┐   │
│ │  Issuer: did:web:af    Target: did:web:sec-agent         │   │
│ │  Input: a3f2...        Output: 8b1c...                   │   │
│ ├─ analyze_s1 ────────── vc-002 ✓ ─────────────────────────┤   │
│ │  Caller: did:web:sec   Target: did:web:sec               │   │
│ ├─ analyze_s2 ────────── vc-003 ✗ (no output) ────────────┤   │
│ │  Caller: did:web:sec   Target: did:web:sec               │   │
│ ├─ deep_dive ─────────── vc-004 ✗ (no output) ────────────┤   │
│ └─ analyze_s3 ────────── vc-005 ✓ ─────────────────────────┘   │
│                                                                │
│ [Download Full Chain (JSON)] [Verify All]                      │
└────────────────────────────────────────────────────────────────┘
```

This replaces the standalone DID Explorer and Credentials pages. The VC chain is **contextualized within the run** where it matters, not in an isolated page where you're browsing disconnected credentials.

#### Single-Step Run (Simplified)

When a run has exactly 1 step, no trace/DAG is needed:

```
┌─────────────────────────────────────────────────────────────────┐
│ RUN r-def                                                       │
│ Reasoner: clause_analyst │ Status: ✓ succeeded │ 3.2s           │
│ [Replay] [Compare ▾]                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─ Input ──────────────────────────────────────────────────────┐ │
│ │ { "clause": "Section 14.3(b)", "type": "indemnification" }   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Output ─────────────────────────────────────────────────────┐ │
│ │ { "risk_level": "high", "findings": [...], "confidence": 0.9}│ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Notes (0) ─────────────────────────────────────────────────┐ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Provenance ────────────────────────────────────────────────┐ │
│ │ VC: ● verified │ Input: a3f2... │ Output: 7c4d...           │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Clean. No tabs, no sidebar, no DAG for a single reasoner call.

---

### Screen 4: Playground
**Purpose:** "Test my reasoner with custom input."

This evolves from the current Reasoner Detail page.

```
┌─────────────────────────────────────────────────────────────────┐
│ PLAYGROUND: clause_analyst                                       │
│ Agent: security-agent │ Status: ● online                         │
│ Schema: ClauseInput → ClauseOutput                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ INPUT                              │ RESULT                      │
│ ┌────────────────────────────────┐ │                              │
│ │ {                              │ │ (waiting for execution...)   │
│ │   "clause": "",                │ │                              │
│ │   "type": ""                   │ │ or after execution:          │
│ │ }                              │ │                              │
│ │                                │ │ ┌──────────────────────────┐ │
│ │ [Load from previous run ▾]     │ │ │ { "risk_level": "high" } │ │
│ │                                │ │ └──────────────────────────┘ │
│ └────────────────────────────────┘ │ Duration: 3.2s               │
│                                    │ [View as Run →]              │
│ [Execute]                          │ [Compare with... ▾]          │
│                                    │                              │
├────────────────────────────────────┴──────────────────────────────┤
│ RECENT RUNS OF THIS REASONER                                     │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ r-def │ 3.2s │ ✓ ok   │ "Section 14.3(b)" → risk: high     │ │
│ │ r-xyz │ 4.1s │ ✓ ok   │ "Section 8.2"     → risk: low      │ │
│ │ r-abc │ 8.0s │ ✗ fail │ "Section 14"      → rate limit     │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ [Load input from r-def] [Compare r-def vs r-xyz]                 │
└──────────────────────────────────────────────────────────────────┘
```

**Key features:**
- **"Load from previous run"** — populate input from any past run's input
- **"View as Run →"** — after executing, link directly to the run detail page
- **Recent runs table** — scoped to this reasoner only, with inline I/O preview
- **Compare** — select two runs from the table to diff
- Long-running executions: show a "Running... (12s)" indicator with a link to the run detail where you can watch it via SSE

---

### Screen 5: Agents (Simplified)
**Purpose:** "What agents and reasoners does my system have? Are they healthy?"

Since most deployments have 1-2 nodes, this is a compact inventory + health page, not a fleet management dashboard.

```
┌─────────────────────────────────────────────────────────────────┐
│ AGENTS                                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ security-agent                    ● active │ health: 95          │
│ ├── hunt_strategies     [Playground →]                           │
│ ├── clause_analyst      [Playground →]                           │
│ ├── risk_scorer         [Playground →]                           │
│ └── deep_dive_analyst   [Playground →]                           │
│     Last heartbeat: 2s ago │ Executions: 3 running, 2/10 slots  │
│     [View Config] [Restart]                                      │
│                                                                  │
│ research-agent                    ● active │ health: 100         │
│ ├── literature_search   [Playground →]                           │
│ └── summarizer          [Playground →]                           │
│     Last heartbeat: 1s ago │ Executions: 0 running, 0/10 slots  │
│     [View Config] [Restart]                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

For 1-2 nodes, this fits on one screen. Each reasoner links directly to its playground. Agent health, concurrency slots, and actions are visible without clicking into a detail page.

---

### Screen 6: Settings
**Purpose:** Configuration, Identity setup, system tuning.

```
Settings
├── General (future: concurrency limits, timeouts)
├── Observability (webhooks, forwarder status, DLQ)
├── Identity & Trust
│   ├── DID Configuration (enable/disable, key rotation)
│   ├── Issuer Public Keys
│   └── Export All Credentials
└── About (version, server DID, health endpoints)
```

DID/VC configuration moves here. The *output* of the identity system (VC chains per run) stays in the Run Detail page where it's contextually useful.

---

## Run Comparison (Diff View)

Accessible from: Runs page (select 2, click Compare) or Run Detail (Compare button).

```
┌─────────────────────────────────────────────────────────────────┐
│ COMPARE: r-abc vs r-jkl                                         │
│ Same root: hunt_strategies │ 2 hours apart                       │
├────────────────────────────┬────────────────────────────────────┤
│ r-abc (older)              │ r-jkl (newer)                      │
├────────────────────────────┼────────────────────────────────────┤
│ Status: ✗ failed           │ Status: ✓ succeeded                │
│ Duration: 45s              │ Duration: 38s (-15%)               │
│ Steps: 4 (1 failed)       │ Steps: 4 (all ok)                  │
├────────────────────────────┼────────────────────────────────────┤
│                                                                  │
│ STEP COMPARISON                                                  │
│                                                                  │
│ hunt_strategies  ✓ / ✓     │ identical                           │
│ analyze_s1       ✓ / ✓     │ output differs (click to diff)      │
│ analyze_s2       ✗ / ✓     │ ◄── DIVERGENCE POINT               │
│   └─ deep_dive   ✗ / ✓     │                                    │
│ analyze_s3       ✓ / ✓     │ identical                           │
│                                                                  │
│ ┌─ analyze_s2 OUTPUT DIFF ─────────────────────────────────────┐ │
│ │ LEFT (r-abc):  ERROR: "LLM rate limit exceeded"              │ │
│ │ RIGHT (r-jkl): {"findings": [...], "risk": "high"}           │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

This requires NO backend changes — input/output payloads are already stored per execution. The diff is computed client-side.

---

## Navigation

```
Sidebar:
  Dashboard          ← health + live runs + recent activity
  Runs               ← all runs, filterable (replaces Executions + Workflows)
  Agents             ← inventory + health (replaces Nodes + Reasoners)
  Playground         ← quick access to test any reasoner
  ──────
  Settings           ← webhooks, identity config, system tuning
```

Five items. Down from the current 8+ with subsections. Every item maps to a clear user intent.

---

## What's NOT in this model (intentional omissions)

| Feature | Why Excluded |
|---|---|
| Flat execution list | Steps are always shown in context of their run |
| DID Explorer page | VC data shown in run detail's provenance section |
| Credentials page | Export moved to Settings > Identity |
| Authorization page | Agent RBAC — not used |
| MCP management | Removed per user feedback |
| Activity heatmap | Analytics, not debugging |
| Performance tab on nodes | Was a placeholder |
| Separate workflow detail vs execution detail | Unified into Run Detail |
| 7 tabs on execution detail | Replaced by run detail with trace + inline sections |

---

## Data Pipeline Enhancement (SDK → Control Plane)

The SDK already computes tokens, cost, and model name for every `.ai()` call but throws it away. To unlock the full debugging vision (especially "why did this step cost so much?" and "what model was used?"), we should eventually add optional telemetry:

| Data | SDK Has It | Priority to Send |
|---|---|---|
| Token usage (prompt/completion/total) | Yes | P1 — most useful for debugging |
| Cost per call (USD) | Yes | P1 — enables cost dashboard |
| Model name | Yes | P1 — "was this using GPT-4 or GPT-3.5?" |
| Raw LLM prompt | Yes | P2 — opt-in, privacy concerns |
| Harness trace (messages) | Yes | P2 — rich but large |
| Tool call trace | Yes | P2 — useful for harness debugging |

This is a separate workstream from the UI revamp but would dramatically increase the UI's value.

---

## Implementation Priority

| Phase | What | Why First |
|---|---|---|
| 1 | **Run Detail page** (trace view + step detail + provenance) | The #1 screen for the #1 user journey (debugging intelligence) |
| 2 | **Runs page** (replaces Executions + Workflows) | The entry point to finding runs |
| 3 | **Dashboard** (health strip + live runs + issues) | "Is anything broken?" at a glance |
| 4 | **Playground** (evolve reasoner detail page) | Testing + development workflow |
| 5 | **Agents page** (simplified inventory + health) | Replaces Nodes + Reasoners |
| 6 | **Comparison view** | Diffing runs — high value, needs runs page first |
| 7 | **Settings** (absorb identity, webhooks, config) | Cleanup, low urgency |
| 8 | **SDK telemetry** (tokens, cost, model) | Unlocks next level of debugging |
