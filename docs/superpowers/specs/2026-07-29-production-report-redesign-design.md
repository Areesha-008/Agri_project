# Digital Ledger production report: field-specific redesign

## Problem

The production report (`GET /report`, `GET /report/pdf`, and their frontend consumers —
the "Production report builder" card and preview modal on
`frontend/src/app/(app)/ledger/page.tsx`) currently rolls up every field a user owns into
one aggregate document: total hectares, average health, a table listing every field, and
whole-farm financial totals. This has four problems:

1. It can't answer "how is *this* field doing, financially and agronomically" — the
   report is farm-wide only, with no way to scope it to one field.
2. There's no record of what actually happened on a field — the report shows totals but
   not the transactions (ledger entries) that produced them.
3. The output has real formatting bugs: the field-summary table's numeric column headers
   (AREA/NDVI/HEALTH) are left-aligned while their data is right-aligned, area and NDVI
   are shown to 4 decimal places, and figures aren't set in tabular numerals.
4. It carries a "Calculated Fertilizer Requirement" section and a PARC-guidance footnote
   sentence. (Already removed from `report_pdf.py`, `ReportResponse`, and the modal in
   the current working tree as part of unrelated fertilizer-module cleanup earlier
   today — listed here only so this spec's diff doesn't reintroduce it.)

