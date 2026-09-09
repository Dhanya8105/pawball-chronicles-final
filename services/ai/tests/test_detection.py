"""
services/ai/tests/test_detection.py

crop_to_subject is pure geometry (no model call) so it's tested directly
against a real PIL Image. detect_cat itself needs a real YOLO model and is
covered by test_model_registry.py's missing-weights path plus, separately,
by manual verification once real weights are downloaded (see
docs/architecture/03-ai-pipeline.md and this milestone's CHANGELOG entry).
"""

from PIL import Image
from app.pipelines.cv.detection import crop_to_subject


def test_crop_adds_margin_around_bbox():
    image = Image.new("RGB", (800, 600), (100, 100, 100))
    bbox = (100, 100, 300, 300)  # 200x200 box
    cropped = crop_to_subject(image, bbox)
    # 10% margin on a 200-wide/200-tall box = 20px each side
    assert cropped.size == (240, 240)


def test_crop_clamps_to_image_bounds_near_edge():
    image = Image.new("RGB", (800, 600), (100, 100, 100))
    bbox = (0, 0, 50, 50)  # near top-left corner
    cropped = crop_to_subject(image, bbox)
    # margin would push past 0, must clamp rather than error or wrap
    assert cropped.size[0] <= 50 + 10  # 50 + max possible margin
    assert cropped.size[0] > 0
    assert cropped.size[1] > 0


def test_crop_clamps_to_image_bounds_at_far_edge():
    image = Image.new("RGB", (800, 600), (100, 100, 100))
    bbox = (750, 550, 800, 600)  # touches bottom-right corner
    cropped = crop_to_subject(image, bbox)
    assert cropped.size[0] > 0
    assert cropped.size[1] > 0
