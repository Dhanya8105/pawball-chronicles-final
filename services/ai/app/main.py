"""services/ai/app/main.py — FastAPI entrypoint for the AI microservice."""

# Load services/ai/.env (ANTHROPIC_API_KEY, CLOUDINARY_*, ...) for standalone
# `uvicorn` dev. Real environment variables — e.g. docker-compose's
# `environment:` block — take precedence (override=False).
from dotenv import load_dotenv

load_dotenv(override=False)

from fastapi import FastAPI  # noqa: E402
from app.routers import cv, imagegen  # noqa: E402

app = FastAPI(
    title="PawBall Chronicles AI Service",
    description="Stateless CV, embedding, and image-generation orchestration. "
    "Owns no persistent data — apps/api is the source of truth.",
    version="0.1.0",
)

app.include_router(imagegen.router)
app.include_router(cv.router)
# app.include_router(embeddings.router)  # added once pipelines/embeddings/* lands (Milestone 7, Bond System)


@app.get("/health")
async def health():
    return {"status": "ok"}
