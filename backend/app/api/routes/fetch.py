from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import KeenableDep

router = APIRouter(tags=["fetch"])


class FetchResponse(BaseModel):
    url: str
    title: str
    author: str | None
    published_at: str | None
    # The page as markdown, or only the answer to `prompt` when one was given.
    content: str
    # "[1] Title (url)" block for an LLM prompt, cut at ~12k chars.
    context: str
    # Credits billed for the call. Keenable only sends it for requests made with an API key.
    usage: dict[str, Any] | None = None


def _iso_from_unix(value: Any) -> str | None:
    # Fetch reports published_at as Unix seconds, unlike search's ISO 8601 strings.
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return None


@router.get("/fetch")
async def fetch(
    keenable: KeenableDep,
    url: Annotated[str, Query(description="Absolute http(s) URL of the page to read")],
    prompt: Annotated[
        str | None,
        Query(max_length=2000, description="Return only what this asks for, not the whole page"),
    ] = None,
    live: Annotated[
        bool, Query(description="Fetch from the source now instead of Keenable's indexed copy")
    ] = False,
    max_chars: Annotated[
        int | None, Query(ge=1, description="Cap on content length; Keenable defaults to 50,000")
    ] = None,
) -> FetchResponse:
    page = await keenable.extract(url, prompt=prompt, live=live, max_chars=max_chars)

    return FetchResponse(
        url=page.url,
        title=page.title,
        author=page.author,
        published_at=page.published_at or _iso_from_unix(page.raw.get("published_at")),
        content=page.content,
        context=page.to_context(),
        usage=page.raw.get("usage"),
    )
