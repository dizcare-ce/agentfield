# Feature Gap Audit: Old UI vs New UI

**Audit date:** 2026-04-04
**Auditor:** Research pass over all page source files
**Purpose:** Identify features present in the old AgentField UI that are missing or degraded in the new UI, so they can be triaged before launch.

---

## Navigation / Routing: What Changed

The new `App.tsx` router maps old routes to new pages. These are the *active* routes:

| New Route | New Page | Old Route(s) Redirected Here |
|-----------|----------|------------------------------|
| `/dashboard` | `NewDashboardPage` | — |
| `/agents` | `AgentsPage` | `/nodes`, `/nodes/:nodeId`, `/reasoners/all` |
| `/runs` | `RunsPage` | `/executions`, `/workflows` |
| `/runs/:runId` | `RunDetailPage` | `/executions/:id`, `/workflows/:id` |
| `/playground` | `PlaygroundPage` | `/reasoners/:id` |
| `/settings` | `NewSettingsPage` | `/identity/dids`, `/identity/credentials`, `/authorization`, `/packages` |

Old pages still exist in the codebase but are **no longer routed to**:
- `NodesPage` (replaced by `AgentsPage`)
- `NodeDetailPage` (no replacement; just redirected to `/agents`)
- `AllReasonersPage` (no replacement; just redirected to `/agents`)
- `ReasonerDetailPage` (replaced by `PlaygroundPage`)
- `ExecutionsPage` (replaced by `RunsPage`)
- `EnhancedExecutionDetailPage` (no replacement in new router)
- `EnhancedWorkflowDetailPage` (no replacement in new router)
- `WorkflowDetailPage` (no replacement in new router)
- `WorkflowsPage` (no replacement in new router)
- `EnhancedDashboardPage` (available at `/dashboard/legacy` only)

---

## Feature Gap Table

