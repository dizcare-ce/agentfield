# AgentField Demo Mode — Design Specification

> **Goal**: Show builders that AgentField is the control plane for embedding intelligence inside software — not chatbots, but backend AI workflows triggered by services, orchestrating hundreds of agents at scale.

> **Target audience**: Developers and technical builders evaluating AgentField for production AI infrastructure.

---

## 1. Entry Points

| Trigger | Behavior |
|---------|----------|
| **First launch** (no agents registered, no runs) | Auto-prompt: "See AgentField in action? Pick your industry." |
| **Command palette** (`Cmd+K` → "Demo Mode") | Toggle demo mode from anywhere |
| **Keyboard shortcut** (`Cmd+Shift+D`) | Direct toggle |
| **URL param** (`?demo=true`) | Activate on load (website embed ready) |
| **ENV var** (`VITE_DEMO_MODE=true`) | Force demo mode (for hosted demos) |

Detection logic: `isDemoMode = urlParam || envVar || localStorage.get('af-demo') || (noAgents && noRuns && firstVisit)`

---

## 2. Vertical Selection (Act 0)

On first demo entry, a centered modal (shadcn `Dialog`) offers:

```
What are you building?

[ Healthcare & Life Sciences ]   [ Financial Services ]   [ SaaS Platform ]
    Clinical pipelines              Risk & compliance        Backend intelligence
    that reason over                that monitor, score,     that powers product
    patient data                    and audit in real-time   features at scale
```

Each vertical populates the demo with domain-specific:
- Agent names and reasoner names
- Workflow structures (DAG topologies)
- Input/output data shapes
- Policy/authorization examples
- Log content and error messages

Selection saved to `localStorage`. Can be changed via Command Palette ("Switch Demo Vertical").

---

## 3. Vertical Scenarios

### 3a. Healthcare & Life Sciences

**Agent Nodes (4):**
| Agent Node | Reasoners | Role |
|------------|-----------|------|
| `intake-service` | `triage-classifier`, `urgency-scorer` | Ingest patient data, classify, score urgency |
| `clinical-reasoning` | `differential-dx`, `evidence-gatherer`, `contraindication-checker` | Core clinical decision support |
| `compliance-gateway` | `hipaa-validator`, `audit-trail-signer`, `consent-verifier` | Regulatory compliance layer |
| `notification-router` | `care-team-notifier`, `ehr-sync`, `escalation-handler` | Route decisions to downstream systems |

**Hero Run (50 nodes) — "Patient Intake Decision Support":**
```
triage-classifier
  ├→ urgency-scorer
  │    └→ differential-dx (fan-out to 5 parallel hypothesis checks)
  │         ├→ evidence-gatherer[cardiac]
  │         ├→ evidence-gatherer[pulmonary]
  │         ├→ evidence-gatherer[gi]
  │         ├→ evidence-gatherer[neuro]
  │         └→ evidence-gatherer[metabolic]
  │              └→ contraindication-checker (per hypothesis, 5x)
  │                   └→ hipaa-validator
  │                        └→ audit-trail-signer
  │                             └→ care-team-notifier
  ├→ consent-verifier
  └→ ehr-sync
```
Multiple depths. ~50 nodes total with parallel fan-outs and cross-agent-node calls.

**Monster Run (200+ steps):**
Batch patient intake — 20 patients processed through the same pipeline in parallel. Shows the scale story: 200+ trace steps, all completing over ~45 seconds.

**Policies:**
- `hipaa-data-scope`: Only `compliance-gateway` can access PHI fields
- `clinical-write-access`: Only `clinical-reasoning` can invoke `differential-dx`
- `audit-mandatory`: All terminal nodes must call `audit-trail-signer`

---

### 3b. Financial Services

