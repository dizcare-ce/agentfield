# Navigation & Information Architecture

**Document:** `06-navigation-ia.md`
**Status:** Design Spec
**Depends on:** `00-product-philosophy.md`

---

## 1. Design Rationale

The current navigation is organized around **data types**: nodes exist, so they get a section; credentials exist, so they get a section. This is feature-out thinking.

The revamp organizes around **user goals**. Every navigation group maps directly to one of the five user journeys from `00-product-philosophy.md`. The label of each group answers the question "what am I trying to do?", not "what kind of data is this?".

### Core principle applied to nav

> The UI must be operations-first, not feature-first.

This translates to navigation in three concrete ways:

**Frequency determines position.** Journeys 1 and 2 (Monitor & Observe, Diagnose & Fix) happen daily. They sit at the top of the sidebar. Journeys 4 and 5 (Audit, Scale) happen periodically. They sit near the bottom.

**Vague group labels are replaced with verbs.** "Agent Hub" tells the user nothing. "Fleet" tells them they are managing a collection of things. "Executions" stays (it is already a verb-adjacent noun that users recognize), but the items inside are reorganized by task, not by implementation detail.

**Low-frequency compliance features are demoted.** Identity & Trust is correct and necessary — but it answers "did this execution follow policy?" not "is my system healthy?". It moves to the bottom half, behind a collapsed group by default.

---

## 2. Proposed Navigation Structure

### Visual Layout

The sidebar remains the collapsible icon-rail from shadcn Sidebar. Collapsed state shows only icons. Expanded state shows icons + labels, with group headers as non-clickable separators.

Items marked `[badge]` receive a live count badge (red for errors, amber for warnings, numeric for activity). Badges are visible in both collapsed and expanded states.

```
┌─────────────────────────────────┐
│  ⚡ AgentField      [collapse]  │
├─────────────────────────────────┤
│                                 │
│  ○  Overview                    │  ← always first, no group header
│                                 │
│  OBSERVE                        │
│  ⬡  System Health    [badge]   │
│  ≋  Live Activity               │
│                                 │
│  FLEET                          │
│  □  Nodes             [badge]  │
│  ⟲  Executions        [badge]  │
│  ◈  Workflows                   │
│                                 │
│  CONFIGURE                      │
│  ⚙  Agents                      │
│  🔑 Authorization               │
│  ◳  Integrations                │
│                                 │
│  AUDIT                          │
│  🔍 Identity & Trust            │
│  📋 Audit Log                   │
│                                 │
│  ─────────────────────────────  │
│  ⚙  Settings                    │
│  ?  Docs                        │
└─────────────────────────────────┘
```

### Group-by-Group Breakdown

#### (no group) — Overview
**URL:** `/`
**Maps to:** Entry point; routes to Monitor based on system state

A single item, always at the top. When the system is healthy, Overview shows the dashboard. When there are active alerts, Overview shows the alert summary. The item badge reflects the highest-severity active alert.

This is the only item without a group. It is special-cased: it is not part of "Observe" because it is the starting point before the user knows which journey they need.

---

#### OBSERVE group

**Purpose:** Journey 1 (Monitor & Observe) and Journey 2 (Diagnose & Fix)
**Frequency:** Daily, primary screen

**System Health** — `/health`
The most critical new page. This is where Journey 2 lives. Shows:
- LLM endpoint health (latency, error rate, circuit state)
- Agent node health (up/down/degraded per node)
- Execution queue depth and throughput
- Active circuit breakers

Badge: red dot when any layer is degraded; amber when warnings only.
Icon (collapsed): a hexagon or circuit symbol — distinct, reads as "infrastructure health" not "data".

**Live Activity** — `/activity`
Replaces the current "Individual Executions" list used for real-time monitoring. Shows a live-updating feed of executions sorted by recency. Optimized for watching, not for historical search. Includes: status, agent, reasoner, duration, timestamp. Auto-refreshes via SSE.

This is not the same as the Executions page (which is for querying history). Live Activity is the real-time window.

---

#### FLEET group

**Purpose:** Journey 2 (Fix) + Journey 3 (Deploy) + Journey 4 (Audit)
**Frequency:** Daily (diagnosis), periodic (deploy)

**Nodes** — `/fleet/nodes`
Renamed from "Agent Hub > Agent Node". "Fleet" as a group communicates "collection of things I operate". "Nodes" within Fleet is the actual list of registered agent processes.

Badge: count of nodes in degraded or offline state.