| # | Feature | Old Page(s) | New Page | Status | Priority | Notes |
|---|---------|-------------|----------|--------|----------|-------|
| 1 | **cURL command copy** | `ReasonerDetailPage` (Copy cURL button, generates curl with current form input) | `PlaygroundPage` | MISSING | P0 | A core developer workflow. Builder pastes curl into terminal to test agents from CLI. New Playground has no curl copy. |
| 2 | **Async execution + execution ID return** | `ReasonerDetailPage` (ExecutionQueue fires async, returns execution ID immediately) | `PlaygroundPage` | MISSING | P0 | Old UI queued executions and tracked each by ID. New Playground does synchronous execute-and-wait with no execution ID surfaced in the UI. |
| 3 | **Webhook URL per execution** | `EnhancedExecutionDetailPage` (Webhooks tab with delivery history + retry), `EnhancedWorkflowDetailPage` (Webhooks tab with per-node webhook status) | None | MISSING | P0 | Old UI showed webhook delivery history, delivery status per execution, retry button. Users set webhooks when executing to receive async callbacks. New UI has no execution-level webhook configuration or delivery visibility. |
| 4 | **Execution retry** | `EnhancedExecutionDetailPage` (Debug tab with `ExecutionRetryPanel`) | None | MISSING | P0 | Old execution detail had a dedicated Debug tab with retry controls. No equivalent in new RunDetailPage / StepDetail. |
| 5 | **Execution approval workflow** | `EnhancedExecutionDetailPage` (Approval tab with `ExecutionApprovalPanel`, visible only when `approval_request_id` is present) | None | MISSING | P0 | Human-in-the-loop approvals are a core platform feature. Old UI showed approval status, pending count badge, and approval/rejection controls. Completely absent from new UI. |
| 6 | **Per-execution notes (app.note())** | `EnhancedExecutionDetailPage` (Notes tab with `EnhancedNotesSection`), `ExecutionDetailPage` (Notes & Comments collapsible), `WorkflowDetailPage` (timeline note expansions) | `RunDetailPage` via `StepDetail` | PARTIAL | P0 | Old UI had a full notes tab showing annotated context added by agents via `app.note()`. New `StepDetail` component may show notes but the old dedicated Notes tab with note expansion controls is gone. Needs verification on `StepDetail`. |
| 7 | **Detailed execution status display** | `EnhancedExecutionDetailPage` (full tabbed detail: I/O, webhook, approval, debug, identity, technical, notes), `ExecutionDetailPage` (timeline, breadcrumb, metadata) | `RunDetailPage` → `StepDetail` | DEGRADED | P0 | New run detail is minimal: trace tree + step detail panel. No webhook tab, no approval tab, no debug/retry tab, no identity/VC tab, no technical metadata tab. |
| 8 | **Workflow-level webhooks view** | `EnhancedWorkflowDetailPage` (Webhooks tab with `EnhancedWorkflowWebhooks`, per-node webhook delivery summary) | None | MISSING | P1 | Old workflow detail had a dedicated tab showing webhook delivery across all executions in the workflow DAG. Useful for multi-agent systems debugging async callback chains. |
| 9 | **Workflow-level notes view** | `EnhancedWorkflowDetailPage` (Notes tab with `EnhancedWorkflowEvents`) | None | MISSING | P1 | Old workflow detail aggregated all notes from all executions in one tab. New workflow view (only accessible via legacy routes) shows timeline cards with note expansion but the dedicated Notes tab is gone. |
| 10 | **Workflow identity / VC chain** | `EnhancedWorkflowDetailPage` (Identity tab with `EnhancedWorkflowIdentity`, shows W3C VC chain for the entire workflow run) | None | MISSING | P1 | Old UI had a dedicated Identity tab on workflow detail showing the cryptographic audit trail. Not present in new `RunDetailPage`. |
| 11 | **Execution identity / VC status** | `EnhancedExecutionDetailPage` (Identity tab with `ExecutionIdentityPanel`), `ExecutionDetailPage` (fetches VC status, shows in header) | None | MISSING | P1 | Per-execution VC verification status displayed in old UI. Completely absent from new UI. |
| 12 | **Workflow-level performance insights** | `EnhancedWorkflowDetailPage` (Insights tab with `EnhancedWorkflowOverview` + `EnhancedWorkflowPerformance`) | None | MISSING | P1 | Old workflow detail had an Insights tab with performance analytics across all nodes in the run. New `RunDetailPage` shows per-step durations in the trace but no aggregate performance view. |
| 13 | **Interactive DAG with node selection** | `EnhancedWorkflowDetailPage` (Graph tab: `EnhancedWorkflowFlow` with multi-node selection, focus mode, view modes), `WorkflowDetailPage` (WorkflowDAGViewer + WorkflowTimeline in 2-column layout) | `RunDetailPage` (graph view placeholder: "Graph view coming soon — use Trace view") | PLACEHOLDER | P1 | Graph view in new `RunDetailPage` is explicitly a placeholder. Old UI had a full interactive DAG with node click, multi-selection, focus mode, standard/performance/debug view modes, fullscreen. |
| 14 | **Workflow I/O inspection** | `EnhancedWorkflowDetailPage` (I/O tab with `EnhancedWorkflowData`, per-node input/output inspection) | `RunDetailPage` → `StepDetail` | PARTIAL | P1 | Old workflow detail had a dedicated I/O tab showing inputs/outputs for every node in the workflow. New `StepDetail` shows I/O for one selected step at a time but there is no cross-run I/O view. |
| 15 | **Node detail page** | `NodeDetailPage` (Overview tab: full node info, reasoners/skills table; Configuration tab: env var management; start/stop/reconcile controls; SSE real-time status; fullscreen mode; keyboard shortcuts; `AgentControlButton`) | `AgentsPage` (collapsed accordion rows only; restart button only) | HEAVILY DEGRADED | P0 | Old `NodeDetailPage` was a comprehensive page: tabbed navigation, live status badge, full reasoner/skills table with clickable rows, environment variable editing, start/stop/reconcile lifecycle controls, MCP health display. New `AgentsPage` collapses agents into accordion rows with only a restart button. There is no drill-down page for a node. |
| 16 | **Start / Stop / Reconcile agent** | `NodeDetailPage` (`AgentControlButton`, `startAgent`, `stopAgent`, `reconcileAgent`) | `AgentsPage` (restart button calls `startAgent` only) | DEGRADED | P0 | Old UI had a full 3-action control button: start, stop, reconcile. New `AgentsPage` only has a restart (start) action. Stop and reconcile are gone. |
| 17 | **Environment variable management** | `NodeDetailPage` (Configuration tab with `EnvironmentVariableForm`, restart required banner) | None | MISSING | P1 | Old node detail had a Configuration tab where you could view and edit environment variables for the agent package. New `AgentsPage` has no configuration UI. |
| 18 | **MCP health display** | `NodeDetailPage` (MCP servers count in header metadata, MCP health in overview) | None | MISSING | P2 | Old node detail surfaced MCP server health (running/total servers, tools count). New `AgentsPage` only shows lifecycle status. |
| 19 | **Input/Output schema display** | `ReasonerDetailPage` (Input Schema / Output Schema tabs showing full JSON schema) | `PlaygroundPage` | MISSING | P1 | Old reasoner detail showed the full JSON schema definition for both input and output. New Playground does not display schemas — it only seeds the input textarea with property keys. Builders cannot see required fields, types, or descriptions without going to the SDK code. |
| 20 | **Execution queue (multi-run tracking)** | `ReasonerDetailPage` (`ExecutionQueue` component: queue multiple runs, track each separately, select a run to view its result, auto-select on completion) | `PlaygroundPage` | MISSING | P1 | Old reasoner detail had an execution queue panel showing multiple in-flight and completed runs. New Playground runs one execution at a time, blocking the UI. |
| 21 | **Formatted output view** | `ReasonerDetailPage` (`FormattedOutput` component with Formatted/JSON segmented control) | `PlaygroundPage` | MISSING | P2 | Old reasoner detail displayed results in a formatted view (pretty-printed, visually structured) with a toggle to switch to raw JSON. New Playground shows raw JSON only. |
| 22 | **Performance metrics per reasoner** | `ReasonerDetailPage` (Quick stats: avg response time, success rate, total executions, last 24h count; Performance tab with `PerformanceChart`) | `PlaygroundPage` | MISSING | P2 | Old reasoner detail showed live performance metrics and a chart. New Playground shows no aggregate performance data. |
| 23 | **Reasoner search + filter** | `AllReasonersPage` (SearchFilters: search by name, filter by status online/offline/all; `CompactReasonersStats` summary header) | `AgentsPage` | MISSING | P1 | Old reasoner list had a search box and status filter. New `AgentsPage` has no search or filter capability. With many agents, finding a reasoner requires manual scrolling through accordion rows. |
| 24 | **Reasoner grid / table view toggle** | `AllReasonersPage` (SegmentedControl: grid vs table view) | `AgentsPage` | MISSING | P3 | Intentionally simplified — accordion row is new design. But discovery of reasoners across nodes is significantly harder without a flat grid/table with search. |
| 25 | **SSE live connection indicator** | `NodesPage` (Live/Reconnecting/Disconnected badge with WifiHigh/WifiSlash icon; reconnect button on disconnect), `AllReasonersPage` (Live Updates / Disconnected badge) | `AgentsPage` | MISSING | P1 | Old pages showed the real-time SSE connection state prominently. New `AgentsPage` polls via React Query with no live connection indicator. Users have no signal when data is stale. |
| 26 | **SSE-driven real-time node updates** | `NodesPage` (full SSE event handling: node_registered, node_online/offline, node_status_updated, node_state_transition, bulk_status_update, mcp_health_changed, heartbeat) | `AgentsPage` (React Query polling only) | MISSING | P1 | Old `NodesPage` had comprehensive SSE wiring for instantaneous node status updates. New `AgentsPage` relies on React Query's `refetchInterval` polling only. |
| 27 | **Density toggle (compact/comfortable)** | `NodesPage` (`DensityToggle` controlling `NodesVirtualList` row height) | None | MISSING | P3 | Intentionally removed in simplification. Minor UX convenience. |
| 28 | **Serverless agent registration modal** | `NodesPage` (`ServerlessRegistrationModal` opened from "Add Serverless Agent" button in page header) | None | MISSING | P1 | Old Nodes page had a dedicated modal to register a new serverless agent (invocation URL, team ID). New `AgentsPage` has no "add agent" flow — the only way to add an agent is `af run` from the CLI. |
| 29 | **Keyboard shortcuts** | `EnhancedWorkflowDetailPage` (Cmd+1-6 for tabs, Cmd+F focus mode, Cmd+R refresh, Escape to deselect/exit fullscreen/navigate back), `EnhancedExecutionDetailPage` (Cmd+1-7 for tabs, Escape back), `NodesPage` (Cmd+R refresh), `WorkflowDetailPage` (Escape back) | None | MISSING | P2 | Old pages had comprehensive keyboard navigation. New pages have none. |
| 30 | **Time range selector** | `ExecutionsPage` / `WorkflowsPage` (TIME_FILTER_OPTIONS: 1h, 6h, 24h, 7d, 30d, all; with URL-persisted state), `RunsPage` (similar) | `RunsPage` | PRESENT | — | RunsPage has time range filter. This is retained. |
| 31 | **Status filter** | `ExecutionsPage` / `WorkflowsPage`, `RunsPage` | `RunsPage` | PRESENT | — | Retained. |
| 32 | **Execution sort** | `ExecutionsPage` (sortable by column, sort order toggle) | `RunsPage` | MISSING | P2 | Old executions table had sortable columns. New `RunsPage` table has no sort controls. |
| 33 | **Bulk select + bulk actions** | `RunsPage` (checkbox column, select all, "Compare Selected", "Cancel Running" bulk action bar) | `RunsPage` | PRESENT (stubs) | — | Bulk select exists but actions are stubs (buttons render, no API calls wired yet). |
| 34 | **Search in run list** | `RunsPage` (search input with debouncing) | `RunsPage` | PRESENT | — | Search is present and functional. |
| 35 | **Run list with search by ID** | `RunsPage` | `RunsPage` | PRESENT | — | Search in run list works. |
| 36 | **Workflow timeline with tag filter** | `WorkflowDetailPage` (WorkflowTimeline with tag filter chips, expand all, sort asc/desc) | `RunDetailPage` (trace tree) | DEGRADED | P1 | Old workflow timeline had tag-based filtering of execution nodes. New trace view has no tag filter. |
| 37 | **Workflow fullscreen mode** | `EnhancedWorkflowDetailPage` (fullscreen toggle with keyboard shortcut) | None | MISSING | P3 | Minor; fullscreen DAG view was a convenience. |
| 38 | **Tab persistence in URL** | `EnhancedWorkflowDetailPage` (?tab= URL param), `EnhancedExecutionDetailPage` (?tab= URL param) | `RunDetailPage` | MISSING | P2 | Old detail pages stored active tab in URL params (shareable, survivable refresh). New pages have no tab state. |
| 39 | **Node status summary bar** | `NodesPage` (`NodesStatusSummary`: online/offline/starting/error counts) | `AgentsPage` | MISSING | P2 | Old nodes page had a summary bar showing aggregate health across all nodes. New `AgentsPage` only shows a count in the subtitle. |
| 40 | **Observability webhook settings** | `ObservabilityWebhookSettingsPage` (now merged into `NewSettingsPage` → Observability tab) | `NewSettingsPage` | PRESENT | — | Migrated into Settings page, not lost. |
| 41 | **DID/Identity management** | Old: separate `/identity/dids`, `/identity/credentials` pages | `NewSettingsPage` | UNKNOWN | P1 | Old routes redirect to `/settings` but the new `NewSettingsPage` code only shows General and Observability tabs (first 80 lines examined). Need to verify whether a DID/Identity tab was added. |
| 42 | **Execution history pagination on reasoner** | `ReasonerDetailPage` (`ExecutionHistoryList` with `onLoadMore` pagination TODO comment) | `PlaygroundPage` (shows 5 recent runs in table) | DEGRADED | P2 | Old reasoner detail had a history list with load-more pagination (though it was a TODO). New Playground hardcodes 5 recent runs with no pagination. |
| 43 | **Auto-escalating time range** | `ExecutionsPage` (if no results for 24h, auto-escalates to broader range) | `RunsPage` | MISSING | P3 | Old executions page had a smart auto-escalation: if the selected time range returned no results, it automatically widened to the next range. Minor but good UX. |
| 44 | **Reasoner tags display** | `ReasonerDetailPage` (tags rendered as `#tag` badges below the header) | `PlaygroundPage` | MISSING | P2 | Old reasoner detail showed tags associated with a reasoner. New Playground has no tag display. |
| 45 | **Load input from recent run** | `PlaygroundPage` (Load Input button in recent runs table) | `PlaygroundPage` | PRESENT | — | This was kept. |
| 46 | **View execution detail from Playground** | `PlaygroundPage` ("View as Execution" link after run) | `PlaygroundPage` | PRESENT | — | This was kept. |

