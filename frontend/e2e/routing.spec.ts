import { expect, test } from "@playwright/test";

test("landing page renders hero content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("every acre")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("landing nav links to login and signup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByText("Create an account").click();
  await expect(page).toHaveURL(/\/signup$/);
});

test("visiting a protected route while logged out redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

// The Mapbox draw interaction itself needs real WebGL + a token (see
// fields.spec.ts) — this only smoke-tests the hero widget's control card.
test("landing hero field analyzer walks between idle and drawing states", async ({ page }) => {
  await page.goto("/");
  const drawButton = page.getByRole("button", { name: "Draw your field" });
  await expect(drawButton).toBeVisible();
  await drawButton.click();
  await expect(page.getByText("Double-click to finish")).toBeVisible();
  await page.locator("#top").getByRole("button", { name: "Cancel" }).click();
  await expect(drawButton).toBeVisible();
});

test("language toggle switches landing copy to Urdu and back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("اردو", { exact: true }).click();
  // .first(): the page-root div is always the first dir-tagged element in
  // document order. Compact feature cards also re-assert `dir` internally
  // (so their Urdu text reads correctly even though their scroll row is
  // forced dir="ltr" for cross-browser-consistent scroll math) — this test
  // cares about the page-level direction, not those nested overrides.
  await expect(page.locator('div[dir="rtl"]').first()).toBeVisible();
  await page.getByText("EN", { exact: true }).click();
  await expect(page.locator('div[dir="ltr"]').first()).toBeVisible();
});