**Agent Nodes (4):**
| Agent Node | Reasoners | Role |
|------------|-----------|------|
| `transaction-monitor` | `tx-ingester`, `pattern-detector`, `velocity-checker` | Real-time transaction analysis |
| `risk-engine` | `risk-scorer`, `fraud-classifier`, `sanctions-screener`, `aml-analyzer` | Multi-dimensional risk assessment |
| `decision-gateway` | `threshold-evaluator`, `escalation-router`, `auto-approver` | Automated decision + human-in-the-loop routing |
| `compliance-ledger` | `vc-signer`, `regulatory-reporter`, `audit-archiver` | Cryptographic audit + regulatory reporting |

**Hero Run (50 nodes) — "Real-Time Transaction Risk Assessment":**
```
tx-ingester
  ├→ pattern-detector
  │    ├→ velocity-checker
  │    └→ risk-scorer (parallel dimensions)
  │         ├→ fraud-classifier[behavioral]
  │         ├→ fraud-classifier[network]
  │         ├→ fraud-classifier[device]
  │         ├→ sanctions-screener
  │         └→ aml-analyzer
  │              └→ threshold-evaluator
  │                   ├→ auto-approver (low risk path)
  │                   └→ escalation-router (high risk path)
  │                        └→ regulatory-reporter
  └→ vc-signer
       └→ audit-archiver
```

**Monster Run (200+ steps):**
Batch processing of 30 transactions in a single compliance sweep. Shows parallel risk assessment across multiple transaction types.

**Policies:**
- `pii-boundary`: `transaction-monitor` cannot forward raw card numbers to `risk-engine` — only tokenized references
- `approval-authority`: Only `decision-gateway` reasoners can issue `approve` or `decline`
- `sanctions-mandatory`: All transactions > $10k must route through `sanctions-screener`

---

### 3c. SaaS Platform

**Agent Nodes (5):**
| Agent Node | Reasoners | Role |
|------------|-----------|------|
| `api-gateway-intel` | `request-classifier`, `intent-detector`, `rate-limit-advisor` | Intelligent API layer |
| `content-pipeline` | `content-analyzer`, `toxicity-filter`, `pii-redactor`, `summarizer` | Content processing at scale |
| `recommendation-engine` | `user-profiler`, `candidate-ranker`, `diversity-enforcer`, `a-b-router` | ML-powered recommendations |
| `ops-automation` | `alert-triager`, `root-cause-analyzer`, `runbook-executor`, `incident-summarizer` | Self-healing infrastructure |
| `billing-intelligence` | `usage-analyzer`, `churn-predictor`, `upsell-scorer` | Revenue intelligence |

**Hero Run (50 nodes) — "Intelligent Incident Response Pipeline":**
```
alert-triager
  ├→ root-cause-analyzer
  │    ├→ request-classifier (analyze affected traffic patterns)
  │    ├→ content-analyzer (check for content-related triggers)
  │    └→ usage-analyzer (correlate with usage spikes)
  │         └→ runbook-executor (fan-out to 5 parallel remediation steps)
  │              ├→ runbook-executor[scale-up]
  │              ├→ runbook-executor[cache-flush]
  │              ├→ runbook-executor[circuit-break]
  │              ├→ runbook-executor[rollback-deploy]
  │              └→ runbook-executor[dns-failover]
  │                   └→ incident-summarizer
  │                        └→ churn-predictor (impact assessment)
  ├→ pii-redactor (scrub logs before analysis)
  └→ a-b-router (route affected users to stable variant)
```

**Monster Run (200+ steps):**
Content moderation pipeline processing 50 user submissions in parallel — each goes through toxicity filter, PII redaction, summarization, and recommendation re-ranking.

**Policies:**
- `pii-firewall`: `content-pipeline` agents must call `pii-redactor` before any data leaves the node
- `model-access`: Only `recommendation-engine` can invoke ML model endpoints
- `ops-blast-radius`: `runbook-executor` is limited to max 3 concurrent remediation actions
- `billing-read-only`: `billing-intelligence` has read-only access to transaction data

---

## 4. Interaction Model — Three Acts

### Act 0: Vertical Selection (5 seconds)

Centered `Dialog`. Three cards. User picks one. Stored in `localStorage('af-demo-vertical')`.

