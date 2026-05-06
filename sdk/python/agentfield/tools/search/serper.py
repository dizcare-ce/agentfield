"""Serper search provider (Google SERP API)."""

from __future__ import annotations

from typing import Literal

import httpx

from .base import SearchProvider, SearchResponse, SearchResult


class SerperSearchProvider(SearchProvider):
    """Serper (Google SERP) search provider implementation."""

    def __init__(
        self,
        search_type: Literal["search", "news", "images"] = "search",
        num_results: int = 10,
        country: str = "us",
        locale: str = "en",
    ):
        self.search_type = search_type
        self.num_results = num_results
        self.country = country
        self.locale = locale

    @property
    def name(self) -> str:
        return "serper"

    @property
    def api_key_env_var(self) -> str:
        return "SERPER_API_KEY"

    async def search(self, query: str) -> SearchResponse:
        api_key = self.get_api_key()
        if not api_key:
            raise ValueError(f"{self.api_key_env_var} environment variable is required")

        url = f"https://google.serper.dev/{self.search_type}"
        headers = {"Content-Type": "application/json", "X-API-KEY": api_key}
        payload = {
            "q": query,
            "num": self.num_results,
            "gl": self.country,
            "hl": self.locale,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        if self.search_type == "news":
            items = data.get("news", [])
        elif self.search_type == "images":
            items = data.get("images", [])
        else:
            items = data.get("organic", [])

        results = []
        for item in items:
            url_field = item.get("link") or item.get("imageUrl", "")
            content = item.get("snippet", "")
            if self.search_type == "news":
                content = item.get("snippet") or item.get("description", "")
            elif self.search_type == "images":
                content = item.get("title", "")

            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=url_field,
                    content=content,
                    description=item.get("snippet"),
                    published_time=None,
                )
            )

        return SearchResponse(
            results=results,
            total_results=len(results),
            query_used=query,
            provider=self.name,
        )
