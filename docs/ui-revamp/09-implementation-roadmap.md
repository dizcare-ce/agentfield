# UI Revamp — Implementation Roadmap

## Executive Summary

The AgentField UI has ~200+ components and covers most features, but fails at its primary job: **helping operators understand and fix their system when things go wrong.** The backend already has LLM circuit breakers, agent health monitoring, concurrency limits, and execution cleanup — the UI just doesn't surface any of it.

This roadmap prioritizes **operational visibility** over cosmetic improvements.

---

## Phase 0: Foundation (Week 1-2)
**Goal:** Technical prerequisites that unblock all subsequent phases.

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| Adopt TanStack Query (React Query) for data fetching | 3-4 days | None |
| Create reusable DataTable component (TanStack Table) | 2 days | None |
| Create reusable ConfirmDialog component | 0.5 day | None |
| Deduplicate JSON viewers → UnifiedJsonViewer only | 1 day | None |
| Delete legacy components (old Sidebar, duplicate headers/panels) | 1 day | None |
| Standardize empty/loading/error state components | 1 day | None |

**Risk:** Low. All changes are internal refactoring.
**Quick wins:** Deleting ~40 duplicate components reduces codebase noise immediately.

---

## Phase 1: System Health Dashboard (Week 2-3)
**Goal:** Operators can answer "is my system healthy?" in 2 seconds.
**Addresses:** Journey 1 (Monitor) + Journey 2 (Diagnose) — the two P0 gaps.

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| Global Health Strip (sticky bar on all pages) | 2 days | None — uses existing `/llm/health` + `/queue/status` |
| System Health page (`/health`) | 3-4 days | New: `/api/ui/v1/health/summary` (aggregates existing data) |
| LLM circuit breaker cards with recovery countdown | 1 day | None — `/llm/health` already returns state |
| Agent fleet health grid | 1 day | None — node status APIs exist |
| Queue depth + concurrency visualization | 1 day | None — `/queue/status` exists |
| Stuck execution count + bulk actions | 1 day | New: `/api/ui/v1/executions/stuck` (filter of existing query) |
| Alert/Issue banner on dashboard | 1 day | None — derives from health data |

**Backend changes needed:**
1. `GET /api/ui/v1/health/summary` — aggregate health across all layers (new, but composes existing service calls)
2. `GET /api/ui/v1/executions/stuck` — executions running > threshold with no recent update

**Risk:** Medium. New page, but data sources exist. Main risk is SSE reliability for real-time updates.

---

## Phase 2: Live Queue View (Week 3-4)
**Goal:** Operators can see what's queued, running, stuck, and take action.
**Addresses:** The exact scenario the user described — "jobs stuck, can't see queue."

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| New Queue page (`/queue`) | 3-4 days | None — uses existing execution + queue APIs |
| Status strip (Queued/Running/Waiting/Done tile counts) | 1 day | None |
| Real-time execution table with SSE updates | 2 days | None — SSE exists |
| Stuck execution highlighting (client-side detection) | 1 day | None |
| Bulk cancel/retry actions | 1 day | Cancel exists; Retry needs new endpoint |
| Pause Updates mode (buffer SSE without re-rendering) | 0.5 day | None |
| Per-agent concurrency usage display | 0.5 day | None — `/queue/status` has this |

**Backend changes needed:**
1. `POST /api/v1/executions/:id/retry` — create new execution with same input, linked to original (NEW)
2. `POST /api/ui/v1/executions/bulk-cancel` — cancel multiple executions (NEW, convenience endpoint)

**Risk:** Medium. SSE event volume in busy systems needs throttling/batching on client side.

---

## Phase 3: Node Health Redesign (Week 4-5)
**Goal:** Agent status is stable, health is visible, actions are prominent.
**Addresses:** "Node status not consistently showing up/down" + "no easy way to see if agents are doing anything."

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| Node card redesign (health score, slots, 3-layer indicators) | 2 days | None |
| Client-side status stability window (prevent flicker) | 1 day | None |
| Active execution count per node on card | 0.5 day | None — concurrency limiter has this |
| Contextual action surfacing (reconcile when degraded) | 1 day | None |
| Node detail Health tab (timeline, incident log) | 2-3 days | New: `/api/ui/v1/nodes/:id/health/history` |
| MCP health on node cards | 0.5 day | None — SSE exists |

**Backend changes needed:**
1. `GET /api/ui/v1/nodes/:id/health/history` — health score + status transitions over time (NEW)

**Risk:** Low-Medium. Status flicker fix is client-side. Health history needs a new storage table.

---

## Phase 4: Dashboard Redesign (Week 5-6)
**Goal:** Dashboard answers "what's happening?" before "what happened?"
**Addresses:** Dashboard being metrics-focused instead of operations-focused.

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| Restructure layout: Health → Activity → Analytics | 2 days | None |
| Live activity feed (SSE-driven, replacing static summary) | 2 days | None |
| Health cards with inline actions (reset circuit, reconcile) | 1 day | None — actions exist |
| Demote KPI cards and trend charts below fold | 0.5 day | None |
| Error breakdown by category (replacing heatmap) | 1 day | New: error category aggregation |
| Remove/simplify: activity heatmap, hotspot panel | 0.5 day | None |

