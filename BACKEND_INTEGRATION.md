# Backend Integration — Real Disease Detection Model

This is the checklist to swap the demo classifier for the fine-tuned
EfficientNet model, following the `InferenceProvider` seam already in the repo
(`app/services/scanner/inference_provider.py`). Nothing in `routes_scans.py` or
`scan_service.py` changes.

The training notebook produces two artifacts:

| Artifact | What it is |
|---|---|
| `disease_model.onnx` | The fine-tuned EfficientNet, exported to ONNX (opset 17) |
| `class_metadata.json` | Class order + preprocessing config + per-class `latin_name` and `mitigations` |

---

## 1. Add the ONNX runtime dependency

The training side (torch/timm) stays in its own environment. The **backend only
needs `onnxruntime`** for inference. Add this to `backend/requirements.txt`,
matching the existing pinned style:

```
# --- ML inference ---
onnxruntime==1.19.2
pillow==10.4.0        # only if not already pinned
numpy==1.26.4         # only if not already pinned
```

`onnxruntime==1.19.2` is the current stable with cp312 wheels, so it installs
cleanly under your `python:3.12-slim` image via the existing
`pip install --no-cache-dir -r requirements.txt`. Check whether `pillow` /
`numpy` are already present before adding them.

## 2. Drop in the model files

```
app/services/scanner/
├── inference_provider.py        # existing
├── onnx_inference_provider.py   # NEW — provided
└── model/                       # NEW
    ├── disease_model.onnx
    └── class_metadata.json
```

If your image is size-sensitive, the `.onnx` (~50–80 MB) can instead live in
object storage and be fetched on container start — but bundling it in the image
is simplest and keeps cold starts deterministic.

## 3. Register the provider

In `get_inference_provider()`, add the branch:

```python
def get_inference_provider() -> InferenceProvider:
    provider = settings.INFERENCE_PROVIDER
    if provider == "demo":
        return DemoInferenceProvider()
    if provider == "onnx":
        from app.services.scanner.onnx_inference_provider import get_onnx_provider
        return get_onnx_provider()          # cached singleton
    raise NotImplementedError(f"Unknown INFERENCE_PROVIDER: {provider!r}")
```

The import is inside the branch so the demo path never imports `onnxruntime`.

## 4. Flip the env var

In `backend/.env`:

```
INFERENCE_PROVIDER=onnx
```

That's it. `create_scan()` now runs the real model, and every result comes back
with `demo_mode=false`.

---

## What the model returns vs. what the backend expects

The provider fills the existing `InferenceResult` contract exactly — no schema
or migration change:

| Field | Source |
|---|---|
| `disease` | `class_metadata.json` → matched class `disease` |
| `latin_name` | `class_metadata.json` → `latin_name` (null for healthy / uncertain) |
| `confidence_pct` | top-1 softmax probability × 100 |
| `breakdown` | top-3 classes + an `"Other / unknown"` bucket for the remaining mass |
| `mitigations` | `class_metadata.json` → per-class list |
| `demo_mode` | always `false` |

### Low-confidence handling
If top-1 confidence is below `unknown_threshold` (default **0.40**, set in
`class_metadata.json`), the provider returns a safe "Uncertain — retake / consult
expert" result instead of guessing. Tune the threshold in the JSON without
touching code.

---

## What YOU need to own: `class_metadata.json`

This file is the human-curated part of the system. The model only outputs a
class index + probabilities; everything a farmer reads comes from here. The
notebook ships a **complete scaffold** — all 38 classes filled with correct
pathogen latin names and practical mitigations — but two things need your review:

1. **Mitigations chemistry is deliberately generic.** Each entry names a *class*
   of action (e.g. "a labelled protectant fungicide") rather than a specific
   product, dose, or pre-harvest interval, because those are region- and
   crop-specific. **Have your agronomist localise these for Pakistan** (product
   names, rates, PHI, resistance rotation) before surfacing them to farmers.

2. **Latin names are pathogen/pest binomials**, matching the demo's
   `Puccinia triticina` style. Healthy classes have `latin_name: null`.

### Structure

```json
{
  "schema_version": 1,
  "model_family": "b3",
  "num_classes": 38,
  "unknown_threshold": 0.40,
  "breakdown_top_n": 3,
  "preprocess": {
    "input_size": 300,
    "mean": [0.5, 0.5, 0.5],
    "std":  [0.5, 0.5, 0.5],
    "interpolation": "bicubic",
    "crop_pct": 1.0
  },
  "classes": [
    {
      "index": 0,
      "folder": "Apple___Apple_scab",
      "crop": "Apple",
      "disease": "Apple Scab",
      "label": "Apple scab",
      "latin_name": "Venturia inaequalis",
      "mitigations": [
        "Remove and destroy infected Apple leaves/debris ...",
        "Apply a labelled protectant fungicide ...",
        "Rake and destroy fallen leaves in autumn ..."
      ]
    }
  ]
}
```

Field notes:
- `index` / `folder` — **do not edit.** These pin the label order to the trained
  model. The notebook regenerates them from the model's own `class_to_idx`, so
  they always match the weights. Editing them silently mislabels predictions.
- `disease` — goes into the `Scan.disease` column and the ledger title.
- `label` — short form used in the `breakdown` rows.
- `latin_name` — nullable; goes into `Scan.latin_name`.
- `mitigations` — becomes the `mitigations` array; edit freely, keep it a list of
  short strings.
- `preprocess` — **do not edit.** Written from the training data config so server
  preprocessing matches training. A mismatch here silently tanks accuracy.

---

## Sanity check before shipping

The notebook's final cell prints an `InferenceResult`-shaped dict from the ONNX
file alone (no torch). Confirm it matches this contract before wiring the
backend. After deploy, upload a known leaf image to `POST /api/v1/scans` and
verify `demo_mode` is now `false` and the disease/mitigations look right.
