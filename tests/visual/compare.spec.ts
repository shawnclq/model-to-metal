// Visual parity: the new build must look like the reference (spec: looks the same).
// Opens both builds side by side in the same browser and compares screenshots pixel by pixel.
//   npm run test:visual                                     reference vs the new build
//   VISUAL_TARGET=reference npm run test:visual              reference vs itself (sanity check of the test)
//   VISUAL_TARGET=reference VISUAL_FILE=copy.html ...         reference vs another single-file build
import { mkdirSync, writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { openTarget, type Target } from "../targets.ts";
import { prepare } from "../parity/record.ts";
import plan from "../parity/plan.json" with { type: "json" };

const target = (process.env.VISUAL_TARGET ?? "build") as Target;
const MAX_DIFF_SHARE = 0.001; // at most 0.1% of pixels may differ (anti-aliasing noise)

// One screen per world, the MIG level (its own layout), a win modal and the Compare panel.
type Screen = { name: string; go: (p: Page) => Promise<void> };
const open = (id: string) => async (p: Page) => {
  await p.click("#homeBtn");
  await p.locator(`#piers [data-level="${id}"]`).first().click();
  await p.locator("#mTitle").filter({ hasText: /\S/ }).waitFor();
  await p.waitForFunction(() => !/^Loading/.test(document.querySelector("#mEyebrow")?.textContent ?? ""));
};
const SCREENS: Screen[] = [
  { name: "home", go: async (p) => void (await p.click("#homeBtn")) },
  ...["tokens", "gpu-anatomy", "software-path", "hgx-board", "fabric", "gpu-sharing"].map((id) => ({
    name: id,
    go: open(id),
  })),
  {
    name: "win-modal",
    go: async (p) => {
      await open("moe-experts")(p);
      for (const cmd of plan.levels.find((l) => l.id === "moe-experts")!.answer) {
        await p.fill("#cmd", cmd);
        await p.press("#cmd", "Enter");
      }
      await p.clock.runFor(2000); // the win modal appears 900 ms after the last goal ticks
      await p.locator("#modal").waitFor();
    },
  },
  { name: "compare", go: async (p) => void (await p.click("[data-compare]")) },
];

async function shoot(page: Page, s: Screen): Promise<Buffer> {
  await s.go(page);
  await page.clock.runFor(1000);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot();
}

for (const scheme of ["light", "dark"] as const) {
  for (const width of [1280, 390]) {
    test(`visual: ${target} matches the reference, ${scheme}, ${width}px`, async ({ browser }) => {
      const pages: Page[] = [];
      for (const side of ["reference", target] as const) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
        const page = await ctx.newPage();
        await prepare(page);
        await openTarget(page, side, side === "reference" && pages.length === 1 ? process.env.VISUAL_FILE : undefined);
        pages.push(page);
      }
      const [ref, tgt] = pages;
      const bad: string[] = [];
      for (const s of SCREENS) {
        const a = PNG.sync.read(await shoot(ref, s));
        const b = PNG.sync.read(await shoot(tgt, s));
        if (a.width !== b.width || a.height !== b.height) {
          bad.push(`${s.name}: size ${a.width}×${a.height} vs ${b.width}×${b.height}`);
          continue;
        }
        const diff = new PNG({ width: a.width, height: a.height });
        const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
        if (n / (a.width * a.height) > MAX_DIFF_SHARE) {
          mkdirSync("test-results/visual", { recursive: true });
          const base = `test-results/visual/${scheme}-${width}-${s.name}`;
          writeFileSync(`${base}-reference.png`, PNG.sync.write(a));
          writeFileSync(`${base}-${target}.png`, PNG.sync.write(b));
          writeFileSync(`${base}-diff.png`, PNG.sync.write(diff));
          bad.push(`${s.name}: ${n} pixels differ (see ${base}-diff.png)`);
        }
        // Spec: no horizontal scroll at phone width.
        if (width === 390) {
          const fits = await tgt.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
          if (!fits) bad.push(`${s.name}: wider than the window at 390px`);
        }
        for (const p of pages) if (await p.locator("#cmpModal").isVisible()) await p.click("#cmpClose");
        for (const p of pages) if (await p.locator("#modal").isVisible()) await p.click("#dStay");
      }
      expect(bad, bad.join("\n")).toEqual([]);
    });
  }
}
