"""
services/ai/app/pipelines/imagegen/__init__.py

Provider selection + fallback chain. This is the ONLY place that knows about
all three concrete provider classes. Routers import `get_provider_chain` and
never reference ComfyUIProvider/SDXLProvider/PlaceholderProvider directly.
"""

import os
import logging
from app.pipelines.imagegen.provider import ImageGenerationProvider
from app.pipelines.imagegen.comfyui_provider import ComfyUIProvider
from app.pipelines.imagegen.sdxl_provider import SDXLProvider
from app.pipelines.imagegen.placeholder_provider import PlaceholderProvider

logger = logging.getLogger(__name__)

_PROVIDER_REGISTRY = {
    "comfyui": ComfyUIProvider,
    "sdxl": SDXLProvider,
    "placeholder": PlaceholderProvider,
}


def get_provider() -> ImageGenerationProvider:
    """Single active provider, set via IMAGE_GEN_PROVIDER. Defaults to
    'placeholder' since no GPU host is provisioned yet."""
    name = os.getenv("IMAGE_GEN_PROVIDER", "placeholder")
    if name not in _PROVIDER_REGISTRY:
        raise ValueError(f"Unknown IMAGE_GEN_PROVIDER '{name}'")
    return _PROVIDER_REGISTRY[name]()


def get_provider_chain() -> list[ImageGenerationProvider]:
    """Ordered fallback chain, set via IMAGE_GEN_FALLBACK_CHAIN
    (comma-separated). Defaults to just the single configured provider.
    Used by the imagegen router: try each provider's submit() in order,
    falling through on exception, so a down GPU host degrades to
    Placeholder rather than failing the capture pipeline outright."""
    raw = os.getenv("IMAGE_GEN_FALLBACK_CHAIN", os.getenv("IMAGE_GEN_PROVIDER", "placeholder"))
    names = [n.strip() for n in raw.split(",") if n.strip()]
    chain = []
    for name in names:
        if name not in _PROVIDER_REGISTRY:
            logger.warning("Skipping unknown provider in fallback chain: %s", name)
            continue
        chain.append(_PROVIDER_REGISTRY[name]())
    if not chain:
        chain = [PlaceholderProvider()]
    return chain
