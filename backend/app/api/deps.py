from typing import Annotated

from fastapi import Depends, Request

from app.services.keenable import KeenableClient


def get_keenable(request: Request) -> KeenableClient:
    return request.app.state.keenable


KeenableDep = Annotated[KeenableClient, Depends(get_keenable)]