Child routes:
- `/fleet/nodes` — Node list (health summary per node)
- `/fleet/nodes/:nodeId` — Node detail (reasoners, health timeline, concurrency usage, env config)

**Executions** — `/fleet/executions`
Replaces "Individual Executions" + "Workflow Executions" as two separate nav items. The old split forced users to know the implementation distinction up front. The new Executions page is a unified list with a "Type" filter column (single / workflow).

The distinction between individual and workflow executions is now a filter, not a nav split.

Badge: count of failed executions in the last hour.

Child routes:
- `/fleet/executions` — Unified list with type/status/agent/time filters
- `/fleet/executions/:executionId` — Execution detail
- `/fleet/executions/:executionId/replay` — Replay action (deep-link target)

**Workflows** — `/fleet/workflows`
Replaces "Workflow Executions" as a dedicated view for multi-step orchestration graphs. Surfaces DAG visualization, phase timing, and cross-execution analytics. Separated from the flat execution list because the interaction model is different (graph exploration vs list scanning).

Child routes:
- `/fleet/workflows` — Workflow list
- `/fleet/workflows/:workflowId` — DAG view + execution history for this workflow

---

#### CONFIGURE group

**Purpose:** Journey 3 (Deploy & Configure) + Journey 5 (Scale & Operate)
**Frequency:** Setup + periodic changes

**Agents** — `/configure/agents`
Covers the configuration and registration side of agents (as opposed to the operational side, which lives under Fleet > Nodes). This is where a developer goes to register a new agent, manage reasoner definitions, configure MCP servers, and manage agent-level settings.

The split between Fleet (operational) and Configure (definition) mirrors the Kubernetes model: `kubectl get pods` (operational) vs `kubectl apply -f deployment.yaml` (configuration).

**Authorization** — `/configure/authorization`
Moved from top-level to a sub-item under Configure. Authorization is a configuration task — you set policies once, not daily. Demoting it reduces visual weight in the sidebar.

**Integrations** — `/configure/integrations`
Absorbs the current "Settings > Observability Webhook" item and expands to include all external integrations: webhooks, LLM endpoint registration, notification channels. The current Settings section had one item; this gives it a proper home.

---

#### AUDIT group

**Purpose:** Journey 4 (Review & Audit)
**Frequency:** Periodic — not daily operations

**Identity & Trust** — `/audit/identity`
Retains the DID Explorer and Credentials sub-pages. Moved from a prominent top-level group to a sub-item under Audit because it answers compliance questions, not operational questions. The name is unchanged — "Identity & Trust" communicates value well, it just needs to be in the right context.

**Audit Log** — `/audit/log`
New page. A filterable, time-ordered log of all governance events: credential issuance, policy evaluations, authorization decisions, node registrations. Pairs with Identity & Trust for compliance workflows.

---

#### Footer items (below separator)

**Settings** — `/settings`
General application settings: user preferences, API keys, appearance. Infrastructure for the app itself, not for agent operations.

**Docs** — external link to documentation
Opens in new tab. Contextual documentation is handled via the command palette (see Section 3), not via a docs page in the sidebar.

---

### Collapsed State (icon-only)

| Icon | Page | Tooltip (on hover) |
|------|------|-------------------|
| ○ | Overview | Overview |
| ⬡ | System Health | System Health |
| ≋ | Live Activity | Live Activity |
| □ | Nodes | Fleet — Nodes |
| ⟲ | Executions | Fleet — Executions |
| ◈ | Workflows | Fleet — Workflows |
| ⚙ | Agents | Configure — Agents |
| 🔑 | Authorization | Configure — Authorization |
| ◳ | Integrations | Configure — Integrations |
| 🔍 | Identity & Trust | Audit — Identity & Trust |
| 📋 | Audit Log | Audit — Audit Log |
| ⚙ | Settings | Settings |

Tooltips appear after 400ms hover delay. Badges are visible in collapsed state (position: absolute top-right of icon).

---

## 3. Command Palette & Global Search

### Motivation

The `cmdk` component is already installed but unused. A command palette is the single highest-leverage navigation improvement: it lets expert users navigate, search, and take actions without touching the sidebar at all.

### Trigger

