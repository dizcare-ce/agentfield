# UX Review — AgentField UI Revamp

**Reviewed against grooming design philosophy**
Persona: AI builder debugging multi-agent systems. Core questions:
1. Is my agent reasoning correctly?
2. Where in the pipeline did reasoning go wrong?
3. What exactly went in and came out at each step?
4. How does this run compare to the last one?

---

## 1. NewDashboardPage (`src/pages/NewDashboardPage.tsx`)

### What Works
- Issues banner (`IssuesBanner`) is correct — only surfaces when something is actually broken. LLM circuit-open and queue-overload are exactly the right conditions to surface.
- Stats strip is minimal and non-intrusive — inline separators instead of big stat cards is the right call.
- Recent runs table includes "Reasoner" column — surfaces the entry point, which is what the builder cares about.
- Row click navigates to run detail correctly.

### What's Broken or Missing

**P0 — No running runs highlighted**
The `RecentRunsTable` is a flat list sorted by `latest_activity desc`. A run that is currently `running` looks identical in layout to a finished run — it just has a different badge. There is no visual separation between "live now" and "historical". The builder's first question when landing on the dashboard is "is anything running or stuck?", and the current layout doesn't answer it. Running runs should appear in a dedicated section above the historical table, with a live pulsing indicator.

**P0 — Navigation bug: row click uses `workflow_id` fallback**
```ts
navigate(`/workflows/${run?.workflow_id ?? runId}`);
```
This navigates to `/workflows/<id>` but the runs detail page route is `/runs/<run_id>` (confirmed in `RunsPage.tsx` line 177). Any run where `workflow_id !== run_id` will 404. The dashboard is the most-visited page — this broken navigation is critical.

**P0 — HealthStrip is static dead weight**
`HealthStrip.tsx` always shows hardcoded "Healthy", "0 online", "0 running" — it never reads real data. The dashboard already calls `useLLMHealth` and `useQueueStatus` for the `IssuesBanner`, but the `HealthStrip` (which renders on every page) ignores these hooks and shows fake numbers. This is actively misleading. Either wire it to real data or remove it entirely.

**P1 — Stats strip shows today's runs but hides live state**
`totalRuns` = `summaryQuery.data?.executions?.today`. On a 24h window this is fine, but on day one it shows 0, giving a false impression the system is empty. More critically, the "avg time" stat is computed from the 15 most-recent runs — which may include multi-day runs that skew the average badly. There is no stat for "currently running" count, which is what the builder actually wants to know at a glance.

**P1 — No actions on the dashboard**
Zero action buttons. The builder should be able to: (a) click into a running run, (b) open the Playground from the dashboard. "View All" goes to the runs list, but there is no "Go to Playground" shortcut for the most common act: testing a reasoner after seeing it fail. Add a quick-actions row: "Open Playground", "View Failed Runs".

**P1 — No agent filter on "Recent Runs"**
With 15 agents, runs from many agents mix in the table. The builder typically cares about one agent's runs at a time. The dashboard table has no agent column and no way to scope it. Add an "agent" column or at minimum surface `agent_name`/`agent_id` from `WorkflowSummary`.

**P2 — Stats strip loading condition is wrong**
```ts
const statsLoading = (summaryQuery.isLoading && runsQuery.isLoading) || agentsQuery.isLoading;
```
`&&` means stats show as loaded as soon as *either* summary or runs finishes, even if agent count is still loading. Should be `||` throughout:
```ts
const statsLoading = summaryQuery.isLoading || runsQuery.isLoading || agentsQuery.isLoading;
```

**P2 — Debug console.warn/console.error left in production**
Lines 265–270 ship debug logs to production. `console.error("[Dashboard] runs query error:")` and `console.warn("[Dashboard] no runs returned.")` should be removed or gated on `import.meta.env.DEV`.

**P2 — `formatDuration` duplicated verbatim**
`NewDashboardPage.tsx` and `RunsPage.tsx` both define identical `formatDuration` functions. This will diverge. Extract to `src/utils/formatters.ts`.

### Specific Fixes

1. Add a "Live" section above the table that filters for `status === "running"` runs with a pulsed dot:
   ```tsx
   const liveRuns = recentRuns.filter(r => r.status === "running");
   // render as a separate section with bg-blue-500/10 highlight
   ```

2. Fix navigation on row click:
   ```tsx
   navigate(`/runs/${run.run_id}`);
   // Remove workflow_id fallback entirely
   ```

3. Wire `HealthStrip` to real data (see Section 7).

