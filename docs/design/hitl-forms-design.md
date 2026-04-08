# Native HITL Forms — Design Doc

**Status:** Approved, in implementation
**Branch:** `dev/hitl-ideate` (design) → slices will land as separate PRs
**Owner:** Platform
**Last updated:** 2026-04-08

---

## Motivation

AgentField today supports human-in-the-loop via `app.pause(approval_request_id, approval_request_url)`. The agent creates an approval request on an **external** service (e.g. hax-sdk Response Hub), passes the ID/URL to the control plane, and the CP transitions the execution to `waiting` until a webhook callback resolves it.

This works but requires a second system. We want a **native, built-in HITL portal** inside the AgentField control plane so an OSS install has zero-config human-in-the-loop:

- Agent calls `app.pause(form_schema=...)`
- UI shows a form at `/hitl/<request_id>`
- Any human with access to the UI fills it in
- Execution resumes with the form values

Think: hax-sdk Response Hub, but bundled, open-source, and shadcn-native.

## Key insight — the CP is already decoupled

`control-plane/internal/handlers/execute_approval.go` already says: *"The control plane manages execution state only — the agent is responsible for communicating with external approval services."* The CP doesn't care **who** POSTs to `/webhooks/approval` with a matching `requestId`.

So we do **not replace hax-sdk**. We become a **second, built-in responder** on top of the existing pause/resume infrastructure.

## Non-goals (v1)

- File uploads (needs artifact storage design)
- Signature pad / canvas fields
- VC-signed responses
- Runtime iframe plugin system
- History page for past responses
- Custom portal theming
- Multi-step wizards
- SSO / auth on the portal (OSS single-user mode — anyone with UI access can respond)

## Product shape

Two UI surfaces, one data model:

| Surface | Audience | Route | Look |
|---|---|---|---|
| Developer UI (existing) | Engineers building agents | `/ui/*` | Dense, DAG-first ops tool |
| **HITL Portal (new)** | Responders — anyone who needs to fill a form | `/hitl/*` | Clean inbox shell, single-purpose |

The HITL portal is **deliberately not part of the developer UI.** Different layout shell, no sidebar, no dev nav. Same React app, same shadcn tokens, same Tailwind config — just a different layout branch under a different route prefix.

### Pages

```
/hitl                          → Inbox (list of all pending items)
/hitl/:request_id              → Single item — renders the form (edit or readonly)
/hitl/:request_id/done         → Thank-you confirmation
```

## Design principle: shadcn defaults, nothing custom

**This is a hard constraint.**

- Every visible element is a **shadcn primitive** as-is. `Button`, `Input`, `Textarea`, `Select`, `RadioGroup`, `Checkbox`, `Switch`, `Calendar`, `Popover`, `Command`, `Card`, `Badge`, `Separator`, `Label`, `Alert`, `Skeleton`, `ScrollArea`, `Tooltip`, `Dialog`.
- **Do not modify the existing shadcn template, tokens, or theme.** Use the project's `tailwind.config.*` as-is. No new CSS files. No new design tokens. No overridden primitives.
- Typography inherits from the existing project type scale.
- Dark mode works because we use shadcn tokens.
- **Only new deps:** `react-markdown`, `remark-gfm`, `rehype-sanitize`.

If a requirement can't be met by a shadcn default, push back or defer.

## Data model

### Migration `028_add_hitl_form_fields.sql`

```sql
-- Native HITL form support on top of existing approval flow.
-- All columns nullable — existing hax-sdk approvals unaffected.

ALTER TABLE workflow_executions ADD COLUMN approval_form_schema TEXT;    -- JSON
ALTER TABLE workflow_executions ADD COLUMN approval_responder    TEXT;   -- display name
ALTER TABLE workflow_executions ADD COLUMN approval_tags         TEXT;   -- JSON array
ALTER TABLE workflow_executions ADD COLUMN approval_priority     TEXT;   -- low|normal|high|urgent

CREATE INDEX IF NOT EXISTS idx_workflow_executions_hitl_pending
  ON workflow_executions (approval_status)
  WHERE approval_form_schema IS NOT NULL;
```

Mirror the change in the SQLite local-mode schema.

### Type additions (`pkg/types/types.go`, `internal/storage/models.go`)

