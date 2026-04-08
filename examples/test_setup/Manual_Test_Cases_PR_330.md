Manual Test Cases — PR #330: UI Revamp + Live Updates + Observability
Test Data & Setup Required

Excel Template

Environment:
- Control plane running locally: http://localhost:8080
- At least 2 registered agents (one healthy, one offline/errored)
- 3+ workflow runs in varying states: pending, running, completed, failed
- At least 1 agent with process logs enabled
- PostgreSQL or SQLite backend (test both if possible)
- Browser: Chrome (primary), Firefox (secondary)
- Postman with base URL: http://localhost:8080

Test Agents Needed:
- agent-alpha  → healthy, actively running
- agent-beta   → registered but offline
- agent-gamma  → errored mid-execution

Test Workflows:
- workflow-short  → completes in <5s
- workflow-long   → runs 60s+ (for live update testing)
- workflow-fail   → deterministically fails at step 2

Auth Tokens:
- valid-admin-token  → full access
- valid-readonly-token → read-only
- expired-token      → for auth edge cases
- no token           → anonymous
SECTION 1 — UI/UX Testing
TC-001
Feature Area: UI
Title: Shell and navigation renders correctly on first load
Preconditions: Control plane running. Navigate to http://localhost:8080/ui/
Test Steps:

Open browser, navigate to /ui/
Observe the top-level shell: header, sidebar/nav, main content area
Check that all nav items are visible: Dashboard, Runs, Agents, Reasoners, Settings, Access, Provenance
Click each nav item in sequence
Verify the active nav item is visually highlighted after each click
Verify browser URL updates to match the selected page
Expected Result: Shell renders without flicker. All nav items clickable. Active state follows selection. URL changes correctly. No console errors.
Priority: High

TC-002
Feature Area: UI
Title: Dashboard page shows correct summary counts
Preconditions: At least 3 runs (1 running, 1 completed, 1 failed) and 2 registered agents exist
Test Steps:

Navigate to /ui/dashboard
Note the counts shown for: Active Runs, Total Agents, Failed Runs (or equivalent summary cards)
Open a new terminal, trigger one more workflow run
Without refreshing, wait 5–10 seconds
Check if the Active Runs count updates
Expected Result: Summary counts match backend state. Count for Active Runs increments automatically (via SSE) without manual refresh.
Priority: High

TC-003
Feature Area: UI
Title: Runs table renders with correct status badges
Preconditions: Workflow runs exist in states: pending, running, completed, failed, cancelled
Test Steps:

Navigate to /ui/runs
Observe the table — verify columns: Run ID, Workflow, Status, Started At, Duration (or equivalent)
Check each row's status badge color and label:
running → should be blue or green with spinner
completed → should be green
failed → should be red
pending → should be grey/yellow
Click a row — verify it navigates to run detail page
Check that the Run ID in the detail URL matches the row clicked
Expected Result: All badges display correct color and label per status. Row click navigates correctly. No missing or overlapping columns.
Priority: High

TC-004
Feature Area: UI
Title: Empty state renders on Runs page when no runs exist
Preconditions: Clean environment with zero workflow runs, OR filter applied that returns no results
Test Steps:

Navigate to /ui/runs
If runs exist, apply a filter/search that returns no results (e.g., search for zzz-nonexistent)
Observe the table area
Expected Result: An empty state component renders (not a blank white area or broken table). Should show a descriptive message like "No runs found" or similar. No JS errors in console.
Priority: Medium

TC-005
Feature Area: UI
Title: Agents page lists agents with correct health status
Preconditions: agent-alpha (healthy) and agent-beta (offline) both registered
Test Steps:

Navigate to /ui/agents
Verify both agents appear in the list/table
Check status indicators: agent-alpha shows healthy/online, agent-beta shows offline/unreachable
Click agent-alpha — verify Agent Detail page opens
On detail page, verify: node ID, registered reasoners, last heartbeat, and a logs section or link
Expected Result: Both agents listed. Status indicators accurate. Detail page loads without errors. Reasoners section populated for agent-alpha.
Priority: High

TC-006
Feature Area: UI
Title: Reasoners page shows all registered reasoners with metadata
Preconditions: At least 2 agents registered, each with 2+ reasoners
Test Steps:

Navigate to /ui/reasoners
Verify reasoners are listed with: name, owning agent, input/output schema (or type), status
Click a reasoner — verify detail or modal opens
Check that the reasoner's agent link navigates back to the correct agent
Expected Result: Reasoner table populated correctly. Detail view shows schema/metadata. Agent backlink works.
Priority: Medium

TC-007
Feature Area: UI
Title: Settings page renders and saves a configuration change
Preconditions: User logged in
Test Steps:

Navigate to /ui/settings
Locate a configurable setting (e.g., log tail limit, polling interval, or any exposed config)
Change the value
Save/submit
Refresh the page
Verify the saved value persists
Expected Result: Settings form renders. Save action succeeds (no error toast). Value persists after page refresh.
Priority: Medium

TC-008
Feature Area: UI
Title: Access page shows token/key management
Preconditions: Admin access. At least 1 access token exists.
Test Steps:

Navigate to /ui/access
Verify existing tokens are listed (masked/truncated)
Click "Create Token" or equivalent
Fill in token name/description
Submit — verify token is shown (ideally shown in full only once)
Copy the token, verify clipboard interaction works (or token is selectable)
Expected Result: Token list renders. New token creation succeeds. Newly created token displayed once with copy affordance.
Priority: Medium

TC-009
Feature Area: UI
Title: Provenance page renders audit/VC chain for a workflow
Preconditions: At least 1 completed workflow with DID/VC enabled
Test Steps:

Navigate to /ui/provenance or find provenance via a completed workflow's detail page
Locate the workflow with VC data
Expand or click the VC chain
Verify each step shows: issuer DID, subject, timestamp, and signature/hash
Check that the chain is in correct chronological order
Expected Result: VC chain renders correctly with all fields. Chronological order maintained. No broken links or empty fields.
Priority: Low

TC-010
Feature Area: UI
Title: Loading states appear during data fetch
Preconditions: Throttle network to "Slow 3G" in browser DevTools
Test Steps:

Open DevTools → Network → set throttle to Slow 3G
Navigate to /ui/runs
Observe whether a loading spinner/skeleton renders while data loads
Navigate to /ui/agents
Repeat observation
Expected Result: Loading skeletons or spinners appear while data is fetching. Page does not flash empty state before data arrives.
Priority: Medium

TC-011
Feature Area: UI
Title: Layout is consistent across viewport widths
Preconditions: Standard environment
Test Steps:

