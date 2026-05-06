"""Test that mcp_servers passes through ``router.harness`` → claude-code provider.

This is the structural verification of the new framework feature: when a
reasoner calls ``router.harness(mcp_servers={...}, tools=[...])`` against the
claude-code provider, those values land in ``ClaudeAgentOptions`` so the
in-process MCP server is registered with the SDK and the namespaced tool
names are permitted.
"""

from __future__ import annotations

import types
from typing import Any, Dict, List

import pytest

from agentfield import Agent

pytestmark = pytest.mark.unit


class _CapturingClaudeSdk:
    """A drop-in stand-in for the claude_agent_sdk module.

    We capture the ClaudeAgentOptions kwargs and the prompt for each call so
    tests can assert on them. The ``query`` async generator emits one
    minimal result message so the harness ``run`` path completes successfully.
    """

    def __init__(self) -> None:
        self.last_options_kwargs: Dict[str, Any] = {}
        self.last_prompt: str | None = None
        self.calls: List[Dict[str, Any]] = []

    # Expose a ClaudeAgentOptions class that just records construction kwargs.
    class ClaudeAgentOptions:
        def __init__(self, **kwargs: Any) -> None:
            self._kwargs = kwargs

        def __getattr__(self, item: str) -> Any:
            if item == "_kwargs":
                raise AttributeError(item)
            try:
                return self._kwargs[item]
            except KeyError as exc:
                raise AttributeError(item) from exc

    async def query(self, *, prompt: str, options: Any):
        # Capture the call shape
        kwargs = (
            getattr(options, "_kwargs", {})
            if not isinstance(options, dict)
            else options
        )
        self.calls.append({"prompt": prompt, "options": kwargs})
        self.last_options_kwargs = kwargs
        self.last_prompt = prompt

        # Minimal "result" message that the provider's parsing loop accepts
        yield {
            "type": "result",
            "subtype": "success",
            "result": "ok",
            "session_id": "fake-session",
            "num_turns": 1,
            "total_cost_usd": 0.0,
        }


@pytest.fixture
def fake_sdk(monkeypatch):
    """Patch the lazy-imported claude_agent_sdk in the provider with a fake."""
    sdk = _CapturingClaudeSdk()

    # Build a module-shaped namespace with the attributes the provider reads
    fake_module = types.SimpleNamespace(
        ClaudeAgentOptions=sdk.ClaudeAgentOptions,
        query=sdk.query,
    )

    def _fake_get_sdk() -> Any:
        return fake_module

    monkeypatch.setattr(
        "agentfield.harness.providers.claude._get_claude_sdk", _fake_get_sdk
    )
    return sdk


async def _build_agent() -> Agent:
    # Construct an Agent without going through the full af init / control plane.
    # We only need the harness() method, which is a thin wrapper over HarnessRunner.
    return Agent(node_id="test-agent")


async def test_harness_passes_mcp_servers_to_claude_options(fake_sdk):
    agent = await _build_agent()
    fake_server = {"type": "sdk", "name": "af_search", "instance": object()}

    result = await agent.harness(
        prompt="say hi",
        provider="claude-code",
        tools=["Read", "mcp__af_search__web_search"],
        mcp_servers={"af_search": fake_server},
        cwd=".",
    )

    assert result.is_error is False
    opts = fake_sdk.last_options_kwargs
    # mcp_servers passed through verbatim
    assert opts["mcp_servers"] == {"af_search": fake_server}
    # Tools list is untouched (claude-code respects MCP-namespaced names directly)
    assert opts["allowed_tools"] == ["Read", "mcp__af_search__web_search"]


async def test_harness_omits_mcp_servers_when_not_provided(fake_sdk):
    agent = await _build_agent()
    await agent.harness(
        prompt="hi",
        provider="claude-code",
        tools=["Read"],
        cwd=".",
    )
    # When the caller didn't pass mcp_servers, the provider must not set it
    # on ClaudeAgentOptions — leaving the SDK to use its default.
    assert "mcp_servers" not in fake_sdk.last_options_kwargs


async def test_harness_with_real_web_search_server_config(fake_sdk, monkeypatch):
    """End-to-end shape check: build the real web_search MCP server config and
    verify it makes it through the harness layer untouched."""
    monkeypatch.setenv("JINA_API_KEY", "fake-key")  # avoid no-provider gate
    from agentfield.tools.web_search import get_web_search_server

    server, tool_names = get_web_search_server()
    agent = await _build_agent()

    await agent.harness(
        prompt="hi",
        provider="claude-code",
        tools=["Read", *tool_names],
        mcp_servers={"af_search": server},
        cwd=".",
    )

    opts = fake_sdk.last_options_kwargs
    assert "af_search" in opts["mcp_servers"]
    assert opts["mcp_servers"]["af_search"] is server
    assert "mcp__af_search__web_search" in opts["allowed_tools"]


async def test_non_claude_provider_ignores_mcp_servers(monkeypatch, fake_sdk):
    """For codex/gemini/opencode providers, mcp_servers should be silently
    ignored (the same way tools=[] already is). Failing closed here would
    silently break harness calls that pass mcp_servers across providers."""
    # Switch to opencode provider; we don't want to actually invoke its CLI
    # so swap in a stub via the import-side reference in _runner (which binds
    # build_provider at import time, so patching the source module is too late).

    class _StubProvider:
        def __init__(self) -> None:
            self.last_options: Dict[str, Any] = {}

        async def execute(self, prompt: str, options: Dict[str, Any]):
            from agentfield.harness._result import Metrics, RawResult

            self.last_options = dict(options)
            return RawResult(
                result="ok",
                messages=[],
                metrics=Metrics(duration_api_ms=1, session_id="x"),
                is_error=False,
            )

    stub = _StubProvider()
    monkeypatch.setattr(
        "agentfield.harness._runner.build_provider", lambda config: stub
    )

    agent = await _build_agent()
    await agent.harness(
        prompt="hi",
        provider="opencode",
        tools=["Read"],
        mcp_servers={"af_search": object()},
        cwd=".",
    )

    # The runner forwards mcp_servers in options regardless; non-claude
    # providers just don't pluck it out of options. That's the contract:
    # silent ignore, not error. Verify the option arrived in the bag and
    # the call succeeded.
    assert "mcp_servers" in stub.last_options
