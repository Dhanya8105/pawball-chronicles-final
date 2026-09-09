"""services/ai/app/utils/cloudinary_client.py

services/ai uploads generated/composited images directly to Cloudinary rather
than returning raw bytes to apps/api, so apps/api never has to proxy binary
payloads — it only ever stores/reads URLs.
"""

import os
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)


async def upload_image_bytes(data: bytes, folder: str) -> str:
    result = cloudinary.uploader.upload(data, folder=folder, resource_type="image")
    return result["secure_url"]