Open /ui/runs in Chrome
Use DevTools to resize viewport to: 1440px, 1280px, 1024px, 768px
At each width, check: nav doesn't overflow, tables have horizontal scroll if needed, badges don't wrap awkwardly
Repeat for /ui/agents and /ui/dashboard
Expected Result: No overlapping elements. Tables scroll horizontally on narrow viewports. Navigation remains usable at 768px.
Priority: Low

SECTION 2 — Live Updates (SSE)
TC-012
Feature Area: Live Updates
Title: SSE connection established on page load
Preconditions: Control plane running. Browser DevTools open.
Test Steps:

Open DevTools → Network tab → filter by "EventStream" or "text/event-stream"
Navigate to /ui/dashboard or /ui/runs
Observe network requests
Expected Result: A persistent SSE connection appears in the Network tab (type: eventsource or text/event-stream). Connection stays open (not closed/re-opened repeatedly). Status is 200.
Priority: High

TC-013
Feature Area: Live Updates
Title: Runs table updates in real-time when a new workflow is triggered
Preconditions: /ui/runs is open in browser. No pending runs.
Test Steps:

Open /ui/runs — note current run count
In a separate terminal, trigger a new workflow via CLI or API:

curl -X POST http://localhost:8080/api/v1/workflows/run -d '{"workflow_id":"workflow-short"}'
Watch the UI — do NOT refresh
Expected Result: New run row appears in the table within 1–3 seconds without a manual refresh. Status starts as pending or running.
Priority: High

TC-014
Feature Area: Live Updates
Title: Run status badge updates automatically as execution progresses
Preconditions: workflow-long (60s+ run) available
Test Steps:

Trigger workflow-long via API
Open /ui/runs immediately
Find the new run row — note initial status (pending → running)
Watch without refreshing for the full duration
Verify status transitions: pending → running → completed (or failed)
Expected Result: Status badge updates automatically at each transition. No manual refresh needed. Transitions are smooth (badge changes color/label in place).
Priority: High

TC-015
Feature Area: Live Updates
Title: Execution detail page updates live as nodes complete
Preconditions: Multi-node workflow (3+ nodes) available
Test Steps:

Trigger the multi-node workflow
Immediately open the execution detail page in the UI
Observe the DAG or node list
Watch nodes as they complete one by one
Expected Result: Each node's status updates in real time. DAG edges or node cards reflect current state without refresh. Completion timestamps appear as nodes finish.
Priority: High

TC-016
Feature Area: Live Updates
Title: Health strip shows live connection status
Preconditions: Control plane running. /ui/ open.
Test Steps:

Open /ui/ — observe the health strip (persistent element, likely bottom or top bar)
Note the live indicator — should show "Live" or green dot
Stop the control plane server
Observe the health strip within 5–10 seconds
Expected Result: While server is up: health strip shows live/connected state. After server stops: health strip changes to disconnected/degraded state within a few seconds.
Priority: High

TC-017
Feature Area: Live Updates
Title: Adaptive polling activates when SSE connection is lost
Preconditions: Control plane running. Network DevTools available.
Test Steps:

Open /ui/runs
Verify SSE is connected (via Network tab)
In DevTools → Network → click "Offline" to simulate disconnect
Wait 10–15 seconds
Observe whether the UI still attempts data fetches (polling)
Re-enable network connection
Observe recovery
Expected Result: After SSE drop, UI falls back to periodic polling (visible as regular XHR/fetch requests in Network tab, every N seconds). After reconnect, SSE re-establishes and polling stops.
Priority: High

TC-018
Feature Area: Live Updates
Title: Data remains consistent between SSE updates and full page refresh
Preconditions: Several active runs
Test Steps:

Open /ui/runs — let SSE-driven updates populate the table for 30 seconds
Note the exact state of 3 specific runs (status, timestamp)
Hard refresh the page (Ctrl+Shift+R)
Compare the state of those same 3 runs
Expected Result: Data shown after refresh matches what was shown via live updates. No phantom runs, no missing status updates. Timestamps match.
Priority: High

TC-019
Feature Area: Live Updates
Title: Multiple browser tabs don't cause duplicate SSE connections or data conflicts
Preconditions: Standard environment
Test Steps:

Open /ui/runs in Tab 1
Open /ui/runs in Tab 2 (same browser)
Trigger a new workflow run
Observe both tabs
Expected Result: Both tabs update with the new run independently. No console errors about duplicate event handlers. Each tab has its own SSE connection (visible in DevTools per-tab).
Priority: Medium

TC-020
Feature Area: Live Updates
Title: Reasoner events invalidate the reasoners query correctly
Preconditions: An agent is running and registering reasoners dynamically
Test Steps:

Open /ui/reasoners
Note current reasoner count
In a terminal, register a new reasoner on agent-alpha (or restart the agent with a new reasoner)
Watch the UI for 10 seconds
Expected Result: New reasoner appears in the list automatically without manual refresh.
Priority: Medium

SECTION 3 — Node Logs & Observability
TC-021
Feature Area: Logs
Title: NodeProcessLogsPanel renders on Agent detail page
Preconditions: agent-alpha is running and has emitted process logs
Test Steps:

Navigate to /ui/agents
Click agent-alpha
On the agent detail page, locate the "Process Logs" panel or tab
Click to open/expand it
Expected Result: Log panel renders. Logs are displayed in chronological order. Each log line shows timestamp + message. No "undefined" or broken JSON in the output.
Priority: High

TC-022
Feature Area: Logs
Title: NodeProcessLogsPanel renders on Node Detail page
Preconditions: A workflow execution with node logs available
Test Steps:

