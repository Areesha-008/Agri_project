import { expect, test } from "@playwright/test";

const MOCK_USER = { id: "11111111-1111-1111-1111-111111111111", email: "guest@jadeedkashtkar.demo", is_active: true, created_at: "2026-01-01T00:00:00Z" };
const MOCK_FIELD = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Mocked Field",
  geometry: { type: "Polygon", coordinates: [[[73.08, 31.4], [73.09, 31.4], [73.09, 31.41], [73.08, 31.41], [73.08, 31.4]]] },
  area_hectares: 12.4,
  district: "Faisalabad",
  crop: "Wheat",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function ndviRow(date: string, ndviMean: number) {
  return {
    id: `row-${date}`,
    ndvi_mean: ndviMean, ndvi_min: ndviMean - 0.1, ndvi_max: ndviMean + 0.1,
    ndmi_mean: 0.06, ndmi_min: -0.03, ndmi_max: 0.15,
    ndre_mean: 0.22, ndre_min: 0.14, ndre_max: 0.3,
    nbr2_mean: 0.11, nbr2_min: 0.06, nbr2_max: 0.16,
    ndwi_mean: -0.35, ndwi_min: -0.44, ndwi_max: -0.26,
    cci_mean: 0.52, cci_min: 0.42, cci_max: 0.62,
    evi_mean: 0.23, evi_min: 0.16, evi_max: 0.31,
    savi_mean: 0.21, savi_min: 0.13, savi_max: 0.29,
    date_range_start: null,
    satellite_image_date: date,
    cloud_cover_percent: 5,
    source_collection: "sentinel-2-l2a",
    ndvi_png_url: null, ndmi_png_url: null, ndre_png_url: null, nbr2_png_url: null,
    ndwi_png_url: null, cci_png_url: null, evi_png_url: null, savi_png_url: null,
    computed_at: "2026-07-20T00:00:00Z",
  };
}
// The real API returns history newest-first (get_field_ndvi orders by
// computed_at DESC) — MeasureIndexList/MeasureDetailChart both do
// `dedupeByDate(history).reverse()` to get oldest→newest internally, so this
// mock has to match that newest-first contract or "latest" comes out as the
// wrong end of the array.
const MOCK_HISTORY = [ndviRow("2026-07-19", 0.31), ndviRow("2026-07-12", 0.34), ndviRow("2026-07-05", 0.3)];

const MOCK_CROP_HEALTH = {
  field_id: MOCK_FIELD.id,
  health_score: 60,
  status_label: "Healthy",
  yield_maund_per_acre: 26.18,
  yield_t_per_ha: 2.11,
  baseline_district: "DEFAULT",
  baseline_crop: "DEFAULT",
  ndvi_trend: [],
};

/**
 * Exercises the reworked Crop Health page against a mocked backend: the
 * yield/health-gauge card is gone, the index list shows latest + season
 * min/max with no sparklines, selecting a row swaps the expanded chart, and
 * the chart has real y-axis tick labels. No live FastAPI/Postgres/CDSE
 * needed — see fields.spec.ts for the same pattern.
 */
test("crop health page shows the index list and swaps the expanded chart on selection", async ({ page }) => {
  // The default 20s test timeout is tight here specifically: this is the
  // first route in the suite to pull in recharts, and a freshly created
  // worktree has no warm Next.js/Turbopack compile cache for it yet — the
  // cold compile alone can eat 15-20s independent of anything this test
  // does. Bumped for this test only, not the suite default.
  test.setTimeout(60_000);

  await page.route("**/api/v1/auth/guest", (route) =>
    route.fulfill({ json: { access_token: "mock-token", token_type: "bearer" } }),
  );
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: MOCK_USER }));
  await page.route("**/api/v1/fields", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: [{ id: MOCK_FIELD.id, name: MOCK_FIELD.name, area_hectares: MOCK_FIELD.area_hectares, created_at: MOCK_FIELD.created_at }] });
    } else {
      route.continue();
    }
  });
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}`, (route) => route.fulfill({ json: MOCK_FIELD }));
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}/ndvi`, (route) =>
    route.fulfill({ json: { latest: MOCK_HISTORY[0], history: MOCK_HISTORY } }),
  );
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}/crop-health`, (route) => route.fulfill({ json: MOCK_CROP_HEALTH }));

  await page.goto("/login");
  await page.getByText("Try without an account").click();
  await page.waitForURL("**/fields");
  // page.route() mocks are registered on `page`, not tied to a particular
  // document load, and the guest-login token is persisted to localStorage
  // (see AuthProvider) — both survive a hard navigation, so goto is safe
  // here. Clicking the sidebar's "Crop Health" link instead hung: leaving
  // the Fields page's live Mapbox GL map via client-side routing didn't
  // reliably complete the transition in this environment — unrelated to
  // this page's own code (confirmed by this direct-goto path rendering the
  // page correctly below).
  await page.goto("/health");

  // Wait generously for the real page (proves it actually finished loading —
  // see the test.setTimeout comment above) before asserting anything about
  // *absence*: an absence check against a still-"Loading…" page would pass
  // vacuously for the wrong reason.
  //
  // Scoped to the index list specifically: the unrelated "All fields" grid
  // further down this same page also renders literal text "NDVI —" for each
  // field's trend summary, so an unscoped getByRole("button", {name: /NDVI/})
  // matches both that card and this row once both sections have loaded.
  const indexList = page.getByTestId("measure-index-list");
  const ndviRowLocator = indexList.getByRole("button", { name: /NDVI/ });
  await expect(ndviRowLocator).toBeVisible({ timeout: 30_000 });

  // Yield/health-gauge card is gone from this page.
  await expect(page.getByText("Projected yield")).toHaveCount(0);

  // Index list: NDVI row shows latest + season min/max, no sparkline svg.
  // series.at(-1) after dedupeByDate(history).reverse() is 2026-07-19 (the
  // newest date, first element of the newest-first mock) → latest 0.31.
  // meanRange takes min/max of the three ndvi_mean values (0.31/0.34/0.30)
  // — NOT the individual rows' own ndvi_min/ndvi_max — giving 0.30/0.34.
  await expect(ndviRowLocator.getByText("0.31")).toBeVisible();
  await expect(ndviRowLocator.getByText(/min 0\.30 · max 0\.34/)).toBeVisible();
  await expect(ndviRowLocator.locator("svg")).toHaveCount(0);

  // Default selection is NDVI; the chart header reflects it.
  await expect(page.getByText("NDVI — vegetation")).toBeVisible();

  // Selecting NDMI swaps the expanded chart's header.
  await indexList.getByRole("button", { name: /NDMI/ }).click();
  await expect(page.getByText("NDMI — moisture")).toBeVisible();

  // The chart has real y-axis tick labels now (Recharts renders them as SVG
  // <text> elements) — selected via our own data-testid, not a Recharts
  // internal class name, so this doesn't depend on Recharts' DOM structure.
  const chart = page.getByTestId("measure-detail-chart");
  await expect(chart.locator("svg")).toBeVisible();
  const tickCount = await chart.locator("svg text").count();
  expect(tickCount).toBeGreaterThan(0);

  // The old Single/Compare toggle no longer exists anywhere on the page.
  await expect(page.getByText("Compare", { exact: true })).toHaveCount(0);
});
