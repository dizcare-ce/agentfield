# AgentField UI — Product Philosophy & User Journeys

## Core Philosophy

**AgentField is an AI operations control plane.** The UI exists to answer three questions, in this order:

1. **Is my system healthy right now?** (< 2 seconds to answer)
2. **What's happening right now?** (< 5 seconds to answer)
3. **What went wrong and how do I fix it?** (< 30 seconds to diagnose)

Everything else — historical analytics, identity/credentials, authorization policies — is secondary. The UI must be **operations-first, not feature-first**.

### The Kubernetes Analogy

AgentField positions itself as "Kubernetes for AI agents." The UI should follow that analogy:
- **Dashboard = `kubectl cluster-info` + health** — system-level status at a glance
- **Nodes = `kubectl get nodes`** — what's up, what's down, what's degraded
- **Executions = `kubectl get pods`** — what's running, what's pending, what's failed
- **Workflows = `kubectl get jobs`** — multi-step orchestrations
- **System Health = Kubernetes Dashboard's cluster health** — resource usage, bottlenecks, alerts

### Design Principles

1. **Operational over Analytical** — Real-time state > historical trends. The operator needs to know what's happening NOW, not what happened last week.

2. **Actionable over Informational** — Every red indicator must have a next step. "Agent offline" should offer "Restart" or "Reconcile", not just a red dot.

3. **Layered Depth** — Surface: health strip (always visible). Mid: live activity. Deep: detailed investigation. Users drill down, never start deep.

4. **System-Aware** — The UI understands the full stack: LLM endpoints → control plane → agents → executions. Problems at any layer should surface clearly.

5. **Recovery-First** — Failed/stuck states are expected in AI systems. The UI must make recovery a first-class action: retry, resume, replay, cancel, bulk cleanup.

---

## User Journeys (Priority Order)

### Journey 1: MONITOR & OBSERVE — "What's happening right now?"
**Frequency:** Constant (primary screen)
**Persona:** Operator running production agents

**Flow:**
```
Dashboard (glance at health strip)
  → System healthy? Great, check live activity feed
  → Something yellow/red? → Click alert → Diagnose (Journey 3)
  → Want details? → Live Queue view → See queued/running/stuck
```

**Information Needs:**
- LLM endpoint status (healthy/degraded/down)
- Agent count (up/down/degraded)
- Execution queue depth and throughput
- Active execution count by status
- Recent failures/alerts

**Current UI Gaps:**
- Dashboard is metrics-focused, not operations-focused
- No health strip / system status bar
- No live queue view
- LLM health not visible anywhere in UI
- Queue depth not visible

---

### Journey 2: DIAGNOSE & FIX — "Something is broken, help me understand and fix it"
**Frequency:** When things go wrong (critical path)
**Persona:** Operator whose system is stuck

**Flow:**
```
Notice problem (dashboard alert, or external signal like "my agents aren't doing anything")
  → System Health page → Which layer is broken?
    → LLM circuit open? → See failure count, endpoint, recovery ETA
    → Agent down? → See health timeline, last heartbeat, offer restart
    → Queue saturated? → See per-agent counts, offer bulk cancel
    → Execution stuck? → See stuck list, offer retry/cancel
  → Take action (restart, retry, cancel, increase limits)
  → Verify fix worked (status updates in real-time)
```

**Information Needs:**
- Root cause identification (LLM vs agent vs queue vs execution)
- Per-layer health with history (when did it break?)
- Actionable remediation for each failure mode
- Real-time feedback on actions taken

**Current UI Gaps:**
- NO system health page exists
- NO troubleshooting guidance
- Actions exist (start/stop/cancel) but aren't contextually surfaced
- No execution retry from UI
- No way to know if LLM is the bottleneck
- Agent status flickers — unclear if truly down

---

### Journey 3: DEPLOY & CONFIGURE — "Get agents running"
**Frequency:** Setup / changes
**Persona:** Developer deploying new agents

**Flow:**
```
Register agent (SDK or serverless modal)
  → See agent appear in Nodes list
  → Check agent health (status goes from starting → active)
  → View registered reasoners/skills
  → Test reasoner execution (ReasonerDetailPage)
  → Configure env vars, MCP servers
```

**Information Needs:**
- Registration confirmation with status
- Health check results during startup
- Reasoner/skill inventory
- MCP server connectivity
- Test execution capability

**Current UI Gaps:**
- Registration flow exists but no clear "getting started" guidance
- Agent startup status transitions not clearly shown
- No wizard or guided setup flow
- Configuration scattered across tabs

---

### Journey 4: REVIEW & AUDIT — "What happened?"
**Frequency:** After-the-fact review
**Persona:** Team lead, compliance, debugging past issues

**Flow:**
```
Executions page → Filter by time/status/agent
  → Click execution → See I/O, duration, errors
  → Workflow page → See DAG, execution order, timing
  → Identity → Verify credentials, audit trail
```

**Information Needs:**
- Execution history with filtering
- Input/output data inspection
- Workflow DAG visualization
- VC chain for compliance
- Error details and stack traces

**Current UI Gaps:**
- This journey is actually the best-served by current UI
- Could improve with better search/filter
- Execution detail page is over-tabbed (7 tabs, many rarely used)

---

### Journey 5: SCALE & OPERATE — "Manage capacity and configuration"
**Frequency:** Periodic
**Persona:** Platform operator

**Flow:**
```
System Health → Check capacity utilization
  → Per-agent concurrency usage
  → Queue depth trends
  → Adjust concurrency limits
  → Scale agents up/down
  → Configure webhooks/observability
  → Manage authorization policies
```

**Information Needs:**
- Capacity metrics (concurrency slots used/available)
- Queue performance (throughput, wait times)
- Configuration management
- Authorization policy management

**Current UI Gaps:**
- No capacity visibility
- No concurrency limit management UI
- Configuration is minimal (just webhook settings)

---

## Priority Matrix

| Journey | Priority | Current Coverage | Gap Size |
|---------|----------|-----------------|----------|
| Monitor & Observe | P0 | 30% (dashboard exists but wrong focus) | LARGE |
| Diagnose & Fix | P0 | 5% (almost nothing) | CRITICAL |
| Deploy & Configure | P1 | 60% (works but rough) | MEDIUM |
| Review & Audit | P2 | 80% (best covered) | SMALL |
| Scale & Operate | P1 | 15% (capacity invisible) | LARGE |

---

## Key Insight

The current UI was built feature-out (we have nodes, let's show them; we have executions, let's list them). The revamp should be built **journey-in** (operator needs to diagnose a stuck system — what screens, data, and actions enable that?).

The backend is actually more capable than the UI lets on. This is primarily a **UI/UX problem**, not a backend problem. The data and actions exist — they just need to be surfaced in the right context at the right time.