Navigate to a completed execution's detail page
Click on a specific node (e.g., summarizer-node)
Look for "Process Logs" or "Node Logs" section
Expand and review
Expected Result: Node-specific logs appear, scoped to that node only (not other nodes' logs). Timestamps align with execution timing.
Priority: High

TC-023
Feature Area: Logs / API
Title: GET /api/ui/v1/nodes/:id/logs returns logs for a valid node
Preconditions: agent-alpha node ID known. Postman ready.
Test Steps:

In Postman, send:

GET http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs
Authorization: Bearer valid-admin-token
Note response status and body structure
Expected Result: HTTP 200. Response body contains an array of log entries. Each entry has at minimum: timestamp, level, message. Format is valid JSON (or NDJSON if streamed).
Priority: High

TC-024
Feature Area: Logs / API
Title: GET /api/ui/v1/nodes/:id/logs returns 404 for unknown node
Preconditions: Postman ready
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/nonexistent-node-xyz/logs
Authorization: Bearer valid-admin-token
Expected Result: HTTP 404. Response body: {"error": "node not found"} or similar. No 500 error. No stack trace exposed.
Priority: High

TC-025
Feature Area: Logs / API
Title: Tail limit parameter restricts log lines returned
Preconditions: agent-alpha has 500+ log lines
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs?tail=50
Authorization: Bearer valid-admin-token
Count the number of log entries in the response
Expected Result: Response contains exactly 50 log entries (the most recent 50). Total does not exceed the requested tail limit.
Priority: Medium

TC-026
Feature Area: Logs / API
Title: Timeout parameter is respected when agent log fetch is slow
Preconditions: agent-beta is offline or intentionally slow to respond
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/agent-beta/logs?timeout=2000
Authorization: Bearer valid-admin-token
Wait for response
Expected Result: Response returns within ~2 seconds with a timeout error (HTTP 504 or 408), not hang indefinitely. Error message indicates timeout, not internal server error.
Priority: Medium

TC-027
Feature Area: Logs
Title: Structured execution logs appear on execution detail page
Preconditions: A completed execution with structured log emission from the SDK
Test Steps:

Navigate to /ui/runs
Click a completed run
On the execution detail page, find the structured logs section (separate from raw process logs)
Verify log entries show: execution ID, node ID, log level, timestamp, message
Check that logs are filterable or sortable by level (INFO, WARN, ERROR)
Expected Result: Structured logs render in a table or timeline format. Each entry has all expected fields. Filter/sort works if implemented.
Priority: High

TC-028
Feature Area: Logs
Title: Raw node logs toggle shows NDJSON source
Preconditions: NodeProcessLogsPanel open, agent has raw NDJSON logs
Test Steps:

On Agent or Node detail page, open the process logs panel
Look for "Raw" or "Advanced" toggle
Enable it
Inspect output format
Expected Result: Switching to raw mode shows NDJSON format (one JSON object per line). Switching back to formatted mode restores the human-readable view. No data loss between modes.
Priority: Low

TC-029
Feature Area: Logs
Title: Execution context is stamped on all SDK-emitted logs
Preconditions: Run a workflow using the Python SDK with observability enabled
Test Steps:

Trigger a workflow via Python SDK agent
Fetch logs via:

GET /api/ui/v1/nodes/agent-alpha/logs
Inspect each log entry
Expected Result: Each log entry contains execution_id and workflow_id fields stamped by the execution context. These IDs match the workflow run that triggered them.
Priority: High

TC-030
Feature Area: Logs
Title: Large log output (10,000+ lines) doesn't crash the UI panel
Preconditions: Agent with a very verbose run that generated 10,000+ log lines
Test Steps:

Navigate to the agent detail page
Open the process logs panel
Observe UI behavior: scroll performance, memory usage, render time
Try scrolling through logs
Expected Result: UI remains responsive. Logs load (possibly paginated or virtualized). Browser tab doesn't crash or freeze. Memory usage stays reasonable (< 500MB increase).
Priority: Medium

SECTION 4 — API Testing
TC-031
Feature Area: API
Title: Unauthorized request to logs endpoint returns 401
Preconditions: Postman ready
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs
(no Authorization header)
Expected Result: HTTP 401. Body: {"error": "unauthorized"} or similar. No log data returned.
Priority: High

TC-032
Feature Area: API
Title: Expired token returns 401, not 500
Preconditions: expired-token available
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs
Authorization: Bearer expired-token
Expected Result: HTTP 401 with a clear "token expired" message. No 500. No internal details (stack trace, DB errors) in the response body.
Priority: High

TC-033
Feature Area: API
Title: Read-only token cannot access sensitive log endpoints (if write-scoped)
Preconditions: valid-readonly-token scoped to read-only
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs
Authorization: Bearer valid-readonly-token
Expected Result: If logs are read-only accessible: HTTP 200. If logs require elevated scope: HTTP 403. Either way, the response is consistent with the token's permissions. No 500.
Priority: Medium

TC-034
Feature Area: API
Title: Malformed node ID in path returns 400 or 404, not 500
Preconditions: Postman ready
Test Steps:

Send each of the following and note response:

GET /api/ui/v1/nodes/../etc/passwd/logs
GET /api/ui/v1/nodes/%00/logs
GET /api/ui/v1/nodes/a-very-long-id-aaaa...(500 chars)/logs
Expected Result: All return 400 or 404. No 500. No path traversal or injection executed. No internal paths or server info exposed in response.
Priority: High

TC-035
Feature Area: API
Title: Logs API returns correct Content-Type header
Preconditions: Postman ready
Test Steps:

Send:

GET http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs
Authorization: Bearer valid-admin-token
Inspect response headers
Expected Result: Content-Type: application/json (or application/x-ndjson if streaming). Not text/plain or missing. X-Content-Type-Options: nosniff present ideally.
Priority: Medium

SECTION 5 — Edge Cases
TC-036
Feature Area: Edge Cases
Title: UI recovers gracefully after server restart mid-session
Preconditions: Active session with SSE connected
Test Steps:

Open /ui/runs — confirm SSE connected
Stop the control plane server
Wait 10 seconds — observe UI state
Restart the control plane server
Wait another 10–15 seconds — observe UI state
Expected Result: During outage: health strip shows degraded/offline. Polling fallback activates. After server returns: SSE reconnects automatically. UI data refreshes. No stuck loading spinners or stale error banners.
Priority: High

TC-037
Feature Area: Edge Cases
Title: Rapid workflow triggering (10 runs in 5 seconds) doesn't desync the UI
Preconditions: Scripted rapid-trigger available
Test Steps:

Open /ui/runs
In terminal, trigger 10 workflow runs rapidly:

for i in {1..10}; do curl -X POST http://localhost:8080/api/v1/workflows/run -d '{"workflow_id":"workflow-short"}' & done
Watch the Runs table
Expected Result: All 10 runs appear in the table (eventually). No duplicate rows. Counts in summary/dashboard stay accurate. No JS errors from race conditions in SSE handlers.
Priority: High

TC-038
Feature Area: Edge Cases
Title: Switching between pages rapidly doesn't cause stale SSE subscriptions
Preconditions: Standard environment
Test Steps:

Rapidly click: Dashboard → Runs → Agents → Runs → Dashboard (within 2–3 seconds)
Wait 10 seconds on Dashboard
Trigger a new run via API
Observe Dashboard
Expected Result: Dashboard updates correctly. No duplicate event handlers from rapid navigation. No "Cannot update unmounted component" errors in console.
Priority: Medium

TC-039
Feature Area: Edge Cases
Title: Execution detail page handles a workflow with 50+ nodes
Preconditions: A workflow configuration with 50+ nodes available (or synthetic test data)
Test Steps:

Trigger the large workflow
Navigate to its execution detail page
Observe the DAG or node list rendering
Expected Result: Page loads within 5 seconds. All nodes render (possibly paginated or scrollable). No layout overflow. Status updates still work for individual nodes.
Priority: Medium

TC-040
Feature Area: Edge Cases
Title: Log panel behavior when agent goes offline mid-fetch
Preconditions: agent-alpha running
Test Steps:

Open agent-alpha detail page, open process logs panel
While logs are loading/streaming, kill the agent process
Observe the UI panel
Expected Result: UI shows a graceful error (e.g., "Connection lost to agent" or "Log fetch failed"). Does not freeze or show an infinite spinner. User can retry.
Priority: Medium

TC-041
Feature Area: Edge Cases
Title: Empty logs for a node renders an appropriate empty state
Preconditions: A newly registered agent that has never executed
Test Steps:

Navigate to the new agent's detail page
Open process logs panel
Expected Result: Empty state message (e.g., "No logs available yet") renders. Not a blank panel, not an error, not broken JSON.
Priority: Low

SECTION 6 — Security
TC-042
Feature Area: Security
Title: CORS headers are correctly set on SSE and API endpoints
Preconditions: cURL available
Test Steps:

Send a cross-origin preflight request:

curl -v -X OPTIONS http://localhost:8080/api/ui/v1/nodes/agent-alpha/logs \
  -H "Origin: http://evil.example.com" \
  -H "Access-Control-Request-Method: GET"
Check response headers
Expected Result: Access-Control-Allow-Origin does NOT include http://evil.example.com unless explicitly allowlisted. Should be restricted to the UI's own origin or configured allowlist. No wildcard * on credentialed endpoints.
Priority: High

TC-043
Feature Area: Security
Title: Log endpoint does not expose logs of one agent to another agent's token
Preconditions: Two agents: agent-alpha and agent-beta, each with their own agent-scoped tokens
Test Steps:

Using agent-beta's token, send:

GET /api/ui/v1/nodes/agent-alpha/logs
Authorization: Bearer agent-beta-token
Expected Result: HTTP 403 (Forbidden). agent-beta cannot read agent-alpha's logs. Principle of least privilege enforced on the control-plane trust model.
Priority: High

TC-044
Feature Area: Security
Title: Log content does not expose environment variables or secrets
Preconditions: Python SDK agent configured with API_KEY env var
Test Steps:

Run a workflow on agent-alpha
Fetch logs:

GET /api/ui/v1/nodes/agent-alpha/logs
Authorization: Bearer valid-admin-token
Search log content for patterns like: API_KEY, PASSWORD, SECRET, TOKEN
Expected Result: No secrets or environment variable values appear in log output. SDK should not log env vars by default.
Priority: High

TC-045
Feature Area: Security
Title: XSS: Log content containing HTML/script tags is escaped in the UI
Preconditions: Ability to emit a log line with XSS payload from an agent
Test Steps:

Configure an agent to emit this log message:

<script>alert('xss')</script>
Navigate to the agent's process logs panel in the UI
Expected Result: The log line renders as literal text. No alert dialog fires. The <script> tag is HTML-escaped in the DOM.
Priority: High

TC-046
Feature Area: Security
Title: SSE endpoint does not allow unauthenticated connections
Preconditions: cURL available
Test Steps:

Attempt to connect to the SSE stream without a token:

curl -v http://localhost:8080/api/v1/events/stream
(adjust path to actual SSE endpoint)
Expected Result: HTTP 401 returned immediately. No event stream opened for unauthenticated clients.
Priority: High

SECTION 7 — Performance
TC-047
Feature Area: Performance
Title: Dashboard page initial load time is acceptable
Preconditions: 100+ runs in the system. Browser DevTools open.
Test Steps:

Open DevTools → Performance tab → Start recording
Navigate to /ui/dashboard
Stop recording when page is interactive
Note: Time to First Contentful Paint (FCP) and Time to Interactive (TTI)
Expected Result: FCP < 2 seconds. TTI < 4 seconds. No individual render blocking resource > 1 second.
Priority: Medium

TC-048
Feature Area: Performance
Title: UI remains responsive during high-frequency SSE events (50+ events/min)
Preconditions: Scripted to trigger 50+ workflow runs per minute
Test Steps:

Open /ui/runs
Start the high-frequency trigger script
Observe UI for 2 minutes: check for lag, freezing, input responsiveness (try clicking nav items)
Monitor browser memory in Task Manager / DevTools Memory tab
Expected Result: UI remains interactive. Navigation clicks respond within 200ms. Browser memory grows by less than 200MB over 2 minutes. No tab crash.
Priority: Medium

TC-049
Feature Area: Performance
Title: Log panel with 1,000-line output loads within acceptable time
Preconditions: Agent with 1,000 log lines available
Test Steps:

Navigate to agent detail page
Open process logs panel
Time from click to logs rendered (using DevTools Network timing)
Expected Result: Logs render within 3 seconds. Scroll is smooth (no jank). If virtualized, only visible rows are in the DOM (verify via Elements inspector — should not be 1,000 DOM nodes).
Priority: Medium

TC-050
Feature Area: Performance
Title: Polling fallback does not cause memory leaks over

Manual Test Cases — PR #330: Operations-First UI Revamp + Live Updates + Observability
Test Setup & Data Requirements
Environment Prerequisites
Control plane running at http://localhost:8080
At least 3 registered agents (1 healthy, 1 degraded, 1 offline)
At least 5 workflow runs in various states: pending, running, completed, failed, cancelled
At least 2 reasoners registered per agent
A PostgreSQL or SQLite backend with seed data
Browser DevTools open (Network tab) for SSE/polling verification
Postman with Authorization header pre-configured
A second browser tab for concurrent state testing
Seed Data Checklist
 workflow_run_001 — status: running, 3 nodes active
 workflow_run_002 — status: failed, error in node 2
 workflow_run_003 — status: completed, full logs
 workflow_run_004 — status: pending
 agent_node_001 — healthy, logs available
 agent_node_002 — degraded/offline, sparse logs
 agent_node_003 — healthy, high-volume logs (>10k lines)
 At least 1 DID/VC audit trail generated
Feature Area 1: UI/UX — Navigation & Shell
TC-001
Feature Area: UI

Title: App shell renders with persistent navigation and health strip

Preconditions: Control plane is running; navigate to http://localhost:8080/ui/

Steps:

Open the app in a browser
Observe the top-level shell layout
Check for persistent navigation sidebar/header
Check for a health strip (persistent status bar)
Navigate between Dashboard → Runs → Agents → Reasoners → Settings
Observe whether shell elements (nav, health strip) persist across all pages
Expected Result: Shell and health strip remain visible and do not re-mount on navigation. Active nav item is highlighted. No layout flicker or scroll reset between pages.

Priority: High

TC-002
Feature Area: UI

Title: Dashboard page shows operational summary — not analytics-first

Preconditions: At least 3 runs in mixed states exist

Steps:

Navigate to /ui/ (dashboard)
Observe what information is "above the fold" (visible without scrolling)
Verify that active/failed run counts are visible immediately
Verify that agent health status is visible
Check for any "quick action" affordances near degraded states
Expected Result: Dashboard leads with operational state (what's running, what's broken). Health indicators are prominent. No analytics charts are the primary content.

Priority: High

TC-003
Feature Area: UI

Title: Runs page — table renders all columns with correct status badges

Preconditions: workflow_run_001 through workflow_run_004 exist

Steps:

Navigate to /ui/runs
Observe the runs table columns (ID, status, agent, created_at, duration, actions)
Check status badge colors: running = blue/yellow, failed = red, completed = green, pending = gray
Verify each row links to the run detail page
Sort the table by created_at descending
Check that the cancelled run (if exists) has distinct badge styling
Expected Result: All runs appear. Badges are color-coded and labeled consistently. Sorting works. Row links navigate correctly.

Priority: High

TC-004
Feature Area: UI

Title: Agents page — table shows node health with correct status

Preconditions: agent_node_001 (healthy) and agent_node_002 (degraded) exist

Steps:

Navigate to /ui/agents
Verify agents list renders with name, status, last-seen, reasoner count
Check that agent_node_001 shows a green/healthy badge
Check that agent_node_002 shows a degraded/offline badge
Click on agent_node_001 to open Node Detail page
Verify the Node Detail page loads correctly with agent metadata
Expected Result: Agent statuses render accurately. Degraded agents are visually distinct. Node detail page loads without error.

Priority: High

TC-005
Feature Area: UI

Title: Empty state renders correctly on Runs page with no data

Preconditions: Use a fresh environment with no workflow runs, or filter to a state with no results

Steps:

Navigate to /ui/runs
Apply a filter that yields zero results (e.g., filter by a non-existent agent name)
Observe the table body
Expected Result: Empty state illustration/message appears (e.g., "No runs found"). No blank white space or JS error. Clear call-to-action if applicable.

Priority: Medium

TC-006
Feature Area: UI

Title: Loading state renders during slow API response

Preconditions: Use browser DevTools to throttle network to "Slow 3G"

Steps:

Open DevTools → Network → set throttle to Slow 3G
Navigate to /ui/runs
Observe the table area before data loads
Expected Result: A skeleton loader or spinner appears in the table area. No layout shift after data loads. No error shown during load.

Priority: Medium

TC-007
Feature Area: UI

Title: Settings page renders all configuration sections

Preconditions: Logged in as admin

Steps:

Navigate to /ui/settings
Verify sections exist for: node log proxy settings (tail limit, timeout), general config, storage mode indicator
Change the node log tail limit to a different value and save
Refresh the page and verify the value persisted
Expected Result: All settings sections load. Changes persist after page reload.

Priority: Medium

TC-008
Feature Area: UI

Title: Provenance page renders DID/VC audit trail

Preconditions: At least one completed run with VC chain generated

Steps:

Navigate to a completed workflow run detail
Locate the Provenance / Audit tab
Verify DID identifiers render for each step
Verify VC chain is downloadable or viewable
Click "Export audit" if available
Expected Result: DID entries render per execution step. VC chain is navigable. Export produces valid JSON.

Priority: Medium

TC-009
Feature Area: UI

Title: Access page renders roles and tokens

Preconditions: At least one API token exists

Steps:

Navigate to /ui/access
Verify token list renders with masked values
Click "Create new token" and verify the form appears
Cancel without saving and verify no token was created
Expected Result: Tokens render with masked secrets. Create flow opens without error. Cancel does not persist changes.

Priority: Low

TC-010
Feature Area: UI

Title: Responsiveness — UI is usable at 1280px, 1440px, and 1920px widths

Preconditions: Standard desktop environment

Steps:

Open the app at browser width 1280px (common laptop)
Verify nav, tables, and panels are not truncated or overflowing
Resize to 1440px and repeat
Resize to 1920px and repeat
Specifically check the NodeProcessLogsPanel — verify it doesn't overflow its container
Expected Result: No horizontal overflow at any tested width. Tables are readable. Log panels scroll within their containers.

Priority: Medium

Feature Area 2: Live Updates (SSE)
TC-011
Feature Area: Live Updates

Title: SSE connection established on app load

Preconditions: Control plane running; DevTools → Network tab open

Steps:

Open DevTools → Network → filter by "EventStream" or "text/event-stream"
Navigate to /ui/
Observe network requests
Expected Result: Exactly one persistent SSE connection is established (from SSESyncProvider). It should NOT be one per page. The connection type is EventStream.

Priority: High

TC-012
Feature Area: Live Updates

Title: Running workflow status updates in real time without page refresh

Preconditions: workflow_run_001 is in running state

Steps:

Navigate to /ui/runs — observe workflow_run_001 shows running
From a separate terminal, trigger the workflow to complete: curl -X POST http://localhost:8080/api/v1/workflows/{id}/complete (or equivalent)
Keep watching the runs table — do NOT refresh the page
Expected Result: Within 2–3 seconds, the status badge for workflow_run_001 changes from running to completed without a page reload.

Priority: High

TC-013
Feature Area: Live Updates

Title: Node status updates reflect on Agents page in real time

Preconditions: agent_node_001 is healthy

Steps:

Navigate to /ui/agents
Stop agent_node_001 (kill the agent process or use admin API)
Watch the agents table without refreshing
Expected Result: agent_node_001 badge transitions to offline or degraded within a few seconds, driven by SSE event.

Priority: High

TC-014
Feature Area: Live Updates

Title: Health strip reflects live backend health state

Preconditions: App loaded, SSE connected

Steps:

Note the current health strip indicator (should show "healthy" or similar)
Stop the control plane server
Watch the health strip
Expected Result: Health strip transitions to a degraded/disconnected state. A clear error indicator appears (not just silent failure).

Priority: High

TC-015
Feature Area: Live Updates

Title: Adaptive polling fallback activates when SSE is unavailable

Preconditions: DevTools available

Steps:

Navigate to /ui/runs
Open DevTools → Network
Block the SSE endpoint using DevTools (Request Blocking: add the SSE URL pattern)
Observe network activity over the next 30 seconds
Trigger a workflow state change via API
Expected Result: Polling requests appear (e.g., GET /api/v1/runs every N seconds). UI still updates, just with polling latency. No JS error in console.

Priority: High

TC-016
Feature Area: Live Updates

Title: SSE reconnects automatically after network interruption

Preconditions: SSE connection established

Steps:

Verify SSE connection in DevTools Network tab
Disable network for 10 seconds using DevTools → Network → Offline
Re-enable network
Observe SSE connection behavior
Expected Result: SSE re-establishes connection automatically (visible as a new EventStream request). App does not require manual reload. Any missed updates are fetched.

Priority: High

TC-017
Feature Area: Live Updates

Title: SSE connection is NOT duplicated on page navigation

Preconditions: App loaded

Steps:

Open DevTools → Network → filter EventStream
Navigate from Dashboard → Runs → Agents → Runs → Dashboard (5 navigations)
Count SSE connections opened
Expected Result: Only 1 SSE connection exists throughout. No new connections are opened per navigation.

Priority: High

TC-018
Feature Area: Live Updates

Title: Data consistency — no stale data shown after rapid state changes

Preconditions: workflow_run_001 is running

Steps:

Navigate to /ui/runs
Rapidly change the run state via API: running → failed → cancelled (within 5 seconds)
Observe the badge in the UI
Expected Result: UI eventually shows the final state (cancelled). No permanently stale state. No race condition where an older event overwrites a newer one.

Priority: High

TC-019
Feature Area: Live Updates

Title: Live status indicator on page accurately reflects SSE stream availability

Preconditions: App loaded with SSE connected

Steps:

Locate the live status indicator (in health strip or page header)
Verify it shows "live" or equivalent when SSE is connected
Block SSE via DevTools Request Blocking
Observe the indicator
Expected Result: Indicator transitions from "live" to "polling" or "offline" state. User is informed they are not receiving real-time updates.

Priority: Medium

Feature Area 3: Node Logs & Execution Observability
TC-020
Feature Area: Logs

Title: NodeProcessLogsPanel renders on Agent Node Detail page

Preconditions: agent_node_001 is running and has generated logs

Steps:

Navigate to /ui/agents
Click on agent_node_001
Locate the NodeProcessLogsPanel on the detail page
Verify panel renders with log lines
Expected Result: Log panel is visible. Log lines are displayed in chronological order with timestamps. Panel has a scrollable area.

Priority: High

TC-021
Feature Area: Logs

Title: NodeProcessLogsPanel renders on Execution Detail page

Preconditions: workflow_run_002 (failed) has logs from node 2

Steps:

Navigate to /ui/runs
Click on workflow_run_002
Open the execution detail / DAG view
Click on the failed node
Locate the NodeProcessLogsPanel or "View Logs" button
Expected Result: Logs panel appears for the specific node within the execution context. Logs show the error that caused the failure.

Priority: High

TC-022
Feature Area: Logs

Title: Structured execution logs display on execution detail page

Preconditions: workflow_run_003 (completed) has structured execution logs

Steps:

Navigate to the detail page for workflow_run_003
Open the "Execution Logs" or "Structured Logs" tab
Observe log entries
Expected Result: Logs are structured (level, timestamp, message, metadata fields visible). Not raw plaintext. Possibly filterable by level (INFO/ERROR/WARN).

Priority: High

TC-023
Feature Area: Logs

Title: Raw node log debugging view accessible from execution detail

Preconditions: A completed or failed execution with node logs

Steps:

Navigate to an execution detail page
Find and open the "Raw Logs" or "Advanced Debug" panel
Verify NDJSON lines are visible
Verify the raw view is distinct from the structured view
Expected Result: Raw NDJSON log lines are visible in a monospace, scrollable area. Structured and raw views are both accessible and distinct.

Priority: Medium

TC-024
Feature Area: Logs

Title: Log tail limit is respected — UI does not load more than configured lines

Preconditions: agent_node_003 has >10,000 log lines; tail limit set to 1000 in settings

Steps:

Set node log tail limit to 1000 in /ui/settings
Navigate to agent_node_003 detail page
Open NodeProcessLogsPanel
Count or estimate the number of log lines shown
Expected Result: No more than 1000 log lines are rendered. A message like "Showing last 1000 lines" may appear. No browser crash or hang.

Priority: High

TC-025
Feature Area: Logs

Title: Log fetch displays appropriate state while loading

Preconditions: Network throttled to Slow 3G

Steps:

Throttle network in DevTools
Navigate to a node detail page with logs
Observe the NodeProcessLogsPanel while logs are loading
Expected Result: Loading spinner or skeleton appears inside the log panel. No blank white area or "undefined" text.

Priority: Medium

TC-026
Feature Area: Logs

Title: Empty log panel state when agent has no logs

Preconditions: A newly registered agent with no executions

Steps:

Navigate to a new agent's detail page
Open NodeProcessLogsPanel
Expected Result: Empty state message appears (e.g., "No logs available for this node"). No error thrown.

Priority: Medium

TC-027
Feature Area: Logs

Title: Execution-context stamping visible in structured logs

Preconditions: A completed multi-step workflow

Steps:

Navigate to a completed workflow's execution detail
Open structured logs
Verify each log entry includes execution context fields (e.g., workflow_id, run_id, node_id, step_id)
Expected Result: Structured logs include execution context metadata on each line. Allows filtering or correlation by run/node.

Priority: High

Feature Area 4: API Testing (Postman / cURL)
TC-028
Feature Area: API

Title: GET /api/ui/v1/nodes/:id/logs returns logs for valid node

Preconditions: agent_node_001 exists and has logs; valid auth token

Steps:

Open Postman
GET http://localhost:8080/api/ui/v1/nodes/agent_node_001/logs
Add header: Authorization: Bearer <valid_token>
Send request
Expected Result: HTTP 200. Response body contains NDJSON log lines. Each line is valid JSON with at least timestamp, level, message fields.

Priority: High

TC-029
Feature Area: API

Title: GET /api/ui/v1/nodes/:id/logs with invalid node ID returns 404

Preconditions: Auth token available

Steps:

GET http://localhost:8080/api/ui/v1/nodes/nonexistent_node_xyz/logs
Add valid auth header
Send request
Expected Result: HTTP 404. Response body: {"error": "node not found"} or equivalent. No stack trace exposed.

Priority: High

TC-030
Feature Area: API

Title: GET /api/ui/v1/nodes/:id/logs without auth returns 401

Preconditions: None

Steps:

GET http://localhost:8080/api/ui/v1/nodes/agent_node_001/logs
Send with NO Authorization header
Expected Result: HTTP 401. No log data returned. Response body indicates authentication required.

Priority: High

TC-031
Feature Area: API

Title: Log endpoint respects tail query parameter

Preconditions: agent_node_003 has >1000 log lines

Steps:

GET http://localhost:8080/api/ui/v1/nodes/agent_node_003/logs?tail=100
Count lines in response
Expected Result: Response contains exactly (or at most) 100 log lines. Lines are the most recent 100.

Priority: High

TC-032
Feature Area: API

Title: Log endpoint with timeout — agent does not respond within timeout window

Preconditions: agent_node_002 is offline/slow

Steps:

GET http://localhost:8080/api/ui/v1/nodes/agent_node_002/logs?timeout=2
Observe response
Expected Result: HTTP 504 (Gateway Timeout) or a structured error within ~2 seconds. Control plane does not hang indefinitely. Error is user-readable.

Priority: High

TC-033
Feature Area: API

Title: Log endpoint returns NDJSON content-type

Preconditions: Valid node with logs

Steps:

GET http://localhost:8080/api/ui/v1/nodes/agent_node_001/logs
Inspect response headers
Expected Result: Content-Type: application/x-ndjson or application/json with NDJSON body. Each line is independently parseable JSON.

Priority: Medium

TC-034
Feature Area: API

Title: Malformed node ID (special characters) handled gracefully

Preconditions: Auth token

Steps:

GET http://localhost:8080/api/ui/v1/nodes/../../etc/passwd/logs
GET http://localhost:8080/api/ui/v1/nodes/<script>alert(1)</script>/logs
Observe responses
Expected Result: HTTP 400 or 404. No path traversal. No XSS reflected in response. Sanitized error message returned.

Priority: High

Feature Area 5: Edge Cases
TC-035
Feature Area: Edge Cases

Title: Network interruption mid-execution — UI recovers gracefully

Preconditions: workflow_run_001 is running

Steps:

Navigate to the running workflow detail page
Enable DevTools offline mode for 15 seconds
Re-enable network
Observe UI behavior
Expected Result: UI shows disconnected/stale state during offline period. After reconnection, SSE re-establishes and UI refreshes to current state. No data loss or permanent error screen.

Priority: High

TC-036
Feature Area: Edge Cases

Title: Large log volume does not crash or freeze the browser

Preconditions: agent_node_003 has 10,000+ log lines

Steps:

Set tail limit to maximum allowed (e.g., 5000)
Navigate to agent_node_003 detail page
Open NodeProcessLogsPanel
Observe browser memory and CPU in DevTools → Performance tab
Expected Result: Browser does not freeze. Memory usage stays reasonable (< 500MB increase). Log panel uses virtualized rendering or pagination for large datasets.

Priority: High

TC-037
Feature Area: Edge Cases

Title: Multiple concurrent executions — all status updates are correctly attributed

Preconditions: 3 runs executing simultaneously: run_A, run_B, run_C

Steps:

Navigate to /ui/runs
Complete run_A via API
Fail run_B via API
Leave run_C running
Observe the table
Expected Result: Each run's status badge updates independently and correctly. run_A = completed, run_B = failed, run_C = running. No cross-contamination of status updates.

Priority: High

TC-038
Feature Area: Edge Cases

Title: Rapid state changes do not leave the UI in an inconsistent state

Preconditions: A run that can be controlled

Steps:

Navigate to /ui/runs
Fire 10 state-change API calls in quick succession (e.g., using a loop in terminal)
Observe the run's badge in the UI
Expected Result: UI eventually stabilizes to the final state. No flickering between states indefinitely. No JS errors about "unmounted component" state updates.

Priority: High

TC-039
Feature Area: Edge Cases

Title: Re-opening the app after long idle period (token expiry / stale SSE)

Preconditions: App open and idle for 30+ minutes (simulate with long session)

Steps:

Leave app open and idle
After 30 minutes, navigate to another page
Observe if SSE reconnects and data refreshes
Expected Result: App either silently reconnects or prompts re-authentication if session expired. No blank/frozen state.

Priority: Medium

TC-040
Feature Area: Edge Cases

Title: Opening multiple browser tabs — SSE connections are independent

Preconditions: App loaded

Steps:

Open the app in Tab 1
Open the same app URL in Tab 2
Trigger a state change via API
Observe both tabs
Expected Result: Both tabs receive the SSE event and update independently. No interference between tabs' SSE connections.

Priority: Medium

Feature Area 6: Security
TC-041
Feature Area: Security

Title: CORS — UI origin is accepted; arbitrary origins are rejected

Preconditions: Control plane running

Steps:

From Postman, send: GET http://localhost:8080/api/ui/v1/nodes/agent_node_001/logs with header Origin: http://evil.com
Inspect response headers for Access-Control-Allow-Origin
Repeat with Origin: http://localhost:8080
Expected Result: http://evil.com origin is NOT reflected in CORS headers (or returns 403). http://localhost:8080 origin is allowed. SSE endpoint enforces the same CORS policy.

Priority: High

TC-042
Feature Area: Security

Title: Log endpoint does not expose logs from another tenant's node

Preconditions: Two separate agents exist (agent A owned by user 1, agent B owned by user 2)

Steps:

Authenticate as user 1
GET /api/ui/v1/nodes/agent_B_id/logs using user 1's token
Expected Result: HTTP 403 or 404. User 1 cannot read agent B's logs. No log content is returned.

Priority: High

TC-043
Feature Area: Security

Title: Log content does not contain secrets injected via agent output

Preconditions: An agent that logs sensitive-looking strings (simulated: password=abc123)

Steps:

Run an agent that logs password=abc123 and api_key=mysecretkey
Fetch logs via /api/ui/v1/nodes/:id/logs
View logs in UI
Expected Result: Log content is passed through as-is (this is expected for raw logs), but verify that the API does not additionally expose any control-plane secrets (DB passwords, internal tokens) in the log response.

Priority: High

TC-044
Feature Area: Security

Title: SSE endpoint requires authentication

Preconditions: SSE endpoint URL known

Steps:

Open a new browser tab (unauthenticated / incognito)
Directly navigate to or fetch the SSE endpoint URL
Observe response
Expected Result: HTTP 401 or redirect to login. No event stream established for unauthenticated clients. No workflow data leaked.

Priority: High

TC-045
Feature Area: Security

Title: XSS — agent name with HTML in it does not execute in UI

Preconditions: Ability to register an agent

Steps:

Register an agent with name: <img src=x onerror=alert(1)>
Navigate to /ui/agents
Observe the table row
Expected Result: The agent name is HTML-escaped and displayed as literal text. No alert box appears. No script executes.

Priority: High

TC-046
Feature Area: Security

Title: DID/VC audit verification — tampered VC is rejected

Preconditions: A VC chain exported from a completed run

Steps:

Export audit JSON from a completed run
Manually modify one field in the JSON (e.g., change an agent ID)
Run: af verify <modified_audit.json>
Expected Result: Verification fails with a clear error message indicating tampered content. No false positive.

Priority: Medium

Feature Area 7: Performance
TC-047
Feature Area: Performance

Title: Runs table loads within 2 seconds with 100+ runs

Preconditions: Database seeded with 100+ workflow runs

Steps:

Open DevTools → Performance / Network
Navigate to /ui/runs
Note time from navigation to table fully rendered (data visible)
Expected Result: Table renders within 2 seconds on localhost. API response for runs list is under 500ms. No excessive re-renders visible in React DevTools.

Priority: Medium

TC-048
Feature Area: Performance

Title: UI remains responsive under high-frequency SSE events (stress test)

Preconditions: Ability to emit rapid SSE events

Steps:

Write a script that triggers 50 workflow state changes in 10 seconds
Navigate to /ui/runs before starting the script
Run the script
Interact with the UI (click, scroll) while events are firing
Expected Result: UI remains interactive. No freezing. Scroll and click respond within 200ms. Memory usage does not grow unboundedly.

Priority: Medium

TC-049
Feature Area: Performance

Title: Log panel does not block the main thread when loading large logs

Preconditions: Node with 5000+ log lines

Steps:

Navigate to a node detail page
Open NodeProcessLogsPanel
While logs are loading, try interacting with the rest of the page (navigate tabs, click buttons)
Expected Result: The rest of the UI remains interactive during log loading. Log loading is non-blocking. If virtualized rendering is used, scrolling through logs is smooth (60fps).

Priority: Medium

TC-050
Feature Area: Performance

Title: SSE fallback polling does not cause request flooding

Preconditions: SSE blocked via DevTools

Steps:

Block SSE endpoint
Open DevTools Network
Count polling requests over 60 seconds
Expected Result: Polling interval is reasonable (e.g., every 10–30 seconds). Not more than 6 requests/minute per data type. No request storm.

Priority: Medium

Smoke Test Checklist (Post-Deployment)
Run this after every deployment to catch regressions fast. Should take < 10 minutes.


[ ] 1. App loads at /ui/ without console errors
[ ] 2. Health strip shows "healthy" when control plane is running
[ ] 3. Navigation: Dashboard → Runs → Agents → Settings all load
[ ] 4. Runs table shows at least one run
[ ] 5. SSE connection established (visible in DevTools Network → EventStream)
[ ] 6. Trigger one workflow run and verify status appears in table without refresh
[ ] 7. Click a run → execution detail page loads
[ ] 8. NodeProcessLogsPanel loads on an active agent's detail page
[ ] 9. GET /api/ui/v1/nodes/:id/logs returns 200 with valid token
[ ] 10. GET /api/ui/v1/nodes/:id/logs returns 401 without token
[ ] 11. Settings page loads and saves a value
[ ] 12. No 500 errors in control plane logs during the above steps
Regression Checklist (What Existing Features Might Break)
These are the highest-risk areas given the scope of changes:


AUTHENTICATION & ACCESS
[ ] Existing API tokens still work (not broken by CORS/auth hardening)
[ ] Login/logout flow still works
[ ] Role-based access still enforced on all existing endpoints

WORKFLOW EXECUTION
[ ] Submitting a new workflow run via API still works
[ ] Agent-to-agent calls still route through control plane correctly
[ ] Run cancellation still works

DID/VC (potentially affected by audit verification hardening)
[ ] DID generation for new executions still works
[ ] VC chain export still produces valid JSON
[ ] `af verify` still passes for unmodified audit files
[ ] did:web with encoded ports resolves correctly (specific fix in this PR)

EXISTING API ENDPOINTS (SSE/CORS changes could have wide impact)
[ ] GET /api/v1/runs still returns correct data
[ ] GET /api/v1/agents still returns correct data
[ ] POST /api/v1/workflows/execute still works
[ ] Existing SSE endpoints (if any pre-dated this PR) still function

SDK COMPATIBILITY
[ ] Python SDK: agent registration and reasoner invocation still work
[ ] Go SDK: agent registration and skill invocation still work
[ ] NDJSON log emission doesn't break existing non-observability agents
[ ] SDK agents that don't opt into observability are unaffected

EMBEDDED WEB UI BUILD
[ ] `make build` produces a binary with embedded UI (not empty)
[ ] `go run ./cmd/af dev` serves UI correctly
[ ] UI works when served from embedded binary (not just Vite dev server)
Total test cases: 50

---

SECTION 8 — Observations & Suggestions

OBS-001
Type: Observation / Documentation Gap
Feature Area: Documentation / LLM Health

Title: LLM health badge shows "Unknown" with no discoverable path to configure it

Description:
The health strip in the top-right of the UI displays an "LLM Unknown" badge whenever
LLM health monitoring is not configured. There is no tooltip, inline help text, or link
that explains what this badge means or how to resolve it. A first-time user has no way to
discover that the feature requires explicit configuration.

Where the configuration IS documented:

- `examples/e2e_resilience_tests/README.md` — Configuration reference table (buried in test suite)
- `CHANGELOG.md` — Single-line feature mention only

Where it is NOT documented (gaps):

- `docs/DEVELOPMENT.md` — no mention
- `docs/ARCHITECTURE.md` — no mention
- `control-plane/README.md` — no mention
- `CLAUDE.md` — no mention
- `.env.example` — env vars not listed

Suggested Fix:

Add an "LLM Health Monitoring" section to `docs/DEVELOPMENT.md` (or `control-plane/README.md`) explaining:

1. What the badge means (health check polling against a configured LLM proxy endpoint)
2. How to enable and configure it via env vars or config YAML:

```sh
# Via environment variables (single endpoint)
AGENTFIELD_LLM_HEALTH_ENABLED=true
AGENTFIELD_LLM_HEALTH_ENDPOINT=http://localhost:4000/health
AGENTFIELD_LLM_HEALTH_ENDPOINT_NAME=litellm
AGENTFIELD_LLM_HEALTH_CHECK_INTERVAL=15s
AGENTFIELD_LLM_HEALTH_FAILURE_THRESHOLD=3
AGENTFIELD_LLM_HEALTH_RECOVERY_TIMEOUT=30s
```

```yaml
# Or via config/agentfield.yaml (supports multiple endpoints)
llm_health:
  enabled: true
  check_interval: 15s
  check_timeout: 5s
  failure_threshold: 3
  recovery_timeout: 30s
  endpoints:
    - name: "litellm"
      url: "http://localhost:4000/health"
      method: GET
```

- What URL to use — it only needs to return a non-5xx HTTP response to be considered healthy.
- Reference to the circuit breaker states: closed (healthy), open (degraded), half-open (recovering).

Optionally: add a tooltip or "?" icon on the LLM badge in the UI that links to documentation.

Priority: Medium
Severity: Usability gap — not a defect, but causes confusion for new operators
Distribution: UI/UX (10) · Live Updates (9) · Logs/Observability (8) · API (7) · Edge Cases (6) · Security (6) · Performance (4)