4. Add `active_executions` count (available on `WorkflowSummary`) to the stats strip as "active" rather than showing only today's total.

---

## 2. RunsPage (`src/pages/RunsPage.tsx`)

### What Works
- Checkbox selection + bulk action bar is present — shows "Compare Selected" and "Cancel Running".
- Infinite scroll via "Load more" is the right pattern for this data volume.
- Debounced search is correctly implemented.
- Filter state resets pagination on change.
- `RunRow` shows the right columns: ID, root reasoner, steps, status, duration, started.

### What's Broken or Missing

**P0 — "Compare Selected" is a no-op**
The button renders but has no `onClick` handler — it's a `<Button>` with no action. The most important analytical action in the entire UI is a shell with zero implementation. No comparison view, no navigation, no modal. This must either be wired to a real compare page or removed until it exists.

**P0 — "Cancel Running" is also a no-op**
Same problem — the destructive action button does nothing. A user could select 10 running jobs expecting to cancel them and nothing happens. If not implemented, disable and tooltip "Coming soon" rather than silently failing.

**P0 — No filter by agent**
The grooming spec explicitly requires a filter by agent. With 15 agents, this is the primary navigation axis. The filter bar has time + status + search but no agent selector. The `WorkflowSummary` type has `agent_id` and `agent_name` fields. The `useRuns` hook needs an agent filter parameter added, and the filter bar needs a `<Select>` for agent.

**P1 — No filter by reasoner**
"Which runs involved reasoner X?" is a direct debugging question. No reasoner filter exists. Add it.

**P1 — Sorting is not user-controllable**
The table is always sorted by `latest_activity desc` (set in `NewDashboardPage`'s `useRuns` call but the `RunsPage` call doesn't pass `sortBy`). Column headers are not clickable. For a debugging workflow, sorting by "Steps" descending (find the most complex runs) or "Duration" (find the slowest) is essential. Table headers should be sortable.

**P1 — Absolute timestamp in table is wrong locale format**
```ts
new Date(run.started_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
```
This produces formats like "Apr 4, 02:15 PM" — no year, no seconds. For runs that can span days, this is ambiguous. Also doesn't show timezone. Use relative time (like the dashboard does) with a tooltip showing full ISO timestamp on hover.

**P1 — "Steps" column shows `1` as fallback for undefined**
```ts
{run.total_executions ?? 1}
```
If `total_executions` is null/undefined, it shows `1` — a lie. Should show `—`.

**P1 — Checkbox `onCheckedChange` is a no-op**
```tsx
<Checkbox checked={isSelected} onCheckedChange={() => {}} />
```
The checkbox's `onCheckedChange` does nothing — all selection is handled by the parent `onClick`. This means keyboard users (Tab to checkbox, Space to toggle) cannot select rows. The `onCheckedChange` must call `onToggleSelect`.

**P2 — No column for `agent_name`**
The table shows `root_reasoner` but not which agent node it ran on. With 15 nodes, this matters for disambiguation when reasoner names repeat across agents.

**P2 — No visual distinction between runs with 1 step vs 100 steps**
The "Steps" column is a raw number with no visual encoding. A run with 200 steps is a complex workflow; a run with 1 step is trivial. Consider a micro bar or color threshold: dim for 1, normal for 2-20, highlighted for 20+.

**P2 — "Load more" instead of virtualized scroll**
The current accumulation pattern (`allRuns` state + append on page increment) will fill DOM with 1000+ rows after several "Load more" clicks. Should use a windowed list (e.g., `@tanstack/react-virtual`) or true pagination with page navigation.

### Specific Fixes

1. Wire "Compare Selected":
   ```tsx
   onClick={() => {
     const ids = Array.from(selected).join(",");
     navigate(`/runs/compare?ids=${ids}`);
   }}
   ```
   (Or open a modal if compare is in-page.)

2. Add agent filter to filter bar:
   ```tsx
   <Select value={agentFilter} onValueChange={handleFilterChange(setAgentFilter)}>
     <SelectTrigger className="w-[160px] h-8 text-xs">
       <SelectValue placeholder="All agents" />
     </SelectTrigger>
     <SelectContent>
       <SelectItem value="all">All agents</SelectItem>
       {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.id}</SelectItem>)}
     </SelectContent>
   </Select>
   ```

3. Fix checkbox:
   ```tsx
   onCheckedChange={() => onToggleSelect(run.run_id, { stopPropagation: () => {} } as React.MouseEvent)}
   ```

---

