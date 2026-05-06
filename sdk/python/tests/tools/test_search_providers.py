"""Unit tests for the four web search providers and the registry.

HTTP traffic is mocked with pytest-httpx so these tests run without keys and
without hitting the network. Live tests against real APIs live in
``test_search_live_jina.py``.
"""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from agentfield.tools.search import (
    DEFAULT_PROVIDER_PRIORITY,
    FirecrawlSearchProvider,
    JinaSearchProvider,
    SearchProvider,
    SerperSearchProvider,
    TavilySearchProvider,
    get_available_providers,
    get_default_provider,
    get_provider,
    list_provider_status,
    register_provider,
    search,
    search_with_provider,
)

pytestmark = pytest.mark.unit


# ---------- Jina ----------


async def test_jina_search_parses_response(monkeypatch, httpx_mock: HTTPXMock):
    monkeypatch.setenv("JINA_API_KEY", "jina-test-key")
    httpx_mock.add_response(
        url="https://s.jina.ai/?q=pytest+docs",
        method="GET",
        json={
            "data": [
                {
                    "title": "Pytest documentation",
                    "url": "https://docs.pytest.org",
                    "content": "pytest is a framework",
                    "description": "Test framework",
                    "publishedTime": "2024-01-01T00:00:00Z",
                },
                {
                    "title": "Pytest on PyPI",
                    "url": "https://pypi.org/project/pytest",
                    "content": "Latest release",
                },
            ]
        },
    )

    response = await JinaSearchProvider().search("pytest docs")

    assert response.provider == "jina"
    assert response.query_used == "pytest docs"
    assert response.total_results == 2
    assert response.results[0].title == "Pytest documentation"
    assert response.results[0].url == "https://docs.pytest.org"
    assert response.results[0].published_time is not None
    # Second result has no publishedTime — should not blow up
    assert response.results[1].published_time is None


async def test_jina_missing_key_raises(monkeypatch):
    monkeypatch.delenv("JINA_API_KEY", raising=False)
    with pytest.raises(ValueError, match="JINA_API_KEY"):
        await JinaSearchProvider().search("anything")


async def test_jina_http_error_propagates(monkeypatch, httpx_mock: HTTPXMock):
    monkeypatch.setenv("JINA_API_KEY", "jina-test-key")
    httpx_mock.add_response(
        url="https://s.jina.ai/?q=fail", method="GET", status_code=500
    )
    import httpx

    with pytest.raises(httpx.HTTPStatusError):
        await JinaSearchProvider().search("fail")


# ---------- Tavily ----------


async def test_tavily_search_parses_response(monkeypatch, httpx_mock: HTTPXMock):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-test")
    httpx_mock.add_response(
        url="https://api.tavily.com/search",
        method="POST",
        json={
            "results": [
                {
                    "title": "Article",
                    "url": "https://example.com/a",
                    "content": "snippet body",
                    "snippet": "short",
                    "published_date": "2024-06-15T12:00:00Z",
                }
            ]
        },
    )

    response = await TavilySearchProvider().search("topic")
    assert response.provider == "tavily"
    assert response.total_results == 1
    assert response.results[0].url == "https://example.com/a"
    assert response.results[0].description == "short"
    assert response.results[0].published_time is not None


