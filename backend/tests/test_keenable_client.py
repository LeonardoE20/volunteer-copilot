import asyncio

import httpx
import keenable
import pytest

from app.services.keenable import KeenableClient


def _extract(api_key: str, handler, **options) -> keenable.Page:
    async def run() -> keenable.Page:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http:
            client = KeenableClient(api_key=api_key, client=http)
            return await client.extract("https://a.example/page?x=1", **options)

    return asyncio.run(run())


def test_extract_sends_options_to_keyless_endpoint() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"url": "https://a.example/page?x=1", "content": "dates"})

    page = _extract("", handler, prompt="List the dates", live=True, max_chars=500)

    [request] = requests
    assert request.url.path == "/v1/fetch/public"
    assert dict(request.url.params) == {
        "url": "https://a.example/page?x=1",
        "prompt": "List the dates",
        "live": "true",
        "max_chars": "500",
    }
    assert "X-API-Key" not in request.headers
    assert page.content == "dates"


def test_extract_omits_unset_options_and_uses_key() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"url": "https://a.example/page?x=1", "content": ""})

    _extract("keen_test", handler)

    [request] = requests
    assert request.url.path == "/v1/fetch"
    assert dict(request.url.params) == {"url": "https://a.example/page?x=1"}
    assert request.headers["X-API-Key"] == "keen_test"


def test_extract_raises_sdk_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"message": "slow down"})

    with pytest.raises(keenable.KeenableRateLimitError):
        _extract("", handler)


def test_extract_refuses_private_hosts() -> None:
    async def run() -> None:
        async with KeenableClient(api_key="") as client:
            await client.extract("http://127.0.0.1/admin")

    with pytest.raises(keenable.KeenableInvalidRequestError):
        asyncio.run(run())