## 3. RunDetailPage + RunTrace + StepDetail

### What Works
- `isSingleStep` detection at line 70 is correct — single-step runs skip the trace/split layout.
- View mode toggle (Trace/Graph tabs) is present in the header.
- Auto-select of root node on load is correct.
- Polling is implemented: 3s interval for running/pending, disabled for terminal.
- `StepDetail` shows input, output, error, and notes — covering the core debugging questions.
- Collapsible sections in `StepDetail` with `defaultOpen` is the right call.

### What's Broken or Missing

**P0 — Trace panel has fixed height 500px — unusable for 100+ steps**
```tsx
<ScrollArea className="h-[500px]">
```
At 100-200 steps, each trace row is ~28px tall. 200 steps = 5600px of content inside a 500px scroll area. This is scroll-within-scroll — terrible UX. The layout should use `flex-1` with the outer container taking full viewport height minus the header. The entire page should grow, not a fixed inner box.

**P0 — Trace has no virtualization**
`RunTrace` is a recursive component that renders the full tree into DOM simultaneously. At 200 nodes this is 200 DOM nodes with all their children. There is no windowing. For runs with 100+ steps, this will lag on every keystroke. Need `@tanstack/react-virtual` or a flat virtualized list replacing the recursive tree renderer.

**P0 — Graph view is a placeholder stub**
```tsx
<div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground p-8 text-center">
  Graph view coming soon — use Trace view
</div>
```
The toggle is present in the header, the tab exists, but the entire Graph view is "coming soon." Showing a toggle for something that doesn't work is actively misleading — users will click Graph, see nothing, lose trust. Either implement it or hide the Graph tab entirely until ready.

**P0 — No cancel/retry/replay actions**
The run detail header has: status badge, trace/graph toggle. Zero action buttons. For a running run: no "Cancel" button. For a failed run: no "Retry from root" or "Replay step" button. These are the most important actions a builder takes after diagnosing a failure. The header's right side is nearly empty — this is wasted prime real estate.

**P1 — StepDetail panel has fixed `h-[500px]`**
```tsx
<CardContent className="p-0 h-[500px]">
```
The step detail panel is a fixed 500px regardless of content. Large inputs/outputs will be cut off inside the nested `<pre>` which itself is `max-h-48`. A 10KB JSON output is all but unreadable. The step panel should scroll its outer container, not its inner pre. Use `max-h-none` on the pre and let the card scroll naturally.

**P1 — Trace row shows `reasoner_id` not human name**
```tsx
<span className="truncate font-mono text-xs min-w-0 flex-shrink">
  {node.reasoner_id}
```
`WorkflowDAGLightweightNode` only has `reasoner_id` (the machine ID). There is no `display_name` or human label at the trace level. For a run with 20 calls to `process_chunk.v2`, every trace row looks identical. Need to show agent context: `{node.agent_node_id}/{node.reasoner_id}` at minimum.

**P1 — No timestamp or wall-clock start time per step**
The trace shows duration bar + duration text but not when the step started relative to the run. For parallel branches (agent A calls agent B and C simultaneously), understanding the wall-clock start is essential. Add `started_at` as a tooltip on each trace row.

**P1 — Depth indicator missing from trace tree connector**
```tsx
{depth > 0 && (
  <span className="text-muted-foreground/50 text-xs shrink-0 font-mono">└─</span>
)}
```
Every level beyond 0 gets the same `└─` connector regardless of depth. At depth 3 the indentation is `3*16+8=56px` but the connector only shows `└─`, not `│ │ └─`. The visual tree structure breaks down beyond 2 levels.

**P1 — `WorkflowDAGLightweightNode` is missing `notes` field**
`StepDetail` renders notes from `execution.notes`, but `WorkflowDAGLightweightNode` (the type used in the trace) has no `notes` field. The trace can't surface "this step has notes" as an indicator. The detail panel must load a separate API call per step click which is fine, but there's no affordance in the trace row that a step has notes worth reading.

**P2 — Breadcrumb doesn't show run context**
The `AppLayout` breadcrumb only shows "Runs" for all `/runs/*` paths. When viewing a run detail, it should show "Runs / <run_id_short>" as a 2-level breadcrumb with the parent being a link.

**P2 — No run metadata visible**
The header subtitle shows: `{workflow_name} · {N} steps · {duration}`. Missing: session_id, actor_id, started_at absolute timestamp. These are fields on `WorkflowDAGLightweightResponse` that the builder needs for correlation.

