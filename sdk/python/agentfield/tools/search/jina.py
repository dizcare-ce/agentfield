"""Jina AI search provider.

Ported from af-deep-research's aiohttp implementation to httpx for consistency
with agentfield's existing pytest-httpx test infrastructure.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import httpx

from .base import SearchProvider, SearchResponse, SearchResult


class JinaSearchProvider(SearchProvider):
    """Jina AI search provider implementation."""

    @property
    def name(self) -> str:
        return "jina"

    @property
    def api_key_env_var(self) -> str:
        return "JINA_API_KEY"

    async def search(self, query: str) -> SearchResponse:
        api_key = self.get_api_key()
        if not api_key:
            raise ValueError(f"{self.api_key_env_var} environment variable is required")

        url = "https://s.jina.ai/"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
            "X-Engine": "browser",
        }
        params = {"q": query}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

        results = []
        for item in data.get("data", []):
            published_time: Optional[datetime] = None
            if item.get("publishedTime"):
                try:
                    published_time = datetime.fromisoformat(
                        item["publishedTime"].replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass

            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    content=item.get("content", ""),
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
