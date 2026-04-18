import { expect, test } from "@playwright/test";

test("renders the feed as a card-oriented newsfeed", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "demoscene" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "demo-scene" })).toBeVisible();
  await expect(page.locator('[aria-label="Workers"] svg')).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Visit homepage" }),
  ).toHaveAttribute("href", "https://demo.example.com");
  await expect(page.locator("main")).toHaveScreenshot("feed-page.png");
});

test("renders a shareable project detail page", async ({ page }) => {
  await page.goto("/projects/acme/demo-scene");

  await expect(
    page.getByRole("heading", { level: 2, name: "acme/demo-scene" }),
  ).toBeVisible();
  await expect(
    page.getByText("This project shows a card-oriented feed."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open GitHub repo" }),
  ).toHaveAttribute("href", "https://github.com/acme/demo-scene");
  await expect(page.locator("main")).toHaveScreenshot(
    "project-detail-page.png",
  );
});
