// On-demand loading in the real build (spec: world-packs, "Packs load on demand" and "Loading is visible and
// failures are recoverable"). Runs against `vite preview`, so these are the real files a player downloads.
import { expect, test, type Page } from "@playwright/test";
import { openTarget } from "../targets.ts";

// Vite names each world's file after its pack folder: assets/w3-server-<hash>.js.
const PACK_FILE = /\/assets\/(w\d+)-[a-z-]+-[\w-]+\.js$/;

/** Every world file the page downloads from now on, by world folder prefix ("w3"). */
function watchPacks(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const m = PACK_FILE.exec(new URL(r.url()).pathname);
    if (m) seen.push(m[1]);
  });
  return seen;
}

async function openLevel(page: Page, id: string) {
  if (await page.locator("#game").isVisible()) await page.click("#homeBtn");
  await page.locator(`#piers [data-level="${id}"]`).first().click();
  await expect(page.locator("#mEyebrow")).not.toHaveText(/^Loading/);
  await expect(page.locator("#mTitle")).not.toBeEmpty();
}

async function type(page: Page, cmd: string): Promise<string> {
  await page.fill("#cmd", cmd);
  await page.press("#cmd", "Enter");
  return (await page.locator("#out > div").last().textContent()) ?? "";
}

test("the home screen downloads no world", async ({ page }) => {
  const packs = watchPacks(page);
  await openTarget(page, "build");
  await page.waitForLoadState("networkidle");
  expect(packs).toEqual([]);
});

test("opening World 3 downloads only World 3, once", async ({ page }) => {
  const packs = watchPacks(page);
  await openTarget(page, "build");
  await openLevel(page, "hgx-board");
  await expect(page.locator("#mEyebrow")).toHaveText("World 3 · Level 1");
  await page.waitForLoadState("networkidle");
  expect(packs).toEqual(["w3"]);
  await openLevel(page, "tensor-parallel");
  await expect(page.locator("#mEyebrow")).toHaveText("World 3 · Level 2");
  await page.waitForLoadState("networkidle");
  expect(packs).toEqual(["w3"]);
});

test("a World 4 command in World 1 downloads nothing and answers like the reference", async ({ page }) => {
  await openTarget(page, "reference");
  await openLevel(page, "gpu-anatomy");
  const want = await type(page, "ibstat");
  expect(want).toContain("World 4");

  const packs = watchPacks(page);
  await openTarget(page, "build");
  await openLevel(page, "gpu-anatomy");
  await page.waitForLoadState("networkidle");
  expect(packs).toEqual(["w1"]);
  expect(await type(page, "ibstat")).toBe(want);
  await page.waitForLoadState("networkidle");
  expect(packs).toEqual(["w1"]);
});

test("a world that fails to download says so; Home and stars are unaffected; Try again opens it", async ({ page }) => {
  const saved = JSON.stringify({ v: 1, stars: { tokens: 2, "gpu-anatomy": 3 } });
  await page.addInitScript((s) => localStorage.setItem("m2m-progress-v1", s), saved);
  const block = (r: import("@playwright/test").Route) => r.abort("internetdisconnected");
  await page.route(/\/assets\/w2-[a-z-]+-[\w-]+\.js$/, block);
  await openTarget(page, "build");

  await page.locator('#piers [data-level="software-path"]').click();
  await expect(page.locator("#mTitle")).toHaveText("Couldn't load World 2");
  await expect(page.locator("#mBrief")).toContainText("Check your connection");
  await expect(page.locator("#retryBtn")).toBeVisible();
  await expect(page.locator("#termCard")).toBeHidden();

  await page.click("#homeBtn");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator('#piers [data-level="gpu-anatomy"] .stars')).toHaveText("★★★");
  expect(await page.evaluate(() => localStorage.getItem("m2m-progress-v1"))).toBe(saved);

  await page.locator('#piers [data-level="software-path"]').click();
  await expect(page.locator("#retryBtn")).toBeVisible();
  await page.unroute(/\/assets\/w2-[a-z-]+-[\w-]+\.js$/, block);
  await page.click("#retryBtn");
  await expect(page.locator("#mEyebrow")).toHaveText("World 2 · Level 1");
  await expect(page.locator("#mTitle")).toHaveText("Follow one matmul");
  await expect(page.locator("#termCard")).toBeVisible();
});

test("while a world downloads, the player sees a loading message instead of a half-drawn level", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/assets\/w0-[a-z-]+-[\w-]+\.js$/, async (r) => {
    await held;
    await r.continue();
  });
  await openTarget(page, "build");
  await page.locator('#piers [data-level="tokens"]').click();
  await expect(page.locator("#mEyebrow")).toHaveText("Loading World 0…");
  await expect(page.locator("#simCard")).toBeHidden();
  await expect(page.locator("#termCard")).toBeHidden();
  release();
  await expect(page.locator("#mEyebrow")).toHaveText("World 0 · Level 1");
  await expect(page.locator("#termCard")).toBeVisible();
});
