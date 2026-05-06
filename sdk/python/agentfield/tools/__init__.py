"""Built-in tools that can be exposed to harnessed agents.

Currently provides:
- ``search`` — multi-provider web search (Jina, Tavily, Firecrawl, Serper)
- ``web_search`` — an in-process MCP server wrapping ``search`` so a harnessed
  Claude Code agent can invoke it via tool call.
"""