**P2 — StepDetail shows execution depth as raw number**
`Depth: {execution.workflow_depth}` — this number means nothing without context. Replace with a visual breadcrumb of the call stack or at minimum show "Level 2 of 4" style text.

**P2 — Collapsible chevron animation uses selector that probably doesn't work**
```tsx
className="size-3 transition-transform [[data-state=open]_&]:rotate-0 [[data-state=closed]_&]:-rotate-90"
```
The Tailwind arbitrary variant `[[data-state=open]_&]` targets a parent with `data-state=open` that contains this element. But shadcn's `Collapsible` sets `data-state` on the `CollapsibleContent`, not the trigger container. The chevron likely doesn't animate. Use a controlled `isOpen` state or `[data-state=open]>` sibling selector instead.

### Specific Fixes

1. Replace fixed heights with viewport-relative layout:
   ```tsx
   // RunDetailPage — outer wrapper
   <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
   // Multi-step split
   <div className="grid grid-cols-[1fr_1fr] gap-4 flex-1 min-h-0">
   // Left panel
   <Card className="flex flex-col min-h-0">
     <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
   ```

2. Add action buttons to header:
   ```tsx
   {dag.workflow_status === "running" && (
     <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
   )}
   {["failed", "timeout"].includes(dag.workflow_status) && (
     <Button variant="outline" size="sm" onClick={handleRetry}>Retry</Button>
   )}
   ```

3. Hide Graph tab until implemented:
   ```tsx
   // Either remove or disable:
   <TabsTrigger value="graph" className="text-xs px-3" disabled>Graph</TabsTrigger>
   ```

---

## 4. PlaygroundPage (`src/pages/PlaygroundPage.tsx`)

### What Works
- Reasoner selector groups by agent node using `SelectGroup`/`SelectLabel` — correct for 15 agents × 50 reasoners.
- Schema seeding on reasoner select (generates `{key: ""}` stub) is a good DX touch.
- `handleLoadInput` from recent runs is implemented.
- Refreshing recent runs after execution is correct.
- `lastRunId` link appears after execution.
- URL is synced to selected reasoner (`/playground/{reasonerId}`) — deep-linkable.

### What's Broken or Missing

**P0 — "View as Execution" navigates to wrong route**
```tsx
navigate(`/executions/${encodeURIComponent(lastRunId)}`)
```
The run detail route is `/runs/:runId` (see `RunsPage.tsx` line 177 and `RunDetailPage.tsx`). This navigates to `/executions/<id>` which likely 404s or hits an old legacy route. Fix to `navigate(`/runs/${lastRunId}`)`.

**P0 — No cURL copy**
A dev tool without cURL copy is incomplete. After selecting a reasoner, the builder needs to reproduce the call from a terminal for CI/scripting. There should be a "Copy as cURL" button near the Execute button that generates:
```bash
curl -X POST http://localhost:8080/api/ui/v1/reasoners/{id}/execute \
  -H "Content-Type: application/json" \
  -d '<input_json>'
```
This is one of the most-used features of any API playground (Postman, Swagger UI, etc.) and it's completely absent.

**P0 — Input area has no syntax highlighting or JSON validation beyond submit**
The `<textarea>` is plain text. JSON errors are only caught on "Execute" click (`setInputError`). There is no real-time validation. The builder can type for 2 minutes and only discover a brace mismatch on submit. Use a lightweight JSON editor (e.g., `@monaco-editor/react` in lightweight mode, or at minimum real-time `JSON.parse` on `onChange` with inline error).

**P1 — Schema display is broken — empty strings as placeholders**
When seeding input from schema:
```ts
for (const key of Object.keys(data.input_schema.properties)) {
  example[key] = "";
}
```
Every field is set to `""`. The builder has no idea which fields are required, what type they are, or what valid values look like. The schema `properties` object has type information — use it:
```ts
example[key] = getSchemaExample(data.input_schema.properties[key]);
// where getSchemaExample returns: "" for string, 0 for number, false for boolean, [] for array, {} for object
```

**P1 — No input/output schema display**
There is no section showing the full `input_schema` and `output_schema` of the selected reasoner. The builder who is writing call code needs to know the exact shape. The `selectedReasoner.input_schema` and `selectedReasoner.output_schema` fields exist but are never rendered. Add a collapsible "Schema" section below the selector.

**P1 — Recent runs table only shows 5 runs, hardcoded**
```ts
const history = await reasonersApi.getExecutionHistory(reasonerId, 1, 5);
```
5 is not enough. The builder might want to spot-check the last 20 runs for flakiness. Make this 20, with pagination or "load more".

