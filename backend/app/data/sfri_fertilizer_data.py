"""
SFRI Punjab Fertilizer Recommendation Data
===========================================
Source:  Soil Fertility Research Institute (SFRI), Punjab, Pakistan brochures,
         transcribed by hand into a spreadsheet/notebook and supplied to this
         project as a starting agronomy prior (2026-07).
Unit:    Nutrients in kg/acre as N, P2O5 and K2O | Products in bags/acre
         (1 bag = 50kg).

ARCHITECTURE NOTE:
------------------
kg/acre nutrient targets (N_kg_acre, P2O5_kg_acre, K2O_kg_acre) are the ONLY
source of truth in this file. Bag-quantity product strings are NOT stored —
they are computed on demand by kg_to_bags()/recommend_bags_for() from the
kg/acre targets, so the two representations cannot drift apart.

UNIT CORRECTION (vs. the originally supplied data): the original transcription
called the middle/third nutrient fields "P_kg_acre"/"K_kg_acre", but the
DAP/SOP bag-math conversions it used (23 kg per 50kg DAP bag, 25 kg per SOP
bag) are P2O5 and K2O calculations, not elemental P and K. Renamed here to
P2O5_kg_acre/K2O_kg_acre throughout — this is a naming fix only, the
kg/acre values and bag arithmetic are unchanged and already correct under
the oxide-equivalent convention.

Data confidence per crop is tracked explicitly and must be surfaced to the
user, never silently dropped:
  "photo_confirmed"  - kg/acre values read directly off a clear photo of the
                        SFRI brochure table (wheat only, verified 2026-07).
  "reconciled_calc"  - kg/acre values recomputed from a brochure bag
                        recommendation using the nutrient-content table, and
                        the arithmetic checks out cleanly (maize, chickpea,
                        cotton).
  "unverified"        - kg/acre values as originally transcribed, not yet
                        cross-checked against a clear brochure photo (rice,
                        sugarcane). Treat as provisional; never present as
                        lab-validated.

SATELLITE_THRESHOLDS below is a provisional, uncalibrated-for-Punjab-specific-
conditions starting point for turning canopy indices into an evidence
classification (adequate / possible N-stress / possible water-stress /
waterlogged / insufficient observation) — NOT a validated diagnostic. Any
recommendation that uses it must carry a matching disclaimer in its
`warnings` list. Do not convert an index directly to a kg dose.

Product prices (PKR) are indicative only, captured at file-authoring time —
never present them as a current market price. See fertilizer_recommendation
service/schema `warnings` for how this is surfaced.
"""

from dataclasses import dataclass


# =============================================================================
# FERTILIZER NUTRIENT CONTENT (%)
# =============================================================================

FERTILIZER_NUTRIENT_CONTENT = {
    "urea": {
        "formula": "46-0-0", "N_percent": 46, "P_percent": 0, "K_percent": 0,
        "bag_weight_kg": 50,
        "local_brands": ["Engro Urea", "Sona Urea", "Fatima Urea", "FFC Urea"],
        "price_pkr_bag": 4200,
    },
    "DAP": {
        "formula": "18-46-0", "N_percent": 18, "P_percent": 46, "K_percent": 0,
        "bag_weight_kg": 50,
        "local_brands": ["Fauji DAP", "Engro DAP"],
        "price_pkr_bag": 12000,
    },
    "TSP": {
        "formula": "0-46-0", "N_percent": 0, "P_percent": 46, "K_percent": 0,
        "bag_weight_kg": 50,
        "local_brands": ["Imported TSP"],
        "price_pkr_bag": 9000,
    },
    "SSP": {
        "formula": "0-18-0", "N_percent": 0, "P_percent": 18, "K_percent": 0,
        "bag_weight_kg": 50,
        "local_brands": ["Local SSP"],
        "price_pkr_bag": 2800,
    },
    "SOP": {
        "formula": "0-0-50", "N_percent": 0, "P_percent": 0, "K_percent": 50,
        "bag_weight_kg": 50,
        "local_brands": ["Imported SOP"],
        "price_pkr_bag": 8500,
    },
    "MOP": {
        "formula": "0-0-60", "N_percent": 0, "P_percent": 0, "K_percent": 60,
        "bag_weight_kg": 50,
        "local_brands": ["Imported MOP"],
        "price_pkr_bag": 7200,
    },
    "CAN": {
        "formula": "26-0-0", "N_percent": 26, "P_percent": 0, "K_percent": 0,
        "bag_weight_kg": 50,
        "local_brands": ["Imported CAN"],
        "price_pkr_bag": 3800,
    },
    "ammonium_sulphate": {
        "formula": "21-0-0", "N_percent": 21, "P_percent": 0, "K_percent": 0,
        "bag_weight_kg": 50,
        "local_brands": ["Local AS"],
        "price_pkr_bag": 3200,
    },
}

