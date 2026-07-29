import pytest

from app.data.sfri_fertilizer_data import (
    FERTILIZER_NUTRIENT_CONTENT,
    SFRI_DATA,
    classify_soil,
    infer_irrigation_regime,
    kg_to_bags,
)


def _leaf_nodes():
    """Walks SFRI_DATA collecting every dict that carries a kg/acre target,
    tagged with a readable label for parametrize IDs."""
    leaves = []

    def walk(node, path):
        if isinstance(node, dict) and "N_kg_acre" in node:
            leaves.append((" / ".join(path), node))
        elif isinstance(node, dict):
            for key, value in node.items():
                if isinstance(value, dict):
                    walk(value, path + [key])

    for crop, rules in SFRI_DATA.items():
        walk(rules, [crop])
    return leaves


@pytest.mark.parametrize("label,node", _leaf_nodes(), ids=[label for label, _ in _leaf_nodes()])
def test_kg_to_bags_supplies_within_one_bag_rounding_of_target(label, node):
    bags = kg_to_bags(node["N_kg_acre"], node["P2O5_kg_acre"], node["K2O_kg_acre"])

    dap = FERTILIZER_NUTRIENT_CONTENT["DAP"]
    urea = FERTILIZER_NUTRIENT_CONTENT["urea"]
    sop = FERTILIZER_NUTRIENT_CONTENT["SOP"]
    dap_p_per_bag = dap["P_percent"] / 100 * dap["bag_weight_kg"]
    urea_n_per_bag = urea["N_percent"] / 100 * urea["bag_weight_kg"]
    sop_k_per_bag = sop["K_percent"] / 100 * sop["bag_weight_kg"]

    # Quarter-bag rounding means supplied nutrient can be off from the exact
    # target by at most half a bag's worth of that nutrient.
    assert abs(bags.P2O5_supplied_kg - node["P2O5_kg_acre"]) <= dap_p_per_bag * 0.5 + 0.01
    assert abs(bags.K2O_supplied_kg - node["K2O_kg_acre"]) <= sop_k_per_bag * 0.5 + 0.01
    # N target minus what DAP already supplies is topped up by urea, so the
    # same half-bag tolerance applies to N.
    assert abs(bags.N_supplied_kg - node["N_kg_acre"]) <= urea_n_per_bag * 0.5 + 0.01


def test_kg_to_bags_zero_target_needs_no_fertilizer():
    bags = kg_to_bags(0.0, 0.0, 0.0)
    assert bags.as_text() == "No fertilizer required"


@pytest.mark.parametrize(
    "P_ppm,K_ppm,om_percent,expected",
    [
        # Below the weak threshold on every axis -> weak, unambiguously.
        (5, 60, 0.5, "weak"),
        # Regression case for the bounds bug: P is inside the medium band,
        # but K is still below the weak threshold overall -> must be
        # "weak", not silently pass through as "medium" (the originally
        # supplied classify_soil only checked upper bounds here).
        (10, 60, 1.0, "weak"),
        # Squarely inside the medium band on all three axes.
        (15, 130, 1.0, "medium"),
        # Above every fertile threshold.
        (30, 200, 1.5, "fertile"),
    ],
)
def test_classify_soil(P_ppm, K_ppm, om_percent, expected):
    assert classify_soil(P_ppm, K_ppm, om_percent) == expected


def test_infer_irrigation_regime_matches_known_rainfed_district():
    irrigation_type, rainfall_class = infer_irrigation_regime("Chakwal")
    assert irrigation_type == "rainfed"
    assert rainfall_class == "medium_rainfall"


def test_infer_irrigation_regime_defaults_to_irrigated_for_unknown_district():
    assert infer_irrigation_regime("Faisalabad") == ("irrigated", None)


def test_infer_irrigation_regime_defaults_to_irrigated_for_no_district():
    assert infer_irrigation_regime(None) == ("irrigated", None)