`WorkflowExecution` struct gains:

```go
ApprovalFormSchema *string `json:"approval_form_schema,omitempty"`
ApprovalResponder  *string `json:"approval_responder,omitempty"`
ApprovalTags       *string `json:"approval_tags,omitempty"` // JSON-encoded []string
ApprovalPriority   *string `json:"approval_priority,omitempty"`
```

## Form schema (JSON)

The full shape the SDK sends, the CP stores, and the portal renders:

```json
{
  "title": "Review PR #1138 — refactor auth middleware",
  "description": "## Summary\n\nRipping out session-token storage per legal...",
  "tags": ["pr-review", "team:platform"],
  "priority": "normal",
  "fields": [
    { "type": "markdown", "content": "### Diff\n```go\n- session.Store(token)\n+ session.StoreEncrypted(token)\n```" },
    {
      "type": "button_group",
      "name": "decision",
      "label": "Your call",
      "required": true,
      "options": [
        { "value": "approve",         "label": "Approve",         "variant": "default" },
        { "value": "request_changes", "label": "Request changes", "variant": "secondary" },
        { "value": "reject",          "label": "Reject",          "variant": "destructive" }
      ]
    },
    {
      "type": "textarea",
      "name": "comments",
      "label": "Comments",
      "placeholder": "Optional context...",
      "rows": 4,
      "hidden_when": { "field": "decision", "equals": "approve" }
    },
    { "type": "checkbox", "name": "block_merge", "label": "Block merge until resolved", "default": false }
  ],
  "submit_label": "Submit review"
}
```

### Schema-level options

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required. Heading of the form. |
| `description` | string | Optional. Markdown. Rendered above the fields. |
| `tags` | string[] | Optional. Used for inbox filtering. |
| `priority` | `"low" \| "normal" \| "high" \| "urgent"` | Default `normal`. Shown as a badge in the inbox. |
| `fields` | Field[] | Required. The actual form. |
| `submit_label` | string | Default `"Submit"`. Overridden when form contains a `button_group`. |
| `cancel_label` | string | Optional. If set, shows a cancel button that submits `{_cancelled: true}`. |

### Field types (v1)

All map to shadcn primitives with **no customization**.

| `type` | Maps to | Field-specific options |
|---|---|---|
| `markdown` | `react-markdown` + `remark-gfm` + `rehype-sanitize` block | `content` |
| `text` | `Label` + `Input` | `placeholder`, `max_length`, `pattern` |
| `textarea` | `Label` + `Textarea` | `placeholder`, `rows`, `max_length` |
| `number` | `Label` + `Input type=number` | `min`, `max`, `step` |
| `select` | `Label` + `Select` | `options: [{value,label}]` |
| `multiselect` | `Label` + `Popover` + `Command` | `options`, `min_items`, `max_items` |
| `radio` | `Label` + `RadioGroup` | `options` |
| `checkbox` | `Checkbox` + `Label` | single boolean |
| `switch` | `Switch` + `Label` | single boolean |
| `date` | `Label` + `Popover` + `Calendar` | `min_date`, `max_date` |
| `button_group` | row of `Button`s (`size="lg"`) | `options: [{value,label,variant}]` — clicking submits the whole form with that value |
| `divider` | `Separator` | none |
| `heading` | `<h3>` with project typography | `text` |

### Common field options (all types that have a `name`)

| Option | Purpose |
|---|---|
| `name` | Required. Key in the submitted response dict. |
| `label` | Optional. Field label. |
| `help` | Optional. Muted help text under the field. |
| `required` | Default `false`. |
| `default` | Default value. |
| `disabled` | Force-disable. |
| `hidden_when` | See below. |

### `hidden_when` — conditional visibility (v1)

Flat form only in v1. Forward-compatible with composite `all`/`any` later.

```ts
type HiddenWhen =
  | { field: string; equals: unknown }
  | { field: string; notEquals: unknown }
  | { field: string; in: unknown[] }
  | { field: string; notIn: unknown[] }
```

When a field becomes hidden, its value is **removed** from the submitted dict so the agent doesn't receive stale data from a hidden branch.

### Unknown field types

The frontend field registry falls back to an `UnknownField` component that renders a shadcn `Alert variant="destructive"` with a helpful message: `"Unknown field type: <type>. Did you forget to register a custom field?"`

