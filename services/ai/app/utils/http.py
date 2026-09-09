"""services/ai/app/utils/http.py"""

import httpx


async def fetch_image_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content