MICRONUTRIENT_CONTENT = {
    "zinc_sulphate_33": {"Zn_percent": 33, "price_pkr_kg": 500,
                          "local_brands": ["Local Zinc Sulphate 33%"]},
    "zinc_sulphate_21": {"Zn_percent": 21, "price_pkr_kg": 400,
                          "local_brands": ["Local Zinc Sulphate 21%"]},
    "boron_boric_acid": {"B_percent": 17, "price_pkr_kg": 800,
                          "local_brands": ["Imported Boric Acid"]},
    "borax":             {"B_percent": 11, "price_pkr_kg": 600,
                          "local_brands": ["Local Borax"]},
    "copper_sulphate":   {"Cu_percent": 30, "price_pkr_kg": 700},
    "ferrous_sulphate":  {"Fe_percent": 24, "price_pkr_kg": 450},
    "manganese_sulphate": {"Mn_percent": 20, "price_pkr_kg": 550},
}


# =============================================================================
# SOIL FERTILITY CLASSIFICATION
# =============================================================================

SOIL_FERTILITY_CLASSIFICATION = {
    "weak":    {"P_ppm_max": 7, "K_ppm_max": 80, "organic_matter_max": 0.86,
                "description": "Poor/Weak land — low fertility"},
    "medium":  {"P_ppm_min": 7, "P_ppm_max": 21, "K_ppm_min": 80, "K_ppm_max": 180,
                "organic_matter_min": 0.86, "organic_matter_max": 1.27,
                "description": "Medium fertility land"},
    "fertile": {"P_ppm_min": 21, "K_ppm_min": 180, "organic_matter_min": 1.27,
                "description": "Fertile/Rich land — high fertility"},
}


def classify_soil(P_ppm: float, K_ppm: float, organic_matter_percent: float) -> str:
    """
    Classify soil fertility based on SFRI Punjab thresholds.

    Bug fix vs. the originally supplied version: that version's "medium"
    branch only checked upper bounds (P_ppm <= 21 and K_ppm <= 180 and
    organic_matter <= 1.27), so a P/K/OM combination below the weak
    thresholds but still under the medium upper bounds was silently
    misclassified as "medium" instead of "weak". This version checks the
    medium band's lower bounds too, so a value has to actually clear the
    weak threshold to count as medium.
    """
    weak = SOIL_FERTILITY_CLASSIFICATION["weak"]
    medium = SOIL_FERTILITY_CLASSIFICATION["medium"]

    if P_ppm < weak["P_ppm_max"] or K_ppm < weak["K_ppm_max"] or organic_matter_percent < weak["organic_matter_max"]:
        return "weak"
    elif (
        medium["P_ppm_min"] <= P_ppm <= medium["P_ppm_max"]
        and medium["K_ppm_min"] <= K_ppm <= medium["K_ppm_max"]
        and medium["organic_matter_min"] <= organic_matter_percent <= medium["organic_matter_max"]
    ):
        return "medium"
    else:
        return "fertile"


# =============================================================================
# PREVIOUS CROP NITROGEN CREDIT
# =============================================================================

PREVIOUS_CROP_N_CREDIT_KG_ACRE = {
    "chickpea": 20, "lentil": 15, "mung_bean": 12, "soybean": 18,
    "wheat": 5, "rice": 8, "maize": 0, "cotton": 0, "sugarcane": 0,
    "default": 0,
}


# =============================================================================
# SATELLITE INDEX THRESHOLDS FOR EVIDENCE CLASSIFICATION (provisional — see
# module docstring)
# =============================================================================

