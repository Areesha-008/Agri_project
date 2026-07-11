"""
ONNX-backed InferenceProvider for the Disease Scanner.

Drop-in replacement for DemoInferenceProvider. Depends only on
onnxruntime + Pillow + numpy (no torch/tensorflow on the server).

Wire-up (see BACKEND_INTEGRATION.md):
  1. Place these files under app/services/scanner/model/:
        disease_model.onnx
        class_metadata.json
  2. Add this class import + branch in get_inference_provider().
  3. Set INFERENCE_PROVIDER=onnx in .env.

The metadata file is the single source of truth for class order,
preprocessing (mean/std/size), the low-confidence threshold, and the
per-class latin_name + mitigations. Retraining regenerates it; the code
below does not hardcode any of it.
"""
from __future__ import annotations

import io
import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from app.services.scanner.inference_provider import (
    InferenceProvider,
    InferenceResult,
    ScanBreakdownItem,
)

_MODEL_DIR = Path(__file__).parent / "model"
_ONNX_PATH = _MODEL_DIR / "disease_model.onnx"
_META_PATH = _MODEL_DIR / "class_metadata.json"


class OnnxInferenceProvider(InferenceProvider):
    """Real classifier backed by an exported EfficientNet ONNX model."""

    def __init__(self, onnx_path: Path = _ONNX_PATH, meta_path: Path = _META_PATH):
        if not onnx_path.exists():
            raise FileNotFoundError(f"ONNX model not found at {onnx_path}")
        if not meta_path.exists():
            raise FileNotFoundError(f"class_metadata.json not found at {meta_path}")

        with open(meta_path, "r", encoding="utf-8") as f:
            self.meta = json.load(f)

        pp = self.meta["preprocess"]
        self._size = int(pp["input_size"])
        self._mean = np.asarray(pp["mean"], dtype=np.float32)
        self._std = np.asarray(pp["std"], dtype=np.float32)
        self._classes = sorted(self.meta["classes"], key=lambda c: c["index"])
        self._top_n = int(self.meta.get("breakdown_top_n", 3))
        self._unknown_threshold = float(self.meta.get("unknown_threshold", 0.40))

        # Single session reused across requests. onnxruntime sessions are
        # thread-safe for .run(), so this is safe under FastAPI's threadpool.
        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.getenv("ONNX_INTRA_OP_THREADS", "0")) or 0
        self._session = ort.InferenceSession(
            str(onnx_path), sess_options=so, providers=["CPUExecutionProvider"]
        )
        self._input_name = self._session.get_inputs()[0].name

    # ------------------------------------------------------------------ helpers
    def _preprocess(self, image_bytes: bytes) -> np.ndarray:
        """Bytes -> normalized NCHW float32 tensor. Mirrors training exactly."""
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((self._size, self._size), Image.BICUBIC)
        arr = np.asarray(img, dtype=np.float32) / 255.0
        arr = (arr - self._mean) / self._std
        return arr.transpose(2, 0, 1)[None].astype(np.float32)  # (1,3,H,W)

    @staticmethod
    def _softmax(z: np.ndarray) -> np.ndarray:
        e = np.exp(z - z.max())
        return e / e.sum()

    def _breakdown(self, probs: np.ndarray) -> list[ScanBreakdownItem]:
        order = probs.argsort()[::-1][: self._top_n]
        rows = [
            ScanBreakdownItem(
                label=self._classes[i]["label"], pct=round(float(probs[i]) * 100, 1)
            )
            for i in order
        ]
        other = max(0.0, 100.0 - sum(r.pct for r in rows))
        rows.append(ScanBreakdownItem(label="Other / unknown", pct=round(other, 1)))
        return rows

    # ------------------------------------------------------------------ public
    def classify(self, image_bytes: bytes) -> InferenceResult:
        tensor = self._preprocess(image_bytes)
        logits = self._session.run(None, {self._input_name: tensor})[0][0]
        probs = self._softmax(logits)
        top = int(probs.argmax())
        confidence = float(probs[top])
        breakdown = self._breakdown(probs)

        if confidence < self._unknown_threshold:
            return InferenceResult(
                disease="Uncertain — please retake the photo or consult an expert",
                latin_name=None,
                confidence_pct=round(confidence * 100, 1),
                breakdown=breakdown,
                mitigations=[
                    "Confidence is low. Retake a sharp, well-lit close-up of a single affected leaf against a plain background.",
                    "If the result stays uncertain, share the photo with your local agronomist for a manual diagnosis.",
                ],
                demo_mode=False,
            )

        cls = self._classes[top]
        return InferenceResult(
            disease=cls["disease"],
            latin_name=cls["latin_name"],
            confidence_pct=round(confidence * 100, 1),
            breakdown=breakdown,
            mitigations=list(cls["mitigations"]),
            demo_mode=False,
        )


@lru_cache(maxsize=1)
def get_onnx_provider() -> OnnxInferenceProvider:
    """Cached singleton so the ONNX session loads once per process."""
    return OnnxInferenceProvider()
