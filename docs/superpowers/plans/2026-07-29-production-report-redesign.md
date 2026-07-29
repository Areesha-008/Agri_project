# Digital Ledger Production Report Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Digital Ledger's whole-farm production report with a field-specific report showing one field's identity, live agronomic numbers, its chronological transaction log, and its own financial summary — in both the downloaded PDF and the in-app preview modal.

**Architecture:** `build_report(db, user_id, field_id)` (`backend/app/services/ledger_service.py`) is rescoped from a farm-wide aggregate to a single field, backed by a redefined `ReportResponse` (`backend/app/schemas/ledger.py`) carrying a chronological `transactions: list[TransactionItem]`. `GET /report` and `GET /report/pdf` take `field_id` as a required query param. `report_pdf.py`'s WeasyPrint template and the ledger page's preview modal (`frontend/src/app/(app)/ledger/page.tsx`) are both rebuilt to the same field-specific layout, fed by a new field `<select>` on the report builder card. No database schema or model changes — this is response-shape and rendering only.

**Tech Stack:** FastAPI / Pydantic / SQLAlchemy / WeasyPrint (existing, backend); Next.js 16 / React 19 / React Query / Tailwind v4 (existing, frontend). No new dependencies.

## Global Constraints

- No DB schema or model changes — `LedgerEntry`, `Field`, `NdviHistory` are used as-is; only the `ReportResponse` Pydantic shape and rendering change.
- No new dependencies, backend or frontend.
- `field_id` is a **required** query parameter on both `GET /report` and `GET /report/pdf` — there is no all-fields aggregate mode anymore.
- Formatting: area rounds to 1 decimal place, NDVI to 2 decimal places, transaction/report dates format as `%d %b %Y`, PKR amounts keep thousands separators (`:,.0f`) — per the approved design (`docs/superpowers/specs/2026-07-29-production-report-redesign-design.md` and the approved mockup at https://claude.ai/code/artifact/bfe5b137-73dc-4c56-8f2f-41cd7e8e314e).
- This repo has **no backend DB-test fixture**. DB-touching tests hit the real configured database directly via `SessionLocal`, creating and tearing down their own throwaway rows in a `try/finally` — the exact pattern already used by `backend/tests/test_ndvi_history_upsert.py`. Requires local Postgres running (`psql "postgresql://musarashid@localhost:5432/jadeed_kashtkar_db"` per project notes).
- This repo has **no backend route-level test suite** (no `TestClient` usage anywhere in `backend/tests/`) — route wiring is verified by an import sanity check plus the final manual/e2e pass, not a dedicated route test.
- This repo has **no frontend unit-test framework** (no jest/vitest — confirmed via `frontend/package.json`, whose only `test:e2e` script is Playwright). Frontend verification is `npx tsc --noEmit` + `npm run lint` + a Playwright e2e spec + a manual browser check, matching the convention already used in `docs/superpowers/plans/2026-07-29-crop-health-trend-chart.md`.
- `npm`/`npx` are not on PATH in this shell (Anaconda shadows them) — prefix every frontend command with `export PATH="/usr/local/bin:$PATH"` and run from `frontend/`.
- `npm run lint` runs plain `eslint` (flat config) — never `next lint`, it doesn't exist in this Next.js version and parses `lint` as a directory.
- Backend tests run via `backend/.venv/bin/pytest` (the project's own virtualenv, not a bare `pytest`).

---

### Task 1: Backend schema — field-scoped `ReportResponse` + `TransactionItem`

**Files:**
- Modify: `backend/app/schemas/ledger.py`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 2, 3, 4):
  - `class TransactionItem(BaseModel)` — fields `id: uuid.UUID`, `timestamp: datetime`, `category: str`, `title: str`, `detail: str`, `amount: Optional[float]`, `entry_type: str`. `id` mirrors the underlying `LedgerEntry.id` — it exists purely so the frontend has a stable React key for the transactions list (Task 6), not because the PDF/modal display it.
  - `class ReportResponse(BaseModel)` — fields `field_name: str`, `crop: Optional[str]`, `area_hectares: Optional[float]`, `ndvi_mean: Optional[float]`, `health_score: Optional[int]`, `transactions: list[TransactionItem]`, `total_spent: float`, `total_earned: float`, `net: float`, `generated_at: datetime`.
  - `FieldReportSummary` is **removed** — no longer used anywhere after this task.

- [ ] **Step 1: Replace `FieldReportSummary`/`ReportResponse` in `backend/app/schemas/ledger.py`**

Delete this block (the current end of the file):

```python
class FieldReportSummary(BaseModel):
    name: str
    crop: Optional[str]
    area_hectares: Optional[float]
    ndvi_mean: Optional[float]
    health_score: Optional[int]


class ReportResponse(BaseModel):
    total_hectares: float
    field_count: int
    avg_health_score: int
    ledger_entry_count: int
    total_spent: float
    total_earned: float
    net: float
    field_summaries: list[FieldReportSummary]
    generated_at: datetime
```

Replace it with:

```python
class TransactionItem(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    category: str
    title: str
    detail: str
    amount: Optional[float]
    entry_type: str


class ReportResponse(BaseModel):
    field_name: str
    crop: Optional[str]
    area_hectares: Optional[float]
    ndvi_mean: Optional[float]
    health_score: Optional[int]
    transactions: list[TransactionItem]
    total_spent: float
    total_earned: float
    net: float
    generated_at: datetime
```

- [ ] **Step 2: Import sanity check**

```bash
cd backend
.venv/bin/python -c "from app.schemas.ledger import ReportResponse, TransactionItem; print('ok')"
```

Expected: prints `ok` with no traceback. (No dedicated test for this step — it's a declarative type change with no branching logic; Task 2's tests exercise it for real.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/ledger.py
git commit -m "Redefine ReportResponse around a single field with a transactions list"
```

---

### Task 2: Backend service — field-scoped `build_report`

**Files:**
- Modify: `backend/app/services/ledger_service.py`
- Create: `backend/tests/test_ledger_service.py` (currently deleted per git status — this recreates it for the new signature; the old file only tested a now-removed fertilizer helper)

**Interfaces:**
- Consumes: `TransactionItem`, `ReportResponse` (Task 1, `app.schemas.ledger`); `get_field_or_404(db, user_id, field_id) -> Field` (`app.services.field_service`, existing); `get_crop_health(db, user_id, field_id) -> CropHealthResponse` (`app.services.crop_health_service`, existing, `.health_score: int`); `FieldNotFoundError` (`app.exceptions.custom_exceptions`, existing).
- Produces (used by Task 3): `build_report(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> ReportResponse`, raising `FieldNotFoundError` if the field doesn't exist or isn't owned by `user_id`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_ledger_service.py`:

```python
"""
build_report is DB-backed (field lookup, ledger entries, crop health), so
these hit the real configured database directly — same approach as
test_ndvi_history_upsert.py, since there's no DB-test fixture in this repo
yet. Creates and tears down its own throwaway user+field(s).
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Polygon

from app.db.session import SessionLocal
from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import LedgerEntry
from app.models.user import User
from app.services.ledger_service import build_report

_POLYGON = Polygon([(73.0, 31.0), (73.001, 31.0), (73.001, 31.001), (73.0, 31.001), (73.0, 31.0)])


def _make_user(db) -> User:
    user = User(email=f"report-test-{uuid.uuid4().hex}@example.invalid", hashed_password="x")
    db.add(user)
    db.flush()
    return user


def _make_field(db, user: User) -> Field:
    field = Field(
        user_id=user.id,
        name="report-test-field",
        geometry=from_shape(_POLYGON, srid=4326),
        area_hectares=12.5,
        crop="Wheat",
    )
    db.add(field)
    db.flush()
    return field


def test_build_report_orders_transactions_chronologically_and_totals_money():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        now = datetime.now(timezone.utc)
        # Inserted newest-first, on purpose, so the assertion actually proves
        # build_report sorts rather than happening to preserve insertion order.
        db.add(LedgerEntry(
            field_id=field.id, title="Wheat — sold", detail="40 maund",
            category="Sale", amount=96000, entry_type="income", timestamp=now,
        ))
        db.add(LedgerEntry(
            field_id=field.id, title="Fertilizer logged", detail="2 bags urea/acre",
            category="Fertilizer", amount=4500, entry_type="expense",
            timestamp=now - timedelta(days=10),
        ))
        db.commit()

        report = build_report(db, user.id, field.id)

        assert [t.title for t in report.transactions] == ["Fertilizer logged", "Wheat — sold"]
        assert report.total_spent == 4500.0
        assert report.total_earned == 96000.0
        assert report.net == 91500.0
        assert report.field_name == "report-test-field"
        assert report.crop == "Wheat"
        assert report.area_hectares == 12.5
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_empty_field_has_no_transactions_and_zero_totals():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        field = _make_field(db, user)
        db.commit()

        report = build_report(db, user.id, field.id)

        assert report.transactions == []
        assert report.total_spent == 0.0
        assert report.total_earned == 0.0
        assert report.net == 0.0
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_raises_for_unknown_field():
    db = SessionLocal()
    user = None
    try:
        user = _make_user(db)
        db.commit()

        with pytest.raises(FieldNotFoundError):
            build_report(db, user.id, uuid.uuid4())
    finally:
        if user is not None:
            db.query(User).filter(User.id == user.id).delete()
            db.commit()
        db.close()


def test_build_report_raises_for_field_owned_by_another_user():
    db = SessionLocal()
    owner = None
    other = None
    try:
        owner = _make_user(db)
        other = _make_user(db)
        field = _make_field(db, owner)
        db.commit()

        with pytest.raises(FieldNotFoundError):
            build_report(db, other.id, field.id)
    finally:
        if owner is not None:
            db.query(User).filter(User.id == owner.id).delete()
        if other is not None:
            db.query(User).filter(User.id == other.id).delete()
        db.commit()
        db.close()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
.venv/bin/pytest tests/test_ledger_service.py -v
```

Expected: FAIL — `build_report()` currently takes `(db, user_id)`, not `(db, user_id, field_id)` (`TypeError: build_report() takes 2 positional arguments but 3 were given` or similar), and the old `build_report` doesn't return a `field_name`/`transactions` shape.

- [ ] **Step 3: Rewrite `build_report` in `backend/app/services/ledger_service.py`**

Replace the imports at the top of the file:

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import (
    BUILTIN_LEDGER_CATEGORIES,
    LedgerCategoryRow,
    LedgerEntry,
)
from app.models.ndvi_history import NdviHistory
from app.schemas.ledger import FieldReportSummary, LedgerEntryCreateRequest, ReportResponse
from app.services.crop_health_service import get_crop_health
```

with:

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.field import Field
from app.models.ledger_entry import (
    BUILTIN_LEDGER_CATEGORIES,
    LedgerCategoryRow,
    LedgerEntry,
)
from app.models.ndvi_history import NdviHistory
from app.schemas.ledger import LedgerEntryCreateRequest, ReportResponse, TransactionItem
from app.services.crop_health_service import get_crop_health
from app.services.field_service import get_field_or_404
```

(`func` is dropped — the money totals below sum the already-fetched entries in Python instead of a separate grouped SQL query, since one field's entries are already being fetched for the transactions list. `FieldNotFoundError` stays imported — `create_ledger_entry` further up the file still raises it directly.)

Then replace the entire `build_report` function (everything from `def build_report(db: Session, user_id: uuid.UUID) -> ReportResponse:` to the end of the file) with:

```python
def build_report(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> ReportResponse:
    field = get_field_or_404(db, user_id, field_id)

    entries = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.field_id == field_id)
        .order_by(LedgerEntry.timestamp.asc())
        .all()
    )

    total_spent = round(
        sum(float(e.amount) for e in entries if e.amount is not None and e.entry_type == "expense"), 2
    )
    total_earned = round(
        sum(float(e.amount) for e in entries if e.amount is not None and e.entry_type == "income"), 2
    )
    net = round(total_earned - total_spent, 2)

    health = get_crop_health(db, user_id, field_id)
    latest_history = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.desc())
        .first()
    )

    transactions = [
        TransactionItem(
            id=e.id,
            timestamp=e.timestamp,
            category=e.category,
            title=e.title,
            detail=e.detail,
            amount=float(e.amount) if e.amount is not None else None,
            entry_type=e.entry_type,
        )
        for e in entries
    ]

    return ReportResponse(
        field_name=field.name,
        crop=field.crop,
        area_hectares=field.area_hectares,
        ndvi_mean=latest_history.ndvi_mean if latest_history else None,
        health_score=health.health_score,
        transactions=transactions,
        total_spent=total_spent,
        total_earned=total_earned,
        net=net,
        generated_at=datetime.now(timezone.utc),
    )
```

Also update the module docstring at the very top of the file from `"""Digital ledger CRUD + production report aggregation."""` to `"""Digital ledger CRUD + field-scoped production report."""`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
.venv/bin/pytest tests/test_ledger_service.py -v
```

Expected: 4 passed. Requires local Postgres running (see Global Constraints).

- [ ] **Step 5: Run the full backend suite**

```bash
cd backend
.venv/bin/pytest -v
```

Expected: all pass (101+ tests, matching the last known-good count) — confirms nothing else imports the removed `FieldReportSummary` or the old `build_report(db, user_id)` two-arg signature.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ledger_service.py backend/tests/test_ledger_service.py
git commit -m "Scope build_report to a single field with a chronological transaction list"
```

---

### Task 3: Backend routes — `field_id` query param + sliced PDF filename

**Files:**
- Modify: `backend/app/api/v1/routes_ledger.py`

**Interfaces:**
- Consumes: `build_report(db, user_id, field_id)` (Task 2); `render_report_pdf(report, owner_email)` (existing, rewritten in Task 4 but signature unchanged).
- Produces: `GET /report?field_id=<uuid>` → `ReportResponse`; `GET /report/pdf?field_id=<uuid>` → PDF bytes with `Content-Disposition: attachment; filename=production-report-<field-slug>.pdf`.

- [ ] **Step 1: Add `field_id` and the filename slug**

Replace the top of `backend/app/api/v1/routes_ledger.py` (imports) from:

```python
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
```

to:

```python
import re
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
```

Add this helper right after `router = APIRouter(tags=["Ledger & Report"])`:

```python
def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "field"
```

Replace the two report routes at the end of the file:

```python
@router.get("/report", response_model=ReportResponse)
def get_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_report(db, current_user.id)


@router.get("/report/pdf")
def get_report_pdf(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = build_report(db, current_user.id)
    pdf_bytes = render_report_pdf(report, current_user.email)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=production-report.pdf"},
    )
```

with:

```python
@router.get("/report", response_model=ReportResponse)
def get_report(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_report(db, current_user.id, field_id)


@router.get("/report/pdf")
def get_report_pdf(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = build_report(db, current_user.id, field_id)
    pdf_bytes = render_report_pdf(report, current_user.email)
    filename = f"production-report-{_slugify(report.field_name)}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
```

- [ ] **Step 2: Import sanity check**

```bash
cd backend
.venv/bin/python -c "from app.api.v1.routes_ledger import router; print(len(router.routes))"
```

Expected: prints `6` (unchanged route count — only two existing routes' signatures changed) with no traceback. There's no route-level test suite in this repo (see Global Constraints) — real functional verification of these two endpoints happens in Task 7's manual/e2e pass, once the frontend can actually call them.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/routes_ledger.py
git commit -m "Require field_id on /report and /report/pdf; slug the PDF filename"
```

---

### Task 4: Backend PDF renderer — field-specific layout + formatting fixes

**Files:**
- Modify: `backend/app/services/report_pdf.py`
- Create: `backend/tests/test_report_pdf.py`

**Interfaces:**
- Consumes: `ReportResponse`, `TransactionItem` (Task 1, `app.schemas.ledger`).
- Produces: `render_report_pdf(report: ReportResponse, owner_email: str) -> bytes` (signature unchanged, callers in Task 3 need no changes); `_amount_str(tx: TransactionItem) -> str` and `_amount_class(tx: TransactionItem) -> str` (module-private helpers, exercised directly by this task's tests).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_report_pdf.py`:

```python
"""
_amount_str/_amount_class are the money-formatting branches inside the PDF
template (sign, color class, or an em dash for no-amount entries) — pure
functions, no DB or WeasyPrint rendering needed to check them.
"""

import uuid
from datetime import datetime, timezone

from app.schemas.ledger import TransactionItem
from app.services.report_pdf import _amount_class, _amount_str


def _tx(amount, entry_type):
    return TransactionItem(
        id=uuid.uuid4(),
        timestamp=datetime(2026, 6, 15, tzinfo=timezone.utc),
        category="Fertilizer",
        title="t",
        detail="d",
        amount=amount,
        entry_type=entry_type,
    )


def test_amount_str_expense_shows_minus_sign_and_thousands_separator():
    assert _amount_str(_tx(4500, "expense")) == "− PKR 4,500"


def test_amount_str_income_shows_plus_sign():
    assert _amount_str(_tx(96000, "income")) == "+ PKR 96,000"


def test_amount_str_none_shows_em_dash():
    assert _amount_str(_tx(None, "expense")) == "—"


def test_amount_class_expense_is_amt_out():
    assert _amount_class(_tx(4500, "expense")) == "amt-out"


def test_amount_class_income_is_amt_in():
    assert _amount_class(_tx(96000, "income")) == "amt-in"


def test_amount_class_none_is_amt_none():
    assert _amount_class(_tx(None, "expense")) == "amt-none"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
.venv/bin/pytest tests/test_report_pdf.py -v
```

Expected: FAIL with `ImportError: cannot import name '_amount_class' from 'app.services.report_pdf'` (neither helper exists yet).

- [ ] **Step 3: Rewrite `backend/app/services/report_pdf.py`**

Replace the entire file:

```python
"""
Renders the ReportResponse into a PDF for one field, matching the design
spec's field-specific report layout
(docs/superpowers/specs/2026-07-29-production-report-redesign-design.md):
branded header, field identity, 3 stat tiles, transactions table, financial
summary, footnote. Plain string-built HTML (no template engine — the one PDF
in the app) rendered via WeasyPrint. User-controlled strings (field name/crop/
ledger entry text) are html.escape'd before interpolation.
"""

import html
from io import BytesIO

from weasyprint import HTML

from app.schemas.ledger import ReportResponse, TransactionItem

# Mirrors CATEGORY_DOT in frontend/src/app/(app)/ledger/page.tsx value-for-
# value so the report and the ledger Timeline use the same category colors.
# No shared source between the two stacks — keep these two maps in sync by hand.
_CATEGORY_DOT = {
    "Fertilizer": "#40916C",
    "Irrigation": "#4E8DBF",
    "Spray": "#C1512F",
    "Scan": "#B07D2B",
    "Operation": "#8a927f",
    "Sale": "#2D6A4F",
}
_DEFAULT_DOT = "#8a927f"

_STYLE = """
body { font-family: sans-serif; color: #1e2b23; padding: 32px; }
.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
          border-bottom: 2px solid #1B4332; padding-bottom: 14px; margin-bottom: 16px; }
.header .title { font-size: 18px; font-weight: 800; color: #1B4332; }
.header .subtitle { font-size: 11px; color: #8a927f; }
.header .field { text-align: right; font-size: 13px; font-weight: 700; color: #1e2b23; }
.header .field .crop { display: block; font-weight: 500; color: #8a927f; font-size: 11px; margin-top: 2px; }
.stats { display: flex; gap: 8px; text-align: center; margin-bottom: 20px; }
.stats div { flex: 1; background: #F6F4ED; border-radius: 10px; padding: 10px; }
.stats .value { font-size: 20px; font-weight: 800; color: #1B4332; font-variant-numeric: tabular-nums; }
.stats .label { font-size: 10px; color: #8a927f; font-weight: 600; }
h2 { font-size: 12px; font-weight: 800; color: #8a927f; letter-spacing: .06em; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 4px; font-size: 12px; border-bottom: 1px dashed #EAE7DA; }
th { color: #8a927f; font-weight: 700; text-transform: uppercase; font-size: 10px; }
th.num, td.num { text-align: right; }
.cat { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.cat .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
.tx-what { font-weight: 600; }
.tx-detail { color: #8a927f; font-size: 11px; margin-top: 1px; }
.amt-in { color: #1B4332; font-weight: 700; }
.amt-out { color: #B4362A; font-weight: 700; }
.amt-none { color: #9aa290; }
.money { display: flex; gap: 8px; margin-bottom: 20px; }
.money div { flex: 1; background: #F6F4ED; border-radius: 10px; padding: 10px; font-size: 12px; }
.money .amount { font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
.footnote { font-size: 10px; color: #9aa290; border-top: 1px solid #EAE7DA; padding-top: 10px; }
"""


def _amount_str(tx: TransactionItem) -> str:
    if tx.amount is None:
        return "—"
    sign = "+" if tx.entry_type == "income" else "−"
    return f"{sign} PKR {tx.amount:,.0f}"


def _amount_class(tx: TransactionItem) -> str:
    if tx.amount is None:
        return "amt-none"
    return "amt-in" if tx.entry_type == "income" else "amt-out"


def _transaction_row(tx: TransactionItem) -> str:
    dot_color = _CATEGORY_DOT.get(tx.category, _DEFAULT_DOT)
    return (
        "<tr>"
        f"<td>{tx.timestamp.strftime('%d %b %Y')}</td>"
        f"<td><span class='cat'><span class='dot' style='background:{dot_color}'></span>"
        f"{html.escape(tx.category)}</span></td>"
        f"<td><div class='tx-what'>{html.escape(tx.title)}</div>"
        f"<div class='tx-detail'>{html.escape(tx.detail)}</div></td>"
        f"<td class='num {_amount_class(tx)}'>{_amount_str(tx)}</td>"
        "</tr>"
    )


def render_report_pdf(report: ReportResponse, owner_email: str) -> bytes:
    generated_str = report.generated_at.strftime("%d %b %Y")
    area_str = f"{report.area_hectares:.1f}" if report.area_hectares is not None else "—"
    ndvi_str = f"{report.ndvi_mean:.2f}" if report.ndvi_mean is not None else "—"
    health_str = f"{report.health_score}%" if report.health_score is not None else "—"

    tx_rows = "".join(_transaction_row(tx) for tx in report.transactions)

    body = f"""
    <html><head><meta charset="utf-8"><style>{_STYLE}</style></head><body>
      <div class="header">
        <div>
          <div class="title">Production Report</div>
          <div class="subtitle">Jadeed Kashtkar · {html.escape(owner_email)} · {generated_str}</div>
        </div>
        <div class="field">
          {html.escape(report.field_name)}
          <span class="crop">{html.escape(report.crop or "—")}</span>
        </div>
      </div>
      <div class="stats">
        <div><div class="value">{area_str}</div><div class="label">HECTARES</div></div>
        <div><div class="value">{ndvi_str}</div><div class="label">NDVI</div></div>
        <div><div class="value">{health_str}</div><div class="label">HEALTH</div></div>
      </div>
      <h2>TRANSACTIONS</h2>
      <table>
        <tr><th style="width:15%">Date</th><th style="width:18%">Head</th><th>Entry</th>
            <th class="num" style="width:20%">Amount</th></tr>
        {tx_rows or "<tr><td colspan='4'>No transactions yet.</td></tr>"}
      </table>
      <h2>FINANCIAL SUMMARY</h2>
      <div class="money">
        <div>Total spent<div class="amount" style="color:#B4362A">PKR {report.total_spent:,.0f}</div></div>
        <div>Total earned<div class="amount" style="color:#1B4332">PKR {report.total_earned:,.0f}</div></div>
        <div>Net<div class="amount" style="color:{'#1B4332' if report.net >= 0 else '#B4362A'}">PKR {report.net:,.0f}</div></div>
      </div>
      <div class="footnote">
        Data: Sentinel-2 L2A via CDSE/openEO · Ledger entries: {len(report.transactions)}
      </div>
    </body></html>
    """

    buffer = BytesIO()
    HTML(string=body).write_pdf(buffer)
    return buffer.getvalue()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
.venv/bin/pytest tests/test_report_pdf.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Run the full backend suite**

```bash
cd backend
.venv/bin/pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/report_pdf.py backend/tests/test_report_pdf.py
git commit -m "Rebuild the PDF report for one field: identity, transactions table, aligned columns"
```

---

### Task 5: Frontend API layer — types, resources, hooks

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/resources.ts`
- Modify: `frontend/src/lib/api/hooks.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (mirrors the backend shapes from Task 1 by hand, per this file's own header comment: "Hand-typed to mirror backend/app/schemas/*.py exactly").
- Produces (used by Task 6):
  - `export interface Transaction` and redefined `export interface Report` (`@/lib/api/types`).
  - `ledgerApi.report(fieldId: string): Promise<Report>` and `ledgerApi.downloadReportPdf(fieldId: string): Promise<Blob>` (`@/lib/api/resources`).
  - `export function useReport(fieldId: string | undefined)` (`@/lib/api/hooks`).

- [ ] **Step 1: Redefine `Report` in `frontend/src/lib/api/types.ts`**

Replace:

```typescript
export interface FieldReportSummary {
  name: string;
  crop: string | null;
  area_hectares: number | null;
  ndvi_mean: number | null;
  health_score: number | null;
}

export interface Report {
  total_hectares: number;
  field_count: number;
  avg_health_score: number;
  ledger_entry_count: number;
  total_spent: number;
  total_earned: number;
  net: number;
  field_summaries: FieldReportSummary[];
  generated_at: string;
}
```

with:

```typescript
export interface Transaction {
  id: string;
  timestamp: string;
  category: LedgerCategory;
  title: string;
  detail: string;
  amount: number | null;
  entry_type: LedgerEntryType;
}

export interface Report {
  field_name: string;
  crop: string | null;
  area_hectares: number | null;
  ndvi_mean: number | null;
  health_score: number | null;
  transactions: Transaction[];
  total_spent: number;
  total_earned: number;
  net: number;
  generated_at: string;
}
```

- [ ] **Step 2: Add `fieldId` to `ledgerApi.report`/`downloadReportPdf` in `frontend/src/lib/api/resources.ts`**

Replace:

```typescript
  report: () => api.get<Report>("/report"),
  // GET /report/pdf requires the JWT bearer header, so a plain <a href>
  // can't hit it directly — fetch as a blob and let the caller trigger
  // the download from an object URL instead.
  downloadReportPdf: async (): Promise<Blob> => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    const token = getToken();
    const response = await fetch(`${base}/report/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error("Failed to download report");
    return response.blob();
  },
```

with:

```typescript
  report: (fieldId: string) => api.get<Report>(`/report?field_id=${fieldId}`),
  // GET /report/pdf requires the JWT bearer header, so a plain <a href>
  // can't hit it directly — fetch as a blob and let the caller trigger
  // the download from an object URL instead.
  downloadReportPdf: async (fieldId: string): Promise<Blob> => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    const token = getToken();
    const response = await fetch(`${base}/report/pdf?field_id=${fieldId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error("Failed to download report");
    return response.blob();
  },
```

- [ ] **Step 3: Add `fieldId` to `useReport` in `frontend/src/lib/api/hooks.ts`**

Replace:

```typescript
export function useReport() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["report"], queryFn: ledgerApi.report, enabled: isAuthenticated });
}
```

with:

```typescript
export function useReport(fieldId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["report", fieldId],
    queryFn: () => ledgerApi.report(fieldId as string),
    enabled: isAuthenticated && Boolean(fieldId),
  });
}
```

(`useCreateLedgerEntry`'s `onSuccess` already does `queryClient.invalidateQueries({ queryKey: ["report"] })` — React Query matches by key *prefix* by default, so this still invalidates every `["report", fieldId]` entry regardless of which field. No change needed there.)

- [ ] **Step 4: Typecheck and lint**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: both fail at this point — `frontend/src/app/(app)/ledger/page.tsx` still calls `useReport()` with no argument and reads the now-removed `field_summaries`/`total_hectares`/etc. That's expected; Task 6 fixes the only caller. Confirm the errors are *only* in `ledger/page.tsx` (nothing else in the codebase reads `Report`/`Transaction`/`ledgerApi.report`/`useReport`):

```bash
grep -rln "useReport\|ledgerApi.report\|FieldReportSummary\|field_summaries" frontend/src --include="*.ts" --include="*.tsx"
```

Expected: only `frontend/src/app/(app)/ledger/page.tsx` and the files just edited in this task.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/types.ts frontend/src/lib/api/resources.ts frontend/src/lib/api/hooks.ts
git commit -m "Add field_id to the report API layer: types, resources, hook"
```

---

### Task 6: Frontend UI — field selector + redesigned report card and modal

**Files:**
- Modify: `frontend/src/app/(app)/ledger/page.tsx`

**Interfaces:**
- Consumes: `Report`, `Transaction` (Task 5, `@/lib/api/types`); `useReport(fieldId)`, `ledgerApi.downloadReportPdf(fieldId)` (Task 5).
- Produces: nothing further downstream — this is the page-level integration point and the last file in the feature's dependency chain.

- [ ] **Step 1: Add field-selection state and resolve the active field**

Replace the top of the component (from `export default function LedgerPage() {` through the `useState`/`useId` block) — specifically, insert the new state and reorder the `useReport` call. Change:

```typescript
export default function LedgerPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { data: fields } = useFields();
  const { data: entries } = useLedgerEntries();
  const { data: report } = useReport();
  const { data: categories } = useLedgerCategories();
```

to:

```typescript
export default function LedgerPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { data: fields } = useFields();
  const { data: entries } = useLedgerEntries();
  const [reportFieldId, setReportFieldId] = useState(selectedFieldId ?? "");
  const activeReportFieldId = reportFieldId || fields?.[0]?.id;
  const { data: report } = useReport(activeReportFieldId);
  const { data: categories } = useLedgerCategories();
```

(`reportFieldId` is deliberately **not** written back to `useAppStore` — previewing a report for a different field must not change what's selected on the Fields/Health pages. It stays local to this page, exactly like the existing `fieldId` state a few lines below it, which already follows this same local-only pattern for the entry form's own field selector.)

Then add an id for the new select, next to the existing id declarations:

```typescript
  const idPrefix = useId();
  const categoryFieldId = `${idPrefix}category`;
  const newHeadFieldId = `${idPrefix}new-head`;
  const targetFieldFieldId = `${idPrefix}target-field`;
  const reportFieldSelectId = `${idPrefix}report-field`;
  const amountFieldId = `${idPrefix}amount`;
  const quantityFieldId = `${idPrefix}quantity`;
  const noteFieldId = `${idPrefix}note`;
```

- [ ] **Step 2: Add a `slugify` helper next to the existing `pkr` helper**

Change:

```typescript
function pkr(value: number | null | undefined): string {
  return value == null ? "—" : `PKR ${value.toLocaleString()}`;
}
```

to:

```typescript
function pkr(value: number | null | undefined): string {
  return value == null ? "—" : `PKR ${value.toLocaleString()}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "field";
}
```

- [ ] **Step 3: Field-scope the PDF download**

Replace:

```typescript
  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const blob = await ledgerApi.downloadReportPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "production-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }
```

with:

```typescript
  async function handleDownloadPdf() {
    if (!activeReportFieldId) return;
    setDownloading(true);
    try {
      const blob = await ledgerApi.downloadReportPdf(activeReportFieldId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production-report-${slugify(report?.field_name ?? "field")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }
```

- [ ] **Step 4: Add the field selector and rebuild the report builder card's Row list**

Replace the whole `#ledgerSide` card:

```tsx
        <div id="ledgerSide" className="w-full lg:w-[280px]">
          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">Production report builder</div>
            <div className="text-xs leading-relaxed text-ink-500">
              Compiles acreage, live health data, and money spent &amp; earned across all fields into a printable
              report.
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <Row label="Total farm area" value={`${report?.total_hectares ?? "—"} ha`} />
              <Row label="Fields tracked" value={report?.field_count ?? "—"} />
              <Row label="Avg. health score" value={`${report?.avg_health_score ?? "—"}%`} valueColor="#2D6A4F" />
              <Row label="Total spent" value={pkr(report?.total_spent)} valueColor="#B4362A" />
              <Row label="Total earned" value={pkr(report?.total_earned)} valueColor="#2D6A4F" />
              <Row
                label="Net"
                value={pkr(report?.net)}
                valueColor={report && report.net >= 0 ? "#2D6A4F" : "#B4362A"}
              />
              <Row label="Ledger entries" value={report?.ledger_entry_count ?? "—"} />
            </div>
            <Button onClick={() => setReportOpen(true)}>Download production PDF report</Button>
          </Card>
        </div>
```

with:

```tsx
        <div id="ledgerSide" className="w-full lg:w-[280px]">
          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">Production report builder</div>
            <div className="text-xs leading-relaxed text-ink-500">
              Compiles one field&apos;s acreage, live health data, and transaction log into a printable report.
            </div>
            <div>
              <label htmlFor={reportFieldSelectId} className="sr-only">
                Report field
              </label>
              <div className="relative">
                <select
                  id={reportFieldSelectId}
                  value={activeReportFieldId ?? ""}
                  onChange={(e) => setReportFieldId(e.target.value)}
                  className={`${INPUT_CLASS} ${SELECT_CLASS} w-full`}
                >
                  {fields?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                  {NavIcons.chevron}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <Row label="Field area" value={report?.area_hectares != null ? `${report.area_hectares.toFixed(1)} ha` : "—"} />
              <Row label="Crop" value={report?.crop ?? "—"} />
              <Row label="NDVI" value={report?.ndvi_mean != null ? report.ndvi_mean.toFixed(2) : "—"} valueColor="#2D6A4F" />
              <Row label="Health score" value={report?.health_score != null ? `${report.health_score}%` : "—"} valueColor="#2D6A4F" />
              <Row label="Total spent" value={pkr(report?.total_spent)} valueColor="#B4362A" />
              <Row label="Total earned" value={pkr(report?.total_earned)} valueColor="#2D6A4F" />
              <Row
                label="Net"
                value={pkr(report?.net)}
                valueColor={report && report.net >= 0 ? "#2D6A4F" : "#B4362A"}
              />
            </div>
            <Button onClick={() => setReportOpen(true)} disabled={!activeReportFieldId}>
              Download production PDF report
            </Button>
          </Card>
        </div>
```

- [ ] **Step 5: Rebuild the modal's stats + field-summary block into identity + transactions**

Replace:

```tsx
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Hectares" value={report?.total_hectares ?? "—"} color="var(--color-forest-ink-900)" />
              <Stat label="Avg Health" value={`${report?.avg_health_score ?? "—"}%`} color="var(--color-forest-ink-700)" />
              <Stat label="Fields" value={report?.field_count ?? "—"} color="var(--color-ink-900)" />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">FIELD SUMMARY</div>
              {report?.field_summaries.map((fs) => (
                <div key={fs.name} className="flex items-center gap-2 border-b border-dashed border-[#EAE7DA] py-1.5 text-xs">
                  <span className="flex-1 font-bold">{fs.name}</span>
                  <span className="text-ink-500">{fs.crop ?? "—"}</span>
                  <span className="w-14 text-right">{fs.area_hectares ?? "—"} ha</span>
                  <span className="w-16 text-right font-bold text-forest-ink-700">
                    NDVI {fs.ndvi_mean?.toFixed(2) ?? "—"}
                  </span>
                  <span className="w-11 text-right font-bold">{fs.health_score ?? "—"}%</span>
                </div>
              ))}
            </div>
```

with:

```tsx
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-extrabold text-forest-ink-900">{report?.field_name ?? "—"}</span>
              <span className="text-[11px] text-ink-400">{report?.crop ?? "—"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Hectares" value={report?.area_hectares != null ? report.area_hectares.toFixed(1) : "—"} color="var(--color-forest-ink-900)" />
              <Stat label="NDVI" value={report?.ndvi_mean != null ? report.ndvi_mean.toFixed(2) : "—"} color="var(--color-forest-ink-700)" />
              <Stat label="Health" value={report?.health_score != null ? `${report.health_score}%` : "—"} color="var(--color-ink-900)" />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">TRANSACTIONS</div>
              {report?.transactions.length === 0 && (
                <div className="text-xs text-ink-400">No transactions yet.</div>
              )}
              {report?.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-2 border-b border-dashed border-[#EAE7DA] py-1.5 text-xs">
                  <span className="w-14 flex-none text-[10.5px] text-ink-400">
                    {new Date(tx.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-900">{tx.title}</span>
                    <span className="block truncate text-[11px] text-ink-400">{tx.detail}</span>
                  </span>
                  <span
                    className="flex-none whitespace-nowrap text-[12px] font-bold"
                    style={{
                      color:
                        tx.amount == null
                          ? "var(--color-ink-400)"
                          : tx.entry_type === "income"
                            ? "var(--color-forest-ink-700)"
                            : "var(--color-down-red)",
                    }}
                  >
                    {tx.amount == null ? "—" : `${tx.entry_type === "income" ? "+" : "−"}${pkr(tx.amount)}`}
                  </span>
                </div>
              ))}
            </div>
```

The Financial Summary block right below this (`Total spent`/`Total earned`/`Net` tiles) and the footnote are **unchanged** — they already read `report?.total_spent`/`total_earned`/`net`, field names that still exist on the redefined `Report` type, and now resolve to this one field's numbers automatically since `report` itself is field-scoped.

- [ ] **Step 6: Typecheck and lint**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: both pass — this is the point where every `field_summaries`/`total_hectares`/`avg_health_score`/`field_count`/`ledger_entry_count` reference in the whole project must be gone.

```bash
grep -rn "field_summaries\|total_hectares\|avg_health_score\|ledger_entry_count" frontend/src --include="*.ts" --include="*.tsx"
```

Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/"(app)"/ledger/page.tsx
git commit -m "Add field selector; rebuild the report card and modal around one field"
```

---

### Task 7: E2e coverage

**Files:**
- Create: `frontend/e2e/ledger.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks directly — drives the real page through the browser, mocking API routes the same way `frontend/e2e/fields.spec.ts` and `frontend/e2e/health.spec.ts` already do.

- [ ] **Step 1: Write the test**

```typescript
import { expect, test } from "@playwright/test";

const MOCK_USER = { id: "11111111-1111-1111-1111-111111111111", email: "guest@jadeedkashtkar.demo", is_active: true, created_at: "2026-01-01T00:00:00Z" };
const MOCK_FIELD = { id: "22222222-2222-2222-2222-222222222222", name: "Mocked Field", area_hectares: 12.4, created_at: "2026-01-01T00:00:00Z" };

const MOCK_REPORT = {
  field_name: "Mocked Field",
  crop: "Wheat",
  area_hectares: 12.4,
  ndvi_mean: 0.35,
  health_score: 42,
  transactions: [
    {
      id: "33333333-3333-3333-3333-333333333333",
      timestamp: "2026-06-15T00:00:00Z",
      category: "Fertilizer",
      title: "Fertilizer logged",
      detail: "2 bags urea/acre",
      amount: 4500,
      entry_type: "expense",
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      timestamp: "2026-07-28T00:00:00Z",
      category: "Sale",
      title: "Wheat — sold",
      detail: "40 maund wheat",
      amount: 96000,
      entry_type: "income",
    },
  ],
  total_spent: 4500,
  total_earned: 96000,
  net: 91500,
  generated_at: "2026-07-29T00:00:00Z",
};

/**
 * Exercises the field-specific production report against a mocked backend —
 * no live FastAPI/Postgres needed, same pattern as fields.spec.ts and
 * health.spec.ts. Covers: the field selector drives the /report request, the
 * transactions list renders chronologically, and the financial summary shows
 * this field's totals.
 */
test("ledger page shows one field's report: identity, chronological transactions, totals", async ({ page }) => {
  await page.route("**/api/v1/auth/guest", (route) =>
    route.fulfill({ json: { access_token: "mock-token", token_type: "bearer" } }),
  );
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: MOCK_USER }));
  await page.route("**/api/v1/fields", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: [MOCK_FIELD] });
    } else {
      route.continue();
    }
  });
  await page.route("**/api/v1/ledger", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/ledger/categories", (route) =>
    route.fulfill({ json: ["Fertilizer", "Irrigation", "Spray", "Operation", "Scan", "Sale"] }),
  );
  await page.route("**/api/v1/report*", (route) => route.fulfill({ json: MOCK_REPORT }));

  await page.goto("/login");
  await page.getByText("Try without an account").click();
  await page.waitForURL("**/fields");
  // A hard page.goto("/ledger") would reload and lose the in-memory
  // auth/query-cache state the guest-login click just established — follow
  // the sidebar link instead, like a real user would.
  await page.getByRole("link", { name: "Digital Ledger" }).click();
  await page.waitForURL("**/ledger");

  // Report builder card: field auto-selected (only one field), its own
  // numbers shown — not a farm-wide aggregate.
  await expect(page.getByText("12.4 ha")).toBeVisible();
  await expect(page.getByText("PKR 4,500").first()).toBeVisible();
  await expect(page.getByText("PKR 96,000").first()).toBeVisible();

  await page.getByRole("button", { name: "Download production PDF report" }).click();

  // Field identity + transactions, chronological (oldest first): Fertilizer
  // (15 Jun) before the Sale (28 Jul).
  await expect(page.getByText("Wheat", { exact: true })).toBeVisible();
  const fertilizerRow = page.getByText("Fertilizer logged");
  const saleRow = page.getByText("Wheat — sold");
  await expect(fertilizerRow).toBeVisible();
  await expect(saleRow).toBeVisible();
  const fertilizerBox = await fertilizerRow.boundingBox();
  const saleBox = await saleRow.boundingBox();
  expect(fertilizerBox && saleBox && fertilizerBox.y < saleBox.y).toBe(true);

  // Financial summary reflects this field's totals only.
  await expect(page.getByText("PKR 91,500")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx playwright test e2e/ledger.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/ledger.spec.ts
git commit -m "Add e2e coverage for the field-specific production report"
```

---

### Task 8: Manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full project check**

```bash
cd backend
.venv/bin/pytest -v
```

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
npx playwright test
```

Expected: all green.

- [ ] **Step 2: Manual browser check (per project convention for UI changes)**

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8000
```

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npm run dev
```

Open `http://localhost:3000/login`, click "Try without an account" (real guest auth into the shared demo account with existing fields — see the project's local-env notes; don't guess at real credentials), navigate to Digital Ledger, and confirm against the approved design (`docs/superpowers/specs/2026-07-29-production-report-redesign-design.md` and https://claude.ai/code/artifact/bfe5b137-73dc-4c56-8f2f-41cd7e8e314e):

- The report builder card shows a field dropdown; switching it changes the area/crop/NDVI/health/totals shown below, without changing the field selected on the Fields or Crop Health pages.
- Opening the report modal shows: field name + crop, three stat tiles (Hectares/NDVI/Health) for that field only, a TRANSACTIONS list in chronological order (oldest first) with correctly right-aligned amounts and a +/− sign colored by expense/income, then FINANCIAL SUMMARY totals matching just that field's transactions.
- A field with zero ledger entries shows "No transactions yet" instead of an empty table.
- Downloading the PDF: filename is `production-report-<field-name-slug>.pdf`; the PDF shows the same layout as the modal — field identity, aligned Amount column (header right-aligned to match its data), area to 1 decimal, NDVI to 2 decimals, dates as `DD Mon YYYY`; no "Calculated Fertilizer Requirement" section or PARC-guidance sentence anywhere.
- Switching the report builder's field dropdown to a second field (if the demo account has one) shows a different transaction log and different totals.
- Toggle light/dark theme and confirm the modal reads correctly in both.

- [ ] **Step 3: Report status**

If everything matches, this plan is complete. If anything doesn't match, note the specific mismatch (which bullet failed and how) rather than re-guessing at a fix inline — that's a signal to go back to the relevant task, not to patch around it here.
