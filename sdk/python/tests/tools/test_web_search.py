"""Unit tests for the web_search MCP tool wrapper.

The wrapper turns the multi-provider search package into a single in-process
MCP tool that a Claude Code harness can invoke. We assert input validation,
output formatting, error paths, and the public ``get_web_search_server``
helper's contract.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from agentfield.tools.search.base import SearchResponse, SearchResult
from agentfield.tools.web_search import (
    SERVER_NAME,
    TOOL_NAME,
    _build_web_search_tool,
    _format_results_as_markdown,
    get_web_search_server,
)

pytestmark = pytest.mark.unit


# ---------- markdown formatting ----------


def test_format_results_renders_title_url_and_snippet():
    response = SearchResponse(
        results=[
            SearchResult(
                title="Pytest docs",
                url="https://docs.pytest.org",
                content="Test framework for Python.",
            )
        ],
        total_results=1,
        query_used="pytest docs",
        provider="jina",
    )
    out = _format_results_as_markdown(response)
    assert "jina" in out
    assert "pytest docs" in out
    assert "[Pytest docs](https://docs.pytest.org)" in out
    assert "Test framework for Python." in out


def test_format_results_truncates_long_snippets():
    response = SearchResponse(
        results=[
            SearchResult(
                title="Long",
                url="https://x",
                content="x" * 1500,
            )
        ],
        total_results=1,
        query_used="q",
        provider="jina",
    )
    out = _format_results_as_markdown(response)
    # Long snippet was truncated to 600 chars + ellipsis
    assert "…" in out
    # Original 1500-char body must not appear in full
    assert "x" * 1500 not in out


def test_format_results_includes_published_time_when_present():
    response = SearchResponse(
        results=[
            SearchResult(
                title="Dated",
                url="https://x",
                content="body",
                published_time=datetime(2025, 6, 1, tzinfo=timezone.utc),
            )
        ],
        total_results=1,
        query_used="q",
        provider="jina",
    )
    out = _format_results_as_markdown(response)
    assert "2025-06-01" in out


def test_format_results_handles_empty():
    response = SearchResponse(
        results=[], total_results=0, query_used="q", provider="jina"
    )
    out = _format_results_as_markdown(response)
    assert "No results" in out
    assert "jina" in out


def test_format_falls_back_to_url_when_title_missing():
    response = SearchResponse(
        results=[SearchResult(title="", url="https://x", content="snip")],
        total_results=1,
        query_used="q",
        provider="jina",
    )
    out = _format_results_as_markdown(response)
    assert "[https://x](https://x)" in out


# ---------- @tool wrapper handler ----------


def _clear_all_keys(monkeypatch):
    for key in (
        "JINA_API_KEY",
        "TAVILY_API_KEY",
        "FIRECRAWL_API_KEY",
        "SERPER_API_KEY",
        "SEARCH_PROVIDER",
    ):
        monkeypatch.delenv(key, raising=False)


def _get_handler():
    sdk_tool = _build_web_search_tool()
    # SdkMcpTool exposes the original async fn via .handler
    return sdk_tool.handler


async def test_handler_rejects_empty_query(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")
    handler = _get_handler()

    result = await handler({"query": ""})
    assert result.get("is_error") is True
    assert "non-empty" in result["content"][0]["text"].lower()


async def test_handler_rejects_missing_query(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")
    handler = _get_handler()
    result = await handler({})
    assert result.get("is_error") is True


async def test_handler_returns_provider_error_when_no_keys(monkeypatch):
    _clear_all_keys(monkeypatch)
    handler = _get_handler()
    result = await handler({"query": "anything"})
    assert result.get("is_error") is True
    text = result["content"][0]["text"]
    assert "no search provider" in text.lower()
    assert "JINA_API_KEY" in text


async def test_handler_returns_formatted_results(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")

    fake_response = SearchResponse(
        results=[
            SearchResult(title="A", url="https://a", content="alpha"),
            SearchResult(title="B", url="https://b", content="beta"),
        ],
        total_results=2,
        query_used="qq",
        provider="jina",
    )

    async def fake_search(query: str):
        return fake_response

    monkeypatch.setattr("agentfield.tools.web_search.search", fake_search)

    handler = _get_handler()
    result = await handler({"query": "qq"})
    assert "is_error" not in result or result.get("is_error") is False
    text = result["content"][0]["text"]
    assert "A" in text and "https://a" in text
    assert "B" in text and "https://b" in text


async def test_handler_catches_search_exception(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")

    async def boom(query: str):
        raise RuntimeError("network down")

    monkeypatch.setattr("agentfield.tools.web_search.search", boom)
    handler = _get_handler()
    result = await handler({"query": "q"})
    assert result.get("is_error") is True
    assert "network down" in result["content"][0]["text"]


# ---------- get_web_search_server contract ----------


def test_get_web_search_server_returns_config_and_namespaced_tool_names(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")

    server, tool_names = get_web_search_server()

    # claude_agent_sdk's create_sdk_mcp_server returns a McpSdkServerConfig
    # which is a TypedDict. We just verify we got a non-empty dict and the
    # tool names are correctly namespaced.
    assert server is not None
    assert tool_names == [f"mcp__{SERVER_NAME}__{TOOL_NAME}"]
    # Specifically: an LLM allow-list referencing the namespaced name should
    # be sufficient for Claude Code to permit the call.
    assert tool_names[0].startswith("mcp__")