If URL param `?demo=healthcare` / `?demo=finance` / `?demo=saas`, skip this step.

### Act 1: Guided Discovery (60-90 seconds)

A floating card (bottom-right, shadcn `Card` with `framer-motion` entrance) tells a story. Cards advance ONLY when the user takes the suggested action (click, navigate). No auto-advance, no timers.

**Beat sequence:**

| # | Card text (approx) | Action to advance | What they see |
|---|--------------------|--------------------|---------------|
| 1 | "A {vertical-specific} pipeline with 47 agents just completed in 12.3s. See what happened." | Click "View Run →" | Navigates to hero run detail |
| 2 | "This is the execution graph — {N} agents across {M} nodes worked together. Click any node." | Click a node in the DAG | Node detail sidebar opens, shows input/output |
| 3 | "Switch to the Trace tab to see every step in execution order — with live logs." | Click "Trace" tab | Trace tree visible, in-progress run's logs streaming |
| 4 | "A second run is failing. Compare them side-by-side to see where they diverge." | Click "Compare with failing run →" | Navigates to `/runs/compare?a=hero&b=failed` |
| 5 | "The divergence happened at a policy gate. See what policies control agent access." | Click "View Policies →" | Navigates to `/access` |
| 6 | "Tags control which agents can call which reasoners. This is how you build guardrails." | Interact with any policy rule | Policy detail expands |
| 7 | "Every execution is cryptographically signed. Verify the audit trail." | Click "Verify Provenance →" | Navigates to `/verify` or run's provenance tab |
| 8 | Transition card: "That's the highlights. The demo is yours to explore — 100+ runs, 4 agent nodes, live data streaming." | Click "Explore →" | Storyline ends, pill mode begins |

Each beat card has:
- A dismiss button (×) to skip the storyline entirely → jump to Act 2
- A "Skip tour" link → jump to Act 2
- Subtle entrance animation (slide up + fade, spring physics)

### Act 2: Free Exploration with Hotspots

The storyline card transforms into a small floating pill (top-right): `Demo Mode: {Vertical}`.

**Hotspots** appear as pulsing rings on sidebar items and page elements the user hasn't visited yet:
- Dashboard (if not visited)
- Agents page (if not visited)
- Playground (if not visited)
- Settings (if not visited)

Hotspots are:
- A `2px` ring with `animate-ping` (Tailwind) in `primary/30` color
- Disappear permanently once the user visits that page
- Non-blocking — purely visual, no tooltip unless hovered

On hover, a tiny shadcn `Tooltip` shows a one-liner: "See agent health across 4 nodes" / "Fire a reasoner directly" / etc.

### Act 3: Living Showroom (Permanent)

The demo data stays alive:
- One run is always "in progress" — its DAG gradually expands (new node every 2-3s), trace steps appear, logs stream
- The in-progress run "completes" after ~60 seconds, then a new one starts ~30 seconds later
- Dashboard metrics update in real-time
- Agent heartbeats show recent timestamps

This continues indefinitely until demo mode is exited.

---

## 5. Mock Data Inventory

### Runs (100+ total)

| Category | Count | Details |
|----------|-------|---------|
| Hero run | 1 | 50 nodes, multi-agent-node, succeeded, 12.3s |
| Monster run | 1 | 200+ steps, batch processing, succeeded, 47.2s |
| Failed run | 3 | Various failure points (policy denial, timeout, reasoner error) |
| In-progress run | 1 | Actively expanding DAG + streaming logs |
| Succeeded (recent) | 40 | Last 24 hours, varied durations (0.5s–15s) |
| Succeeded (older) | 45 | Last 7 days, varied topologies |
| Timeout | 3 | Long-running that exceeded deadline |
| Cancelled | 2 | User-cancelled mid-execution |

**Distribution of agent-node participation:**
- ~30% of runs: single agent node (simple workflows)
- ~45% of runs: 2 agent nodes working together
- ~25% of runs: 3-4 agent nodes (complex multi-node workflows)

### Agent Nodes

