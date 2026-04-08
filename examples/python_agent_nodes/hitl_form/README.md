# HITL Form Example — PR Review Agent

This example demonstrates **native Human-in-the-Loop forms** in AgentField. The agent simulates receiving a pull-request review request, builds a rich form (markdown diff + decision buttons + conditional comment field), and pauses execution until a human submits their review through the `/hitl` portal.

No external approval service required — the form is rendered and processed entirely by the AgentField control plane.

## What it shows

- `hitl.Form` + builder helpers (`hitl.ButtonGroup`, `hitl.Markdown`, `hitl.Textarea`, `hitl.Checkbox`, etc.)
- A multi-line markdown `description` with a fenced Go diff — showcases how rich context renders in the portal
- `button_group` as the flagship decision pattern: clicking **Approve / Request changes / Reject** immediately submits the form
- `hidden_when` conditional visibility: the **Comments** textarea is shown (and required) only when the reviewer selects *Request changes* or *Reject*
- `app.pause(form_schema=schema, tags=[...], priority="normal", expires_in_hours=24)` — one call, zero config
- Unpacking `ApprovalResult.raw_response` after the agent resumes

## Screenshots

![HITL inbox — pending PR review item](./screenshot-inbox.png)
![HITL form — diff + decision buttons](./screenshot-form.png)

*(Screenshots will be added once the frontend lands.)*

## Prerequisites

- AgentField control plane running locally (see [Quick Start](../../../README.md#quick-start))
- Python 3.8+ with `agentfield` installed

## Running the example

### 1. Start the control plane

```bash
# Terminal 1
cd /path/to/agentfield
go run ./control-plane/cmd/af dev
# Dashboard: http://localhost:8080
```

### 2. Install dependencies and start the agent

```bash
# Terminal 2
cd examples/python_agent_nodes/hitl_form
pip install agentfield          # or: pip install -r requirements.txt
python main.py
```

You should see:

```
PR Review HITL Agent
Node: pr-review-bot
Control Plane: http://localhost:8080
...
```

### 3. Trigger a review

```bash
curl -X POST http://localhost:8080/api/v1/execute/pr-review-bot.review_pr \
  -H "Content-Type: application/json" \
  -d '{"input": {"pr_number": 1138}}'
```

The execution starts, the agent fetches the (simulated) PR, builds the form, and **pauses**. The execution status becomes `waiting`.

### 4. Open the HITL portal

Navigate to **[http://localhost:8080/hitl](http://localhost:8080/hitl)**

You will see one pending item: *Review PR #1138*. Click it to open the form.

The form renders:
- Full markdown description including the Go diff in a syntax-highlighted code fence
- Three large decision buttons: **Approve**, **Request changes**, **Reject**
- A **Comments** textarea that appears (and becomes required) when you select *Request changes* or *Reject*
- A **Block merge** checkbox

### 5. Submit the form

Fill in the form and click one of the decision buttons. The portal redirects to the confirmation page.

### 6. Observe the agent resume

Back in Terminal 2 you will see the result printed:

```
=== PR Review Result ===
  PR:          #1138 — refactor: extract AuthMiddleware into standalone package (#1138)
  Decision:    request_changes
  Comments:    Please add a migration guide for callers still using the deprecated Store alias.
  Block merge: false
  Approved:    False
========================
```

The execution completes and the workflow DAG updates in the developer dashboard at [http://localhost:8080/ui](http://localhost:8080/ui).

## Expected behaviour

| Scenario | What happens |
|---|---|
| Select **Approve** | Comments field hides. Form submits with `{decision: "approve", block_merge: false}`. Agent receives `result.approved == True`. |
| Select **Request changes** | Comments field appears and is required. Submitting without comments shows a validation error. |
| Select **Reject** | Same as Request changes. `result.approved == False`. |
| Leave form open for >24 h | Item shows an expired banner. Agent's `pause()` call raises a timeout. |
| Multiple agents paused | Each creates a separate item in the `/hitl` inbox. |

## Files

| File | Purpose |
|---|---|
| `main.py` | The agent — one reasoner, HITL form builder, pause/resume flow |
| `README.md` | This file |

## See also

- [HITL forms reference documentation](../../../docs/hitl.md)
- [waiting_state example](../waiting_state/main.py) — external approval flow (hax-sdk style)
- [Design doc](../../../docs/design/hitl-forms-design.md)
