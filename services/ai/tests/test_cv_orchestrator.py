"""
services/ai/tests/test_cv_orchestrator.py

Verifies analyze_image's control flow with mocked pipeline modules — this
tests the ORCHESTRATION logic (which classifiers run, in what order, with
what input) independent of whether real model weights are present. Each
individual classifier's own correctness is that classifier's own module's
responsibility/tests; this file only verifies analyze_image wires them
together correctly.
"""

from unittest.mock import patch
from PIL import Image

from app.services.cv_orchestrator import analyze_image
from app.pipelines.cv.detection import DetectionResult
from app.schemas.cv_result import ConfidenceValue, CoatResult, SurroundingLabel


def test_no_cat_detected_skips_all_classifiers():
    """When detection finds no cat, breed/pose/coat/age/facial-feature
    classifiers must never be called — running them against a catless
    image would produce meaningless labels and waste compute."""
    fake_image = Image.new("RGB", (100, 100))

    with patch("app.services.cv_orchestrator.detection.detect_cat") as mock_detect, \
         patch("app.services.cv_orchestrator.surroundings.classify_surroundings") as mock_surroundings, \
         patch("app.services.cv_orchestrator.breed.classify_breed") as mock_breed, \
         patch("app.services.cv_orchestrator.pose.classify_pose") as mock_pose:

        mock_detect.return_value = DetectionResult(is_cat=False, confidence=0.02, bbox=None)
        mock_surroundings.return_value = [SurroundingLabel(label="street", confidence=0.4)]

        result = analyze_image(fake_image)

        assert result.is_cat is False
        assert result.confidence == 0.02
        mock_breed.assert_not_called()
        mock_pose.assert_not_called()
        # surroundings DOES run even with no cat — environment classification
        # is independent of whether a cat was found in frame
        mock_surroundings.assert_called_once()


def test_cat_detected_runs_full_classifier_suite():
    fake_image = Image.new("RGB", (200, 200))

    with patch("app.services.cv_orchestrator.detection.detect_cat") as mock_detect, \
         patch("app.services.cv_orchestrator.detection.crop_to_subject") as mock_crop, \
         patch("app.services.cv_orchestrator.surroundings.classify_surroundings") as mock_surroundings, \
         patch("app.services.cv_orchestrator.breed.classify_breed") as mock_breed, \
         patch("app.services.cv_orchestrator.pose.classify_pose") as mock_pose, \
         patch("app.services.cv_orchestrator.coat.classify_coat") as mock_coat, \
         patch("app.services.cv_orchestrator.age.classify_age_group") as mock_age, \
         patch("app.services.cv_orchestrator.facial_features.classify_eye_openness") as mock_eyes, \
         patch("app.services.cv_orchestrator.facial_features.classify_ear_orientation") as mock_ears, \
         patch("app.services.cv_orchestrator.facial_features.classify_face_orientation") as mock_face, \
         patch("app.services.cv_orchestrator.facial_features.detect_tail_visible") as mock_tail:

        mock_detect.return_value = DetectionResult(is_cat=True, confidence=0.91, bbox=(10, 10, 90, 90))
        mock_crop.return_value = fake_image
        mock_surroundings.return_value = []
        mock_breed.return_value = ConfidenceValue(label="Bengal", confidence=0.6)
        mock_pose.return_value = ConfidenceValue(label="sitting", confidence=0.8)
        mock_coat.return_value = CoatResult(color="orange", pattern="tabby", confidence=0.7)
        mock_age.return_value = ConfidenceValue(label="adult", confidence=0.65)
        mock_eyes.return_value = ConfidenceValue(label="open", confidence=0.9)
        mock_ears.return_value = ConfidenceValue(label="forward", confidence=0.55)
        mock_face.return_value = ConfidenceValue(label="facing camera", confidence=0.77)
        mock_tail.return_value = True

        result = analyze_image(fake_image)

        assert result.is_cat is True
        assert result.confidence == 0.91
        assert result.breed.label == "Bengal"
        assert result.pose.label == "sitting"
        assert result.tail_visible is True
        mock_crop.assert_called_once_with(fake_image, (10, 10, 90, 90))
