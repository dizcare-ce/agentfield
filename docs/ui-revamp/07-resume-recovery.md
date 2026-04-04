# AgentField UI — Resume & Recovery UX Design Spec

> **Document:** 07-resume-recovery.md
> **Status:** Draft
> **Covers:** Recovery actions, execution lifecycle display, bulk operations, backend gaps, guardrails, verification

---

## Motivation: The Stuck System Problem

> "I had a big job running, submitted more, everything froze. I restarted components but jobs showed as 'running' even though nothing was happening. I had to delete the stuck requests — but now how do I resume that work?"

This is not an edge case. In AI agent systems — where LLMs can become unavailable, agents can crash mid-execution, and queues can saturate — the question "how do I recover?" is asked constantly. The current UI treats deletion as the only escape hatch, which destroys the work. This spec defines a recovery-first approach.

The design principle from the product philosophy doc applies directly: **every red state must have a next step**. "Stuck" is a state. "Deleted" is not a next step — it is data loss.

---

## 1. Recovery Actions Taxonomy

There are five distinct recovery actions. They are not synonyms. Each has a precise precondition, semantics, and backend path. The UI must present them unambiguously.

### 1.1 Resume

**What it does:** Continues a paused execution from where it left off. No work is re-done; state is preserved.

**Preconditions:** Execution status is `paused`.

**When to offer:** User explicitly paused an execution and is now ready to continue. Also offered when the system auto-paused due to reaching a HITL checkpoint.

**Backend:** `POST /api/v1/executions/:id/resume` (exists)

**Outcome:** Status transitions `paused → running`. The execution continues from its last committed state.

**Reversible:** Becomes pausable again once running. Not undoable in the sense that the work that happened before the pause is committed.

---

### 1.2 Retry

**What it does:** Re-runs the same execution using the same agent, same input, and same configuration. Creates a new execution record linked to the original as a retry attempt.

**Preconditions:** Execution status is `failed`, `timeout`, or `cancelled`.

**When to offer:** After a transient failure (LLM unavailable, agent crash, timeout). The user believes the same input will succeed now that the underlying issue is resolved.

**Backend:** `POST /api/v1/executions/:id/retry` — **does not exist yet** (see Section 6).

**Outcome:** New execution created with `parent_id` pointing to the original. Displayed as a retry in the lineage chain. Original execution remains accessible.

**Reversible:** The retry is its own execution and can be cancelled independently.

---

### 1.3 Replay

**What it does:** Submits the original execution's input as a brand-new, independent execution — no lineage link to the original.

**Preconditions:** Execution has stored input (all executions do).

**When to offer:** User wants to re-run the same job but start fresh with no connection to the old execution. Useful when the original has been archived, when investigating a regression, or when the user wants to try with different agent configuration.

**Backend:** Read input from existing execution + submit new execution via normal execution creation endpoint. Partial support today (input is stored); UI-level "submit copy" is straightforward. Full replay with pre-populated input form requires a new UI flow.

**Outcome:** New independent execution. No parent link.

**Reversible:** The new execution can be cancelled. The original is unaffected.

---

### 1.4 Cancel

**What it does:** Signals the execution to stop. For running executions, sends a cancellation signal to the agent. For queued executions, removes from the queue immediately.

**Preconditions:** Execution status is `running`, `queued`, or `paused`.

**When to offer:** User determines an execution is no longer needed, is stuck, or is consuming resources incorrectly.

**Backend:** `POST /api/v1/executions/:id/cancel` (exists)

**Outcome:** Status transitions to `cancelled`. Input and any partial output are preserved for inspection and replay.

**Reversible:** Cancellation is final. The cancelled execution cannot be un-cancelled. However, Replay is available after cancellation if the user wants to re-run the input.

---

### 1.5 Archive

**What it does:** Moves an execution to a soft-deleted, read-only state. It disappears from active views but remains queryable and accessible via direct link or audit filter.

**Preconditions:** Execution is in a terminal state: `done`, `failed`, `timeout`, `cancelled`.

**When to offer:** User wants to clean up list views without permanently deleting. Replaces the current "delete" action for terminal executions.

**Backend:** `PATCH /api/v1/executions/:id` with `{ "archived": true }` — **does not exist yet** (see Section 6). Current "delete" should be replaced or supplemented by archive.