SATELLITE_THRESHOLDS = {
    "Wheat":     {"ndre_critical": 0.20, "ndre_low": 0.25, "ndre_high": 0.35,
                  "cci_critical": 0.25, "cci_low": 0.30,
                  "ndmi_stress": -0.15, "ndwi_stress": -0.10, "ndwi_waterlog": 0.35},
    "Rice":      {"ndre_critical": 0.18, "ndre_low": 0.22, "ndre_high": 0.32,
                  "cci_critical": 0.22, "cci_low": 0.28,
                  "ndmi_stress": -0.10, "ndwi_stress": 0.00, "ndwi_waterlog": 0.50},
    "Cotton":    {"ndre_critical": 0.18, "ndre_low": 0.22, "ndre_high": 0.30,
                  "cci_critical": 0.20, "cci_low": 0.25,
                  "ndmi_stress": -0.20, "ndwi_stress": -0.15, "ndwi_waterlog": 0.35},
    "Sugarcane": {"ndre_critical": 0.25, "ndre_low": 0.30, "ndre_high": 0.40,
                  "cci_critical": 0.28, "cci_low": 0.33,
                  "ndmi_stress": -0.08, "ndwi_stress": -0.03, "ndwi_waterlog": 0.40},
    "Maize":     {"ndre_critical": 0.20, "ndre_low": 0.25, "ndre_high": 0.35,
                  "cci_critical": 0.23, "cci_low": 0.28,
                  "ndmi_stress": -0.18, "ndwi_stress": -0.12, "ndwi_waterlog": 0.35},
    "Chickpea":  {"ndre_critical": 0.15, "ndre_low": 0.18, "ndre_high": 0.28,
                  "cci_critical": 0.18, "cci_low": 0.22,
                  "ndmi_stress": -0.22, "ndwi_stress": -0.16, "ndwi_waterlog": 0.30},
}


# =============================================================================
# kg/acre -> BAGS CONVERSION (computed, not stored)
# =============================================================================

def _round_to(value: float, step: float) -> float:
    if step <= 0:
        return value
    return round(value / step) * step


@dataclass
class BagRecommendation:
    DAP_bags: float
    Urea_bags: float
    SOP_bags: float
    N_supplied_kg: float
    P2O5_supplied_kg: float
    K2O_supplied_kg: float
    N_target_kg: float
    P2O5_target_kg: float
    K2O_target_kg: float

    def as_text(self) -> str:
        parts = []
        if self.DAP_bags > 0:
            parts.append(f"{self.DAP_bags:g} bag(s) DAP")
        if self.Urea_bags > 0:
            parts.append(f"{self.Urea_bags:g} bag(s) Urea")
        if self.SOP_bags > 0:
            parts.append(f"{self.SOP_bags:g} bag(s) SOP")
        return " + ".join(parts) if parts else "No fertilizer required"


def kg_to_bags(N_kg: float, P2O5_kg: float, K2O_kg: float,
               round_step: float = 0.25) -> BagRecommendation:
    """
    Convert an N/P2O5/K2O kg/acre target into a DAP + Urea + SOP bag
    recommendation. DAP is used to fully meet the phosphorus (P2O5) target
    (and contributes some nitrogen as a side effect); Urea tops up the
    remaining nitrogen; SOP meets the potassium (K2O) target. This is the
    standard product combination SFRI brochures use as their "option 1"
    across crops.

    Rounded to the nearest `round_step` of a bag (default: quarter bag,
    matching how SFRI brochures express partial bags).
    """
    dap = FERTILIZER_NUTRIENT_CONTENT["DAP"]
    urea = FERTILIZER_NUTRIENT_CONTENT["urea"]
    sop = FERTILIZER_NUTRIENT_CONTENT["SOP"]

    dap_n_per_bag = dap["N_percent"] / 100 * dap["bag_weight_kg"]
    dap_p_per_bag = dap["P_percent"] / 100 * dap["bag_weight_kg"]
    urea_n_per_bag = urea["N_percent"] / 100 * urea["bag_weight_kg"]
    sop_k_per_bag = sop["K_percent"] / 100 * sop["bag_weight_kg"]

    dap_bags = (P2O5_kg / dap_p_per_bag) if P2O5_kg > 0 else 0.0
    dap_bags = _round_to(dap_bags, round_step)

    n_from_dap = dap_bags * dap_n_per_bag
    remaining_n = max(N_kg - n_from_dap, 0.0)
    urea_bags = _round_to(remaining_n / urea_n_per_bag, round_step) if remaining_n > 0 else 0.0

    sop_bags = _round_to(K2O_kg / sop_k_per_bag, round_step) if K2O_kg > 0 else 0.0

    return BagRecommendation(
        DAP_bags=dap_bags,
        Urea_bags=urea_bags,
        SOP_bags=sop_bags,
        N_supplied_kg=round(dap_bags * dap_n_per_bag + urea_bags * urea_n_per_bag, 1),
        P2O5_supplied_kg=round(dap_bags * dap_p_per_bag, 1),
        K2O_supplied_kg=round(sop_bags * sop_k_per_bag, 1),
        N_target_kg=N_kg, P2O5_target_kg=P2O5_kg, K2O_target_kg=K2O_kg,
    )