**P1 — Recent runs "Load Input" button has no visual feedback**
Clicking "Load Input" populates the textarea silently. There's no flash, toast, or animation indicating the input was loaded. The builder may click it and not notice the textarea changed. Add a brief highlight or toast: "Input loaded from run <short_id>".

**P1 — Result area is a fixed-height div, not a proper panel**
```tsx
<div className="flex-1 min-h-[200px] rounded-md border ...">
```
Long JSON results overflow this area with `overflow-auto`, but the area itself is bounded by the card, creating awkward double-scroll. Use a `<ScrollArea>` component and give it a `min-h-[300px] max-h-[60vh]`.

**P2 — Reasoner dropdown is `w-[320px]` — too narrow with long reasoner IDs**
Reasoner IDs like `document_analysis_pipeline_v2` in a 320px dropdown will truncate. This is the primary navigation control. It should be at least 400px or fluid (`w-auto max-w-xl`).

**P2 — No "last executed" timestamp shown in result panel**
After execution, the result panel shows the JSON but not when it ran. Add "Executed at HH:MM:SS, took 1.2s" below the result.

**P2 — `handleExecute` casts `parsed` to `Record<string, unknown>` without validation**
```ts
input: parsed as Record<string, unknown>
```
If the user submits a JSON array or a string literal (`"hello"`), this will silently pass an unexpected type to the API. Add a type check:
```ts
if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
  setInputError("Input must be a JSON object {}, not an array or primitive.");
  return;
}
```

---

## 5. AgentsPage (`src/pages/AgentsPage.tsx`)

### What Works
- Accordion-style row expansion is correct for this data density (15 agents × 50 reasoners).
- `SHOW_LIMIT = 5` with "Show N more" prevents overwhelming the initial view.
- Status dot + color coding is present and consistent.
- Restart button fires `startAgent` with loading state.
- Last heartbeat is shown — gives a quick freshness signal.
- Reasoner items have a "Play" button that links directly to `/playground/{nodeId}.{item.id}`.

### What's Broken or Missing

**P0 — No search/filter across all reasoners**
With 15 agents × 50 reasoners = 750 items, finding "the `extract_entities` reasoner on any agent" requires expanding each agent row one by one. There is no global search. A search box that filters agent rows and highlights matching reasoners is essential for this scale.

**P0 — Page has no heading/title**
```tsx
<p className="text-sm text-muted-foreground">
  {isLoading ? "Loading agents…" : `${nodes.length} agent node${…} registered`}
</p>
```
There is no `<h1>`. The breadcrumb shows "Agents" but the page content starts immediately with a subtitle. Every other page has `<h1 className="text-2xl font-semibold">`. This is inconsistent and visually broken — the breadcrumb is the only heading.

**P0 — Restart semantics are wrong/unclear**
The restart calls `startAgent(node.id)` from `configurationApi`. The button is always visible and enabled regardless of agent status. You can "restart" an already-running agent or a healthy agent. There should be: a confirmation for running agents, and the button should be labeled "Start" when status is `stopped`/`offline` vs "Restart" when status is `ready`/`running`.

**P1 — Reasoner expand triggers lazy load with no error handling**
`NodeReasonerList` calls `getNodeDetails(nodeId)` on every expand, with `staleTime: 30_000`. If the node is offline, this will silently fail — the loading skeleton will just disappear and show "No reasoners registered" even though they were registered before going offline. Add an error state:
```tsx
if (isError) return <div className="pl-8 text-xs text-destructive">Failed to load</div>;
```

**P1 — No "run this reasoner" context from agent health**
When an agent shows `degraded` or `error` status, there is no explanation. The builder needs to know *why* — is it a crashed process, a network timeout, an unhealthy LLM? Status dot + label is not enough. Add a tooltip or expandable section showing the last error message when `lifecycle_status` is `error`/`degraded`.

**P1 — Mixed reasoners + skills with confusing badge**
Skills show a `skill` badge at `text-[9px]`, nearly unreadable. The distinction between a "skill" and a "reasoner" is meaningful to the builder. The current visual treatment buries it. Consider a separate sub-section header "Reasoners" / "Skills" within the expanded row, rather than a micro-badge.

**P1 — Heartbeat column shows `>1y ago` for missing data**
```ts
if (diffMs < 0 || diffMs > 365 * 24 * 60 * 60 * 1000) return ">1y ago";
```
When `last_heartbeat` is undefined, `formatRelativeTime` shows "—". But if the date is somehow in the future or far past, it shows ">1y ago" — this is not meaningful. Show "Never" for genuinely missing heartbeats.

