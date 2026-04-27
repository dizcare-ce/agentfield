"""Trigger binding types for AgentField reasoners.

A reasoner declares external event sources via the ``triggers`` kwarg on
``@reasoner``. The canonical form passes typed ``EventTrigger`` /
``ScheduleTrigger`` instances; the ``@on_event`` and ``@on_schedule`` sugar
in :mod:`agentfield.decorators` desugars to the same shape.

The control plane registers a code-managed Trigger row per binding when the
agent registers, so the agent never has to provision webhooks itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union


@dataclass
class EventTrigger:
    """Bind a reasoner to events emitted by an HTTP-driven Source.

    Attributes:
        source: Registered Source name (``"stripe"``, ``"github"``, ``"slack"``,
            ``"generic_hmac"``, ``"generic_bearer"``).
        types: Event types the reasoner cares about. Empty list means "all".
            Supports prefix-match: ``"pull_request"`` matches
            ``"pull_request.opened"`` and friends.
        secret_env: Name of the env var on the **control plane** that holds
            the provider's webhook secret. Required for Sources whose
            ``secret_required`` is true.
        config: Source-specific JSON config (timestamp tolerance, custom
            header names, etc). The Source's ``Validate`` runs server-side.
    """

    source: str
    types: List[str] = field(default_factory=list)
    secret_env: Optional[str] = None
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScheduleTrigger:
    """Bind a reasoner to a cron schedule.

    Attributes:
        cron: 5-field cron expression (``minute hour dom month dow``).
        timezone: IANA timezone name. Defaults to UTC.
    """

    cron: str
    timezone: str = "UTC"


Trigger = Union[EventTrigger, ScheduleTrigger]


def trigger_to_payload(trigger: Trigger) -> Dict[str, Any]:
    """Convert a typed trigger into the wire payload sent at registration.

    The control plane expects ``{source, event_types, config, secret_env_var}``;
    schedule triggers normalize to the ``cron`` source with their expression
    embedded in ``config``.
    """
    if isinstance(trigger, EventTrigger):
        payload: Dict[str, Any] = {
            "source": trigger.source,
            "event_types": list(trigger.types or []),
        }
        if trigger.config:
            payload["config"] = dict(trigger.config)
        if trigger.secret_env:
            payload["secret_env_var"] = trigger.secret_env
        return payload
    if isinstance(trigger, ScheduleTrigger):
        return {
            "source": "cron",
            "event_types": [],
            "config": {
                "expression": trigger.cron,
                "timezone": trigger.timezone or "UTC",
            },
        }
    raise TypeError(f"unknown trigger type: {type(trigger).__name__}")
