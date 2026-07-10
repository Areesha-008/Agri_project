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

/**
 * Exercises the My Fields list + selection flow against a mocked backend —
 * no live FastAPI/Postgres/CDSE needed, so this stays fast and deterministic
 * in CI. The Mapbox draw interaction itself needs a real WebGL map and a
 * tile token, so it's covered by manual/local testing instead (see
 * DEPLOY.md); this test covers the data flow around it.
 */
test("fields page lists a field from the API and shows its stats", async ({ page }) => {
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
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}/ndvi`, (route) => route.fulfill({ json: { latest: null, history: [] } }));
  await page.route("**/api/v1/alerts*", (route) => route.fulfill({ json: [] }));

  await page.goto("/login");
  await page.getByText("Try without an account").click();
  await page.waitForURL("**/fields");

  await expect(page.getByText("Mocked Field").first()).toBeVisible();
  await expect(page.getByText("12.4 ha").first()).toBeVisible();
  await expect(page.getByText("+ Draw new field boundary")).toBeVisible();
});
