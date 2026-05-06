"""Base classes and models for web search providers.

Vendored from github.com/Agent-Field/af-deep-research at skills/search/base.py.
Adapted for agentfield: no behavioral changes, kept the SearchProvider ABC and
unified pydantic models.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SearchResult(BaseModel):
    """Unified search result model for all providers."""

    title: str = Field(description="Result title")
    url: str = Field(description="Result URL")
    content: str = Field(description="Result content/snippet")
    description: Optional[str] = Field(None, description="Result description")
    published_time: Optional[datetime] = Field(None, description="Publication time")

    model_config = ConfigDict(populate_by_name=True)


class SearchResponse(BaseModel):
    """Unified response model for all search providers."""

    results: List[SearchResult] = Field(
        default_factory=list, description="Search results"
    )
    total_results: int = Field(0, description="Total number of results")
    query_used: str = Field("", description="Query that was executed")
    provider: str = Field("", description="Provider that executed the search")

    model_config = ConfigDict(populate_by_name=True)


class SearchProvider(ABC):
    """Abstract base class for search providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name identifier."""

    @property
    @abstractmethod
    def api_key_env_var(self) -> str:
        """Environment variable name for the API key."""

    def get_api_key(self) -> Optional[str]:
        return os.getenv(self.api_key_env_var)

    def is_available(self) -> bool:
        api_key = self.get_api_key()
        return api_key is not None and len(api_key) > 0

    @abstractmethod
    async def search(self, query: str) -> SearchResponse:
        """Execute a search query."""

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(available={self.is_available()})"
