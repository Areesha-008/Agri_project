import pytest

from app.models.district_yield_baseline import DistrictYieldBaseline
from app.services.crop_health_service import (
    _healthy_status_label,
    compute_health_score,
    project_yield,
)


def test_compute_health_score_at_baseline_is_100():
    assert compute_health_score(latest_ndvi_mean=0.84, baseline_ndvi=0.84) == 100


def test_compute_health_score_clamps_above_100():
    # A field out-yielding its baseline still clamps the *score* to 100
    # (project_yield below is intentionally not clamped).
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


def test_project_yield_scales_with_health_score():
    baseline = DistrictYieldBaseline(
        district="Faisalabad",
        crop="Wheat",
        baseline_ndvi=0.84,
        baseline_yield_maund_per_acre=77.0,
        baseline_yield_t_per_ha=6.2,
    )

    maund, t_ha = project_yield(baseline, health_score=100)
    assert maund == 77.0
    assert t_ha == 6.2

    maund_half, t_ha_half = project_yield(baseline, health_score=50)
    assert maund_half == pytest.approx(38.5)
    assert t_ha_half == pytest.approx(3.1)


def test_project_yield_can_exceed_baseline_when_uncapped_upstream():
    # project_yield itself doesn't clamp — a caller passing a score above
    # 100 (which compute_health_score would never produce) still scales
    # linearly. Documents that clamping is compute_health_score's job.
    baseline = DistrictYieldBaseline(
        district="DEFAULT",
        crop="DEFAULT",
        baseline_ndvi=0.84,
        baseline_yield_maund_per_acre=77.0,
        baseline_yield_t_per_ha=6.2,
    )
    maund, _ = project_yield(baseline, health_score=150)
    assert maund == pytest.approx(115.5)
