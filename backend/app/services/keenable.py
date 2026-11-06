from typing import Any

from keenable import AsyncKeenable, Page
from keenable.client import _reject_private_fetch_target


class KeenableClient(AsyncKeenable):
    """AsyncKeenable plus the fetch options the SDK doesn't take yet.

    keenable 0.1.3's fetch() accepts only a URL, while the HTTP API also takes prompt, live and
    max_chars (https://docs.keenable.ai/api-reference/fetch.md). extract() goes through the SDK's
    private request helper so keyless routing, headers and error types stay the SDK's own.
    Switch to fetch() once the SDK supports these options.
    """

    async def extract(
        self,
        url: str,
        *,
        prompt: str | None = None,
        live: bool = False,
        max_chars: int | None = None,
    ) -> Page:
        _reject_private_fetch_target(url)
        params: dict[str, Any] = {"url": url}
        if prompt:
            params["prompt"] = prompt
        if live:
            params["live"] = True
        if max_chars is not None:
            params["max_chars"] = max_chars
        return Page._from_json(await self._request("fetch", params=params), url)
