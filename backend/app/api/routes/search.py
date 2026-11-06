from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import KeenableDep

router = APIRouter(tags=["search"])

DateFilter = Annotated[
    str | None, Query(description="YYYY-MM-DD, an ISO 8601 timestamp, or relative like 7d or 2w")
]


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    published_at: str | None = None
    acquired_at: str | None = None


class SearchResponse(BaseModel):
    query: str
    mode: str | None
    results: list[SearchResult]
    # Numbered "[n] Title (url)" block for an LLM prompt; [n] matches results[n - 1].
    # The SDK caps it at ~12k chars, so with long snippets it may cite only the first results.
    context: str
    warning: str | None = None
    # Credits billed for the call. Keenable only sends it for requests made with an API key.
    usage: dict[str, Any] | None = None


@router.get("/search")
async def search(
    keenable: KeenableDep,
    q: Annotated[str, Query(min_length=1, description="Describe the page you want")],
    mode: Annotated[
        Literal["pro", "realtime"], Query(description="pro: deeper retrieval; realtime: fastest")
    ] = "pro",
    site: Annotated[str | None, Query(description="Restrict to one site, e.g. arxiv.org")] = None,
    published_after: DateFilter = None,
    published_before: DateFilter = None,
    acquired_after: Annotated[
        str | None, Query(description="Pages Keenable indexed on or after this; same formats")
    ] = None,
    acquired_before: Annotated[
        str | None, Query(description="Pages Keenable indexed on or before this; same formats")
    ] = None,
    query_time: Annotated[
        str | None, Query(description="Search the index as it stood then; not a recency filter")
    ] = None,
    max_results: Annotated[int, Query(ge=1, le=50)] = 10,
    # Full page snippets run 5-7k chars; 1,000 keeps 10 results inside the context budget.
    snippet_max_length: Annotated[int, Query(ge=180, le=10000)] = 1000,
) -> SearchResponse:
    response = await keenable.search(
        q,
        # The SDK types mode as "pro" only but forwards any value; the API also takes realtime.
        mode=mode,  # type: ignore[arg-type]
        site=site,
        published_after=published_after,
        published_before=published_before,
        acquired_after=acquired_after,
        acquired_before=acquired_before,
        query_time=query_time,
        max_results=max_results,
        snippet_max_length=snippet_max_length,
    )

    return SearchResponse(
        query=response.query,
        mode=response.mode,
        results=[
            SearchResult(
                title=r.title,
                url=r.url,
                snippet=r.snippet,
                published_at=r.published_at,
                acquired_at=r.acquired_at,
            )
            for r in response.results
        ],
        context=response.to_context(),
        warning=response.raw.get("warning"),
        usage=response.raw.get("usage"),
    )