**P2 — Agent rows have no version column on mobile**
```tsx
<span className="hidden sm:inline">v{node.version}</span>
```
The version is hidden on mobile. For a dev tool, version is important for debugging (running two different versions of the same agent?). Keep it visible.

**P2 — No link to view runs for a specific agent**
There is no "View runs for this agent" button on the agent row. After seeing an agent with error status, the builder's next action is "show me its recent failed runs". This should be a button that navigates to `/runs?agent={node.id}`.

**P2 — `totalItems` label says "reasoners" even when mix includes skills**
```tsx
{totalItems} reasoner{totalItems !== 1 ? "s" : ""}
```
If there are 3 reasoners and 2 skills, it shows "5 reasoners". Should be "3 reasoners, 2 skills" or just "5 capabilities".

### Specific Fixes

1. Add a search bar at the top of the page:
   ```tsx
   const [search, setSearch] = useState("");
   // filter nodes: nodes whose id matches, or whose expanded reasoners match
   const filtered = nodes.filter(n =>
     n.id.includes(search) || /* reasoner names loaded */ true
   );
   ```

2. Add `<h1>` heading:
   ```tsx
   <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
   ```

---

## 6. NewSettingsPage (`src/pages/NewSettingsPage.tsx`)

### What Works
- Observability tab is fully implemented — URL, secret (with show/hide), custom headers, enable toggle.
- Dead letter queue management (redrive/clear) is present and correct.
- Forwarder status side card shows real metrics.
- Event types documentation card is a nice reference.
- IdentityTab shows DID status and server DID.
- HMAC secret field uses `type="password"` with toggle — correct.
- Delete confirmation uses `confirm()` — acceptable for a settings page.

### What's Broken or Missing

**P0 — GeneralTab is an empty placeholder shipped to production**
```tsx
<p className="text-sm text-muted-foreground">
  No configurable settings yet. Concurrency limits and timeout configuration coming soon.
</p>
```
"General Settings" is the default tab. The first thing a user sees in Settings is an empty card with "nothing here yet." This erodes trust in the product. Either hide the General tab, make a different tab the default, or put something real here (e.g., server URL, current mode, API key display from the About tab).

**P0 — IdentityTab displays DID status message field as "Server DID"**
```ts
setServerDid(res.message || "Not available");
```
The code uses `res.message` (a human-readable status string like "DID system initialized") as the Server DID. A DID looks like `did:key:z6Mk...` — a message string is not a DID. The actual DID is likely on a different field of the response. This shows the wrong data in a security-sensitive field.

**P1 — Success/error alerts don't have a dismiss button**
Success auto-clears after 5 seconds (`setTimeout(() => setSuccess(null), 5000)`). But errors (`setError`) persist forever until the next action. There's no way to manually dismiss an error. Add an `<X>` dismiss button on error alerts.

**P1 — "About" tab has hardcoded version string**
```tsx
<span className="font-mono">0.1.63</span>
```
The version is hardcoded in the UI. It will drift from the actual control plane version on every release unless manually updated. Pull from an API endpoint (`/api/ui/v1/info` or similar) or from `import.meta.env.VITE_APP_VERSION`.

**P1 — Storage mode is hardcoded**
```tsx
<Badge variant="secondary">Local (SQLite)</Badge>
```
Same problem — storage mode is always "Local (SQLite)" regardless of actual config. Should be fetched from the server info endpoint.

**P1 — Webhook test send is missing**
The observability webhook config has no "Test" button. After configuring a URL, the builder must wait for a real event to confirm it works. Add a "Send test event" button that fires a test payload to the configured URL, and shows whether the response was 2xx.

**P2 — "Export All Credentials" opens `_blank` without feedback**
```ts
window.open("/api/ui/v1/did/export/vcs", "_blank");
```
No loading state, no error feedback if the endpoint fails, no filename hint. Wrap in a try/catch with a toast.

**P2 — `hover:bg-red-50` hardcodes a light-mode color**
```tsx
className="text-red-500 hover:text-red-600 hover:bg-red-50"
```
`bg-red-50` is a very light red that doesn't work in dark mode. Use `hover:bg-destructive/10` or `hover:bg-red-500/10` instead.

---

## 7. HealthStrip (`src/components/HealthStrip.tsx`)

### What's Broken (Everything)

