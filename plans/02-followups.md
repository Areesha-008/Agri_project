# Follow-ups from the landing-page redesign (2026-07-14)

Work completed per `plans/01-landing-hero-field-drawing.md` — all phases done, verified (tsc, eslint, next build, 5/5 Playwright, manual EN+UR browser flows). These items remain:

## Requires a decision / user action
1. **Commit the work.** Nothing is committed yet. Changes: `page.tsx` (sections + hero swap), new `LandingFieldAnalyzer.tsx`, `FieldsMap.tsx` overlay fix, `dictionary.ts` (keys added/removed), `HeroMap.tsx` deleted.
2. **Clean the shared guest account.** ~7 test fields ("My field" / "probe field", created 2026-07-14 11:31–11:55) were left by testing; bulk deletion was permission-blocked. Delete via the /fields page, or re-authorize an API cleanup.

## Product / robustness improvements (not in scope, recommended)
3. **Client-side job timeout in the hero.** One CDSE job hung in `running` forever (no server-side timeout); a visitor would see an endless spinner. Add a "taking too long — try again" state after ~2–3 min, and/or a backend job timeout that marks jobs `failed`.
4. **Guest-account growth.** Every landing analysis persists a field under the single shared guest user. Options: auto-delete the field on "Draw another field" (useDeleteField), a backend TTL cleanup for guest fields, or per-visitor guest users.
5. **Duplicate backend instances.** Two uvicorn processes listen on :8000 (0.0.0.0 from an old terminal + 127.0.0.1). Kill the stale one to avoid confusion.
6. **Hardcoded English strings.** The "How it works" STEPS array and some bento card copy in `page.tsx` are not in the i18n dictionary (pre-existing) — Urdu users see English there.
7. **Landing hero e2e coverage.** The draw interaction isn't e2e-tested (WebGL/token constraint, same as /fields). A mocked-API smoke test of the idle card + button states would be cheap.
