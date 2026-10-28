// A world added by a pack (spec: world-packs, "A world is added by adding a pack"). The test-only World 5
// comes from tests/pack: its pack and one manifest entry. No file in src/ mentions it (checked in layers.test.ts).
import { expect, test } from "@playwright/test";

test("the test world appears after World 4, and its level can be opened, played and won", async ({ page }) => {
  await page.goto("/");
  const worlds = await page.locator("#piers .pier-head h2").allTextContents();
  expect(worlds.slice(-2)).toEqual(["World 4 · Many servers", "World 5 · Test pack"]);

  await page.locator('#piers [data-level="test-ping"]').click();
  await expect(page.locator("#mEyebrow")).toHaveText("World 5 · Level 1");
  await expect(page.locator("#mTitle")).toHaveText("Ping the test pack");
  await expect(page.locator("#simBody .xp")).toHaveText("0 pings");

  await page.fill("#cmd", "ping");
  await page.press("#cmd", "Enter");
  await expect(page.locator("#out > div").last()).toHaveText("pong");
  await expect(page.locator("#simBody .xp")).toHaveText("1 pings");
  await expect(page.locator("#modal")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("m2m-progress-v1") ?? "null"));
  expect(saved.stars["test-ping"]).toBe(3);

  // The other worlds' guard answers still work from inside the new world.
  await page.click("#dStay");
  await page.fill("#cmd", "ibstat");
  await page.press("#cmd", "Enter");
  await expect(page.locator("#out > div").last()).toContainText("World 4");
});
