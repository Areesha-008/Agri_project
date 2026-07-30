import pytest

from app.services.crop_health_service import _healthy_status_label, compute_health_score


def test_compute_health_score_at_baseline_is_100():
    assert compute_health_score(latest_ndvi_mean=0.84, baseline_ndvi=0.84) == 100


def test_compute_health_score_clamps_above_100():
    assert compute_health_score(latest_ndvi_mean=1.5, baseline_ndvi=0.84) == 100


def test_compute_health_score_clamps_at_0_floor():
    assert compute_health_score(latest_ndvi_mean=-0.5, baseline_ndvi=0.84) == 0


def test_compute_health_score_scales_proportionally():
    # Half the baseline NDVI -> ~50 health score.
    assert compute_health_score(latest_ndvi_mean=0.42, baseline_ndvi=0.84) == 50


@pytest.mark.parametrize(
    "score,label", [(100, "Healthy"), (75, "Healthy"), (74, "Stressed"), (40, "Stressed"), (39, "Critical"), (0, "Critical")]
)
def test_healthy_status_label_thresholds(score, label):
    assert _healthy_status_label(score) == label
