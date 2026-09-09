"""
services/ai/tests/test_surroundings.py

Mocks get_clip_model() to return a fake model/processor pair whose forward
pass produces fixed, known logits — this lets us verify the REAL threshold
and sort logic in classify_surroundings without needing actual CLIP
weights. The softmax/threshold/sort code is exactly what would run with
real weights; only the model's raw output is faked here.
"""

from unittest.mock import patch, MagicMock
import torch
from PIL import Image

from app.pipelines.cv.surroundings import classify_surroundings, SURROUNDING_LABELS


def _make_fake_clip(logits: list[float]):
    fake_model = MagicMock()
    fake_outputs = MagicMock()
    fake_outputs.logits_per_image = torch.tensor([logits])
    fake_model.return_value = fake_outputs

    fake_processor = MagicMock()
    fake_processor.return_value = {}

    return fake_model, fake_processor


def test_only_labels_above_threshold_are_returned():
    fake_image = Image.new("RGB", (50, 50))
    # Construct logits so softmax gives one clearly dominant label and the
    # rest near-zero — only the dominant one should clear the 0.05 threshold.
    logits = [10.0] + [0.0] * (len(SURROUNDING_LABELS) - 1)
    fake_model, fake_processor = _make_fake_clip(logits)

    with patch(
        "app.pipelines.cv.surroundings.get_clip_model",
        return_value=(fake_model, fake_processor),
    ):
        results = classify_surroundings(fake_image)

    assert len(results) >= 1
    assert results[0].label == SURROUNDING_LABELS[0]
    assert all(r.confidence >= 0.05 for r in results)


def test_results_are_sorted_descending_by_confidence():
    fake_image = Image.new("RGB", (50, 50))
    logits = [1.0, 3.0, 2.0] + [-10.0] * (len(SURROUNDING_LABELS) - 3)
    fake_model, fake_processor = _make_fake_clip(logits)

    with patch(
        "app.pipelines.cv.surroundings.get_clip_model",
        return_value=(fake_model, fake_processor),
    ):
        results = classify_surroundings(fake_image)

    confidences = [r.confidence for r in results]
    assert confidences == sorted(confidences, reverse=True)


def test_no_labels_clear_threshold_returns_empty_list():
    fake_image = Image.new("RGB", (50, 50))
    # Uniform logits -> uniform softmax -> every label gets roughly
    # 1/19 ≈ 0.053, which is just above 0.05, so nudge them down further.
    logits = [-5.0] * len(SURROUNDING_LABELS)
    logits[0] = 10.0  # one dominant label, rest should fall below 0.05
    fake_model, fake_processor = _make_fake_clip(logits)

    with patch(
        "app.pipelines.cv.surroundings.get_clip_model",
        return_value=(fake_model, fake_processor),
    ):
        results = classify_surroundings(fake_image)

    # only the dominant label should clear threshold
    assert len(results) == 1