Per vertical: 4-5 agent nodes, each with 2-5 reasoners. Total ~15 reasoners.

All agents show as `lifecycle_status: "ready"` with recent heartbeats (last 5-30 seconds).

### Access Policies

Per vertical: 3-4 policies demonstrating different rule patterns:
- Tag-based authorization (which tags can call which reasoners)
- Data boundary policies (what data can cross node boundaries)
- Mandatory routing (certain reasoners must be invoked in certain workflows)

### Streaming Data

**Log lines** (for in-progress run):
- Emitted every 300-500ms (randomized for natural feel)
- Format matches real execution logs: timestamp, level, agent_node, reasoner, message
- Content is vertical-specific (e.g., healthcare: "Evaluating differential hypothesis: cardiac arrhythmia")
- Mix of INFO (80%), DEBUG (15%), WARN (5%)

**DAG expansion** (for in-progress run):
- New node appears every 2-3 seconds
- Status transitions: `pending` → `running` → `succeeded` (or `failed` for one branch)
- Edge animations show data flowing between nodes

**Trace updates** (for in-progress run):
- New steps appear in the trace tree matching DAG expansion
- Duration counters tick up for `running` steps
- Completed steps snap to final duration

---

## 6. Architecture

### File Structure

```
src/demo/
  ├── DemoModeContext.tsx          # Core provider: state machine, vertical, act tracking
  ├── DemoVerticalPicker.tsx       # Act 0: industry selection dialog
  ├── DemoStoryline.tsx            # Act 1: floating narrative cards
  ├── DemoHotspot.tsx              # Act 2: pulsing ring component
  ├── DemoPill.tsx                 # Act 2+3: floating "Demo Mode" indicator
  ├── DemoExitBanner.tsx           # Exit state: "This is demo data" banner
  │
  ├── hooks/
  │   ├── useDemoMode.ts           # Hook to read demo state from context
  │   ├── useDemoStream.ts         # Streaming log/event simulation engine
  │   ├── useDemoDAG.ts            # Gradually expanding DAG state
  │   └── useDemoVisited.ts        # Track which pages user has seen (for hotspots)
  │
  ├── mock/
  │   ├── types.ts                 # Vertical config type, scenario type
  │   ├── interceptor.ts           # fetch() wrapper: intercept API calls, return mock data
  │   ├── generators.ts            # Functions that create realistic mock entities
  │   ├── scenarios/
  │   │   ├── healthcare.ts        # Healthcare vertical: agents, runs, policies, logs
  │   │   ├── finance.ts           # Finance vertical
  │   │   └── saas.ts              # SaaS vertical
  │   └── shared.ts                # Shared mock utilities (ID generation, timestamps, etc.)
  │
  └── constants.ts                 # Timing constants, storyline beat definitions
```

### Context Provider

```tsx
interface DemoState {
  active: boolean;
  vertical: 'healthcare' | 'finance' | 'saas' | null;
  act: 0 | 1 | 2 | 3;           // Which phase of the experience
  storyBeat: number;              // Current beat in Act 1 (0-7)
  visitedPages: Set<string>;      // For hotspot dismissal
  inProgressRunId: string;        // The run that's "currently executing"
}
```

Wrapped at the same level as `ModeProvider` in `App.tsx`. When `active`, query hooks check `isDemoMode` and return mock data instead of calling the API.

### Mock Data Interception Strategy

**Option A: Hook-level interception (recommended)**

Each React Query hook (e.g., `useRuns`, `useRunDAG`, `useAgents`) checks `isDemoMode` from context. If true, returns mock data directly — no fetch at all.

```tsx
// In hooks/queries.ts (simplified)
export function useRuns() {
  const { isDemoMode, vertical } = useDemoMode();
  
  return useQuery({
    queryKey: ['runs', isDemoMode ? 'demo' : 'live'],
    queryFn: isDemoMode 
      ? () => getDemoRuns(vertical) 
      : () => fetchRuns(),
    // Demo data never goes stale
    ...(isDemoMode && { staleTime: Infinity }),
  });
}
```

