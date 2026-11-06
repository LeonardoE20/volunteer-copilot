import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import InboundHandlerDep, session_for
from app.core.config import Settings, get_settings
from app.services.chert import parse_inbound, parse_status_update, verify_signature
from app.services.coordination import apply_provider_status

router = APIRouter(prefix="/chert", tags=["chert"])


@router.post("/webhook", status_code=204)
async def chert_webhook(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    handle: InboundHandlerDep,
) -> None:
    """Receive Chert webhook events. Register this URL as a webhook subscription in Chert."""
    if not settings.chert_webhook_secret:
        # Not 2xx, so Chert keeps the events for retry and replay once this is configured.
        raise HTTPException(503, "CHERT_WEBHOOK_SECRET is not set")

    body = await request.body()
    signature = request.headers.get("x-webhook-signature") or request.headers.get(
        "x-chert-signature"
    )
    if not verify_signature(body, signature, settings.chert_webhook_secret):
        raise HTTPException(401, "Invalid Chert signature")

    try:
        payload = json.loads(body)
        message = parse_inbound(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if message:
        await handle(message)
        return
    update = parse_status_update(payload)
    if update is not None:
        async for session in session_for(request):
            await apply_provider_status(session, update)
            await session.commit()