### Plugin extensibility (Tier A — file-drop)

```ts
// control-plane/web/client/src/hitl/fields/registry.ts
export function registerHitlField(type: string, component: FieldComponent): void
```

OSS devs create `src/hitl/fields/custom/MyField.tsx` and import it in `src/hitl/fields/custom/index.ts`. Rebuild. Done. No runtime plugin system in v1.

## Backend API (new)

All under `/api/hitl/v1/*`. No auth (matches `/api/ui/*` in local/OSS mode).

### `GET /api/hitl/v1/pending`

Lists pending HITL items.

**Query params:** `tag` (repeatable), `priority`, `limit`, `offset`.

**WHERE:** `status = 'waiting' AND approval_status = 'pending' AND approval_form_schema IS NOT NULL`.

**Response item shape:**
```json
{
  "request_id": "uuid",
  "execution_id": "uuid",
  "agent_node_id": "refund-bot",
  "workflow_id": "wf_abc",
  "title": "...",
  "description_preview": "...(first ~200 chars, markdown stripped)",
  "tags": ["pr-review"],
  "priority": "normal",
  "requested_at": "RFC3339",
  "expires_at": "RFC3339"
}
```

`title` and `description_preview` are extracted server-side from `approval_form_schema` so the inbox list is cheap.

### `GET /api/hitl/v1/pending/:request_id`

Full detail.

**Response (pending):**
```json
{
  "request_id": "...",
  "execution_id": "...",
  "agent_node_id": "...",
  "workflow_id": "...",
  "schema": { /* full form schema */ },
  "requested_at": "...",
  "expires_at": "...",
  "status": "pending",
  "readonly": false
}
```

**Response (already responded):**
```json
{
  "request_id": "...",
  "schema": { /* full form schema */ },
  "status": "approved",
  "readonly": true,
  "response": { /* submitted values */ },
  "responder": "Alice",
  "responded_at": "..."
}
```

404 if not found or no schema.

### `POST /api/hitl/v1/pending/:request_id/respond`

Submit a response.

**Body:**
```json
{
  "responder": "Alice",
  "response": { "decision": "approve", "comments": "LGTM", "block_merge": false }
}
```

**Behavior:**
1. Load the workflow execution by `request_id`.
2. Guard: `approval_status` must be `pending`, execution must be `waiting`. Else 409.
3. **Re-validate** `response` against the stored `form_schema` server-side (required, types, enums, bounds, regex). Return 400 with per-field errors on failure.
4. Derive canonical decision:
   - If `response.decision` is set, pass it through `normalizeDecision` (existing helper).
   - Else default to `"approved"`.
5. Call the shared `resolveApproval(wfExec, payload)` helper — extracted from the existing `webhook_approval.go` `handleApprovalWebhook`. **Do not duplicate state-transition logic.**
6. Store `approval_responder = responder` in the same update.
7. Return `{ status, decision, execution_id }`.

### `GET /api/hitl/v1/stream` — dedicated SSE

Subscribes to the existing execution event bus, filters to HITL-relevant events only, and emits:

- `hitl.pending.added` — payload matches list item shape
- `hitl.pending.resolved` — payload: `{ request_id, decision, responder, responded_at }`

Reuses existing SSE plumbing (keepalive pings, flush on write, context cancellation on disconnect).

### Extension of existing `POST /request-approval`

`RequestApprovalRequest` gains:
```go
FormSchema json.RawMessage `json:"form_schema,omitempty"`
Tags       []string        `json:"tags,omitempty"`
Priority   string          `json:"priority,omitempty"`
```

Behavior:
- Validate `FormSchema` is parseable JSON with `fields: [...]`. 400 on failure.
- Validate `Priority` in allowed set. Default `normal`.
- Store all four new fields.
- If `FormSchema` is set and `ApprovalRequestURL` is empty, auto-generate `{server_base}/hitl/{request_id}`.
- Include `form_schema_present: true`, `tags`, `priority` in the `ExecutionWaiting` event payload.

### Webhook handler refactor

Extract the body of `handleApprovalWebhook` into `(c *webhookApprovalController) resolveApproval(ctx, wfExec, payload)` so the portal endpoint can call it directly without going through HTTP. Existing webhook endpoint keeps working unchanged.

