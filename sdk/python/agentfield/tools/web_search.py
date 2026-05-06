"""Web search exposed to harnessed Claude Code agents as an in-process MCP tool.

Wraps the multi-provider :mod:`agentfield.tools.search` package as a single
``web_search`` tool that a Claude Code agent can call during a harness run.

Usage from a reasoner::

    from agentfield.tools.web_search import get_web_search_server

    server, tool_names = get_web_search_server()
    result = await router.harness(
        prompt=...,
        tools=["Read", "Bash", *tool_names],
        mcp_servers={"af_search": server},
        ...,
    )

The MCP tool name exposed to the agent is namespaced by Claude Code as
``mcp__<server_name>__web_search``. ``tool_names`` returns these fully-namespaced
names so they can be dropped straight into the ``tools`` allow-list.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from .search import SearchResponse, get_default_provider, search

logger = logging.getLogger(__name__)


SERVER_NAME = "af_search"
SERVER_VERSION = "1.0.0"
TOOL_NAME = "web_search"


def _format_results_as_markdown(response: SearchResponse) -> str:
    """Format a SearchResponse as a readable markdown block for the LLM.

    Compact-but-informative: provider line, then numbered results with title
    (linked), URL, and a trimmed snippet. Missing fields are skipped silently.
    """
    if not response.results:
        return (
            f"No results from provider `{response.provider}` for query "
            f"`{response.query_used}`."
        )

    lines: List[str] = [
        f"Search results from `{response.provider}` for `{response.query_used}` "
        f"({response.total_results} results):",
        "",
    ]
    for i, r in enumerate(response.results, start=1):
        title = r.title.strip() or r.url
        snippet = (r.content or r.description or "").strip()
        if len(snippet) > 600:
            snippet = snippet[:600].rstrip() + "…"
        lines.append(f"{i}. **[{title}]({r.url})**")
        if snippet:
            lines.append(f"   {snippet}")
        if r.published_time:
            lines.append(f"   _published: {r.published_time.isoformat()}_")
        lines.append("")
    return "\n".join(lines).rstrip()


def _build_web_search_tool() -> Any:
    """Construct the SdkMcpTool. Lazy-imports claude_agent_sdk."""
    try:
        from claude_agent_sdk import tool
    except ImportError as exc:
        raise ImportError(
            "claude_agent_sdk is required to expose web_search as an MCP tool. "
            "Install it with: pip install claude-agent-sdk"
        ) from exc

    @tool(
        TOOL_NAME,
        (
            "Search the web for documentation, library APIs, error messages, "
            "and other external context. Returns ranked results with titles, "
            "URLs, and snippets. Backed by Jina/Tavily/Firecrawl/Serper "
            "depending on which API key is configured. Use sparingly — only "
            "for information that cannot be answered from the codebase."
        ),
        {"query": str},
    )
    async def _web_search(args: Dict[str, Any]) -> Dict[str, Any]:
        query = (args.get("query") or "").strip()
        if not query:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: 'query' must be a non-empty string.",
                    }
                ],
                "is_error": True,
            }

        if get_default_provider() is None:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Error: no search provider configured. Set one of "
                            "JINA_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY, "
                            "or SERPER_API_KEY."
                        ),
                    }
                ],
                "is_error": True,
            }

        try:
            response = await search(query)
        except Exception as exc:
            logger.warning("web_search failed for query %r: %s", query, exc)
            return {
                "content": [
                    {"type": "text", "text": f"Error executing web search: {exc}"}
                ],
                "is_error": True,
            }

        return {
            "content": [{"type": "text", "text": _format_results_as_markdown(response)}]
        }

    return _web_search


def get_web_search_server() -> Tuple[Any, List[str]]:
    """Return ``(server_config, allowed_tool_names)`` for the web_search MCP server.

    ``server_config`` is the ``McpSdkServerConfig`` to put under
    ``mcp_servers[SERVER_NAME]`` in the harness call. ``allowed_tool_names``
    is the list of fully-namespaced tool names to merge into the ``tools=``
    allow-list so the agent is permitted to call them.

    Raises ImportError if claude_agent_sdk isn't installed (i.e. the
    claude-code provider isn't being used).
    """
    try:
        from claude_agent_sdk import create_sdk_mcp_server
    except ImportError as exc:
        raise ImportError(
            "claude_agent_sdk is required for the web_search MCP server. "
            "Install it with: pip install claude-agent-sdk"
        ) from exc

    web_search_tool = _build_web_search_tool()
    server = create_sdk_mcp_server(
        name=SERVER_NAME, version=SERVER_VERSION, tools=[web_search_tool]
    )
    tool_names = [f"mcp__{SERVER_NAME}__{TOOL_NAME}"]
    return server, tool_names


__all__ = [
    "SERVER_NAME",
    "TOOL_NAME",
    "get_web_search_server",
]
