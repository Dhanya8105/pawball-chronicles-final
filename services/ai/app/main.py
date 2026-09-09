"""services/ai/app/main.py — FastAPI entrypoint for the AI microservice."""

from fastapi import FastAPI
from app.routers import cv, imagegen

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