**P0 — Entirely static, never reads real data**
```tsx
// This will later use TanStack Query hooks. For now, show static placeholders.
export function HealthStrip() {
```
The comment is honest but the outcome is catastrophic: a UI strip that renders on every page, always shows "Healthy", "0 online", "0 running". This is:
- Actively misleading: LLM could be down, it says "Healthy"
- Waste of vertical space (32px per page)
- A false sense of security

The `NewDashboardPage` already has `useLLMHealth` and `useQueueStatus` working. These hooks need to be moved to a shared context or used directly in `HealthStrip`. The component should either be wired or deleted.

**P1 — HealthStrip renders under the header on every page, not just Dashboard**
In `AppLayout`, the `HealthStrip` is rendered at the top-level layout, meaning it appears on Runs, Agents, Playground, and Settings pages too. A health strip makes sense on Dashboard. On Settings it's noise. Consider making it Dashboard-only or placing it in a collapsible header element.

**P1 — No click targets**
Each indicator (`LLM`, `Agents`, `Queue`) has a tooltip but is not clickable. Clicking "LLM" should navigate to `/settings#llm-health` or show a popover with per-endpoint detail. "Agents" should navigate to `/agents`. "Queue" should show queue depth detail. Static badges with tooltips are the bare minimum.

### Specific Fix

Wire to real data:
```tsx
import { useLLMHealth, useQueueStatus } from "@/hooks/queries";
import { useAgents } from "@/hooks/queries";

export function HealthStrip() {
  const llmHealth = useLLMHealth();
  const queueStatus = useQueueStatus();
  const agents = useAgents();

  const llmHealthy = llmHealth.data?.healthy ?? true;
  const agentsOnline = agents.data?.nodes?.filter(n => n.health_status === "ready").length ?? 0;
  const running = queueStatus.data?.total_running ?? 0;

  // render with real values
}
```

---

## 8. AppLayout + AppSidebar

### What Works
- Collapsible sidebar with icon-mode is the right pattern for a dev tool.
- `SidebarRail` gives a grab target for expanding.
- Dark/light mode toggle in sidebar footer.
- Breadcrumb in the header is minimal and readable.

### What's Broken or Missing

**P0 — Sidebar defaults to collapsed (`defaultOpen={false}`)**
```tsx
<SidebarProvider defaultOpen={false}>
```
On first visit, the sidebar is collapsed to icons only. The user sees 5 unlabeled icons and must hover over each to discover navigation. This creates a terrible first impression. The sidebar should default to `defaultOpen={true}` and use `localStorage` to remember state (which `SidebarProvider` supports natively via `defaultOpen` persisted to cookie). As a dev tool used primarily on desktop, a 200px sidebar is not excessive.

**P0 — No command palette (Cmd+K)**
There is no global command palette. For a tool with 15 agents × 50 reasoners + hundreds of runs, fuzzy search is essential. Not having Cmd+K in 2025 for a developer tool is a significant miss. Implement with `cmdk` (already standard with shadcn): search across agents, reasoners, recent runs.

**P0 — No keyboard shortcuts anywhere**
No `useEffect` with keyboard listeners anywhere in the codebase. Basic shortcuts that should exist:
- `G D` → Dashboard
- `G R` → Runs
- `G A` → Agents
- `G P` → Playground
- `/` → focus search
- `Escape` → close panels/dismiss
The grooming spec notes "keyboard navigation" as important for a dev tool.

**P1 — Breadcrumb is single-level and non-navigable**
```tsx
<BreadcrumbItem>
  <BreadcrumbPage>{currentRoute?.[1] || "AgentField"}</BreadcrumbPage>
</BreadcrumbItem>
```
The breadcrumb only shows the current section name. On `RunDetailPage`, it shows "Runs" — you can't click back to the runs list. Needs to be a proper multi-level breadcrumb with links:
```
Runs > run_abc123
Agents > my-agent > extract_entities (on a future agent detail page)
```

**P1 — Header height `h-10` is cramped**
The header is 40px (`h-10`). With a sidebar toggle, separator, and breadcrumb, this is tight. The HealthStrip immediately below adds another 32px of chrome. Combined: 72px of header chrome before any page content. On a 900px tall viewport, that's 8% of vertical space consumed by navigation chrome showing mostly static or misleading data.

**P1 — HealthStrip placement is wrong**
`HealthStrip` is between the header and the main content area:
```tsx
<header>...</header>
<HealthStrip />
<main>...</main>
```
This places it as a second persistent bar. The HealthStrip should either be integrated into the right side of the header bar (inline at 40px height), or displayed only on the Dashboard page. A second horizontal divider bar is layout overhead.

