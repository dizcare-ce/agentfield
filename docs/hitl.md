# Human-in-the-Loop Forms

Native, built-in HITL forms let your agents pause execution and present a structured form to a human reviewer — all without connecting to an external approval service.

The reviewer opens `/hitl` in the AgentField UI, fills in the form, and the agent resumes with their response. Everything is handled by the control plane you already run.

## How it differs from external approval services

AgentField has always supported human-in-the-loop via `app.pause(approval_request_id=..., approval_request_url=...)`. That flow delegates to a separate service (e.g. hax-sdk Response Hub) which POSTs back to the control plane's webhook when a human responds.

Native HITL forms add a **second, built-in responder** on top of the same pause/resume infrastructure:

| | External approval (existing) | Native HITL forms (new) |
|---|---|---|
| Who renders the form? | Your own service | AgentField's `/hitl` portal |
| Setup | Requires a second system | Zero — works out of the box |
| Form schema | You define and render it | Agent sends JSON schema, portal renders it |
| Webhook | You POST to `/webhooks/approval` | Portal POSTs to `/api/hitl/v1/pending/:id/respond` |
| OSS-friendly | Depends on external service | Fully self-hosted |

Both flows co-exist. Use native forms for internal tooling and quick setups; use external approval for deep integrations with Slack, email, or custom UIs.

## Quick start

```python
from agentfield import Agent, ApprovalResult
from agentfield import hitl
import os

app = Agent(node_id="my-agent",
            agentfield_server=os.getenv("AGENTFIELD_URL", "http://localhost:8080"))

@app.reasoner()
async def review_item(item_id: str) -> dict:
    schema = hitl.Form(
        title=f"Review item {item_id}",
        description="Please approve or reject this item.",
        tags=["review"],
        fields=[
            hitl.ButtonGroup("decision", options=[
                hitl.Option("approve", "Approve"),
                hitl.Option("reject",  "Reject", variant="destructive"),
            ], required=True),
            hitl.Textarea("notes", label="Notes",
                          hidden_when={"field": "decision", "equals": "approve"}),
        ],
    ).to_dict()

    result: ApprovalResult = await app.pause(
        form_schema=schema,
        tags=["review"],
        priority="normal",
        expires_in_hours=24,
    )

    return {"decision": result.raw_response.get("decision"),
            "notes":    result.raw_response.get("notes", "")}
```