### Storage layer

`QueryWorkflowExecutions` filters gain:
- `HasFormSchema *bool`
- `Tags []string` (any-of match)
- `Priority *string`
- `ApprovalStatusEq *string`

Implement for both SQLite (local) and PostgreSQL backends. Tags match is "any-of" via JSON text match in v1 (no native array column).

## SDK changes

### Python SDK

**`sdk/python/agentfield/client.py`** — `request_approval` gains `form_schema`, `tags`, `priority` kwargs. Body includes them when non-None.

**`sdk/python/agentfield/agent.py`** — `pause` method:
```python
async def pause(
    self,
    approval_request_id: Optional[str] = None,
    approval_request_url: str = "",
    expires_in_hours: int = 72,
    timeout: Optional[float] = None,
    execution_id: Optional[str] = None,
    form_schema: Optional[dict] = None,   # NEW
    tags: Optional[list[str]] = None,     # NEW
    priority: Optional[str] = None,       # NEW
) -> ApprovalResult: ...
```

- If `approval_request_id` is None **and** `form_schema` is provided, auto-generate a UUID.
- If `form_schema` is set and `approval_request_url` is empty, omit URL (CP will auto-generate).
- `ApprovalResult.raw_response` carries the submitted form values dict.

**`sdk/python/agentfield/hitl.py`** (new) — typed form builder helpers:

```python
from agentfield import hitl

schema = hitl.Form(
    title="Review PR #1138",
    description="...",
    tags=["pr-review"],
    fields=[
        hitl.Markdown("### Diff\n```..."),
        hitl.ButtonGroup("decision", options=[
            hitl.Option("approve", "Approve"),
            hitl.Option("reject",  "Reject", variant="destructive"),
        ], required=True),
        hitl.Textarea("comments", label="Comments"),
    ],
).to_dict()
```

Thin dataclass/Pydantic wrappers producing the JSON schema. Users can also pass a raw dict.

**Tests:** `sdk/python/tests/test_hitl.py` — builder, `pause(form_schema=...)` serialization, end-to-end with mock CP.

### Go SDK

Mirror:
- `sdk/go/client/approval.go` — `ApprovalRequest` gains `FormSchema`, `Tags`, `Priority`.
- `sdk/go/agent/` — `Pause` method same new fields.
- `sdk/go/hitl/` — builder pkg with `Form`, `Field`, `ButtonGroup`, `Markdown`, etc.
- Tests mirror the Python suite.

## Frontend — `/hitl` tree

### New deps
```
pnpm add react-markdown remark-gfm rehype-sanitize
```

### File tree

```
control-plane/web/client/src/hitl/
├── types.ts                     # HitlFormSchema, HitlField, HitlPendingItem
├── api.ts                       # fetch wrappers for /api/hitl/v1/*
├── sse.ts                       # EventSource wrapper for /api/hitl/v1/stream
├── validation.ts                # schema-driven client-side validation
├── visibility.ts                # hidden_when resolver
├── layout/
│   └── HitlLayout.tsx           # clean inbox shell (no dev nav)
├── pages/
│   ├── HitlInboxPage.tsx        # /hitl
│   ├── HitlFormPage.tsx         # /hitl/:request_id  (edit or readonly)
│   └── HitlDonePage.tsx         # /hitl/:request_id/done
├── components/
│   ├── HitlFormRenderer.tsx     # the engine
│   ├── HitlInboxCard.tsx
│   ├── HitlTagBadge.tsx
│   ├── HitlPriorityBadge.tsx
│   ├── HitlResponderBanner.tsx  # "Responding as: X" + edit
│   ├── HitlMarkdown.tsx         # react-markdown wrapper
│   ├── HitlEmptyState.tsx
│   ├── HitlReadonlyBanner.tsx
│   └── HitlExpiredBanner.tsx
├── fields/
│   ├── registry.ts
│   ├── types.ts                 # FieldComponentProps uniform contract
│   ├── builtins.ts              # imports and registers all built-ins
│   ├── MarkdownField.tsx
│   ├── TextField.tsx
│   ├── TextareaField.tsx
│   ├── NumberField.tsx
│   ├── SelectField.tsx
│   ├── MultiSelectField.tsx
│   ├── RadioField.tsx
│   ├── CheckboxField.tsx
│   ├── SwitchField.tsx
│   ├── DateField.tsx
│   ├── ButtonGroupField.tsx
│   ├── DividerField.tsx
│   ├── HeadingField.tsx
│   ├── UnknownField.tsx
│   └── custom/
│       └── index.ts             # OSS plugin drop zone
├── hooks/
│   ├── useHitlInbox.ts          # react-query + SSE
│   ├── useHitlItem.ts
│   └── useResponderIdentity.ts  # localStorage display name
└── index.ts                     # public exports incl. registerHitlField
```

### Routing

Top-level router branches:

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/hitl/*" element={<HitlLayout />}>
      <Route index element={<HitlInboxPage />} />
      <Route path=":requestId" element={<HitlFormPage />} />
      <Route path=":requestId/done" element={<HitlDonePage />} />
    </Route>
    <Route path="/*" element={<ExistingDevLayout />}>
      {/* existing routes — untouched */}
    </Route>
  </Routes>
</BrowserRouter>
```