- `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux) — open from anywhere
- `/` — open when focus is on an empty area (not in an input)
- Click the search icon in the sidebar header (visible in expanded state)

### Architecture

The palette has three modes, selected automatically based on query prefix:

#### Default mode (no prefix): Navigation + Recent

```
⌘K ───────────────────────────────────────────────
  Search or jump to...

  RECENT
  > Execution exec_7f3a1b  (failed, 2m ago)
  > Node payments-agent    (degraded)

  PAGES
  > System Health
  > Live Activity
  > Nodes
  > Executions
  ...

  ACTIONS
  > Open Execution Replay
  > Register New Agent
  > Create Authorization Policy
──────────────────────────────────────────────────
```

#### Node/Execution search (prefix: `n:` or `e:`)

```
⌘K ───────────────────────────────────────────────
  n: payments

  NODES matching "payments"
  > payments-agent        ● active   3 reasoners
  > payments-gateway      ○ offline  last seen 5m
──────────────────────────────────────────────────
```

```
⌘K ───────────────────────────────────────────────
  e: exec_7f

  EXECUTIONS matching "exec_7f"
  > exec_7f3a1b  payments-agent.process_payment  failed
  > exec_7f9c2d  billing-agent.reconcile         done
──────────────────────────────────────────────────
```

#### Action mode (prefix: `>`)

```
⌘K ───────────────────────────────────────────────
  > retry

  ACTIONS
  > Retry execution exec_7f3a1b
  > Retry all failed in last hour  (3 executions)
──────────────────────────────────────────────────
```

### Search Prefixes

| Prefix | Searches | Example |
|--------|---------|---------|
| (none) | Pages + recent items | `system health` |
| `n:` | Node names | `n: payments` |
| `e:` | Execution IDs and agent/reasoner names | `e: exec_7f` |
| `w:` | Workflow names | `w: onboarding` |
| `>` | Actions (retry, cancel, restart, navigate) | `> cancel stuck` |
| `?` | Documentation topics | `? circuit breaker` |

### Result Ranking

1. Exact prefix matches (e.g., execution ID starts with query)
2. Recent items matching query
3. Active/degraded items (unhealthy nodes surface higher than healthy ones)
4. Full-text matches on name/ID
5. Semantic matches (future: embedding-based)

### Implementation Notes

- Results backed by client-side index (nodes, executions cached from API) + static page list
- Execution search queries the API with debounce (300ms)
- Actions are registered by pages — each page exports its available cmdk actions to a global registry
- Keyboard navigation: `↑↓` to move, `Enter` to select, `Esc` to close
- Selection opens the item's detail page or triggers the action inline

---

## 4. Breadcrumb Improvements

### Current State

Breadcrumbs are inconsistently applied. Some detail pages have them, some do not. The labels do not always reflect the sidebar group hierarchy.

### Proposed Standard

All pages below the top-level group pages get a breadcrumb. The format is:

```
[Group Label] / [List Page] / [Item Name or ID]
```

Examples:

```
Fleet / Executions / exec_7f3a1b
Fleet / Nodes / payments-agent / Reasoners
Audit / Identity & Trust / did:af:node:payments-agent
Configure / Agents / payments-agent / Settings
```

Rules:
- Each segment is a clickable link except the last (current page)
- The group label segment links to the first page in that group (e.g., "Fleet" links to `/fleet/nodes`)
- Item names are preferred over IDs. If only an ID is available, truncate to 8 characters with a tooltip for the full ID
- Breadcrumbs appear below the page title on mobile, inline with the page title on desktop (right side)

### Page Title Format

Page titles in `<title>` and the browser tab follow this format:

```
[Page Name] — [Item Name if applicable] — AgentField
```

Examples:
- `System Health — AgentField`
- `Execution Detail — exec_7f3a1b — AgentField`
- `Node — payments-agent — AgentField`

This ensures bookmarks and browser history entries are human-readable.

---

## 5. Keyboard Shortcuts Scheme

### Sidebar Navigation (global, works from any page)

These shortcuts work regardless of focus, except when the user is inside a text input.

| Shortcut | Destination |
|----------|-------------|
| `Cmd+K` | Open command palette |
| `G then H` | Overview (Go Home) |
| `G then S` | System Health (Go Status) |
| `G then A` | Live Activity |
| `G then N` | Nodes |
| `G then E` | Executions |
| `G then W` | Workflows |
| `G then C` | Configure — Agents |
| `G then I` | Identity & Trust |

The `G then X` pattern is borrowed from GitHub's navigation shortcuts. It is discoverable: pressing `G` alone shows a brief tooltip overlay listing available second keys.

### Page-Level Shortcuts (active on specific pages)

#### Executions list (`/fleet/executions`)
| Shortcut | Action |
|----------|--------|
| `R` | Retry selected execution |
| `X` | Cancel selected execution |
| `F` | Focus filter input |
| `↑ / ↓` | Move selection |
| `Enter` | Open execution detail |

#### System Health (`/health`)
| Shortcut | Action |
|----------|--------|
| `R` | Refresh all health checks |
| `1–5` | Jump to layer (1=LLM, 2=Nodes, 3=Queue, 4=Executions, 5=Alerts) |

#### Nodes list (`/fleet/nodes`)
| Shortcut | Action |
|----------|--------|
| `↑ / ↓` | Move selection |
| `Enter` | Open node detail |
| `S` | Start selected node |
| `P` | Stop (pause) selected node |

### Global Actions

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+B` | Toggle sidebar |
| `?` | Open keyboard shortcut help overlay |
| `Esc` | Close any modal/drawer/palette |