Open **[http://localhost:8080/hitl](http://localhost:8080/hitl)** to fill in the form.

## Form schema reference

The complete JSON object sent to `app.pause(form_schema=...)`.

### Schema-level options

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Heading shown in the inbox and at the top of the form. |
| `description` | string | no | Markdown. Rendered above the fields using `react-markdown` + GFM. |
| `tags` | string[] | no | Used for inbox filtering. Any string; `"team:x"` namespacing is a convention. |
| `priority` | `"low"` \| `"normal"` \| `"high"` \| `"urgent"` | no | Default `"normal"`. Shown as a colour-coded badge in the inbox. |
| `fields` | Field[] | yes | The form fields, rendered in order. |
| `submit_label` | string | no | Default `"Submit"`. Overridden when the form contains a `button_group` (the button labels take over). |
| `cancel_label` | string | no | If set, a cancel button appears. Submitting it sends `{_cancelled: true}` as the response. |

### Field types

All map to shadcn primitives with no customization.

| `type` | Rendered as | Field-specific options |
|---|---|---|
| `markdown` | `react-markdown` block (GFM + sanitized) | `content` (string, markdown source) |
| `text` | `Label` + `Input` | `placeholder`, `max_length`, `pattern` |
| `textarea` | `Label` + `Textarea` | `placeholder`, `rows`, `max_length` |
| `number` | `Label` + `Input type=number` | `min`, `max`, `step` |
| `select` | `Label` + `Select` | `options: [{value, label}]` |
| `multiselect` | `Label` + `Popover` + `Command` (combobox) | `options`, `min_items`, `max_items` |
| `radio` | `Label` + `RadioGroup` | `options: [{value, label}]` |
| `checkbox` | `Checkbox` + `Label` | Single boolean. |
| `switch` | `Switch` + `Label` | Single boolean. |
| `date` | `Label` + `Popover` + `Calendar` | `min_date`, `max_date` (ISO 8601) |
| `button_group` | Row of large `Button`s | `options: [{value, label, variant}]` — clicking a button sets that value and **immediately submits** the form. |
| `divider` | `Separator` | None. |
| `heading` | `<h3>` with project typography | `text` (string) |

### Common field options

Applies to all types that have a `name` (i.e. all except `markdown`, `divider`, `heading`).

| Option | Type | Purpose |
|---|---|---|
| `name` | string | **Required.** Key in the submitted response dict. |
| `label` | string | Field label displayed above the input. |
| `help` | string | Muted help text rendered below the input. |
| `required` | boolean | Default `false`. Fails validation if the field is empty on submit. |
| `default` | any | Pre-filled value shown when the form first opens. |
| `disabled` | boolean | Renders the field in a non-interactive state. |
| `hidden_when` | object | See below. |

## `hidden_when` — conditional visibility

Use `hidden_when` to show or hide fields based on the current value of another field. This is evaluated live in the browser as the user interacts with the form.

```json
{ "field": "decision", "equals": "approve" }
```

When the condition is true the field is hidden and its value is **removed** from the submitted dict — the agent will not receive stale data from a hidden branch.

### Supported operators

```ts
type HiddenWhen =
  | { field: string; equals: unknown }
  | { field: string; notEquals: unknown }
  | { field: string; in: unknown[] }
  | { field: string; notIn: unknown[] }
```

### Examples

Hide comments when approving:

```json
{
  "type": "textarea",
  "name": "comments",
  "label": "Reason for rejection",
  "hidden_when": { "field": "decision", "equals": "approve" }
}
```

Show an escalation field only for urgent or high priority items:

```json
{
  "type": "select",
  "name": "escalate_to",
  "label": "Escalate to",
  "hidden_when": { "field": "priority", "notIn": ["urgent", "high"] }
}
```

`hidden_when` is flat (single condition) in v1. Composite `all`/`any` logic is forward-compatible and will be added in a future release.

## Tags and priority

Tags group items in the `/hitl` inbox so different teams can filter to their queue:

```python
await app.pause(
    form_schema=schema,
    tags=["pr-review", "team:platform", "repo:core"],
    priority="high",
    expires_in_hours=4,
)
```

Priority values and their visual treatment:

| Value | Badge colour | Intended use |
|---|---|---|
| `low` | muted | Background tasks, no SLA |
| `normal` | default | Standard review queue |
| `high` | amber | Same-day SLA |
| `urgent` | red | Immediate attention required |

## The `/hitl` portal

The HITL portal is a clean, single-purpose UI at `/hitl` — separate from the developer dashboard at `/ui`. It is designed for non-engineer reviewers who only need to fill forms, not operate the control plane.

### Inbox (`/hitl`)

Lists all pending items with title, description preview, tags, priority badge, and relative time. Filter by tag or priority using the controls at the top. Live updates via SSE — new items appear instantly, resolved items disappear.

### Form page (`/hitl/:request_id`)

Three render states:

1. **Pending** — editable form. Submit transitions the execution and redirects to the done page.
2. **Already responded** — readonly view of the submitted values with the responder's name and timestamp.
3. **Expired** — expiry banner; readonly form if values are present.

### Responder identity

On first submission the portal prompts for a display name (stored in `localStorage`). This name is recorded as `responder` in the response and shown in the readonly view.

### Multi-pause behaviour

Each call to `app.pause(form_schema=...)` creates a **separate, independent item** in the inbox with its own `request_id`. Two concurrent pauses from the same agent appear as two separate cards. Responding to one does not affect the other.

### Done page (`/hitl/:request_id/done`)

Confirmation card with a checkmark, the responder name, and a link back to the inbox.

## SDK builder helpers

`agentfield.hitl` provides thin dataclass wrappers that produce the correct JSON schema. You can also pass a raw `dict` directly to `form_schema`.

```python
from agentfield import hitl

# Field constructors
hitl.Form(title, description, tags, priority, fields, submit_label, cancel_label)
hitl.Markdown(content)
hitl.Text(name, label, placeholder, max_length, pattern, **common)
hitl.Textarea(name, label, placeholder, rows, max_length, **common)
hitl.Number(name, label, min, max, step, **common)
hitl.Select(name, label, options, **common)
hitl.MultiSelect(name, label, options, min_items, max_items, **common)
hitl.Radio(name, label, options, **common)
hitl.Checkbox(name, label, **common)
hitl.Switch(name, label, **common)
hitl.Date(name, label, min_date, max_date, **common)
hitl.ButtonGroup(name, label, options, **common)
hitl.Divider()
hitl.Heading(text)

# Option helper (for select, radio, multiselect, button_group)
hitl.Option(value, label, variant=None)   # variant: "default"|"secondary"|"destructive"|"outline"

# Common kwargs available on all named fields:
# required, default, disabled, hidden_when, help
```

Call `.to_dict()` on a `Form` instance to get the plain dict for `form_schema`.

### `pause` signature

```python
result: ApprovalResult = await app.pause(
    approval_request_id=None,   # auto-generated UUID when form_schema is provided
    approval_request_url="",    # auto-generated as {server}/hitl/{id} when omitted
    expires_in_hours=72,
    timeout=None,               # local poll timeout in seconds
    execution_id=None,
    form_schema=None,           # dict — the form schema produced by hitl.Form.to_dict()
    tags=None,                  # list[str] — inbox filter tags
    priority=None,              # "low"|"normal"|"high"|"urgent"
)
```

`ApprovalResult.raw_response` is a `dict` containing the submitted form values keyed by field `name`. Hidden fields are absent from this dict.

## Custom plugin fields (Tier A)

OSS developers can add custom field types by dropping a React component into the frontend source and registering it.

### Step 1 — Create the component

```tsx
// control-plane/web/client/src/hitl/fields/custom/RichTextEditor.tsx
import type { FieldComponentProps } from "../types"

export function RichTextEditor({ field, value, onChange, error, disabled }: FieldComponentProps) {
  // field.type === "rich_text"
  // field.name, field.label, field.help, field.placeholder, etc.
  return (
    <div>
      {/* your component using shadcn primitives only */}
    </div>
  )
}
```

`FieldComponentProps` contract:

```ts
interface FieldComponentProps {
  field:    HitlField             // the full field definition from the schema
  value:    unknown               // current value from form state
  onChange: (v: unknown) => void  // call to update form state
  error:    string | undefined    // per-field validation error
  disabled: boolean               // true in readonly mode
}
```

### Step 2 — Register the component

Edit `control-plane/web/client/src/hitl/fields/custom/index.ts`:

```ts
import { registerHitlField } from "../registry"
import { RichTextEditor } from "./RichTextEditor"

registerHitlField("rich_text", RichTextEditor)
```

### Step 3 — Rebuild the UI

```bash
cd control-plane/web/client
npm run build
```

The custom field is now available. If the agent sends `{ "type": "rich_text", ... }`, the registry picks up your component. If the type is unknown and not registered, the portal renders a `destructive` alert:

> Unknown field type: rich_text. Did you forget to register a custom field?

No runtime plugin system is needed — just rebuild. This is intentional: static registration keeps the bundle deterministic and avoids dynamic eval.

## Troubleshooting

**The `/hitl` inbox is empty after calling `app.pause(form_schema=...)`**

- Confirm the control plane received the form schema: check `GET /api/v1/executions/{id}` — the response should include `approval_form_schema` (non-null).
- Check `priority` — if you filtered the inbox by priority, make sure the filter matches.
- The SSE stream may not have connected yet. Refresh the inbox page.

**Submitting the form returns a 400 error**

Server-side validation re-runs the schema rules on POST. Check the error body for per-field messages. Common causes:
- A `required` field was omitted.
- A `button_group` value doesn't match any of the declared `options[].value`.
- A `number` field is outside `min`/`max` bounds.
- A `text` field exceeds `max_length`.

**The form shows "Unknown field type: X"**

The frontend does not recognise field type `X`. Either register a custom plugin (see above) or use one of the 13 built-in types.

**`app.pause()` times out locally before the form is submitted**

The `timeout` parameter controls how long the SDK polls the control plane. Increase it: `await app.pause(form_schema=schema, timeout=86400)`. The `expires_in_hours` parameter controls the portal-side expiry, which is independent.

**Execution stuck in `waiting` after the form was submitted**

Check `GET /api/hitl/v1/pending/:request_id` — if `status` is `approved` but the execution is still `waiting`, the webhook resolution may have failed. Check control plane logs for `resolveApproval` errors.

**Dark mode looks broken**

Native HITL forms use the same shadcn tokens as the developer UI. If dark mode looks wrong, ensure you have not modified `tailwind.config.*` or the project's CSS variables. The portal does not add any new design tokens.

## See also

- [PR review example](../examples/python_agent_nodes/hitl_form/main.py) — full working agent
- [Design document](./design/hitl-forms-design.md) — architecture, data model, API contracts
- [waiting_state example](../examples/python_agent_nodes/waiting_state/main.py) — external approval flow