---

## Summary by Area

### Critical Missing (P0) — Must-Have Before Launch

These are gaps that break core developer workflows or remove platform-differentiating features:

1. **cURL copy** — removes the CLI integration path
2. **Async execute + execution ID** — removes the ability to fire async runs and track them
3. **Webhook delivery visibility** — removes observability into async callback chains
4. **Execution retry** — removes the ability to recover from failed executions
5. **Approval workflow** — removes human-in-the-loop visibility entirely
6. **Notes/app.note() visibility** — degrades agent communication observability
7. **Node detail page** — completely removed; start/stop/reconcile/env management gone
8. **Start/Stop/Reconcile controls** — only restart is available; cannot gracefully stop an agent

### Important (P1) — Should Be Restored Before GA

These features represent functionality that users will notice missing after a week of use:

- Input/Output schema display on Playground
- Reasoner search + filter
- SSE live connection indicator
- SSE real-time node updates
- Serverless agent registration modal
- Workflow-level webhook/notes/identity/insights tabs
- Per-execution VC/identity status
- Interactive DAG graph (currently just a placeholder)
- Workflow timeline tag filter
- Execution DID/identity settings in Settings page (verify)

### Nice-to-Have (P2) — Polish Items

- Formatted output view in Playground
- Performance metrics per reasoner
- Keyboard shortcuts
- Tab URL persistence
- Node status summary bar
- Execution sort in run list
- Reasoner tags display