**P2 — Sidebar navigation does not distinguish between "active" and "has notifications"**
Active state is shown with `isActive` prop. But if there are 3 running executions, the Runs nav item has no indicator. A small badge count on the Runs nav item showing "3 running" would be immediately useful.

**P2 — `SidebarProvider defaultOpen={false}` loses state on refresh**
Even if we change to `defaultOpen={true}`, shadcn's `SidebarProvider` persists open/closed state in a cookie named `sidebar:state`. This works for 1 click but resets to `defaultOpen` if the cookie is cleared. This is fine — document it in code.

**P2 — No global error boundary**
No `<ErrorBoundary>` wraps `<Outlet />`. A crash in any page component will unmount the entire app with a blank screen. Add `react-error-boundary` around the `<Outlet />`.

### Specific Fixes

1. Change sidebar default:
   ```tsx
   <SidebarProvider defaultOpen={true}>
   ```

2. Move HealthStrip into the header right side:
   ```tsx
   <header className="flex h-10 ...">
     <SidebarTrigger />
     <Separator />
     <Breadcrumb>...</Breadcrumb>
     <div className="ml-auto flex items-center">
       <HealthStrip inline /> {/* render as compact inline variant */}
     </div>
   </header>
   // Remove standalone <HealthStrip /> below header
   ```

3. Add Cmd+K shortcut placeholder:
   ```tsx
   // In AppLayout
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       if ((e.metaKey || e.ctrlKey) && e.key === "k") {
         e.preventDefault();
         setCommandOpen(true);
       }
     };
     document.addEventListener("keydown", handler);
     return () => document.removeEventListener("keydown", handler);
   }, []);
   ```

---

## Cross-Cutting Issues

### Route Inconsistency (P0)
Multiple places in the codebase use different route patterns for the same resource:
- `RunDetailPage` uses `useParams<{ runId: string }>` and `params.runId`
- `NewDashboardPage` navigates to `/workflows/${run?.workflow_id ?? runId}` (legacy route)
- `PlaygroundPage` navigates to `/executions/${lastRunId}` (legacy route)
- `RunsPage` navigates to `/runs/${run.run_id}` (correct)

There appear to be at least 3 different names for the same concept: `run_id`, `workflow_id`, `execution_id`. This causes broken navigation. Audit all `navigate()` calls and ensure they all use `/runs/<run_id>`.

### `formatDuration` Defined 3+ Times (P2)
The same function exists in `NewDashboardPage.tsx`, `RunsPage.tsx`, `RunTrace.tsx`, and `PlaygroundPage.tsx`. Extract to `src/utils/formatters.ts` and import everywhere.

### Hardcoded Non-Semantic Colors (P1)
Several places use hardcoded colors that break dark mode:
- `hover:bg-red-50` in `NewSettingsPage.tsx`
- `text-green-500`, `text-yellow-500`, `text-red-500`, `text-orange-500` in `AgentsPage.tsx` — these are hardcoded and bypass the theming system. Use CSS variables: `text-[--color-success]` or shadcn semantic variants.

### Missing Refetch-on-Window-Focus (P2)
`useRunDAG` polls for running/pending runs but `useRuns`, `useAgents`, and `useLLMHealth` don't have `refetchOnWindowFocus: true`. When the builder switches to their terminal and back, stale data persists. TanStack Query has `refetchOnWindowFocus` enabled by default globally but the queries set `refetchInterval: false` for terminal states — verify global config includes `refetchOnWindowFocus: true`.

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 15 | Broken navigation, static/misleading health data, unusable at scale (no virtualization), unimplemented action buttons, wrong routes |
| P1 | 22 | Missing filters, bad column data, keyboard inaccessible checkboxes, fixed heights, missing actions |
| P2 | 14 | Duplicated code, hardcoded values, dark mode breaks, minor information missing |

**The most critical single chain of failures for the core persona:**
1. Builder sees a failed run on Dashboard → clicks it → **404** (wrong route)
2. Goes to Runs page → filters by agent → **no agent filter exists**
3. Finds the run → opens it → clicks "Graph" → **"coming soon" placeholder**
4. Looks at trace with 150 steps → **500px fixed scroll box, entire tree in DOM**
5. Finds the failing step → wants to replay in Playground → **Playground navigates to /executions/ which 404s**
6. Opens Playground → executes → **no cURL copy for CI reproduction**

Every step of the core debugging workflow has at least one P0 issue.
