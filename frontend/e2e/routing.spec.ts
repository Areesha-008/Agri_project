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

test("language toggle switches landing copy to Urdu and back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("اردو", { exact: true }).click();
  await expect(page.locator('div[dir="rtl"]')).toBeVisible();
  await page.getByText("EN", { exact: true }).click();
  await expect(page.locator('div[dir="ltr"]')).toBeVisible();
});