**Outcome:** Execution moves to archived state. Not shown in default list views. Accessible via "Show archived" filter. Audit trail preserved.

**Reversible:** Unarchive is a supported action (same endpoint, `{ "archived": false }`).

---

### Action Availability Matrix

| Action    | queued | running | paused | failed | timeout | cancelled | done |
|-----------|--------|---------|--------|--------|---------|-----------|------|
| Resume    | —      | —       | YES    | —      | —       | —         | —    |
| Retry     | —      | —       | —      | YES    | YES     | YES       | —    |
| Replay    | YES    | YES     | YES    | YES    | YES     | YES       | YES  |
| Cancel    | YES    | YES     | YES    | —      | —       | —         | —    |
| Archive   | —      | —       | —      | YES    | YES     | YES       | YES  |

> Replay is available in all states because the input is always available. For active states (queued/running/paused), the replay action pre-populates a new submission form — it does not affect the current execution.

---

## 2. Where Each Action Appears in the UI

### 2.1 Execution Detail Page

The detail page is where a user lands when investigating a specific execution. Recovery actions belong here, prominently, in a dedicated "Recovery" section above the tabs.

**Layout — top of detail page:**

```
[ Execution ID: exec-abc123 ]   [ Status: FAILED ]   [ Agent: my-agent / process-doc ]
[ Started: 14:32:01 ]           [ Duration: 4m 22s ]  [ Attempt: 2 of 3 ]

─────────────────────────────────────────────────────────────────
  RECOVERY ACTIONS
  [ Retry ]   [ Replay ]   [ Archive ]
  Retry uses the same input and configuration. A new execution will be created.
─────────────────────────────────────────────────────────────────
```

Rules:
- Only show buttons that are valid for the current status (use the matrix above).
- The secondary label under the buttons explains what the primary action does in one sentence. This prevents misuse of Retry vs Replay.
- "Archive" is always last and styled as a secondary (outline) button to reduce accidental clicks.
- "Cancel" appears as a destructive button (red outline) only for active states.

**For paused executions:**

```
[ Status: PAUSED ]   [ Paused at: 14:35:44 ]   [ Reason: Awaiting human review ]

─────────────────────────────────────────────────────────────────
  RECOVERY ACTIONS
  [ Resume ]   [ Cancel ]   [ Replay ]
  Resume continues from the current checkpoint. No work will be repeated.
─────────────────────────────────────────────────────────────────
```

---

### 2.2 Execution List / Queue View

The queue view is the operational triage surface. Recovery actions appear inline per row and in a bulk action bar.

**Per-row action menu (... overflow):**

Each row in the list has a `⋮` context menu. Contents depend on execution status:

- `running` → Cancel, Replay
- `queued` → Cancel, Replay
- `paused` → Resume, Cancel, Replay
- `failed` → Retry, Replay, Archive
- `timeout` → Retry, Replay, Archive
- `cancelled` → Retry, Replay, Archive
- `done` → Replay, Archive

Destructive or irreversible actions (Cancel) are separated from constructive actions (Retry, Resume, Replay) by a divider inside the menu.

**Status badge affordance:**

The status badge itself should be clickable for active states and open a recovery popover. This matches the "every red state has a next step" principle from the product philosophy.

```
[ FAILED ↗ ]  →  (click)  →  small popover:
                              "This execution failed 8 minutes ago."
                              [ Retry ]  [ Replay ]  [ View Error ]
```

---

### 2.3 Workflow Detail Page

Workflows are DAGs of executions. Recovery at the workflow level means recovering from a point of failure, not re-running the entire workflow.

**Workflow-level recovery panel** (appears when workflow has failed or stuck nodes):

```
Workflow: doc-pipeline-run-22
Status: FAILED (2 of 5 steps completed)

─────────────────────────────────────────────────────────────────
  RECOVERY
  [ Retry from failure point ]   [ Retry entire workflow ]   [ Archive workflow ]

  Retrying from failure point will re-run: step-3 (chunk-analyze), step-4 (synthesize)
  Steps 1-2 completed successfully and will not be re-run.
─────────────────────────────────────────────────────────────────
```

"Retry from failure point" is the most valuable workflow recovery action and requires new backend support (see Section 6). Until that backend exists, the button should be shown but explain what it will do and that it requires re-running from the failed node forward.

