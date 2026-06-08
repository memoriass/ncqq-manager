"""Container runtime route package."""

from fastapi import APIRouter

from routers.container_runtime.actions import router as actions_router
from routers.container_runtime.data_recreate import router as data_recreate_router
from routers.container_runtime.events import router as events_router
from routers.container_runtime.internal import router as internal_router
from routers.container_runtime.status import router as status_router


router = APIRouter()
router.include_router(data_recreate_router)
router.include_router(actions_router)
router.include_router(status_router)
router.include_router(internal_router)
router.include_router(events_router)

__all__ = ["router"]
