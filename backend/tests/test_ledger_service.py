import pytest

from app.services.ledger_service import calculate_fertilizer_bags


def test_calculate_fertilizer_bags_matches_design_sample():
    # design_handoff sample fields sum to 12.4 + 9.6 + 15.2 + 7.8 = 45.0 ha.
    urea, dap, sop = calculate_fertilizer_bags(45.0)
    acres = 45.0 * 2.47
    assert urea == round(acres * 1.6)
    assert dap == round(acres * 1.0)
    assert sop == round(acres * 0.5)


def test_calculate_fertilizer_bags_zero_area():
    assert calculate_fertilizer_bags(0.0) == (0, 0, 0)


@pytest.mark.parametrize("total_hectares", [1.0, 10.5, 100.0, 5000.0])
def test_calculate_fertilizer_bags_urea_exceeds_dap_and_sop(total_hectares):
    # Urea rate (1.6/acre) > DAP rate (1.0/acre) > SOP rate (0.5/acre), so
    # bag counts should preserve that ordering at any nonzero area.
    urea, dap, sop = calculate_fertilizer_bags(total_hectares)
    assert urea >= dap >= sop
