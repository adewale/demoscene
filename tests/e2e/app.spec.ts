import { expect, test } from "@playwright/test";

test("renders the feed as a card-oriented newsfeed", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "demoscene" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-team-member-login="adewale"]').first(),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", { name: "demoscene" }).nth(1),
  ).toBeVisible();
  await expect(
    page.getByLabel("Project feed").getByLabel("Workers").first(),
  ).toBeVisible();
  await expect(
    page.getByLabel("Project feed").getByRole("link", { name: "demoscene" }),
  ).toHaveAttribute("href", "https://github.com/adewale/demoscene");
  await expect(page.locator("main")).toHaveScreenshot("feed-page.png", {
    maxDiffPixels: 700,
  });
});

test("keeps every desktop team row within the rail width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");

  const overflowingRows = await page.evaluate(() => {
    return [...document.querySelectorAll(".team-rail .team-card-heading-row")]
      .map((row) => ({
        scrollWidth: row.scrollWidth,
        text: row.textContent?.trim() ?? "",
        width: row.getBoundingClientRect().width,
      }))
      .filter((row) => row.scrollWidth > Math.ceil(row.width));
  });

  expect(overflowingRows).toEqual([]);
});

test("keeps desktop project names on one line when the card has room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto("/");

  const wrappedTitles = await page.evaluate(() => {
    return [...document.querySelectorAll(".feed-card-title")]
      .map((title) => {
        const style = getComputedStyle(title);
        return {
          height: title.getBoundingClientRect().height,
          lineHeight: parseFloat(style.lineHeight),
          text: title.textContent?.trim() ?? "",
        };
      })
      .filter((title) => title.height > title.lineHeight + 1);
  });

  expect(wrappedTitles).toEqual([]);
});
