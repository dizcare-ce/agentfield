"""Tavily search provider (AI-native search)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

import httpx

from .base import SearchProvider, SearchResponse, SearchResult


class TavilySearchProvider(SearchProvider):
    """Tavily search provider implementation."""

    def __init__(self, search_depth: Literal["basic", "advanced"] = "basic"):
        self.search_depth = search_depth

    @property
    def name(self) -> str:
        return "tavily"

    @property
    def api_key_env_var(self) -> str:
        return "TAVILY_API_KEY"

    async def search(self, query: str) -> SearchResponse:
        api_key = self.get_api_key()
        if not api_key:
            raise ValueError(f"{self.api_key_env_var} environment variable is required")

        url = "https://api.tavily.com/search"
        headers = {"Content-Type": "application/json"}
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": self.search_depth,
            "include_answer": False,
            "include_raw_content": False,
            "max_results": 10,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        results = []
        for item in data.get("results", []):
            published_time: Optional[datetime] = None
            if item.get("published_date"):
                try:
                    published_time = datetime.fromisoformat(
                        item["published_date"].replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass

            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    content=item.get("content", ""),
                    description=item.get("snippet"),
                    published_time=published_time,
                )
            )

        return SearchResponse(
            results=results,
            total_results=len(results),
            query_used=query,
            provider=self.name,
        )
