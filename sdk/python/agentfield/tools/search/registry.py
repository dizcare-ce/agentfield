"""Search provider registry: auto-detection and selection."""

from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional, Type

from .base import SearchProvider
from .firecrawl import FirecrawlSearchProvider
from .jina import JinaSearchProvider
from .serper import SerperSearchProvider
from .tavily import TavilySearchProvider

logger = logging.getLogger(__name__)


DEFAULT_PROVIDER_PRIORITY = ["jina", "tavily", "firecrawl", "serper"]

PROVIDER_CLASSES: Dict[str, Type[SearchProvider]] = {
    "jina": JinaSearchProvider,
    "tavily": TavilySearchProvider,
    "firecrawl": FirecrawlSearchProvider,
    "serper": SerperSearchProvider,
}


def get_all_providers() -> Dict[str, SearchProvider]:
    return {name: cls() for name, cls in PROVIDER_CLASSES.items()}


def get_available_providers() -> List[SearchProvider]:
    available = []
    for name in DEFAULT_PROVIDER_PRIORITY:
        if name in PROVIDER_CLASSES:
            provider = PROVIDER_CLASSES[name]()
            if provider.is_available():
                available.append(provider)
    return available


def get_provider(name: str) -> Optional[SearchProvider]:
    if name in PROVIDER_CLASSES:
        return PROVIDER_CLASSES[name]()
    return None


def get_default_provider() -> Optional[SearchProvider]:
    """Return the default provider based on env config and availability.

    Order:
    1. SEARCH_PROVIDER env var if set and available
    2. First available provider in DEFAULT_PROVIDER_PRIORITY
    3. None if no provider has its API key configured
    """
    preferred = os.getenv("SEARCH_PROVIDER", "").lower().strip()
    if preferred:
        provider = get_provider(preferred)
        if provider and provider.is_available():
            return provider
        logger.warning(
            "Preferred SEARCH_PROVIDER=%s not available; falling through to priority order",
            preferred,
        )

    available = get_available_providers()
    if available:
        return available[0]
    return None


def list_provider_status() -> Dict[str, bool]:
    return {
        name: PROVIDER_CLASSES[name]().is_available()
        for name in DEFAULT_PROVIDER_PRIORITY
    }


def register_provider(name: str, provider_class: Type[SearchProvider]) -> None:
    if not issubclass(provider_class, SearchProvider):
        raise TypeError("Provider must inherit from SearchProvider")
    PROVIDER_CLASSES[name] = provider_class
    if name not in DEFAULT_PROVIDER_PRIORITY:
        DEFAULT_PROVIDER_PRIORITY.append(name)