### Intentionally Removed (P3) — Document the Decision

| Feature | Decision |
|---------|----------|
| Density toggle | Simplified in new design; accordion rows replace virtual list |
| Grid/table view for reasoners | New accordion per-node design is the intended pattern |
| Auto-escalating time range | Minor convenience; new design defaults to "all time" |
| Workflow fullscreen mode | Lower value; browser fullscreen is sufficient |

---

## Old Pages: Current Status

| Page File | Currently Routed? | Replacement | Notes |
|-----------|------------------|-------------|-------|
| `EnhancedDashboardPage.tsx` | Yes (`/dashboard/legacy` only) | `NewDashboardPage` | Legacy fallback kept |
| `ExecutionsPage.tsx` | No (redirects to `/runs`) | `RunsPage` | Redirect in place |
| `WorkflowsPage.tsx` | No (redirects to `/runs`) | `RunsPage` | Redirect in place |
| `WorkflowDetailPage.tsx` | No (redirects to `/runs`) | `RunDetailPage` | No direct replacement for detail; major feature loss |
| `EnhancedWorkflowDetailPage.tsx` | No (redirects to `/runs`) | `RunDetailPage` | Massive feature loss — 6 tabs gone |
| `ExecutionDetailPage.tsx` | No (redirects to `/runs`) | `RunDetailPage` → `StepDetail` | Significant feature loss |
| `EnhancedExecutionDetailPage.tsx` | No (redirects to `/runs`) | `RunDetailPage` → `StepDetail` | 7 tabs → minimal step view |
| `RedesignedExecutionDetailPage.tsx` | No | Not routed | Intermediate redesign, never shipped |
| `ReasonerDetailPage.tsx` | No (redirects to `/playground`) | `PlaygroundPage` | cURL, async, schema, metrics lost |
| `AllReasonersPage.tsx` | No (redirects to `/agents`) | `AgentsPage` | Search, filter, grid view lost |
| `NodesPage.tsx` | No (redirects to `/agents`) | `AgentsPage` | SSE, density, serverless modal lost |
| `NodeDetailPage.tsx` | No (redirects to `/agents`) | None | Full page removed; major gap |
| `ObservabilityWebhookSettingsPage.tsx` | No (redirects to `/settings`) | `NewSettingsPage` Observability tab | Migrated |
| `PlaygroundPage.tsx` | Yes | New page | Exists but missing features |
| `RunsPage.tsx` | Yes | New page | Mostly equivalent to old ExecutionsPage |
| `RunDetailPage.tsx` | Yes | New page | Minimal replacement for old detail pages |
| `AgentsPage.tsx` | Yes | New page | Minimal replacement for Nodes+Reasoners |
| `NewDashboardPage.tsx` | Yes | New page | Minimal dashboard with LLM health, queue alerts |
| `NewSettingsPage.tsx` | Yes | New page | Consolidated settings |
