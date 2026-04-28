"""
AgentField triggers demo — sample Python agent.

Three deterministic reasoners, each wired to a different Source plugin:

- handle_payment   ← Stripe webhook (Stripe-Signature HMAC)
- handle_pr        ← GitHub webhook (X-Hub-Signature-256 HMAC)
- handle_tick      ← cron schedule (every minute)

No LLM calls. Each reasoner just transforms its inbound event into a
small, deterministic record and writes it to per-agent memory so the UI's
event log + run detail surfaces show real data flowing through.

When the agent registers with the control plane, the @on_event /
@on_schedule decorators auto-create code-managed Trigger rows. The CP
returns the public URLs for each, which the SDK prints at startup:

    Stripe webhook URL: http://localhost:8080/sources/<id>
    GitHub webhook URL: http://localhost:8080/sources/<id>
    Cron schedule "* * * * *" registered

Paste those URLs into provider dashboards (or use the included
`scripts/fire-events.sh` to fire signed test events locally).
"""

from __future__ import annotations

import os
import sys
import threading
import time
from typing import Any, Dict

from agentfield import (
    Agent,
    EventTrigger,
    ScheduleTrigger,
    TriggerContext,
    on_event,
    on_schedule,
    reasoner,
)


app = Agent(
    node_id=os.getenv("AGENT_NODE_ID", "triggers-demo-agent"),
    agentfield_server=os.getenv("AGENTFIELD_URL", "http://localhost:8080"),
    dev_mode=True,
)


# ---------------------------------------------------------------------------
# Stripe — payment events
#
# The Stripe source plugin verifies Stripe-Signature: t=<ts>,v1=<hmac> over
# "<ts>.<body>" using the secret read from STRIPE_DEMO_SECRET on the CP host.
# The transform here pulls the bits we actually care about out of Stripe's
# fairly nested envelope so the reasoner body stays clean.
# ---------------------------------------------------------------------------


def _stripe_to_payment(event: dict) -> Dict[str, Any]:
    obj = event.get("data", {}).get("object", {})
    return {
        "id": obj.get("id"),
        "amount": obj.get("amount"),
        "currency": obj.get("currency", "usd"),
        "customer": obj.get("customer"),
        "status": obj.get("status"),
        "metadata": obj.get("metadata", {}),
    }


@app.reasoner(
    triggers=[
        EventTrigger(
            source="stripe",
            types=["payment_intent.succeeded"],
            secret_env="STRIPE_DEMO_SECRET",
            transform=_stripe_to_payment,
        ),
    ],
)
async def handle_payment(payment: dict, ctx, trigger: TriggerContext | None = None):
    """Records a Stripe payment, deterministically."""
    record = {
        "kind": "payment",
        "stripe_id": payment.get("id"),
        "amount_cents": payment.get("amount"),
        "currency": payment.get("currency"),
        "customer": payment.get("customer"),
        "received_via": trigger.source if trigger else "direct_call",
        "trigger_event_id": trigger.event_id if trigger else None,
    }
    await app.memory.set(scope="agent", key=f"payment:{record['stripe_id']}", value=record)
    print(f"[handle_payment] saved {record}", flush=True)
    return record


# ---------------------------------------------------------------------------
# GitHub — pull-request events
#
# The GitHub source verifies X-Hub-Signature-256 = sha256=<hmac of body>
# using the secret from GITHUB_DEMO_SECRET. Reads X-GitHub-Event +
# X-GitHub-Delivery for type and idempotency.
# ---------------------------------------------------------------------------


@app.reasoner()
@on_event(
    source="github",
    types=["pull_request"],
    secret_env="GITHUB_DEMO_SECRET",
)
async def handle_pr(event: dict, ctx, trigger: TriggerContext | None = None):
    """Records a GitHub pull_request action."""
    pr = event.get("pull_request", {})
    record = {
        "kind": "pull_request",
        "action": event.get("action"),
        "number": event.get("number") or pr.get("number"),
        "title": pr.get("title"),
        "html_url": pr.get("html_url"),
        "user": (pr.get("user") or {}).get("login"),
        "repo": (event.get("repository") or {}).get("full_name"),
        "received_via": trigger.source if trigger else "direct_call",
        "delivery_id": trigger.idempotency_key if trigger else None,
    }
    if record["repo"] and record["number"]:
        key = f"pr:{record['repo']}#{record['number']}"
        await app.memory.set(scope="agent", key=key, value=record)
    print(f"[handle_pr] saved {record}", flush=True)
    return record


# ---------------------------------------------------------------------------
# Cron — periodic tick
#
# The cron source runs as a LoopSource inside the CP, emitting a "tick" event
# every time its schedule fires. The agent sees the same dispatch shape as
# any other webhook delivery — so the reasoner code path is identical.
# ---------------------------------------------------------------------------


@app.reasoner()
@on_schedule("* * * * *")
async def handle_tick(_input, ctx, trigger: TriggerContext | None = None):
    """Increments a cron-fire counter and records the wall-clock time."""
    counter_key = "cron:tick:count"
    current = (await app.memory.get(scope="agent", key=counter_key)) or {"count": 0}
    record = {
        "count": (current.get("count") or 0) + 1,
        "last_fired_at": trigger.received_at.isoformat() if trigger else None,
        "received_via": trigger.source if trigger else "direct_call",
    }
    await app.memory.set(scope="agent", key=counter_key, value=record)
    print(f"[handle_tick] {record}", flush=True)
    return record


# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------


def _heartbeat() -> None:
    """Surface in container logs that the agent is alive between events."""
    n = 0
    node = app.node_id
    while True:
        print(f"[{node}] alive heartbeat #{n}", flush=True)
        n += 1
        time.sleep(30)


if __name__ == "__main__":
    threading.Thread(target=_heartbeat, daemon=True).start()
    port = int(os.getenv("PORT", "8001"))
    # Banner so the user sees the agent come up. The SDK separately prints
    # the assigned trigger URLs once it registers with the CP.
    print(
        "AgentField triggers demo — sample agent starting\n"
        f"  node_id            = {app.node_id}\n"
        f"  agentfield_server  = {os.getenv('AGENTFIELD_URL', 'http://localhost:8080')}\n"
        f"  callback url       = {os.getenv('AGENT_CALLBACK_URL', f'http://localhost:{port}')}\n"
        "  reasoners          = handle_payment (stripe), handle_pr (github), handle_tick (cron)",
        flush=True,
        file=sys.stderr,
    )
    app.run(host="0.0.0.0", port=port, auto_port=False)