Per-node recovery: Each node in the DAG visualization can be right-clicked (or long-pressed on mobile) to access node-level retry/replay for that individual execution within the workflow.

---

### 2.4 Stuck Executions Panel (System Health Page)

The system health page (per the product philosophy) surfaces stuck executions as part of operations monitoring. The recovery flow from health → stuck → action is a first-class journey.

```
STUCK EXECUTIONS   (executions showing 'running' with no recent progress)
─────────────────────────────────────────────────────────────────
 exec-abc   my-agent / process-doc   Running for 47 min   [ Retry ]  [ Cancel ]
 exec-def   pipeline-agent / build   Running for 1h 12m   [ Retry ]  [ Cancel ]

 [ Select all ]  [ Bulk cancel ]  [ Bulk retry ]
─────────────────────────────────────────────────────────────────
```

This panel only shows executions that are running but have exceeded the stale threshold (30 min default). The stale detection logic already exists in the backend — this is a UI surface over it.

---

## 3. Execution Lifecycle Display

### 3.1 Status State Machine

The UI must display the full status lifecycle. Status values and valid transitions:

```
queued
  └─ running
       ├─ paused ──────────────────────── resume ──► running
       │                                             (cycle)
       ├─ done
       ├─ failed
       └─ timeout

queued ──── cancel ──► cancelled
running ─── cancel ──► cancelled
paused ──── cancel ──► cancelled

failed ──── retry ──► queued (new execution, parent_id set)
timeout ─── retry ──► queued (new execution, parent_id set)
cancelled ─── retry ──► queued (new execution, parent_id set)

any terminal ── replay ──► queued (new execution, no parent link)
any terminal ── archive ──► archived (soft-delete)
```

Status badges must use consistent visual language:
- `queued` — grey pill
- `running` — blue pill with pulse animation
- `paused` — amber pill (static)
- `done` — green pill
- `failed` — red pill
- `timeout` — orange pill (distinct from failed — different recovery path)
- `cancelled` — grey strikethrough pill
- `archived` — light grey, italicized (only visible in archive views)

---

### 3.2 Retry Chain / Execution Lineage

When an execution is retried, the UI must show the relationship between attempts. This replaces the current pattern where retries are invisible and the user loses track of what was tried.

**Lineage display in execution detail:**

```
EXECUTION HISTORY (this lineage)
─────────────────────────────────────────────────────────────────
  ● Attempt 1  exec-aaa   14:30   FAILED      "LLM timeout after 30s"   [ view ]
  ● Attempt 2  exec-bbb   14:35   FAILED      "Connection refused"       [ view ]
  ▶ Attempt 3  exec-ccc   14:41   RUNNING     (current)
─────────────────────────────────────────────────────────────────
  [ Retry again ]   [ Cancel ]
```

Rules:
- Show the lineage for both the original execution and any attempt in the chain. Navigating to any attempt in the chain shows the full lineage with the current attempt highlighted.
- If there are more than 5 attempts, collapse with "Show 2 earlier attempts" link.
- The original execution (attempt 1) is never archived unless the user explicitly archives the whole lineage.

**Lineage in list view:**

Rows in the list that are retries should show a visual indentation or "↺ retry of exec-aaa" label. The default list view shows only the most recent attempt per lineage group (collapsed). A toggle expands all attempts.

```
  [ ▶ ] exec-ccc   my-agent / process-doc   RUNNING   14:41   ↺ attempt 3   ...
        [ exec-aaa  FAILED  14:30 ]   [ exec-bbb  FAILED  14:35 ]    (collapsed)
```

---

### 3.3 Parent/Child Workflow Relationships

For executions that are part of a workflow DAG, the execution detail page shows context about where this execution fits:

```
WORKFLOW CONTEXT
─────────────────────────────────────────────────────────────────
  Workflow: doc-pipeline-run-22
  Step: 3 of 5 (chunk-analyze)
  Parent step: [ step-2: extract ]  →  This step  →  [ step-4: synthesize ] (blocked)

  [ View workflow ]
─────────────────────────────────────────────────────────────────
```

If the current execution has failed and is blocking downstream steps, this is shown explicitly: "1 downstream step is waiting on this execution."

---

## 4. Bulk Recovery Operations

### 4.1 Multi-Select in List Views

