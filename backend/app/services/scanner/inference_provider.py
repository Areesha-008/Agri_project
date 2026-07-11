"""
InferenceProvider — see GAPS.md Gap 5.

No trained disease-detection model exists in this repo. Options presented
to the user were: (a) wait for the lab's model, (b) a hosted vision API as
a stopgap, (c) a clearly-fake demo classifier. Chose (c) so the rest of the
scanner (upload, persistence, ledger logging) can be built and demoed now;
swapping in a real model later means adding a new class here and flipping
settings.INFERENCE_PROVIDER, not touching routes_scans.py or scan_service.py.

DemoInferenceProvider is deterministic per image hash (same photo always
classifies the same way) and returns entries drawn verbatim from the
design's sample data (design_handoff/designs/Jadeed Kashtkar App.dc.html,
~line 477, 492-494, 958-961 for the rust case; the ledger sample entry
"Leaf scan — healthy · 96% confidence" for the healthy case). Every
response is marked `demo_mode=True` so the frontend can badge it clearly.
"""

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.core.config import settings


@dataclass
class ScanBreakdownItem:
    label: str
    pct: float


@dataclass
class InferenceResult:
    disease: str
    latin_name: str | None
    confidence_pct: float
    breakdown: list[ScanBreakdownItem]
    mitigations: list[str]
    demo_mode: bool = field(default=True)


class InferenceProvider(ABC):
    @abstractmethod
    def classify(self, image_bytes: bytes) -> InferenceResult: ...


_RESULT_POOL: list[InferenceResult] = [
    InferenceResult(
        disease="Leaf rust",
        latin_name="Puccinia triticina",
        confidence_pct=94.2,
        breakdown=[
            ScanBreakdownItem("Leaf rust", 94.2),
            ScanBreakdownItem("Septoria blotch", 3.1),
            ScanBreakdownItem("Healthy tissue", 1.8),
            ScanBreakdownItem("Other / unknown", 0.9),
        ],
        mitigations=[
            "Apply propiconazole 250 EC at 200 ml/acre within 48 hours — before the Saturday rain window.",
            "Remove and burn heavily infected tillers from the NW quadrant to slow spore spread.",
            "Next season: switch to rust-resistant variety NARC-2011, matched to your soil zone by our lab.",
        ],
    ),
    InferenceResult(
        disease="Healthy",
        latin_name=None,
        confidence_pct=96.0,
        breakdown=[
            ScanBreakdownItem("Healthy tissue", 96.0),
            ScanBreakdownItem("Leaf rust", 2.1),
            ScanBreakdownItem("Septoria blotch", 1.0),
            ScanBreakdownItem("Other / unknown", 0.9),
        ],
        mitigations=[
            "No treatment needed — continue routine scouting.",
            "Recheck in 7-10 days or after any weather event favoring disease (see Weather tab).",
            "Log this scan to keep a photographic health record for the field.",
        ],
    ),
]


class DemoInferenceProvider(InferenceProvider):
    def classify(self, image_bytes: bytes) -> InferenceResult:
        digest = hashlib.sha256(image_bytes).digest()
        index = digest[0] % len(_RESULT_POOL)
        return _RESULT_POOL[index]


def get_inference_provider() -> InferenceProvider:
    if settings.INFERENCE_PROVIDER == "demo":
        return DemoInferenceProvider()
    if settings.INFERENCE_PROVIDER == "onnx":
        from app.services.scanner.onnx_inference_provider import get_onnx_provider
        return get_onnx_provider()          # cached singleton — loads the ONNX session once
    raise NotImplementedError(
        f"No InferenceProvider implementation for INFERENCE_PROVIDER={settings.INFERENCE_PROVIDER!r} "
        "yet — see GAPS.md Gap 5."
    )