**Why hook-level over fetch interception:**
- Type-safe: mock functions return the exact TypeScript types the UI expects
- No URL matching/regex fragility
- Easy to test each mock in isolation
- SSE streaming mocks integrate naturally (separate concern from fetch)

### New Dependency

**`motion` (framer-motion v11+)** — ~15kb gzipped

Used for:
- Storyline card entrance/exit (`AnimatePresence` + `motion.div`)
- Hotspot ring animation (spring-based pulse, more organic than CSS)
- DAG node status transitions (color interpolation)
- Pill expand/collapse

No other new dependencies. Everything else uses existing shadcn + Tailwind + Radix.

---

## 7. Exit Experience

### While in demo mode

The `DemoPill` (floating indicator) has a dropdown:
- **Switch vertical** → reopens vertical picker
- **Restart tour** → resets to Act 1, beat 0
- **Exit demo** → transitions to exit state

### Exit state

A full-width banner (shadcn `Alert`, `variant="default"`) at the top of every page:

```
You're viewing demo data from the {Vertical} scenario.
[Connect your agents]  [Back to demo]  [Dismiss]
```

- **Connect your agents** → navigates to empty dashboard with "Get Started" instructions
- **Back to demo** → reactivates demo mode (same vertical, Act 2)
- **Dismiss** → removes banner, shows clean empty state

On dismiss, a toast: "You can always return to the demo via Cmd+K → 'Demo Mode'"

### Persistence

- `localStorage('af-demo-active')`: boolean
- `localStorage('af-demo-vertical')`: string
- `localStorage('af-demo-visited')`: JSON array of visited page paths
- `localStorage('af-demo-storyline-beat')`: number (resume storyline if interrupted)

---

## 8. Website Embed Considerations

The demo mode is designed to be embeddable:

- **All data is client-side** — no backend required
- **URL param activation** — `?demo=true&vertical=saas` activates with specific vertical
- **No auth required** — when `isDemoMode`, `AuthGuard` passes through
- **Base path agnostic** — works with any `VITE_BASE_PATH`
- **Isolated state** — demo localStorage keys are prefixed `af-demo-*`

For website embed, either:
1. `<iframe src="https://app.agentfield.ai/ui/?demo=true&vertical=saas">` 
2. Standalone build with `VITE_DEMO_MODE=true` (strips auth, always demo)

---

## 9. Component Specifications

### DemoHotspot

```tsx
// Wraps any element with a pulsing attention ring
<DemoHotspot id="sidebar-agents" hint="See agent health across 4 nodes">
  <SidebarItem label="Agents" />
</DemoHotspot>
```

- Renders a `motion.div` with spring-animated ring
- Ring color: `hsl(var(--primary) / 0.3)` 
- Disappears after the wrapped element's page is visited
- Only renders when `act >= 2` and page not in `visitedPages`

### DemoStoryline

- Fixed position bottom-right, `z-50`
- shadcn `Card` with max-width 380px
- Progress dots at bottom (current beat highlighted)
- Dismiss (×) and "Skip tour" always visible
- `AnimatePresence` for smooth card transitions between beats

### DemoPill

- Fixed position top-right, `z-40`
- shadcn `Badge` with dropdown on click
- Shows vertical icon + "Demo Mode"
- Subtle, doesn't compete with the app content

### DemoVerticalPicker

- shadcn `Dialog` (centered modal)
- Three `Card` components in a row, hover effect, click to select
- Each card: icon + title + one-line description
- No close button on first launch (must pick). Has close button when switching.

---

## 10. Storyline Log Examples (per vertical)

