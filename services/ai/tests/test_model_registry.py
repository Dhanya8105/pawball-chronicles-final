"""
services/ai/tests/test_model_registry.py

Verifies the core honesty constraint: when model weights aren't present in
the local cache, get_*() functions raise ModelNotAvailableError with a
clear, actionable message — they never silently return None, an empty
model-like object, or any other value that could let a caller proceed as
if inference had actually happened.
"""

import pytest
from pathlib import Path

from app.models import registry


@pytest.fixture(autouse=True)
def clear_model_cache():
    registry.clear_cache()
    yield
    registry.clear_cache()


def test_yolo_detector_raises_when_weights_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(registry, "MODEL_CACHE_DIR", tmp_path)
    with pytest.raises(registry.ModelNotAvailableError) as exc_info:
        registry.get_yolo_detector()
    assert "yolov8n" in str(exc_info.value)
    assert "download_models.sh" in str(exc_info.value)


def test_clip_model_raises_when_weights_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(registry, "MODEL_CACHE_DIR", tmp_path)
    with pytest.raises(registry.ModelNotAvailableError) as exc_info:
        registry.get_clip_model()
    assert "clip-vit-base-patch32" in str(exc_info.value)


def test_breed_classifier_raises_when_weights_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(registry, "MODEL_CACHE_DIR", tmp_path)
    with pytest.raises(registry.ModelNotAvailableError) as exc_info:
        registry.get_breed_classifier()
    assert "breed_classifier" in str(exc_info.value)


def test_model_not_available_error_includes_expected_path(tmp_path):
    expected = tmp_path / "somefile.pt"
    err = registry.ModelNotAvailableError("test_model", expected)
    assert str(expected) in str(err)
    assert err.model_name == "test_model"
    assert err.expected_path == expected


def test_yolo_detector_is_cached_after_first_successful_load(tmp_path, monkeypatch):
    """Verifies the cache actually short-circuits a second call — without
    this, every CV request would reload weights from disk, which is slow
    and defeats the point of lazy-loading-then-caching."""
    monkeypatch.setattr(registry, "MODEL_CACHE_DIR", tmp_path)
    registry._cache["yolo"] = "fake-cached-model"
    result = registry.get_yolo_detector()
    assert result == "fake-cached-model"