A layout demo with mock data was built and approved
(https://claude.ai/code/artifact/bfe5b137-73dc-4c56-8f2f-41cd7e8e314e) — this spec
formalizes that approved design.

## Non-goals

- No change to how ledger entries are created, categorized, or listed in the Timeline
  card — this is report-rendering only.
- No multi-field or "all fields" report mode. Per the approved design, the report is
  field-required; there is no fallback aggregate view.
- No field switcher inside the preview modal itself. The field is chosen once, on the
  report builder card, before the modal opens.
- No changes to the fertilizer recommendation module (`routes_fertilizer_recommendation.py`,
  `fertilizer_recommendation_service.py`, etc.) — unrelated feature, already separate from
  the production report.

## Design

### 1. Backend: field-scoped report

`build_report(db, user_id, field_id)` (`backend/app/services/ledger_service.py`) gains a
required `field_id` parameter. It uses the existing `get_field_or_404(db, user_id,
field_id)` helper (`backend/app/services/field_service.py`) for the ownership/existence
check, so an unknown or not-owned `field_id` fails the same way every other field-scoped
endpoint already does (`FieldNotFoundError` → 404).

Ledger entries for the field are pulled via the same join `list_ledger_entries_for_user`
already uses (`LedgerEntry` joined to `Field`, filtered by `user_id`), narrowed to
`field_id` and ordered ascending by `timestamp` (chronological — oldest first), instead of
the Timeline's descending order.

Money totals (`total_spent`, `total_earned`, `net`) are computed the same way as today
(sum by `entry_type`, rounded to 2 decimals) but scoped to that field's entries only.

`GET /report` and `GET /report/pdf` (`backend/app/api/v1/routes_ledger.py`) both take
`field_id` as a required query parameter and pass it through to `build_report`.

### 2. Backend: response schema

`ReportResponse` (`backend/app/schemas/ledger.py`) is redefined around one field instead
of a farm-wide aggregate. `FieldReportSummary` and `field_summaries: list[...]` are
removed (no longer meaningful for a single field); a new `TransactionItem` is added:

```python
class TransactionItem(BaseModel):
    timestamp: datetime
    category: str
    title: str
    detail: str
    amount: Optional[float]
    entry_type: str  # "expense" | "income"

class ReportResponse(BaseModel):
    field_name: str
    crop: Optional[str]
    area_hectares: Optional[float]
    ndvi_mean: Optional[float]
    health_score: Optional[int]
    transactions: list[TransactionItem]   # chronological, oldest first
    total_spent: float
    total_earned: float
    net: float
    generated_at: datetime
```

Dropped fields: `field_count`, `avg_health_score`, `ledger_entry_count`,
`field_summaries` — all were whole-farm concepts with no single-field equivalent.
`ndvi_mean` and `health_score` are sourced the same way `build_report` already computes
them today (latest `NdviHistory` row for the field; `get_crop_health`), just for the one
selected field instead of iterating every field.

### 3. Report layout (PDF and modal share this structure)

Both `render_report_pdf` (`backend/app/services/report_pdf.py`) and the modal JSX
(`frontend/src/app/(app)/ledger/page.tsx` lines ~359-428) are rebuilt to the same
structure, replacing the multi-field table with a single-field layout:

1. Header — unchanged: title, `Jadeed Kashtkar · {owner email} · {date}`.
2. Field identity line: field name + crop (e.g. "Field 1 · Wheat"), right-aligned
   opposite the header per the approved mockup.
3. Three stat tiles — **Area / NDVI / Health** (this field's own numbers), replacing the
   old Hectares/Avg Health/Fields aggregate tiles.
4. **Transactions** section (new) — one row per ledger entry, chronological
   (oldest → newest): date, category, title + detail, and amount right-aligned with a
   +/− sign and expense/income coloring (mirrors the Timeline row's existing
   `entry.entry_type === "income" ? "+" : "−"` convention). Entries with no amount
   (e.g. a bare "Scan logged") show an em dash in the amount column, not a blank cell.
   Category dot colors match the Timeline's existing `CATEGORY_DOT` map
   (`frontend/src/app/(app)/ledger/page.tsx`) value-for-value so the report and Timeline
   stay visually consistent — for the modal this is a direct reuse of that map, but
   `report_pdf.py` is server-side Python with no import path to frontend TypeScript, so
   its `_STYLE`/row-rendering code gets its own small `dict[str, str]` of the same hex
   values, kept in sync by inspection rather than a shared source (there's no existing
   shared color-token file between the two stacks to point at instead).
5. Financial summary — same 3-tile style as today, now totalled from this field's
   transactions only.
6. Footnote — unchanged wording (`Data: Sentinel-2 L2A via CDSE/openEO · Ledger
   entries: {count}`), where `{count}` is `len(transactions)`.

Empty state: a field with zero ledger entries shows "No transactions yet" in place of
the table, matching the Timeline card's existing `entries?.length === 0` empty-state
convention.

### 4. Formatting fixes

- **Numeric column alignment**: the PDF's `_STYLE` block defines `td.num { text-align:
  right }` but no matching rule for `th`, so numeric headers sit left of their
  right-aligned data. Add `th.num` (or apply the class to both), used on both the
  transactions table's Amount column and anywhere else numeric data appears.
- **Decimal precision**: area rounds to 1 decimal place (`53.3262` → `53.3`, matching the
  rounding already used for the total-hectares stat elsewhere in the app), NDVI to 2
  decimal places (`0.3489` → `0.35`, matching the modal's existing `.toFixed(2)`).
- **Tabular numerals**: `font-variant-numeric: tabular-nums` on the stat tile values,
  the transactions Amount column, and the financial summary amounts, so digits line up
  down each column.
- **Transaction dates**: formatted `%d %b %Y` (matches the header's `28 Jul 2026`
  style), not a raw ISO timestamp.

### 5. Frontend: field selection

- A new field `<select>` is added to the "Production report builder" card
  (`frontend/src/app/(app)/ledger/page.tsx`), styled with the same `INPUT_CLASS` /
  `SELECT_CLASS` pattern already used by the entry form's field selector on the same
  page. It defaults to `useAppStore`'s `selectedFieldId` if one is set, otherwise the
  first field.
- This selection is **local component state**, not written back to `useAppStore` —
  previewing a report for a different field must not change what's selected on the
  Fields/Health pages.
- `useReport()` (`frontend/src/lib/api/hooks.ts`) takes a `fieldId` argument and the
  query is `enabled: isAuthenticated && !!fieldId`. `ledgerApi.report` and
  `ledgerApi.downloadReportPdf` (`frontend/src/lib/api/resources.ts`) both take
  `fieldId` and append it as a query param.
- The report builder card's copy changes from "across all fields" to reflect a single
  selected field (exact wording decided at implementation time, matching existing
  copy tone).
- The preview modal reads whatever field is currently selected on the card when it
  opens — no independent field state in the modal.
- Downloaded PDF filename becomes `production-report-<field-slug>.pdf` (slug = field
  name, lowercased, non-alphanumerics replaced with `-`), replacing the current fixed
  `production-report.pdf`.
- `Report` TypeScript interface (`frontend/src/lib/api/types.ts`) is updated to match
  the new `ReportResponse` shape from §2, including a `Transaction` type mirroring
  `TransactionItem`.

### 6. Error handling

- Zero fields on the account: the report builder card keeps its existing "No fields
  yet" empty state (`fields.length === 0` branch) — unchanged, since there's nothing to
  select.
- `field_id` query param referring to a field the user doesn't own or that doesn't
  exist: existing `FieldNotFoundError` → 404, same as other field-scoped endpoints
  (e.g. `field_service.get_field_or_404` callers).

## Testing

- `backend/tests/test_ledger_service.py` (currently deleted per git status from
  unrelated fertilizer cleanup) is rewritten for the new `build_report(db, user_id,
  field_id)` signature: a field with transactions (chronological order asserted,
  totals correct), a field with zero transactions (empty list, zero totals), and the
  not-found/not-owned field_id case (raises `FieldNotFoundError`).
- Existing backend test suite (101 tests as of the last full run) must still pass.
- Frontend: `tsc`/ESLint must pass after the `Report`/`Transaction` type and hook
  signature changes.
- Manual verification in the browser (per project convention for UI changes): selecting
  different fields on the report builder card changes the preview; downloading a PDF
  for a field with transactions shows them chronologically above the financial summary
  with aligned columns and 1-2 decimal figures; a field with no transactions shows the
  empty state; the fertilizer section stays absent; the global field selection
  elsewhere in the app is unaffected by the report card's own field choice.
