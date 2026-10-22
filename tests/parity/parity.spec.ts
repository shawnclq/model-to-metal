// Parity: the new build must show exactly what the reference showed, step by step (spec: plays the same).
//   npm run test:parity                              compare the new build with reference.json
//   PARITY_TARGET=reference npm run test:parity       compare the reference itself (sanity check of the test)
//   PARITY_TARGET=reference npm run parity:update     (re)record reference.json from the reference
//   PARITY_FILE=path/to/copy.html ...                 use another single-file build as "reference" (test of the test)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { openTarget, type Target } from "../targets.ts";
import { SCRIPT } from "./script.ts";
import { firstDifference, playScript, prepare, type Recording } from "./record.ts";

const target = (process.env.PARITY_TARGET ?? "build") as Target;
const file = new URL("./reference.json", import.meta.url);

test(`parity: ${target} plays the same as reference.json`, async ({ page }) => {
  await prepare(page);
  await openTarget(page, target, process.env.PARITY_FILE);
  // PARITY_ONLY=3 plays just the first N scenes (for timing and debugging the recorder itself).
  const scenes = process.env.PARITY_ONLY ? SCRIPT.slice(0, Number(process.env.PARITY_ONLY)) : SCRIPT;
  const got = await playScript(page, scenes);

  if (process.env.PARITY_UPDATE) {
    writeFileSync(file, JSON.stringify(got, null, 1) + "\n");
    return;
  }
  // Keep the actual recording next to the test output, for diffing by hand when something fails.
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/parity-actual.json", JSON.stringify(got, null, 1) + "\n");

  expect(existsSync(file), "tests/parity/reference.json is missing: record it first").toBe(true);
  const want = JSON.parse(readFileSync(file, "utf8")) as Recording;
  const diff = firstDifference(want, got);
  expect(diff, diff ?? "").toBeNull();
});