The execution list supports checkbox multi-select. A bulk action bar appears at the bottom of the screen when 1 or more rows are selected (sticky bar, does not obscure list content).

```
─────────────────────────────────────────────────────────────────
  3 executions selected
  [ Retry failed ]   [ Cancel active ]   [ Archive terminal ]   [ Clear selection ]
─────────────────────────────────────────────────────────────────
```

Rules:
- Bulk action buttons are only active if the action is valid for at least one selected execution. Invalid selections are silently ignored (with a post-action summary showing which were skipped).
- "Retry failed" retries all selected executions that are in `failed`, `timeout`, or `cancelled` state. Ignores others.
- "Cancel active" cancels all selected executions in `queued`, `running`, or `paused` state. Ignores others.
- "Archive terminal" archives all selected executions in terminal states. Ignores non-terminal.

### 4.2 Smart Bulk Selection

Provide filter-then-select patterns for common recovery scenarios:

**Predefined selection shortcuts** (appear as chips above the list when filtering):

- "Select all failed (last 24h)" — selects all failed executions in current filter view
- "Select all stuck" — selects all running executions over the stale threshold
- "Select all from workflow X" — selects all executions belonging to a workflow

This avoids requiring the user to manually scroll and check each stuck execution.

### 4.3 Bulk Operation Progress

When a bulk action affects more than 5 executions, show a progress indicator:

```
Retrying 12 executions...  [ 7 / 12 ]   [ Cancel remaining ]
```

After completion, show a summary toast:

```
Bulk retry complete: 10 succeeded, 2 skipped (already running)   [ View results ]
```

### 4.4 Bulk Cancel Safety

Bulk cancellation of running executions is the highest-risk operation. Additional safeguard:

- If more than 10 running executions are selected for cancellation, show a confirmation modal (not just a toast) with a count of executions that will be stopped.
- Provide a "Save inputs before cancelling" option that exports the inputs of all selected executions as a JSON file before proceeding. This ensures the user can replay them later even if they can't remember what was submitted.

---

## 5. Execution Lineage Tracking

This is a new data model requirement that enables the Retry flow described above.

### 5.1 Lineage Fields on Execution

New fields needed on the execution record:

```json
{
  "parent_execution_id": "exec-aaa",   // set when this is a retry of another execution
  "attempt_number": 2,                  // 1-indexed, 1 = original
  "lineage_root_id": "exec-aaa",        // always points to the original in the chain
  "retry_reason": "user-initiated"      // "user-initiated" | "auto-retry" | "stale-cleanup"
}
```

`lineage_root_id` enables fetching the full chain with a single query: all executions where `lineage_root_id = exec-aaa`.

### 5.2 Lineage Query API

New endpoint (or query parameter on existing list endpoint):

```
GET /api/v1/executions?lineage_root=exec-aaa
```

Returns all attempts in order. The UI uses this to build the lineage display in Section 3.2.

### 5.3 Auto-Retry Lineage

When the backend performs auto-retry (stale cleanup with `MaxRetries > 0`), the new execution must also set `parent_execution_id` and `attempt_number`. This makes auto-retries visible in the UI — the user can see that the system retried on their behalf and what happened.

---

## 6. Backend Changes Required

The following capabilities do not exist and require backend implementation before the UI features that depend on them can ship.

### 6.1 Retry Endpoint — REQUIRED for Retry action

**New endpoint:** `POST /api/v1/executions/:id/retry`

**Behavior:**
1. Fetch the original execution's input, agent ID, and reasoner/skill name.
2. Create a new execution record with `parent_execution_id = :id`, `attempt_number = (max attempt in lineage) + 1`, `lineage_root_id = (original's lineage_root_id or :id if original)`.
3. Enqueue the new execution normally.
4. Return the new execution ID.

**Why not just replay from the UI?** A dedicated retry endpoint ensures lineage is tracked server-side, allows the backend to enforce `MaxRetries` limits, and enables auto-retry and user-retry to share the same lineage tracking logic.

---

### 6.2 Archive / Soft-Delete — REQUIRED for Archive action

**New fields on execution:** `archived_at: timestamp (nullable)`, `archived_by: string (nullable)`

**New endpoint:** `PATCH /api/v1/executions/:id`

Accept `{ "archived": true }` or `{ "archived": false }`. Set/clear `archived_at` and `archived_by` accordingly.

