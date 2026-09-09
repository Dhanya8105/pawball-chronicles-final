"""services/ai/app/schemas/imagegen.py"""

from pydantic import BaseModel
from typing import Optional, Literal


class ImageGenRequest(BaseModel):
    original_image_url: str
    breed: str
    coat_color: str
    coat_pattern: str
    pose: str
    surroundings: list[str]
    fantasy_class: str
    element: str
    region: str


class ImageGenJobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "complete", "failed"]
    image_url: Optional[str] = None
    error: Optional[str] = None
    provider_used: str
