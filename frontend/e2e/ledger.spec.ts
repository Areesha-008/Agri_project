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
  // .last(): "Wheat" also matches the still-mounted report-builder card's
  // Crop row behind the modal overlay (same field, same value) — the modal's
  // own crop label is the later element in DOM order.
  await expect(page.getByText("Wheat", { exact: true }).last()).toBeVisible();
  const fertilizerRow = page.getByText("Fertilizer logged");
  const saleRow = page.getByText("Wheat — sold");
  await expect(fertilizerRow).toBeVisible();
  await expect(saleRow).toBeVisible();
  const fertilizerBox = await fertilizerRow.boundingBox();
  const saleBox = await saleRow.boundingBox();
  expect(fertilizerBox && saleBox && fertilizerBox.y < saleBox.y).toBe(true);

  // Financial summary reflects this field's totals only.
  // .last(): same "still-mounted sidebar behind the modal" overlap as
  // above — the sidebar's Net row and the modal's Net tile both read
  // "PKR 91,500"; the modal's is the later element in DOM order.
  await expect(page.getByText("PKR 91,500").last()).toBeVisible();
});