### `HitlLayout`

- Top bar: left = small wordmark + "HITL" label. Right = `HitlResponderBanner` (display name + `Pencil` icon, opens shadcn `Dialog` to edit).
- `Separator`
- Centered column, `max-w-3xl mx-auto px-6 py-8`.
- `<Outlet />`
- Subtle footer link to `/ui` for devs who wandered in.

No sidebar. No tabs. No command palette. Single-purpose shell.

### `HitlInboxPage`

- `h1`: "Tasks awaiting your input"
- Filter row: tag chips (`Badge` + click toggle) + priority `Select`
- Stack of `HitlInboxCard`s (mobile-first; max-width keeps it narrow on desktop)
- `HitlInboxCard`: shadcn `Card` → `CardHeader` (title, truncated) + `CardContent` (description preview with `line-clamp-2`, tags, priority badge, "5 min ago", "expires in 23h", `ChevronRight`). Whole card is a `<Link>`.
- Loading: `Skeleton` cards.
- Empty: `HitlEmptyState` — centered, friendly copy.
- Live updates via `useHitlInbox` hook merging SSE events into react-query cache.

### `HitlFormPage`

Three render states based on API response:

1. **Pending** → editable form
2. **Already responded** → `HitlReadonlyBanner` + form with `mode="readonly"` + responder name + timestamp
3. **Expired** → `HitlExpiredBanner` + readonly form if values present

Layout:
- Back link ("← Back to inbox")
- `h1` = `schema.title`
- `HitlMarkdown` for `schema.description`
- `<Separator />`
- `<HitlFormRenderer schema={schema} onSubmit={handleSubmit} mode={mode} />`

On submit: POST → navigate to `/hitl/:id/done`. On error: shadcn `Alert` at top + per-field errors.

### `HitlDonePage`

Centered `Card` with a checkmark icon, "Response recorded", responder name, small "Back to inbox" link.

### `HitlFormRenderer` — the engine

Contract:
```tsx
<HitlFormRenderer
  schema={HitlFormSchema}
  initialValues={Record<string, any>}
  mode="edit" | "readonly"
  onSubmit={(values: Record<string, any>) => Promise<void>}
/>
```

Internals:
- `useState` for `values`, `errors`, `submitting`
- For each field:
  1. Evaluate `hidden_when` against current `values` — skip if hidden
  2. Look up component in `registry` by `field.type`; fall back to `UnknownField`
  3. Render with `{ field, value, onChange, error, disabled: mode === 'readonly' }`
- On submit:
  1. Remove hidden-field values from `values`
  2. Run `validate(schema, values)` → `{ok, errors}`
  3. If errors, update state, scroll to first error
  4. If ok, call `onSubmit(values)`
- `button_group` field calls `submitWithValue(name, value)` on a context provided by the renderer — clicking a button sets its value and immediately submits

Sticky footer: shadcn `Button type="submit"` with `schema.submit_label`. Hidden if the form contains a `button_group` that handles submission.

### Field registry

