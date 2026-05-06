"""Multi-provider web search package.

Provides a unified interface for web search across Jina, Tavily, Firecrawl,
and Serper. Auto-detects available providers from env vars and uses the first
available in priority order, or honors SEARCH_PROVIDER if set.

Usage:
    from agentfield.tools.search import search

    results = await search("agentfield python sdk")
    for r in results.results:
        print(r.title, r.url)

To force a specific provider:
    from agentfield.tools.search import search_with_provider
    results = await search_with_provider("query", provider="tavily")

To check what's configured:
    from agentfield.tools.search import list_provider_status
    print(list_provider_status())
"""

from __future__ import annotations

import asyncio
from typing import List, Optional

from .base import SearchProvider, SearchResponse, SearchResult
from .firecrawl import FirecrawlSearchProvider
from .jina import JinaSearchProvider
from .registry import (
    DEFAULT_PROVIDER_PRIORITY,
    PROVIDER_CLASSES,
    get_all_providers,
    get_available_providers,
    get_default_provider,
    get_provider,
    list_provider_status,
    register_provider,
)
from .serper import SerperSearchProvider
from .tavily import TavilySearchProvider

__all__ = [
    "SearchProvider",
    "SearchResponse",
    "SearchResult",
    "JinaSearchProvider",
    "TavilySearchProvider",
    "FirecrawlSearchProvider",
    "SerperSearchProvider",
    "DEFAULT_PROVIDER_PRIORITY",
    "PROVIDER_CLASSES",
    "get_all_providers",
    "get_available_providers",
    "get_default_provider",
    "get_provider",
    "list_provider_status",
    "register_provider",
    "search",
    "search_with_provider",
    "parallel_search",
]


async def search(query: str) -> SearchResponse:
    """Search using the default available provider.

    Raises RuntimeError if no providers are configured.
    """
    provider = get_default_provider()
    if provider is None:
        raise RuntimeError(
            "No search providers available. Set at least one of: "
            "JINA_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY, SERPER_API_KEY."
        )
    return await provider.search(query)


async def search_with_provider(query: str, provider: str) -> SearchResponse:
    """Search using a specific provider name.

    Raises ValueError if the provider is unknown or not configured.
    """
    instance = get_provider(provider)
    if instance is None:
        raise ValueError(f"Unknown search provider: {provider}")
    if not instance.is_available():
        raise ValueError(
            f"Provider '{provider}' is not available (API key not configured)"
        )
    return await instance.search(query)


async def parallel_search(
    queries: List[str], provider: Optional[str] = None
) -> List[SearchResponse]:
    """Execute multiple searches concurrently.

    Failures for individual queries return an empty SearchResponse rather than
    raising — callers can inspect total_results to detect them.
    """
    if not queries:
        return []

    if provider:
        instance = get_provider(provider)
        if instance is None or not instance.is_available():
            raise ValueError(f"Provider '{provider}' is not available")
    else:
        instance = get_default_provider()
        if instance is None:
            raise RuntimeError("No search providers available")

    tasks = [instance.search(q) for q in queries]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out: List[SearchResponse] = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            out.append(
                SearchResponse(
                    results=[],
                    total_results=0,
                    query_used=queries[i],
                    provider=instance.name,
                )
            )
        else:
            out.append(r)
    return out
