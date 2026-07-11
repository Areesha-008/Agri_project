# Crop Disease Detection — Backend Setup

The Disease Scanner lets a farmer upload a leaf photo and get back a
diagnosis: disease name, confidence, a classification breakdown, and
recommended mitigations. This document describes how that's wired up on
the backend today.

## Status: demo classifier, real pipeline otherwise

There is no trained disease-detection model in this repo yet (see
`GAPS.md` Gap 5). Everything **around** the model — upload handling,
validation, persistence, image storage, ledger integration — is real and
production-shaped. Only the classification step itself is a stand-in,
isolated behind one interface so swapping in a real model later is a
new class, not a rewrite.

## Architecture

```
POST /api/v1/scans (multipart image)
        │
        ▼
routes_scans.py ──▶ scan_service.create_scan()
                          │
                          ├─ validate content-type + size
                          ├─ InferenceProvider.classify(image_bytes)
                          ├─ save image to disk, build public URL
                          └─ persist Scan row
```

### `InferenceProvider` — `app/services/scanner/inference_provider.py`

```python
class InferenceProvider(ABC):
    @abstractmethod
    def classify(self, image_bytes: bytes) -> InferenceResult: ...
```

- `InferenceResult` carries `disease`, `latin_name`, `confidence_pct`, a
  `breakdown` (list of `{label, pct}`), a list of `mitigations`, and a
  `demo_mode` flag.
- `DemoInferenceProvider` is the only implementation right now. It's
  **deterministic per image** — it SHA-256-hashes the uploaded bytes and
  picks from a fixed 2-entry result pool (a "Leaf rust" result and a
  "Healthy" result, both taken verbatim from the original design mockup's
  sample data), so the same photo always classifies the same way across
  repeated uploads.
- Every result returned by the demo provider sets `demo_mode: true` so
  the frontend can badge it clearly as non-production output.
- `get_inference_provider()` reads `settings.INFERENCE_PROVIDER` (env var
  `INFERENCE_PROVIDER`, default `"demo"`) and returns the matching
  implementation. Any other value currently raises `NotImplementedError`
  — there's nowhere else to route to yet.

**To wire in a real model:** add a new `InferenceProvider` subclass (e.g.
a local model, a hosted vision API, or a call out to the lab's
genome-backed classifier), branch on it in `get_inference_provider()`,
and point `INFERENCE_PROVIDER` at it. `routes_scans.py` and
`scan_service.py` don't need to change.

### `scan_service.py` — orchestration

`create_scan(db, user_id, filename, content_type, image_bytes)`:

1. Rejects anything outside `image/jpeg`, `image/png`, `image/webp`
   (`InvalidImageError`, 422).
2. Rejects uploads over 10 MB (`InvalidImageError`, 422).
3. Runs the configured `InferenceProvider`.
4. Writes the image to disk under `settings.SCAN_IMAGES_DIR`
   (default `static/scan_images/`) with a random UUID filename —
   the original filename is discarded except for its extension.
5. Builds a public `image_url` as
   `{APP_BASE_URL}/{SCAN_IMAGES_DIR}/{filename}` — served by the
   `StaticFiles` mount at `/static` in `app/main.py`.
6. Persists a `Scan` row with the classification result and image URL.

`log_scan_to_ledger(db, user_id, scan_id, field_id)` attaches a scan to a
field after the fact by creating a `LedgerEntry` (category `Scan`) — the
scanner itself is field-agnostic at capture time, matching the original
design's standalone scan-then-attach flow.

### Data model — `app/models/scan.py`

Table `scans`, one row per upload:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users.id`, `ON DELETE CASCADE` | |
| `image_url` | String | public URL to the stored photo |
| `disease` | String | e.g. `"Leaf rust"`, `"Healthy"` |
| `latin_name` | String, nullable | e.g. `"Puccinia triticina"` |
| `confidence_pct` | Float | |
| `breakdown` | JSON | list of `{label, pct}` |
| `mitigations` | `ARRAY(String)` | recommended actions |
| `demo_mode` | Boolean | `true` while no real model is wired up |
| `created_at` | timestamptz | |

Migration: `alembic/versions/2026_07_10_0918-3aa6c82dd67c_add_scans_table.py`.

Scans are **not** linked to a field until explicitly logged to the
ledger — there's no `field_id` on `Scan` itself.

## API

All endpoints require a Bearer JWT (`get_current_user`) and are scoped
to the caller — see `app/api/v1/routes_scans.py`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/scans` | Upload a leaf photo (`multipart/form-data`, field name `image`). Runs inference, persists, returns the `Scan`. |
| `GET` | `/api/v1/scans` | List the caller's scans, most recent first. |
| `POST` | `/api/v1/scans/{scan_id}/log-to-ledger` | Body `{"field_id": "<uuid>"}`. Creates a `LedgerEntry` (category `Scan`) for that field, titled `"Leaf scan — {disease}"` with the confidence in the detail line. |

Response shape (`ScanResponse`, `app/schemas/scan.py`):

```json
{
  "id": "uuid",
  "image_url": "http://localhost:8000/static/scan_images/<uuid>.jpg",
  "disease": "Leaf rust",
  "latin_name": "Puccinia triticina",
  "confidence_pct": 94.2,
  "breakdown": [
    { "label": "Leaf rust", "pct": 94.2 },
    { "label": "Septoria blotch", "pct": 3.1 },
    { "label": "Healthy tissue", "pct": 1.8 },
    { "label": "Other / unknown", "pct": 0.9 }
  ],
  "mitigations": [
    "Apply propiconazole 250 EC at 200 ml/acre within 48 hours — before the Saturday rain window.",
    "Remove and burn heavily infected tillers from the NW quadrant to slow spore spread.",
    "Next season: switch to rust-resistant variety NARC-2011, matched to your soil zone by our lab."
  ],
  "demo_mode": true,
  "created_at": "2026-07-10T09:20:00Z"
}
```

## Configuration

Set in `backend/.env` (see `.env.example`):

| Var | Default | Purpose |
|---|---|---|
| `INFERENCE_PROVIDER` | `demo` | Which `InferenceProvider` to instantiate. |
| `SCAN_IMAGES_DIR` | `static/scan_images` | Where uploaded photos are written; served at `/static/scan_images/...`. |
| `APP_BASE_URL` | `http://localhost:8000` | Used to build the absolute `image_url` returned to the frontend. |

## Known limitations

- No real disease-detection model — see `GAPS.md` Gap 5 for the full
  resolution note and options considered.
- Uploaded images are stored unencrypted on local disk under
  `SCAN_IMAGES_DIR`; nothing purges old scan photos.
- 10 MB upload cap and a 3-type allowlist (JPEG/PNG/WebP) are enforced
  in `scan_service.py`, not at a reverse-proxy layer.