```ts
// fields/registry.ts
import type { ComponentType } from "react"
import type { FieldComponentProps } from "./types"

const registry = new Map<string, ComponentType<FieldComponentProps>>()

export function registerHitlField(type: string, component: ComponentType<FieldComponentProps>): void {
  registry.set(type, component)
}

export function getHitlField(type: string): ComponentType<FieldComponentProps> | undefined {
  return registry.get(type)
}

// Side-effect imports
import "./builtins"
import "./custom"
```

`fields/builtins.ts` registers all built-in fields at module load.
`fields/custom/index.ts` is a manifest OSS users edit:
```ts
// Add custom fields here:
// import "./MyField"
export {}
```

### SSE hook

```ts
export function useHitlInbox(filters?: { tags?: string[]; priority?: string }) {
  const query = useQuery({
    queryKey: ["hitl", "pending", filters],
    queryFn: () => hitlApi.listPending(filters),
  })

  useEffect(() => {
    const es = new EventSource("/api/hitl/v1/stream")
    es.addEventListener("hitl.pending.added", (e) => {
      const item = JSON.parse((e as MessageEvent).data)
      queryClient.setQueryData(["hitl", "pending", filters], (prev) => mergeItem(prev, item))
    })
    es.addEventListener("hitl.pending.resolved", (e) => {
      const { request_id } = JSON.parse((e as MessageEvent).data)
      queryClient.setQueryData(["hitl", "pending", filters], (prev) => removeItem(prev, request_id))
    })
    es.onerror = () => { /* let browser auto-reconnect */ }
    return () => es.close()
  }, [JSON.stringify(filters)])

  return query
}
```

Match the existing SSE patterns in `services/executionsApi.ts`.

### Responder identity

```ts
export function useResponderIdentity() {
  const [name, setName] = useState(() => localStorage.getItem("af.hitl.responder") ?? "")
  const update = (next: string) => {
    localStorage.setItem("af.hitl.responder", next)
    setName(next)
  }
  return { name, setName: update }
}
```

On first submission with empty name, prompt via shadcn `Dialog`.

### NotificationBell integration

When a notification's `eventKind === "pause"` **and** event data includes `form_schema_present: true`, render an extra "Respond →" button linking to `/hitl/{request_id}`. ~15 lines of change in `src/components/NotificationBell.tsx`.

## Example

`examples/python_agent_nodes/hitl_form/main.py` — a polished PR-review agent that pauses with a rich schema (markdown diff + button group + comments textarea).

`examples/python_agent_nodes/hitl_form/README.md` — how to run, screenshot of inbox + form.

## Documentation

- Section in main `README.md` — "Human-in-the-loop forms"
- `docs/hitl.md` — schema reference, field type table, `hidden_when` docs, custom plugin field how-to

## Test criteria

**Backend:**
- Existing tests pass unchanged
- New `hitl_portal_test.go`: list empty, list with items, tag filter, priority filter, detail not found, detail readonly, respond happy path, respond validation failures per field type, respond-twice (409), respond to non-existent
- `execute_approval_test.go`: new cases for form_schema, tags, priority, auto-URL generation
- `webhook_approval_test.go`: extracted `resolveApproval` helper doesn't regress webhook path

**SDK:**
- `test_hitl.py`: builder, `pause` serialization, e2e with mock CP
- Go equivalent

**Frontend:**
- `npm run lint` clean
- Smoke test: run example agent, trigger pause, item appears in `/hitl` live, submit, item disappears live, agent resumes with values

**Manual UX:**
- `/hitl` empty state is friendly
- Submit → done page → inbox (item gone)
- Readonly view shows submitted values + responder
- Expired view
- Dark mode works
- No changes to any existing shadcn component or Tailwind config

## Shipping sequence

Four slices, each a separate PR:

1. **Backend + migration** — migration, types, approval request extensions, portal handlers, SSE, webhook refactor, tests. Independently mergeable.
2. **SDK (Py + Go)** — new kwargs, builder helpers, tests. Independent of frontend.
3. **Frontend** — `/hitl` route tree, renderer, fields, inbox, form, done, SSE, notification-bell CTA. Depends on slice 1.
4. **Example + docs** — PR-review example, README, `docs/hitl.md`. Depends on 1–3.

Slices 1 and 2 can be built in parallel. Slice 3 waits for slice 1 to be reviewable. Slice 4 wraps it up.