def recommend_bags_for(crop: str, tier_path: list, round_step: float = 0.25) -> BagRecommendation:
    """
    Look up an N/P2O5/K2O target inside SFRI_DATA by following tier_path
    (e.g. ["irrigated", "weak"] for wheat) and return the computed bag
    recommendation.
    """
    node = SFRI_DATA[crop]
    for key in tier_path:
        node = node[key]
    return kg_to_bags(node["N_kg_acre"], node["P2O5_kg_acre"], node["K2O_kg_acre"], round_step)


# =============================================================================
# MAIN SFRI FERTILIZER DATA  (kg/acre = source of truth; no stored bag strings)
# =============================================================================

SFRI_DATA = {

    # -------------------------------------------------------------------
    # WHEAT — kg/acre photo-confirmed against two SFRI brochure table
    # images (irrigated table + rainfed table), 2026-07.
    # -------------------------------------------------------------------
    "Wheat": {
        "source": "SFRI Punjab Wheat Brochure",
        "kg_acre_confidence": "photo_confirmed",
        "crop_type": "Rabi",
        "sowing_months": ["October", "November"],
        "harvest_months": ["April", "May"],

        "irrigated": {
            "weak":    {"N_kg_acre": 58, "P2O5_kg_acre": 46, "K2O_kg_acre": 25,
                        "micronutrients": {"zinc_sulphate_33_kg_acre": 6},
                        "timing": {"pre_sowing": "All P2O5 + All K2O + 50% N",
                                   "first_irrigation": "Remaining 50% N",
                                   "note": "On light soils split N into 3 applications instead"}},
            "medium":  {"N_kg_acre": 42, "P2O5_kg_acre": 34, "K2O_kg_acre": 25,
                        "micronutrients": {"zinc_sulphate_33_kg_acre": 6},
                        "timing": {"pre_sowing": "All P2O5 + All K2O + 50% N",
                                   "first_irrigation": "Remaining 50% N",
                                   "note": "On light soils split N into 3 applications instead"}},
            "fertile": {"N_kg_acre": 32, "P2O5_kg_acre": 23, "K2O_kg_acre": 25,
                        "micronutrients": {"zinc_sulphate_33_kg_acre": 0},
                        "timing": {"pre_sowing": "All P2O5 + All K2O + 50% N",
                                   "first_irrigation": "Remaining 50% N",
                                   "note": "Reduce dose further on already very fertile land"}},
        },

        "rainfed": {
            "low_rainfall": {
                "areas": ["Rajanpur", "Leiah", "Dera Ghazi Khan", "Muzaffargarh",
                          "Bhakkar", "Mianwali", "Khushab"],
                "N_kg_acre": 23, "P2O5_kg_acre": 23, "K2O_kg_acre": 12,
                "timing": {"pre_sowing": "All fertilizer at sowing (single application)"},
            },
            "medium_rainfall": {
                "areas": ["Chakwal"],
                "N_kg_acre": 46, "P2O5_kg_acre": 46, "K2O_kg_acre": 12,
                "timing": {"pre_sowing": "All fertilizer at sowing (single application)"},
            },
            "high_rainfall": {
                "areas": ["Rawalpindi", "Attock", "Jhelum", "Narowal", "Gujrat", "Kharian"],
                "N_kg_acre": 46, "P2O5_kg_acre": 46, "K2O_kg_acre": 12,
                "timing": {"pre_sowing": "All fertilizer at sowing (single application)"},
            },
        },

        "general_notes": [
            "On light textured soils apply N in three splits instead of two",
            "Phosphorus can be applied at first irrigation if missed at sowing",
            "In late planting apply all fertilizer at sowing",
            "Apply Zinc Sulphate 33% at 6 kg/acre where deficient",
            "Adjust K2O and micronutrients based on soil analysis",
        ],
    },

    # -------------------------------------------------------------------
    # RICE — kg/acre as originally transcribed; NOT yet cross-checked
    # against a clear brochure photo. Variety-based, not fertility-tiered.
    # -------------------------------------------------------------------
    "Rice": {
        "source": "SFRI Punjab Rice Brochure",
        "kg_acre_confidence": "unverified",
        "crop_type": "Kharif",
        "sowing_months": ["June", "July"],
        "harvest_months": ["October", "November"],

        "varieties": {
            "IRRI": {
                "includes": ["IRRI-6", "IRRI-9", "IRRI-2000"],
                "N_kg_acre": 57, "P2O5_kg_acre": 41, "K2O_kg_acre": 32,
                "timing": {"pre_transplanting": "All P2O5 + All K2O + 50% N incorporated in mud",
                           "day_35_40": "Remaining 50% N at panicle initiation, in dry soil",
                           "zinc": "Zinc Sulphate 33% at 6 kg/acre, 7-10 days after transplanting"},
            },
            "Basmati_385_2000_198": {
                "includes": ["Basmati-385", "Basmati-2000", "Basmati-198"],
                "N_kg_acre": 57, "P2O5_kg_acre": 32, "K2O_kg_acre": 25,
                "timing": {"pre_transplanting": "All P2O5 + All K2O + 50% N incorporated in mud",
                           "day_35_40": "Remaining 50% N at panicle initiation, in dry soil",
                           "zinc": "Zinc Sulphate 33% at 6 kg/acre, 7-10 days after transplanting"},
            },
            "Shaheen_Basmati": {
                "includes": ["Shaheen Basmati"],
                "N_kg_acre": 46, "P2O5_kg_acre": 28, "K2O_kg_acre": 25,
                "timing": {"pre_transplanting": "All P2O5 + All K2O + 50% N incorporated in mud",
                           "day_35_40": "Remaining 50% N at panicle initiation, in dry soil",
                           "zinc": "Zinc Sulphate 33% at 6 kg/acre, 7-10 days after transplanting"},
            },
            "Basmati_370_Pak_Kernel": {
                "includes": ["Basmati-370", "Basmati Pak", "Kernel"],
                "N_kg_acre": 34, "P2O5_kg_acre": 24, "K2O_kg_acre": 25,
                "timing": {"pre_transplanting": "All P2O5 + All K2O + 50% N incorporated in mud",
                           "day_35_40": "Remaining 50% N at panicle initiation, in dry soil",
                           "zinc": "Zinc Sulphate 33% at 6 kg/acre, 7-10 days after transplanting"},
            },
        },

        "default_variety": "IRRI",

        "general_notes": [
            "NEVER apply N fertilizer in standing water — causes volatilization loss",
            "Incorporate urea in mud before flooding for 25-30% yield increase",
            "Rice soils in Pakistan are commonly reported as zinc-deficient — treat as a crop/ecology "
            "prior requiring confirmation, not a universal rule for every field",
            "Use ammoniacal N sources (Urea or Ammonium Sulphate) — better for rice",
            "Apply K2O based on soil analysis",
            "Flood irrigation immediately after N top dressing in dry soil",
        ],
    },

    # -------------------------------------------------------------------
    # COTTON — kg/acre reconciled from the SFRI sowing-time bag table
    # (arithmetic checks out cleanly against that table). A separate
    # "Mid April-May" top-dressing table also appears in the source
    # brochure; it is deliberately EXCLUDED here because it's unclear
    # whether it is additional top-dressing beyond the totals below or a
    # restatement — confirm against the brochure before adding it.
    # -------------------------------------------------------------------
    "Cotton": {
        "source": "SFRI Punjab Cotton Brochure",
        "kg_acre_confidence": "reconciled_calc",
        "crop_type": "Kharif",
        "sowing_months": ["April", "May"],
        "harvest_months": ["November", "December"],

        "BT_hybrid": {
            "weak":    {"N_kg_acre": 119,   "P2O5_kg_acre": 69,   "K2O_kg_acre": 50},
            "medium":  {"N_kg_acre": 105.5, "P2O5_kg_acre": 34.5, "K2O_kg_acre": 50},
            "fertile": {"N_kg_acre": 57.5,  "P2O5_kg_acre": 23,   "K2O_kg_acre": 50},
        },
        "conventional": {
            "weak":    {"N_kg_acre": 34.5, "P2O5_kg_acre": 23,    "K2O_kg_acre": 25},
            "medium":  {"N_kg_acre": 46,   "P2O5_kg_acre": 17.25, "K2O_kg_acre": 25},
            "fertile": {"N_kg_acre": 57.5, "P2O5_kg_acre": 23,    "K2O_kg_acre": 25},
        },

        "default_type": "BT_hybrid",

        "timing": {
            "sowing": "1/4 of total fertilizer (band placement)",
            "first_irrigation": "1/4 N",
            "ridge_making": "1/4 N",
            "seed_formation": "1/4 N",
            "note": "Divide total fertilizer into 4 equal parts across the season",
        },

        "micronutrients": {
            "boron_kg_acre": 3,
            "zinc_sulphate_kg_acre": 5,
            "note": ("Apply Boron and Zinc Sulphate at sowing. Boron deficiency-to-toxicity range "
                     "is narrow — do not exceed dose, require confirmation before repeat application."),
        },

        "general_notes": [
            "Divide all fertilizer into 4 equal parts for 4 applications",
            "Apply Boron 3 kg/acre + Zinc Sulphate 5 kg/acre at sowing",
            "If previous wheat was fully fertilized and soil P > 10 mg/kg, reduce P2O5 for cotton",
            "Boron deficiency vs toxicity range is very narrow — follow dose strictly",
            "Apply K2O and other micronutrients based on soil analysis",
        ],
    },

    # -------------------------------------------------------------------
    # SUGARCANE — kg/acre as originally transcribed; NOT yet
    # cross-checked against a clear brochure photo. Ratoon multiplier is
    # internally inconsistent enough in the source material that it is
    # gated behind an explicit "unverified" flag rather than applied
    # silently — see fertilizer_recommendation_service.
    # -------------------------------------------------------------------
    "Sugarcane": {
        "source": "SFRI Punjab Sugarcane Brochure",
        "kg_acre_confidence": "unverified",
        "crop_type": "Kharif",
        "sowing_months": ["February", "March"],
        "harvest_months": ["November", "December", "January"],
        "cycle_months": 12,

        "new_planting": {
            "weak":    {"N_kg_acre": 120, "P2O5_kg_acre": 69, "K2O_kg_acre": 50},
            "medium":  {"N_kg_acre": 92,  "P2O5_kg_acre": 46, "K2O_kg_acre": 50},
            "fertile": {"N_kg_acre": 69,  "P2O5_kg_acre": 23, "K2O_kg_acre": 25},
        },

        "ratoon_crop": {
            "note": "Ratoon crop requires 30% MORE fertilizer than new planting (unverified, confirm before use)",
            "multiplier": 1.30,
            "timing": {"sprouting": "50% N + All P2O5 + All K2O",
                       "two_months": "Remaining 50% N"},
        },

        "timing": {
            "planting": "All P2O5 + All K2O + 1/3 N (in furrows below seed sets)",
            "april": "1/3 N",
            "may": "1/3 N",
            "note": "Avoid fertilizer contact with seed sets at planting",
        },

        "organic": {
            "FYM_cart_loads_per_ha": "20-25",
            "timing": "At soil preparation — minimum 1 month before planting",
        },

        "general_notes": [
            "Apply FYM 20-25 cart loads per hectare at soil preparation",
            "Never let fertilizer touch seed sets at planting time",
            "Ratoon crop needs 30% more fertilizer than new planting (unverified)",
            "For ratoon: half N with P2O5 and K2O at sprouting, rest 2 months later",
            "N applied in 3 splits: planting, April, May",
        ],
    },

    # -------------------------------------------------------------------
    # MAIZE — kg/acre reconciled cleanly from the SFRI bag table
    # -------------------------------------------------------------------
    "Maize": {
        "source": "SFRI Punjab Maize Brochure",
        "kg_acre_confidence": "reconciled_calc",
        "crop_type": "Kharif / Spring",
        "sowing_months": ["February", "March", "June", "July"],
        "harvest_months": ["June", "July", "October", "November"],

        "irrigated": {
            "common_varieties":  {"includes": ["Ageti", "Sunehri"],
                                   "N_kg_acre": 91.5, "P2O5_kg_acre": 57.5, "K2O_kg_acre": 37.5},
            "high_yield_hybrid": {"includes": ["Jhakkar", "Soan", "Akbar", "Sultan", "Hybrid"],
                                   "N_kg_acre": 126, "P2O5_kg_acre": 57.5, "K2O_kg_acre": 50},
        },
        "rainfed": {
            "low_rainfall":  {"N_kg_acre": 32, "P2O5_kg_acre": 23,   "K2O_kg_acre": 12.5},
            "high_rainfall": {"N_kg_acre": 48, "P2O5_kg_acre": 34.5, "K2O_kg_acre": 25},
        },

        "default_type": "irrigated",
        "default_variety": "common_varieties",

        "varieties": {
            "early": ["Ageti", "Sunehri"],
            "mid":   ["Jhakkar", "Soan"],
            "late":  ["Akbar", "Sultan"],
        },

        "timing": {
            "sowing": "All P2O5 + All K2O + 1/3 N",
            "knee_high": "1/3 N",
            "tasseling": "1/3 N",
            "note": "Apply fertilizer in evening, irrigate immediately after N application",
        },

        "general_notes": [
            "Zinc deficiency common — monitor for yellowing of leaves before dosing, don't auto-apply",
            "Skip irrigation if rainfall occurs within schedule",
            "Water stress at flowering/pollination causes ~40% yield loss — never skip irrigation at this stage",
            "Plant on ridges in irrigated areas for better water management",
            "Apply fertilizer in evening for best results",
            "Irrigate immediately after nitrogen application",
        ],
    },

    # -------------------------------------------------------------------
    # CHICKPEA — kg/acre reconciled cleanly from the SFRI bag
    # recommendation. Single recommendation, no fertility tiers.
    # -------------------------------------------------------------------
    "Chickpea": {
        "source": "SFRI Punjab Chickpea Brochure",
        "kg_acre_confidence": "reconciled_calc",
        "crop_type": "Rabi",
        "sowing_months": ["October", "November"],
        "harvest_months": ["March", "April"],

        "recommendation": {
            "note": ("SFRI gives a single unified recommendation for chickpea. Chickpea is a legume "
                     "that fixes its own nitrogen from air. Too fertile land causes excess leaf growth "
                     "and reduces yield — medium fertility land is optimal."),
            "N_kg_acre": 11.5, "P2O5_kg_acre": 34.5, "K2O_kg_acre": 0,
            "timing": {"pre_sowing": ("Apply all fertilizer before last plough at sowing time. "
                                       "If missed: apply DAP at last irrigation. "
                                       "Mix Potassium Sulphate with seed if K2O needed.")},
        },

        "nitrogen_credit_as_previous_crop": {
            "credit_kg_acre": 20,
            "note": ("After chickpea harvest, next crop benefits from 20 kg/acre nitrogen credit "
                     "due to biological N fixation."),
        },

        "general_notes": [
            "Chickpea fixes its own nitrogen — do NOT over apply N",
            "Phosphorus significantly increases yield and early maturity",
            "Medium fertility land is BEST — avoid very fertile land",
            "After chickpea harvest next crop gets 20 kg/acre N credit",
            "Crop rotation with chickpea improves weed and pest control",
        ],
    },
}