**Backend changes needed:**
1. `GET /api/ui/v1/dashboard/errors` — error count by category over time (NEW, simple aggregation)

**Risk:** Low. Mostly reorganization of existing data and components.

---

## Phase 5: Navigation & Troubleshooting (Week 6-7)
**Goal:** Navigation matches operational workflows. Guided troubleshooting exists.

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| Sidebar restructure (Observe/Fleet/Configure/Audit) | 1-2 days | None |
| URL redirects for old paths | 0.5 day | None |
| Command palette activation (cmdk component exists) | 1-2 days | None |
| Keyboard shortcuts for navigation | 1 day | None |
| Troubleshooting modal/page | 2-3 days | None — composes existing health data |
| Issue detection rules (client-side) | 1-2 days | None |
| Recommended actions per issue type | 1 day | None |

**Backend changes needed:** None. All data sources exist.

**Risk:** Low. Navigation changes need URL redirect mapping to avoid breaking bookmarks.

---

## Phase 6: Resume & Recovery (Week 7-8)
**Goal:** Failed/stuck work can be recovered, not just deleted.

| Task | Effort | Backend Changes |
|------|--------|-----------------|
| Replay action on execution detail (re-submit same input) | 1-2 days | Minimal — create new execution from old input |
| Retry with lineage display | 2 days | NEW: retry endpoint + lineage fields |
| Bulk recovery operations | 1-2 days | NEW: bulk retry endpoint |
| Execution archive (soft-delete) | 1-2 days | NEW: archive field in DB |
| Recovery verification panel | 1 day | None |
| Workflow retry from failure point | 2-3 days | NEW: complex, needs DAG-aware retry |

**Backend changes needed:**
1. `POST /api/v1/executions/:id/retry` — if not built in Phase 2
2. Execution lineage fields (`parent_execution_id`, `retry_count`)
3. Soft-delete/archive flag on executions table
4. Workflow-level retry endpoint (most complex backend change)

**Risk:** High for workflow-level retry. Medium for everything else.

---

## Summary: Backend Changes Needed

| Endpoint/Change | Phase | Complexity | Exists Today? |
|---|---|---|---|
| `GET /api/ui/v1/health/summary` | 1 | Low (aggregation) | No |
| `GET /api/ui/v1/executions/stuck` | 1 | Low (filtered query) | No |
| `POST /api/v1/executions/:id/retry` | 2 | Medium | No |
| `POST /api/ui/v1/executions/bulk-cancel` | 2 | Low | No |
| `GET /api/ui/v1/nodes/:id/health/history` | 3 | Medium (new table) | No |
| `GET /api/ui/v1/dashboard/errors` | 4 | Low (aggregation) | No |
| Execution lineage fields | 6 | Medium (migration) | No |
| Execution soft-delete/archive | 6 | Low (migration) | No |
| Workflow retry from failure | 6 | High | No |

**Total new backend endpoints:** 6 simple + 2 medium + 1 complex = 9

---

## Quick Wins (Can ship independently, < 1 day each)

1. **Surface LLM health on dashboard** — data exists at `/llm/health`, just render it
2. **Show queue depth on dashboard** — data exists at `/queue/status`
3. **Add "Cancel" button to execution list rows** — endpoint exists
4. **Fix status flicker** — add 5-15s client-side stability window
5. **Delete ~40 duplicate components** — immediate codebase cleanup
6. **Show per-agent concurrency on node cards** — data exists in concurrency limiter
7. **Activate command palette** — cmdk component exists, just wire it up

---

## Effort Summary

| Phase | Weeks | Effort (days) | Backend Work |
|-------|-------|---------------|-------------|
| 0: Foundation | 1-2 | 8-10 | None |
| 1: System Health | 2-3 | 10-12 | 2 simple endpoints |
| 2: Live Queue | 3-4 | 8-10 | 2 endpoints (1 medium) |
| 3: Node Health | 4-5 | 7-8 | 1 endpoint + storage |
| 4: Dashboard | 5-6 | 7-8 | 1 simple endpoint |
| 5: Nav + Troubleshoot | 6-7 | 7-10 | None |
| 6: Resume & Recovery | 7-8 | 8-12 | 4 changes (1 complex) |
| **Total** | **8 weeks** | **~55-70 days** | **~10 backend changes** |

---

## Dependencies

```
Phase 0 (Foundation)
  ├── Phase 1 (System Health) ←── most impactful, do first
  │   └── Phase 4 (Dashboard) ←── uses health strip from Phase 1
  ├── Phase 2 (Live Queue) ←── second most impactful
  │   └── Phase 6 (Resume) ←── uses retry/replay from queue context
  ├── Phase 3 (Node Health) ←── parallel with Phase 2
  └── Phase 5 (Navigation) ←── can be done anytime after Phase 1
```

Phases 1, 2, 3 can be parallelized across developers.
Phase 5 (Navigation) should be done after at least Phase 1 so the new System Health page exists.
Phase 6 requires backend changes and should be last.