async def test_tavily_missing_key_raises(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    with pytest.raises(ValueError, match="TAVILY_API_KEY"):
        await TavilySearchProvider().search("anything")


# ---------- Firecrawl ----------


async def test_firecrawl_search_parses_response(monkeypatch, httpx_mock: HTTPXMock):
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")
    httpx_mock.add_response(
        url="https://api.firecrawl.dev/v1/search",
        method="POST",
        json={
            "data": [
                {
                    "title": "Doc",
                    "url": "https://example.com/doc",
                    "markdown": "# Heading\nbody",
                    "description": "doc desc",
                    "publishedDate": "2025-02-01T08:30:00Z",
                },
                {
                    "title": "Snippet only",
                    "url": "https://example.com/snip",
                    "snippet": "fallback snippet",
                },
            ]
        },
    )

    response = await FirecrawlSearchProvider().search("docs")
    assert response.provider == "firecrawl"
    assert response.total_results == 2
    # First result prefers markdown over description/snippet
    assert response.results[0].content.startswith("# Heading")
    # Second result falls back to snippet (no markdown, no description)
    assert response.results[1].content == "fallback snippet"


async def test_firecrawl_missing_key_raises(monkeypatch):
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    with pytest.raises(ValueError, match="FIRECRAWL_API_KEY"):
        await FirecrawlSearchProvider().search("anything")


# ---------- Serper ----------


async def test_serper_search_parses_organic(monkeypatch, httpx_mock: HTTPXMock):
    monkeypatch.setenv("SERPER_API_KEY", "serper-test")
    httpx_mock.add_response(
        url="https://google.serper.dev/search",
        method="POST",
        json={
            "organic": [
                {
                    "title": "Result A",
                    "link": "https://a.example",
                    "snippet": "A snippet",
                },
                {
                    "title": "Result B",
                    "link": "https://b.example",
                    "snippet": "B snippet",
                },
            ]
        },
    )

    response = await SerperSearchProvider().search("query")
    assert response.provider == "serper"
    assert response.total_results == 2
    assert response.results[0].url == "https://a.example"


async def test_serper_news_uses_news_section(monkeypatch, httpx_mock: HTTPXMock):
    monkeypatch.setenv("SERPER_API_KEY", "serper-test")
    httpx_mock.add_response(
        url="https://google.serper.dev/news",
        method="POST",
        json={
            "news": [
                {
                    "title": "Breaking",
                    "link": "https://news.example",
                    "snippet": "news snippet",
                }
            ]
        },
    )
    response = await SerperSearchProvider(search_type="news").search("topic")
    assert response.total_results == 1
    assert response.results[0].url == "https://news.example"


async def test_serper_missing_key_raises(monkeypatch):
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    with pytest.raises(ValueError, match="SERPER_API_KEY"):
        await SerperSearchProvider().search("anything")


# ---------- Registry / auto-detect ----------


def _clear_all_keys(monkeypatch):
    for key in (
        "JINA_API_KEY",
        "TAVILY_API_KEY",
        "FIRECRAWL_API_KEY",
        "SERPER_API_KEY",
        "SEARCH_PROVIDER",
    ):
        monkeypatch.delenv(key, raising=False)


def test_default_priority_picks_jina_when_only_jina_set(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")
    provider = get_default_provider()
    assert provider is not None
    assert provider.name == "jina"


def test_default_priority_picks_first_available_in_priority_order(monkeypatch):
    _clear_all_keys(monkeypatch)
    # Skip jina, configure tavily and serper. Priority order is jina,tavily,firecrawl,serper
    # so the default should be tavily (first available).
    monkeypatch.setenv("TAVILY_API_KEY", "t")
    monkeypatch.setenv("SERPER_API_KEY", "s")
    provider = get_default_provider()
    assert provider is not None
    assert provider.name == "tavily"


def test_explicit_search_provider_env_var_wins(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "j")
    monkeypatch.setenv("SERPER_API_KEY", "s")
    monkeypatch.setenv("SEARCH_PROVIDER", "serper")
    provider = get_default_provider()
    assert provider is not None
    assert provider.name == "serper"


def test_explicit_search_provider_falls_through_when_unavailable(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "j")
    monkeypatch.setenv("SEARCH_PROVIDER", "tavily")  # not configured
    provider = get_default_provider()
    assert provider is not None
    assert provider.name == "jina"  # falls back to first available in priority


def test_no_providers_returns_none(monkeypatch):
    _clear_all_keys(monkeypatch)
    assert get_default_provider() is None
    assert get_available_providers() == []


def test_list_provider_status_reflects_env(monkeypatch):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "j")
    status = list_provider_status()
    assert status["jina"] is True
    assert status["tavily"] is False
    assert set(status.keys()) == set(DEFAULT_PROVIDER_PRIORITY)


def test_get_provider_unknown_returns_none():
    assert get_provider("nonexistent") is None


def test_register_custom_provider(monkeypatch):
    _clear_all_keys(monkeypatch)

    class FakeProvider(SearchProvider):
        @property
        def name(self) -> str:
            return "fake"

        @property
        def api_key_env_var(self) -> str:
            return "FAKE_API_KEY"

        async def search(self, query: str):  # pragma: no cover - not exercised
            raise NotImplementedError

    register_provider("fake", FakeProvider)
    monkeypatch.setenv("FAKE_API_KEY", "k")
    instance = get_provider("fake")
    assert isinstance(instance, FakeProvider)


def test_register_provider_rejects_non_subclass():
    class NotAProvider:
        pass

    with pytest.raises(TypeError):
        register_provider("bad", NotAProvider)  # type: ignore[arg-type]


# ---------- module-level search() helper ----------


async def test_module_search_helper_uses_default_provider(
    monkeypatch, httpx_mock: HTTPXMock
):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("JINA_API_KEY", "k")
    httpx_mock.add_response(
        url="https://s.jina.ai/?q=hello",
        method="GET",
        json={"data": [{"title": "H", "url": "https://h", "content": "hi"}]},
    )

    response = await search("hello")
    assert response.provider == "jina"
    assert response.total_results == 1


async def test_module_search_helper_raises_without_providers(monkeypatch):
    _clear_all_keys(monkeypatch)
    with pytest.raises(RuntimeError, match="No search providers"):
        await search("anything")


async def test_search_with_provider_specific(monkeypatch, httpx_mock: HTTPXMock):
    _clear_all_keys(monkeypatch)
    monkeypatch.setenv("TAVILY_API_KEY", "t")
    httpx_mock.add_response(
        url="https://api.tavily.com/search",
        method="POST",
        json={"results": [{"title": "T", "url": "https://t", "content": "c"}]},
    )

    response = await search_with_provider("q", provider="tavily")
    assert response.provider == "tavily"


async def test_search_with_provider_unknown_raises():
    with pytest.raises(ValueError, match="Unknown"):
        await search_with_provider("q", provider="bogus")


async def test_search_with_provider_unconfigured_raises(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    with pytest.raises(ValueError, match="not available"):
        await search_with_provider("q", provider="tavily")
