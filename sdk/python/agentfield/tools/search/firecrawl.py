"""Firecrawl search provider (search + optional content scraping)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

import httpx

from .base import SearchProvider, SearchResponse, SearchResult


class FirecrawlSearchProvider(SearchProvider):
    """Firecrawl search provider implementation."""

    def __init__(
        self,
        limit: int = 10,
        scrape_results: bool = False,
        source_filter: Optional[
            Literal["web", "news", "github", "research", "pdf"]
        ] = None,
    ):
        self.limit = limit
        self.scrape_results = scrape_results
        self.source_filter = source_filter

    @property
    def name(self) -> str:
        return "firecrawl"

    @property
    def api_key_env_var(self) -> str:
        return "FIRECRAWL_API_KEY"

    async def search(self, query: str) -> SearchResponse:
        api_key = self.get_api_key()
        if not api_key:
            raise ValueError(f"{self.api_key_env_var} environment variable is required")

        url = "https://api.firecrawl.dev/v1/search"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        payload: dict = {"query": query, "limit": self.limit}
        if self.source_filter:
            payload["filter"] = {"sourceType": self.source_filter}
        if self.scrape_results:
            payload["scrapeOptions"] = {"formats": ["markdown"]}

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        results = []
        for item in data.get("data", []):
            content = (
                item.get("markdown")
                or item.get("description")
                or item.get("snippet", "")
            )
            published_time: Optional[datetime] = None
            if item.get("publishedDate"):
                try:
                    published_time = datetime.fromisoformat(
                        item["publishedDate"].replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass

            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    content=content,
                    description=item.get("description"),
                    published_time=published_time,
                )
            )

        return SearchResponse(
            results=results,
            total_results=len(results),
            query_used=query,
            provider=self.name,
        )
