"""End-to-end harness test with real Claude + real web_search tool.

This is the headline functional test the user asked for: it spins up a
genuine ``router.harness`` call against ``provider="claude-code"`` with the
``web_search`` MCP server attached, asks Claude a question that requires
external lookup, and asserts that (a) the harness completed without error
and (b) Claude actually invoked the web_search tool.

Marked ``harness_live`` because it costs real money: requires both
``ANTHROPIC_API_KEY`` (for Claude) and ``JINA_API_KEY`` (for the underlying
search). Excluded from default test runs by the pytest ``addopts``
configuration; run explicitly with ``pytest -m harness_live``.
"""

from __future__ import annotations

import os

import pytest

from agentfield import Agent
from agentfield.tools.web_search import get_web_search_server

pytestmark = [
    pytest.mark.harness_live,
    pytest.mark.skipif(
        not (os.environ.get("ANTHROPIC_API_KEY") and os.environ.get("JINA_API_KEY")),
        reason="ANTHROPIC_API_KEY and JINA_API_KEY both required for live e2e",
    ),
]


@pytest.mark.asyncio
async def test_claude_invokes_web_search_tool():
    """Real Claude harness call must successfully invoke the web_search tool.

    We instruct Claude to use web_search to look up a fact, then verify both
    that the harness returned a successful result AND that at least one
    tool_use message in the captured transcript names the web_search tool.
    """
    agent = Agent(node_id="test-web-search-e2e")
    server, tool_names = get_web_search_server()

    result = await agent.harness(
        prompt=(
            "Use the web_search tool to find the official documentation URL for "
            "the Python pytest framework. After searching, reply in one sentence "
            "with the documentation URL."
        ),
        provider="claude-code",
        tools=["Read", *tool_names],
        mcp_servers={"af_search": server},
        cwd=".",
        max_turns=4,
        permission_mode="auto",
    )

    assert result.is_error is False, f"harness errored: {result.error_message}"
    assert result.result is not None and result.result.strip()

    # Walk the captured messages looking for a tool_use of web_search.
    used_web_search = False
    for msg in result.messages or []:
        # Messages are dicts; tool calls may be nested under content blocks.
        content = msg.get("content")
        if content is None:
            inner = msg.get("message")
            if isinstance(inner, dict):
                content = inner.get("content")
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use":
                    name = block.get("name", "")
                    if "web_search" in name:
                        used_web_search = True
                        break
        if used_web_search:
            break

    assert used_web_search, (
        "Expected Claude to invoke the web_search tool, but no tool_use for "
        "web_search appeared in the message transcript."
    )