### Implementation

Shortcuts are registered via a global `useKeyboardShortcuts` hook. Each page registers its own shortcuts on mount and deregisters on unmount. The global `G then X` shortcuts are always registered. The `?` overlay reads from the registry and displays all currently active shortcuts.

Shortcuts are suppressed when:
- Focus is inside `<input>`, `<textarea>`, or `contenteditable`
- A modal is open (only modal-specific shortcuts apply)
- The command palette is open

---

## 6. Page Title and URL Strategy

### URL Design Principles

1. **Predictable hierarchy.** URLs mirror the sidebar group hierarchy: `/fleet/nodes`, `/configure/authorization`, `/audit/identity`.
2. **Stable entity IDs.** Entity detail pages use the entity's canonical ID, never a numeric database row ID that could change.
3. **Action routes are sub-paths.** Actions on an entity are sub-paths of the entity: `/fleet/executions/exec_7f3a1b/replay`, not `/actions/replay?executionId=exec_7f3a1b`.
4. **Filter state in query params.** List filters are query parameters, not path segments: `/fleet/executions?status=failed&agent=payments-agent`.
5. **No ambiguity.** The same page should never be reachable via multiple URLs.

### URL Inventory

| Route | Page | Notes |
|-------|------|-------|
| `/` | Overview / Dashboard | Redirects to `/health` if alerts active |
| `/health` | System Health | |
| `/activity` | Live Activity | |
| `/fleet/nodes` | Node List | |
| `/fleet/nodes/:nodeId` | Node Detail | `nodeId` = node slug/ID |
| `/fleet/nodes/:nodeId/reasoners` | Reasoners tab | Tab as sub-route for deep linking |
| `/fleet/nodes/:nodeId/reasoners/:reasonerId` | Reasoner Detail | |
| `/fleet/executions` | Execution List | |
| `/fleet/executions/:executionId` | Execution Detail | |
| `/fleet/executions/:executionId/replay` | Replay UI | |
| `/fleet/workflows` | Workflow List | |
| `/fleet/workflows/:workflowId` | Workflow Detail / DAG | |
| `/configure/agents` | Agent Configuration | |
| `/configure/authorization` | Authorization Policies | |
| `/configure/integrations` | Integrations & Webhooks | |
| `/audit/identity` | DID Explorer | |
| `/audit/identity/:did` | DID Detail | |
| `/audit/identity/:did/credentials` | VC Chain for a DID | |
| `/audit/log` | Audit Log | |
| `/settings` | Application Settings | |

### Query Parameter Conventions

List pages support these standard query params:

| Param | Type | Used on |
|-------|------|---------|
| `status` | enum | executions, nodes |
| `agent` | string (nodeId) | executions, workflows |
| `from` | ISO8601 | executions, audit log |
| `to` | ISO8601 | executions, audit log |
| `q` | string | free text search |
| `page` | integer | all paginated lists |
| `sort` | field:asc/desc | all lists |

These params are persisted in the URL so filtered views can be bookmarked and shared.

---

## 7. Deep-Linking Support

### What Must Be Deep-Linkable

Every page in the application must render correctly when loaded from a direct URL with no prior navigation. This includes:

- Entity detail pages (`/fleet/executions/exec_7f3a1b`) — must fetch entity by ID on mount, not rely on cached list data
- Filtered list views (`/fleet/executions?status=failed`) — must initialize filters from URL params on mount
- Tab-as-sub-route pages (`/fleet/nodes/:nodeId/reasoners`) — must render the correct tab on direct load

### Link Generation

Every detail page exposes a "Copy Link" action in the page header actions menu. The copied URL is the canonical URL for that entity, including any active filters or selected tab.