SUPPORTED_CROPS = list(SFRI_DATA.keys())
# ["Wheat", "Rice", "Cotton", "Sugarcane", "Maize", "Chickpea"]

UNSUPPORTED_CROP_MESSAGE = (
    "Fertilizer recommendation is not yet available for this crop. "
    "Supported crops: Wheat, Rice, Cotton, Sugarcane, Maize, Chickpea. "
    "Contact your nearest SFRI lab or agriculture extension officer for guidance. "
    "SFRI Faisalabad: sfri.punjab.gov.pk"
)


def infer_irrigation_regime(district: str | None) -> tuple[str, str | None]:
    """
    Infer a default irrigation regime from district alone, using the
    rainfed-district groupings recorded under Wheat's rainfed tiers (the
    only crop entry that documents this breakdown). This is a property of
    the district's climate, not a wheat-specific rule, so it's reused as
    the default for any crop — documented here since the source table
    happens to live under Wheat.

    Returns ("rainfed", "low_rainfall"|"medium_rainfall"|"high_rainfall")
    if district matches one of those area lists, else ("irrigated", None).
    """
    if not district:
        return "irrigated", None

    rainfed_tiers = SFRI_DATA["Wheat"]["rainfed"]
    for rainfall_class, tier in rainfed_tiers.items():
        if district in tier["areas"]:
            return "rainfed", rainfall_class
    return "irrigated", None