**List endpoint change:** Default list query excludes archived executions. Add query parameter `include_archived=true` to include them.

**Why replace delete?** Deleting executions loses audit history and destroys the ability to inspect what failed. Archive preserves everything while keeping list views clean.

---

### 6.3 Workflow Retry From Failure Point — REQUIRED for workflow-level recovery

**New endpoint:** `POST /api/v1/workflows/:id/retry-from-failure`

**Behavior:**
1. Identify the failed/timeout execution(s) in the workflow DAG.
2. Identify which successful upstream executions have already completed — do not re-run those.
3. Re-execute from the first failed node forward, using the outputs of already-completed upstream nodes as inputs to the re-run.
4. Track the new executions under the same workflow with a `workflow_attempt_number`.

**Complexity note:** This is the most complex backend change. A simplified version (re-run only the failed leaf nodes, keeping completed parent outputs) should ship first. Full "from failure point with re-computed intermediaries" can follow.

---

### 6.4 Execution Lineage Query — REQUIRED for lineage display

Add `lineage_root_id` field to execution records and index it.

Support query: `GET /api/v1/executions?lineage_root=:id` returning all attempts in creation order.

Also support: `GET /api/v1/executions/:id` returning the lineage chain as an embedded `lineage` array to avoid N+1 queries from the execution detail page.

---

### 6.5 Webhook Retry (Existing, Needs UI Surface)

`POST /api/ui/v1/executions/:id/webhook/retry` exists but is not surfaced in the UI.

This appears in the execution detail page under a "Webhooks" tab. The action should be: if an execution completed but the webhook delivery failed, show "Webhook delivery failed — Retry delivery" with a button that calls this endpoint.

This requires no backend changes — only UI work.

---

## 7. Guardrails

### 7.1 Confirmation Dialogs

Confirmation is required before any destructive or resource-intensive action.

| Action | Confirmation Required | Type |
|--------|----------------------|------|
| Cancel (single) | YES | Inline confirm (button turns "Click to confirm") |
| Cancel (bulk, ≤ 10) | YES | Toast confirmation bar ("Cancel 8 executions? Confirm / Undo") |
| Cancel (bulk, > 10) | YES | Modal with count and description |
| Retry (single) | NO | Immediate, undo available via toast |
| Retry (bulk) | YES | Inline count summary before firing |
| Replay | YES | Pre-populated form shown; user submits explicitly |
| Archive (single) | NO | Immediate, undo available via toast |
| Archive (bulk) | YES | Inline count summary before firing |
| Delete (if kept) | YES | Modal, warns it is permanent and cannot be undone |

### 7.2 Undo for Reversible Actions

For actions that are reversible (Archive, single Cancel of a queued execution), provide a 10-second undo toast:

```
Archived exec-abc.   [ Undo ]   (dismisses after 10s)
```

For bulk archive, undo applies to the entire batch:

```
Archived 14 executions.   [ Undo all ]   (dismisses after 15s)
```

### 7.3 Retry Limit Warning

If the backend enforces `MaxRetries`, the Retry button should:
- Show the current attempt count next to the button: "Retry (attempt 2 of 3)"
- When `MaxRetries` is reached, disable the Retry button and show: "Max retries reached (3/3). Use Replay to start a new execution."

### 7.4 Replay Pre-Population

Replay always opens a form — never fires silently. The form is pre-populated with the original execution's input, agent, and reasoner. The user can inspect and modify before submitting. This prevents accidental replays with stale or incorrect inputs.

The form includes a banner: "This is a new, independent execution. It is not linked to the original."

### 7.5 Active Execution Warning on Retry

If the lineage chain already has a running or queued attempt, the Retry button shows a warning before confirming:

```
⚠ Attempt 3 is currently running.
Starting another retry will create attempt 4 in parallel.
Are you sure?   [ Retry anyway ]   [ Cancel ]
```

---

## 8. Recovery Verification

After taking a recovery action, the user needs immediate and ongoing confirmation that it worked.

### 8.1 Immediate Feedback

All actions return feedback within 2 seconds:

