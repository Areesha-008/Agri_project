# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Genuinely mixed, no single primary:
- **Smallholder farmers, self-serve** — draw their own fields, read NDVI/weather, log the ledger. Urdu-first, phone-first, tolerant of low bandwidth, enter through the no-signup guest trial before creating an account.
- **Agronomists / field advisors / input dealers** — operate the app on behalf of one or more farmers. More technical comfort, more likely on desktop/tablet, and the ones who actually generate the printable production report to hand to a third party (a bank, a subsidy officer, the farmer themselves).

Design and copy need to work for both: a stranger on a phone in a field, and someone building a document at a desk.

## Product Purpose

Precision-agriculture platform for Pakistani farmland. A user draws a field boundary on a satellite map and gets real Sentinel-2-derived NDVI/NDMI vegetation-health readings, a projected yield and crop-health trend over a season, leaf-disease diagnosis from a photo, and a bilingual digital ledger of farm inputs/sales that compiles into a printable production report. Success is an end-to-end tool a working farm can actually run on today — real integrations over polished-looking mocks. Built by a biotechnology & genome-engineering organization.

## Positioning

The bundled, real-data workflow is the differentiator, not any single feature: draw a field → live satellite NDVI/NDMI → health/yield → disease check → ledger → printable report, all in one bilingual (EN/UR, RTL-aware) app, with a zero-signup guest trial that shows a first-time visitor real analysis on their own land before asking them to create an account. A generic mandi-price app or a bare NDVI viewer can't truthfully copy the full loop, or the guest-trial-on-real-data pattern.

## Operating Context

- Web app (desktop + mobile web), single 760px breakpoint by design, EN/اردو toggle with full RTL mirroring on chrome/nav.
- Guest trial: draw a field on the landing hero with no account, see the real previous 4 weeks of NDVI history as separate readings, then a "create an account for custom date ranges" upsell.
- Authenticated flow: manage multiple fields, crop-health trend + yield projection, disease-photo scanning, weather, a rule-based pest/weather alert sweep, a digital ledger with user-defined custom expense/income "heads," and PDF report generation (WeasyPrint) meant to be printed or handed to a third party.
- Real external dependencies in production: Sentinel-2 L2A via CDSE/openEO (live, not mocked), Open-Meteo weather, Mapbox (basemap/search/draw), PARC fertilizer-rate guidance for report calculations.

## Capabilities and Constraints

- Auth is real JWT signup/login plus a guest path (auto-provisioned demo account) — not a stubbed dev-mode login.
- NDVI/NDMI analysis runs as a background job (FastAPI BackgroundTasks + polling) against real CDSE credentials — verified working end-to-end on live Sentinel-2 data.
- The disease scanner is **explicitly a deterministic demo classifier** (`InferenceProvider`, every response marked `demo_mode: true`), not a trained model. Swappable later behind the same interface; future work must not claim or imply real ML accuracy for it today.
- SMS notifications are a stubbed `Notifier` interface only (in-app/email/no-op) — provider integration is explicitly deferred, not yet decided.
- Market/mandi price tracking was intentionally removed from the product entirely (low-value, cluttered nav/landing/dashboard). Do not reintroduce it or treat the original design brief's mandi-rate screens as current scope.
- The digital ledger supports user-defined custom category "heads" beyond the original fixed 5, a per-entry amount with expense/income direction, and spent/earned/net totals in both the UI and the printed PDF.
- i18n is EN/UR dictionary-driven and RTL-aware on structural chrome; some landing-page body copy is still English-only (known gap, not yet closed).

## Brand Commitments

- Name: Jadeed Kashtkar (جدید کاشتکار) — "Modern Farmer."
- Built by a biotechnology & genome-engineering organization; this pedigree is a stated trust signal, even though the disease-diagnosis model itself is currently a demo classifier.
- Typefaces: Inter (Latin sans, weights 400–800), Noto Nastaliq Urdu (all Urdu text, needs line-height ≥1.7 — it's a tall script), Besley (serif, display/brand accents in the current implementation).
- Palette is a fixed forest/mint/cream design-token system (`frontend/src/app/globals.css`) with a genuine dark-mode inversion ramp — dark mode was added after the original design brief, which was light-only.
- Logo: two-leaf mark in a rounded square.

## Evidence on Hand

- `design_handoff/README.md` — the original high-fidelity design brief (colors, type, spacing, screen-by-screen behavior). Treat as historical intent, not current scope: it still describes mandi/market screens (removed) and frames the disease scanner as a working diagnosis (it's a demo classifier).
- `GAPS.md` — the authoritative log of every deliberate scope decision and deferral (guest auth, background jobs, demo scanner, deferred SMS, mandi rates since fully removed).
- Real, live integrations confirmed working: CDSE/openEO Sentinel-2, Open-Meteo weather, Mapbox.
- No customer testimonials, case studies, press mentions, or usage-benchmark data exist anywhere in the repo — do not fabricate any of these for future landing or marketing work.

## Product Principles

1. Real data over polished mocks — every module either uses a live integration or is explicitly, visibly labeled as demo/placeholder. Never silently fake a result.
2. Bilingual and RTL-aware by default, not bolted on — EN/UR parity is a product requirement for structural chrome; known gaps are tracked, not hidden.
3. Let a stranger try it on their own land before asking for an account — the guest, no-signup path on real satellite data is core to the funnel, not a throwaway demo mode.
4. Serve both the farmer and the intermediary who acts for them — copy, density, and report output need to work standing in a field on a phone and sitting at a desk building a bank-ready PDF.
5. Cut what doesn't earn its place — mandi prices were removed once they stopped being load-bearing; features are expected to keep proving their value, not accumulate.

## Accessibility & Inclusion

- WCAG AA color contrast is an enforced constraint already, not aspirational — `frontend/src/app/globals.css` documents verified 4.5:1-minimum text ramps for both light and dark themes.
- The original design brief specifies ≥44px touch targets on mobile; the current implementation has known deviations (e.g. Digital Ledger form controls measured at 34–42px in the 2026-07-24 audit) still to close.
- Urdu/RTL is a first-class layout requirement, not a translation afterthought — Noto Nastaliq needs line-height ≥1.7 and RTL mirroring on nav/chrome.
