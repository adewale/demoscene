import { expect, test } from "@playwright/test";

test("renders the feed as a card-oriented newsfeed", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "demoscene" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "demo-scene" })).toBeVisible();
  await expect(page.locator('[aria-label="Workers"] svg')).toBeVisible();
  await expect(page.getByRole("link", { name: "demo-scene" })).toHaveAttribute(
    "href",
    "https://github.com/acme/demo-scene",
  );
  await expect(page.getByRole("link", { name: "Video" })).toHaveAttribute(
    "href",
    "https://www.loom.com/share/demo-scene",
  );
  await expect(page.locator("main")).toHaveScreenshot("feed-page.png", {
    maxDiffPixels: 700,
  });
});
