"""
services/ai/tests/test_facial_features.py

Covers detect_tail_visible specifically, since it's the one function in the
package that's explicitly NOT a model call — it's a heuristic, and per the
project's "never invent confidence values" rule, it must return a plain
bool with no confidence attached at all (there's no confidence field in its
return type to even check — the test here verifies the type signature
itself stays a bool, not that some confidence field is null).
"""

from app.pipelines.cv.facial_features import detect_tail_visible


def test_returns_false_when_no_bbox():
    assert detect_tail_visible(None, (800, 600)) is False


def test_returns_bool_type_not_a_confidence_tuple():
    result = detect_tail_visible((10, 10, 100, 100), (800, 600))
    assert isinstance(result, bool)


def test_wide_box_relative_to_height_is_true():
    # width=200, height=200 -> aspect ratio 1.0, below the 1.6 threshold
    result = detect_tail_visible((0, 0, 200, 200), (800, 600))
    assert result is True


def test_very_tall_narrow_box_is_false():
    # width=50, height=300 -> aspect ratio 6.0, well above threshold
    result = detect_tail_visible((0, 0, 50, 300), (800, 600))
    assert result is False


def test_zero_width_box_does_not_crash():
    result = detect_tail_visible((10, 10, 10, 100), (800, 600))
    assert result is False
