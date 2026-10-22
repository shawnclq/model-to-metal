// The two builds every comparison test opens: the frozen single-file reference, and the new Vite build.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export type Target = "reference" | "build";

// The reference was published as a claude.ai artifact, which wraps it in a standard page skeleton
// (doctype, charset, viewport). Serve it the same way, so both builds render in standards mode.
// `file` swaps in another single-file build, used to prove the tests catch a change.
const REFERENCE_URL = "https://reference.m2m.test/";
const referenceHtml = (file?: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>` +
  readFileSync(file ?? new URL("../reference/model-to-metal.html", import.meta.url), "utf8") +
  `</body></html>`;

export async function openTarget(page: Page, target: Target, file?: string): Promise<void> {
  if (target === "reference") {
    const body = referenceHtml(file);
    await page.route(REFERENCE_URL, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body }));
    await page.goto(REFERENCE_URL);
  } else {
    await page.goto("/"); // baseURL: the `vite preview` server started by playwright.config.ts
  }
  await page.locator("#piers .lvl").first().waitFor();
}