The command palette "recent items" list stores full URLs, not just entity IDs, so returning to a recent item restores exact state.

### Status Change Links

Notification systems and webhooks that emit URLs for actionable items should use the canonical detail URL pattern. For example, a webhook payload for a failed execution should include:

```json
{
  "execution_id": "exec_7f3a1b",
  "status": "failed",
  "ui_url": "https://app.agentfield.io/fleet/executions/exec_7f3a1b"
}
```

The Integrations page provides a URL template that operators can use when configuring external alerting.

---

## 8. Migration Path from Current to New Navigation

### Invariant: No Broken Bookmarks

All existing URL patterns must continue to work. They redirect to the new canonical URL with a `301 Moved Permanently` (or client-side redirect equivalent in the React Router layer).

### Redirect Map

| Old URL | New URL | Notes |
|---------|---------|-------|
| `/dashboard` | `/` | Overview |
| `/nodes` | `/fleet/nodes` | |
| `/nodes/:id` | `/fleet/nodes/:id` | |
| `/reasoners` | `/fleet/nodes` | Reasoners list moved inside Node detail; land on node list |
| `/reasoners/:id` | `/fleet/nodes/:nodeId/reasoners/:reasonerId` | Requires ID lookup; see note below |
| `/executions` | `/fleet/executions` | |
| `/executions/:id` | `/fleet/executions/:id` | |
| `/workflows` | `/fleet/workflows` | |
| `/workflows/:id` | `/fleet/workflows/:id` | |
| `/identity` | `/audit/identity` | |
| `/identity/:did` | `/audit/identity/:did` | |
| `/credentials` | `/audit/identity` | Credentials now under Identity |
| `/authorization` | `/configure/authorization` | |
| `/settings` | `/settings` | Unchanged |
| `/settings/webhook` | `/configure/integrations` | |

**Note on `/reasoners/:id`:** The old reasoner detail page used a reasoner-scoped ID. The new URL requires the parent node ID. On redirect, the app performs a lookup: `GET /api/v1/reasoners/:id` to fetch the parent node, then redirects to the correct new URL. If the lookup fails, redirect to `/fleet/nodes`.

### Feature Flag Rollout

Navigation restructuring affects muscle memory. To reduce friction for existing users:

**Phase 1 (2 weeks):** New URLs are active. Old URLs redirect. Sidebar shows new structure. A dismissable banner appears: "Navigation has been reorganized — [see what changed]" linking to a changelog entry.

**Phase 2 (4 weeks after Phase 1):** Old URL redirects remain active. Banner removed. Monitor analytics for navigation confusion patterns (users going back immediately after landing on a page = wrong destination).

**Phase 3 (90 days after Phase 1):** Old URL redirects produce a 410 Gone with a message pointing to the new URL pattern. This is the hard cutover for any external tools or bookmarks that haven't been updated.

### Preserving User Familiarity

Items that keep their names (Executions, Workflows, Settings) require no relearning. Items that change name or location get a one-time tooltip on first visit after migration:

- "Agent Hub" → "Fleet" group: tooltip on first visit to `/fleet/nodes` — "Agent Hub is now Fleet. Your agents are here."
- "Individual Executions" merger: tooltip on first visit to `/fleet/executions` — "Individual and Workflow Executions are now in one unified list. Use the Type filter to separate them."
- "Identity & Trust" move: tooltip on first visit to `/audit/identity` — "Identity & Trust has moved to Audit."
- "Settings > Webhook" move: tooltip on first visit to `/configure/integrations` — "Observability Webhook has moved to Integrations."

Tooltips are stored per-user in localStorage and dismissed after acknowledgment or 3 views.

---

## Summary: Mapping Navigation to Journeys

| Journey | Priority | Primary Nav Items |
|---------|----------|------------------|
| Monitor & Observe | P0 | Overview, System Health, Live Activity |
| Diagnose & Fix | P0 | System Health, Executions (with retry/cancel), Nodes |
| Deploy & Configure | P1 | Fleet > Nodes, Configure > Agents, Configure > Integrations |
| Review & Audit | P2 | Fleet > Executions, Fleet > Workflows, Audit > Identity & Trust, Audit > Audit Log |
| Scale & Operate | P1 | System Health, Configure > Agents, Configure > Authorization |

The command palette (`Cmd+K`) is a cross-cutting tool that spans all five journeys — it is the fastest path to any entity or action once a user knows the system.
