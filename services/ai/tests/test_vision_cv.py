"""
Tests for the Claude Vision CV service (app/services/vision_cv.py).

None of these need an ANTHROPIC_API_KEY: they cover the no-key mock path
and the pure JSON-parsing / normalisation helpers. The one real network
call (`_call_claude`) is exercised via the live curl check in the README,
not here.
"""

import asyncio
import json

from app.schemas.cv_result import CvAnalysisResult
from app.services import vision_cv


def test_no_api_key_returns_labelled_mock(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = asyncio.run(
        vision_cv.analyze_image_source({"type": "url", "url": "http://x/y.jpg"})
    )
    assert isinstance(result, CvAnalysisResult)
    assert result.mock is True
    assert result.is_cat is True
    assert result.breed.label == "Domestic Shorthair"
    assert result.confidence == 0.0
    assert result.breed.confidence == 0.0


def test_mock_result_is_schema_valid():
    m = vision_cv.mock_result()
    # round-trips through Pydantic without raising
    CvAnalysisResult.model_validate(m.model_dump())
    assert m.pose.label in {"sitting", "sleeping", "running", "loaf", "standing", "unknown"}
    assert m.eye_openness.label in {"open", "half", "closed"}
    assert m.ear_orientation.label in {"forward", "alert", "relaxed", "flat"}
    assert m.estimated_age_group.label in {"kitten", "adult", "senior"}


def test_extract_json_strips_markdown_fence():
    payload = {"isCat": True, "confidence": 0.9}
    fenced = "```json\n" + json.dumps(payload) + "\n```"
    assert vision_cv._extract_json(fenced) == payload


def test_extract_json_strips_surrounding_prose():
    payload = {"isCat": False, "confidence": 0.1}
    noisy = "Here is the result: " + json.dumps(payload) + " (done)"
    assert vision_cv._extract_json(noisy) == payload


def test_to_result_maps_camelcase_and_clamps_surroundings():
    raw = {
        "isCat": True,
        "confidence": 0.88,
        "breed": {"label": "Bengal", "confidence": 0.6},
        "pose": {"label": "loaf", "confidence": 0.7},
        "faceOrientation": {"label": "facing camera", "confidence": 0.5},
        "eyeOpenness": {"label": "half", "confidence": 0.4},
        "earOrientation": {"label": "alert", "confidence": 0.55},
        "tailVisible": True,
        "coat": {"color": "brown", "pattern": "spotted", "confidence": 0.5},
        "estimatedAgeGroup": {"label": "adult", "confidence": 0.7},
        "surroundings": [
            {"label": "forest", "confidence": 0.6},
            {"label": "trees", "confidence": 0.5},
            {"label": "grass", "confidence": 0.4},
            {"label": "rocks", "confidence": 0.3},
            {"label": "sky", "confidence": 0.2},
        ],
    }
    r = vision_cv._to_result(raw)
    assert r.is_cat is True
    assert r.face_orientation.label == "facing camera"
    assert r.eye_openness.label == "half"
    assert r.tail_visible is True
    assert r.coat.color == "brown" and r.coat.pattern == "spotted"
    assert len(r.surroundings) == 4  # 5th dropped
    assert r.mock is False


def test_to_result_handles_non_cat_nulls():
    raw = {
        "isCat": False,
        "confidence": 0.05,
        "breed": None,
        "pose": None,
        "faceOrientation": None,
        "eyeOpenness": None,
        "earOrientation": None,
        "tailVisible": False,
        "coat": None,
        "estimatedAgeGroup": None,
        "surroundings": [],
    }
    r = vision_cv._to_result(raw)
    assert r.is_cat is False
    assert r.breed.label == "unknown" and r.breed.confidence == 0.0
    assert r.coat.color == "unknown" and r.coat.confidence == 0.0
    assert r.surroundings == []
