"""
services/ai/app/pipelines/cv/detection.py

Real YOLOv8 inference via ultralytics, against the standard COCO-pretrained
yolov8n checkpoint (class 15 = 'cat' in the COCO label set — no fine-tuning
needed for "is there a cat" detection specifically, since COCO already
includes cats as a class). This is the one CV sub-task in this milestone
that works with a stock pretrained checkpoint rather than needing a
custom-trained one — see models/registry.py's get_breed_classifier()
docstring for the contrast.

Returns the real model confidence (box.conf) and the cat's bounding box
(used by downstream classifiers to crop to just the cat before running
breed/pose/coat/age classification, rather than classifying the whole
scene).
"""

from PIL import Image
from app.models.registry import get_yolo_detector

COCO_CAT_CLASS_ID = 15


class DetectionResult:
    def __init__(self, is_cat: bool, confidence: float, bbox: tuple[int, int, int, int] | None):
        self.is_cat = is_cat
        self.confidence = confidence
        self.bbox = bbox  # (x1, y1, x2, y2) in pixel coords, or None if no cat found


def detect_cat(image: Image.Image) -> DetectionResult:
    """Runs YOLOv8 object detection and returns whether a cat was found,
    its real confidence, and its bounding box for downstream cropping.

    If multiple cats are detected, the highest-confidence one is used —
    multi-cat-per-photo handling (separate PawBalls per cat in one image)
    is out of scope for this milestone and is left as a documented
    limitation, not silently mishandled: see this module's tests for the
    explicit single-cat assumption.
    """
    model = get_yolo_detector()
    results = model(image, verbose=False)

    best_box = None
    best_conf = 0.0

    for result in results:
        for box in result.boxes:
            if int(box.cls[0]) != COCO_CAT_CLASS_ID:
                continue
            conf = float(box.conf[0])
            if conf > best_conf:
                best_conf = conf
                xyxy = box.xyxy[0].tolist()
                best_box = (int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]))

    if best_box is None:
        return DetectionResult(is_cat=False, confidence=0.0, bbox=None)

    return DetectionResult(is_cat=True, confidence=best_conf, bbox=best_box)


def crop_to_subject(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    """Crops the image to the detected cat's bounding box, with a small
    margin so classifiers downstream (breed, coat) see a bit of context
    rather than a razor-tight crop that might clip ears/tail."""
    x1, y1, x2, y2 = bbox
    width, height = image.size
    margin_x = int((x2 - x1) * 0.1)
    margin_y = int((y2 - y1) * 0.1)
    return image.crop((
        max(0, x1 - margin_x),
        max(0, y1 - margin_y),
        min(width, x2 + margin_x),
        min(height, y2 + margin_y),
    ))
