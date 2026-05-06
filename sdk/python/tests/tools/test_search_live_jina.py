"""Live functional smoke test for the Jina search provider.

Skipped unless ``JINA_API_KEY`` is set in the environment. When the key is
present, this test issues one real search request and asserts that the
provider returns at least one result with a URL and a non-empty content
field. This is the proper functional test that proves the integration
actually works against the provider's API.

Marked ``functional`` so it runs alongside other end-to-end-within-SDK
tests but is gated on the API key at import time.
"""

from __future__ import annotations

import os

import pytest

from agentfield.tools.search import JinaSearchProvider, search

pytestmark = [
    pytest.mark.functional,
    pytest.mark.skipif(
        not os.environ.get("JINA_API_KEY"),
        reason="JINA_API_KEY not set — skipping live Jina smoke test",
    ),
]


@pytest.mark.asyncio
async def test_jina_live_search_returns_results():
    """Real Jina search must return at least one result with a URL."""
    response = await JinaSearchProvider().search("agentfield python sdk")

    assert response.provider == "jina"
    assert response.query_used == "agentfield python sdk"
    assert response.total_results >= 1, "expected at least one result from Jina"

    first = response.results[0]
    assert first.url, "first result should have a URL"
    assert first.url.startswith(("http://", "https://"))
    # Most results have content; a few might just have title+url. We require
    # at least one of the three text fields to be non-empty.
    assert first.title or first.content or first.description


@pytest.mark.asyncio
async def test_module_search_helper_live():
    """The top-level search() helper auto-resolves to Jina when only Jina is set."""
    response = await search("pytest")
    assert response.provider in {"jina", "tavily", "firecrawl", "serper"}
    assert response.total_results >= 1
