"""Compatibility entrypoint for container runtime routes.

The route implementation is split under ``routers/container_runtime/`` so
model readers and maintainers can load the runtime surface by concern.
"""

from routers.container_runtime import router
from routers.container_runtime.common import ContainerAction, RecreateRequest

__all__ = ["router", "ContainerAction", "RecreateRequest"]