| Action | Success Feedback | Failure Feedback |
|--------|-----------------|-----------------|
| Resume | Status badge updates to `running`. Toast: "Execution resumed." | Toast: "Resume failed: [reason]" with retry |
| Retry | New execution ID shown in toast with link: "Retry queued as exec-xyz → View" | Toast with error reason |
| Replay | Redirects to new execution detail page | Toast with error reason |
| Cancel | Status badge updates to `cancelled`. Toast: "Cancelled." | Toast with error if cancellation signal not received |
| Archive | Row fades from list with archive animation | Toast with error |
| Bulk | Progress bar, then summary: "10 retried, 2 skipped" | Per-item failures listed in summary |

### 8.2 Status Staleness Indicator

A common failure mode: the user takes an action, the UI shows success, but nothing actually changes in the backend. To address this:

- After any recovery action on a running/queued execution, poll that execution's status every 5 seconds for 60 seconds.
- If status has not changed after 30 seconds, show a soft warning: "This execution hasn't updated in 30s. It may be stuck." with a "Refresh" button.
- After 60 seconds with no change, show a stronger warning with a link to the stuck executions panel.

### 8.3 Post-Recovery Checklist Pattern

For users who have just recovered from a system-wide incident (multiple stuck executions), provide a recovery summary view:

Accessible via "Recovery summary" link in the bulk action completion toast.

```
RECOVERY SUMMARY — just now
─────────────────────────────────────────────────────────────────
  ✓ 8 executions retried
    → 6 now running
    → 2 still queued

  ✗ 3 executions cancelled
    → Inputs saved (download)
    → Ready to replay

  ? 1 execution unchanged
    → exec-ggg still showing RUNNING with no progress
    → [ Force cancel ]  [ Investigate ]
─────────────────────────────────────────────────────────────────
```

This answers the user's original question: "I took action — did it actually work?" in aggregate.

### 8.4 Workflow Recovery Verification

After a workflow-level retry, the workflow detail page auto-refreshes and shows:

- Which nodes were re-submitted (highlighted in amber with label "retrying")
- Which nodes picked up the re-submitted work (turns blue/running)
- Which nodes completed (turns green)

The DAG visualization must update in real-time via the existing SSE event stream. The user watches the failure point turn from red → amber → blue → green without refreshing.

---

## 9. Implementation Phasing

Recovery UX can ship incrementally. Backend dependencies gate which features are available.

### Phase 1 — Existing backend, UI work only (can ship immediately)

- Cancel action with confirmation dialog and undo toast
- Replay action via pre-populated form (reads existing execution input, submits new execution)
- Resume and Pause actions on execution detail and list rows
- Webhook retry surface in execution detail
- Status staleness indicator (poll after action)
- Bulk cancel with safety guardrails

### Phase 2 — Requires Retry endpoint (Section 6.1) and Lineage query (Section 6.4)

- Retry action with lineage tracking
- Execution lineage display in detail page and list view
- Retry limit warning (MaxRetries awareness)
- Active execution warning on retry
- Auto-retry visibility (system retries shown in lineage chain)

### Phase 3 — Requires Archive (Section 6.2)

- Archive action replacing delete
- Archived executions filter toggle in list views
- Undo for archive

### Phase 4 — Requires Workflow retry from failure point (Section 6.3)

- Workflow-level recovery panel
- Per-node retry from workflow DAG
- Workflow recovery DAG visualization with real-time status updates
- Post-recovery summary for workflow incidents

---

## Appendix: Open Questions

1. **Auto-archive policy:** Should terminal executions older than N days be auto-archived? This keeps active views clean without requiring user action. Needs product decision on default retention policy.

2. **Input mutation on replay:** Should users be able to edit the input during Replay, or should it be submit-as-is? Current design allows editing. If editing is removed, Replay becomes a one-click action.

3. **Retry vs Resume naming:** "Retry" implies running the same thing again. "Retry" on a `timeout` execution is clear. "Retry" on a `cancelled` execution might confuse users (they cancelled it intentionally — why retry?). Consider whether `cancelled` executions should only offer Replay, not Retry.

4. **MaxRetries enforcement in UI:** If the backend enforces MaxRetries server-side and rejects the retry API call, the UI needs to handle the 4xx gracefully and surface the reason clearly. Confirm the backend error format.

5. **Workflow retry from partial success:** When retrying a workflow from failure, should the user be shown which steps will be re-run vs skipped? This is high information value but requires the backend to return a "would retry" plan before committing. Worth designing a preview step.