### Healthcare
```
[INFO]  intake-service/triage-classifier    Received patient intake form — age: 67, chief complaint: chest pain
[INFO]  intake-service/urgency-scorer       Urgency score: 0.89 (HIGH) — cardiac history flagged
[INFO]  clinical-reasoning/differential-dx  Spawning 5 parallel evidence gatherers for hypothesis evaluation
[DEBUG] clinical-reasoning/evidence-gatherer[cardiac]  Querying clinical knowledge base: "acute coronary syndrome indicators"
[INFO]  clinical-reasoning/evidence-gatherer[cardiac]  3 supporting indicators found, confidence: 0.82
[WARN]  clinical-reasoning/contraindication-checker    Contraindication detected: patient on warfarin — flagging for review
[INFO]  compliance-gateway/hipaa-validator   PHI access audit logged — accessor: differential-dx, justification: active-triage
[INFO]  compliance-gateway/audit-trail-signer  Signing execution VC — DID: did:agentfield:compliance-gateway
[INFO]  notification-router/care-team-notifier  Routing to cardiology on-call: Dr. Chen — priority: URGENT
```

### Finance
```
[INFO]  transaction-monitor/tx-ingester     Processing transaction TX-8827441 — $47,200 wire transfer
[INFO]  transaction-monitor/pattern-detector Behavioral pattern match: unusual destination country (score: 0.71)
[DEBUG] transaction-monitor/velocity-checker 3 transactions in 15 minutes from same originator — velocity flag
[INFO]  risk-engine/risk-scorer             Composite risk score: 0.78 — ELEVATED
[INFO]  risk-engine/fraud-classifier[behavioral]  Behavioral anomaly: 2.3σ from historical pattern
[INFO]  risk-engine/sanctions-screener      Screening against OFAC/EU/UN lists — no match
[INFO]  risk-engine/aml-analyzer            AML typology match: layering pattern (confidence: 0.45 — below threshold)
[INFO]  decision-gateway/threshold-evaluator Risk 0.78 > auto-approve threshold 0.65 — routing to manual review
[WARN]  decision-gateway/escalation-router  Escalating to compliance team — reason: elevated risk + velocity flags
[INFO]  compliance-ledger/vc-signer         Signing decision VC — immutable audit record created
```

### SaaS
```
[INFO]  ops-automation/alert-triager        PagerDuty alert received: API latency p99 > 2000ms (threshold: 500ms)
[INFO]  ops-automation/root-cause-analyzer  Correlating with 3 data sources: metrics, deploy log, error rates
[DEBUG] api-gateway-intel/request-classifier Analyzing traffic pattern: 73% requests hitting /api/v2/recommendations
[INFO]  content-pipeline/content-analyzer   Content processing queue depth: 847 (normal: ~50) — likely bottleneck
[INFO]  billing-intelligence/usage-analyzer Usage spike detected: 12x normal for tenant acme-corp (plan: enterprise)
[INFO]  ops-automation/root-cause-analyzer  Root cause identified: recommendation model cold-start after deploy v2.14.3
[INFO]  ops-automation/runbook-executor[cache-flush]  Flushing recommendation cache — ETA: 8s
[INFO]  ops-automation/runbook-executor[scale-up]     Scaling recommendation-engine replicas: 3 → 8
[WARN]  ops-automation/runbook-executor[rollback-deploy]  Deploy rollback initiated: v2.14.3 → v2.14.2
[INFO]  ops-automation/incident-summarizer  Incident summary generated — MTTR: 43s, affected tenants: 3, revenue impact: $0 (within SLA)
[INFO]  billing-intelligence/churn-predictor Impact assessment: churn risk delta +0.02 for acme-corp — within tolerance
```

---

## 11. Implementation Priority

| Phase | Scope | Estimate |
|-------|-------|----------|
| **P0** | `DemoModeContext` + mock data interceptor + one vertical (SaaS) | Foundation |
| **P1** | Storyline (Act 1) + hero run mock data + streaming logs | The "wow" |
| **P2** | All three verticals + monster run + 100 runs | Scale story |
| **P3** | Hotspots (Act 2) + pill + exit experience | Polish |
| **P4** | Vertical picker (Act 0) + resume/persistence | Complete |
| **P5** | Website embed mode + standalone build config | Distribution |

---

*This spec is a living document. Update as decisions are made during implementation.*
