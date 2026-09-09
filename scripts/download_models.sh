#!/usr/bin/env bash
#
# scripts/download_models.sh
#
# One-time setup step: downloads the real model weights the CV pipeline
# (services/ai/app/pipelines/cv/) needs into a local cache directory.
#
# WHY THIS IS A MANUAL SCRIPT RATHER THAN AUTOMATIC:
# This was built in a development sandbox whose network access is
# restricted to a small allowlist (package registries, GitHub repo
# content) and does NOT include any model-weight host — HuggingFace,
# GitHub *release asset* downloads (as opposed to repo content, which is
# allowed), and PyTorch's own CDN were all checked directly and confirmed
# unreachable (HTTP 403 from the network egress layer) before writing this
# script. Run this on a machine with normal, unrestricted internet access.
#
# WHAT THIS DOWNLOADS:
#   - yolov8n.pt           (~6MB)  — cat detection (pipelines/cv/detection.py)
#   - clip-vit-base-patch32 (~600MB) — used by every other classifier in
#                                       pipelines/cv/ (zero-shot pose, coat,
#                                       age, breed, facial features,
#                                       surroundings) plus, later, same-cat
#                                       re-identification embeddings
#
# After running this once, MODEL_CACHE_DIR (default ./model_cache, override
# via env var) is populated and services/ai will load real models on first
# request. For production, bake this into the AI service's Docker image
# build step instead of running interactively.

set -euo pipefail

MODEL_CACHE_DIR="${MODEL_CACHE_DIR:-./model_cache}"
mkdir -p "$MODEL_CACHE_DIR"

echo "==> Downloading YOLOv8n (cat detection) to $MODEL_CACHE_DIR/yolov8n.pt"
curl -L -o "$MODEL_CACHE_DIR/yolov8n.pt" \
  "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt"

echo "==> Downloading CLIP ViT-B/32 (zero-shot classifiers) to $MODEL_CACHE_DIR/clip-vit-base-patch32"
python3 - <<PYEOF
from huggingface_hub import snapshot_download
import os

target = os.path.join("${MODEL_CACHE_DIR}", "clip-vit-base-patch32")
snapshot_download(repo_id="openai/clip-vit-base-patch32", local_dir=target)
print(f"CLIP weights downloaded to {target}")
PYEOF

echo ""
echo "==> Done. Model cache populated at: $MODEL_CACHE_DIR"
echo "    Set MODEL_CACHE_DIR=$MODEL_CACHE_DIR (or move this directory) before"
echo "    starting services/ai so it picks these up."
echo ""
echo "Note: breed_classifier.pt (a cat-breed-fine-tuned checkpoint) is NOT"
echo "downloaded by this script because no such checkpoint exists yet —"
echo "breed classification currently runs via CLIP zero-shot instead. See"
echo "services/ai/app/pipelines/cv/breed.py and models/registry.py's"
echo "get_breed_classifier() docstring for the full explanation and the"
echo "upgrade path once a real fine-tuned checkpoint is trained."
