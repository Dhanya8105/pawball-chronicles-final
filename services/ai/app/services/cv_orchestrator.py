"""
services/ai/app/services/cv_orchestrator.py

The only place that composes the individual pipeline modules
(detection, breed, pose, coat, age, facial_features, surroundings) into the
single CvAnalysisResult shape the router returns. Each pipeline module
stays independently unit-testable with a mocked PIL Image and mocked model
registry — this orchestrator is what wires them together for the real
request path.

If a cat isn't detected at all, none of the downstream classifiers run —
there's no point running breed/pose/coat classification against an image
that doesn't contain a cat, and doing so would waste compute and produce
meaningless labels.
"""

from PIL import Image

from app.pipelines.cv import age, breed, coat, detection, facial_features, pose, surroundings
from app.schemas.cv_result import ConfidenceValue, CoatResult, CvAnalysisResult


def analyze_image(image: Image.Image) -> CvAnalysisResult:
    detection_result = detection.detect_cat(image)

    if not detection_result.is_cat:
        return CvAnalysisResult(
            is_cat=False,
            confidence=detection_result.confidence,
            breed=ConfidenceValue(label="unknown", confidence=0.0),
            pose=ConfidenceValue(label="unknown", confidence=0.0),
            face_orientation=ConfidenceValue(label="unknown", confidence=0.0),
            eye_openness=ConfidenceValue(label="unknown", confidence=0.0),
            ear_orientation=ConfidenceValue(label="unknown", confidence=0.0),
            tail_visible=False,
            coat=CoatResult(color="unknown", pattern="unknown", confidence=0.0),
            estimated_age_group=ConfidenceValue(label="unknown", confidence=0.0),
            surroundings=surroundings.classify_surroundings(image),
        )

    subject_crop = (
        detection.crop_to_subject(image, detection_result.bbox)
        if detection_result.bbox
        else image
    )

    return CvAnalysisResult(
        is_cat=True,
        confidence=detection_result.confidence,
        breed=breed.classify_breed(subject_crop),
        pose=pose.classify_pose(subject_crop),
        face_orientation=facial_features.classify_face_orientation(subject_crop),
        eye_openness=facial_features.classify_eye_openness(subject_crop),
        ear_orientation=facial_features.classify_ear_orientation(subject_crop),
        tail_visible=facial_features.detect_tail_visible(detection_result.bbox, image.size),
        coat=coat.classify_coat(subject_crop),
        estimated_age_group=age.classify_age_group(subject_crop),
        # Surroundings classification runs on the FULL image, not the
        # cat crop — the whole point is reading the environment around the
        # cat, which the crop deliberately excludes.
        surroundings=surroundings.classify_surroundings(image),
    )
