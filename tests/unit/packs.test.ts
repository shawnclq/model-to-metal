// Each world pack keeps its side of the contract (spec: each pack matches its entry in the list of worlds).
// Guard answers (what other worlds say for this world's commands) are checked exactly by the parity sweep.
import { describe, expect, it } from "vitest";
import { finaliseLevels, levelMismatches } from "../../src/core/catalog.ts";
import { MANIFEST } from "../../src/core/manifest.ts";
import type { WorldPack } from "../../src/core/types.ts";
import { BENCH_CONTROLS } from "../../src/shared/bench/controls.ts";
import { PACK as W0 } from "../../src/packs/w0-model/index.ts";
import { PACK as W1 } from "../../src/packs/w1-gpu/index.ts";
import { PACK as W2 } from "../../src/packs/w2-software/index.ts";
import { PACK as W3 } from "../../src/packs/w3-server/index.ts";
import { PACK as W4 } from "../../src/packs/w4-cluster/index.ts";

const PACKS: WorldPack[] = [W0, W1, W2, W3, W4];

describe.each(PACKS.map((p) => [p.world, p] as const))("World %i pack", (world, pack) => {
  finaliseLevels();
  const entry = MANIFEST.find((W) => W.world === world)!;

  it("its levels match its manifest entry exactly", () => {
    expect(pack.levels).toBeDefined();
    expect(levelMismatches(world, pack.levels!)).toEqual([]);
    expect(pack.levels!.every((l) => l.world === world)).toBe(true);
  });

  it("its lab matches its manifest entry", () => {
    expect(pack.lab ? { id: pack.lab.id, title: pack.lab.title } : undefined).toEqual(entry.lab);
  });

  it("can draw every control its levels and lab ask for, in its control order", () => {
    const asked = new Set([...pack.levels!, ...(pack.lab ? [pack.lab] : [])].flatMap((l) => l.controls ?? []));
    for (const name of asked) {
      expect(pack.controlOrder, `control order lacks "${name}"`).toContain(name);
      expect(name in pack.controls || name in BENCH_CONTROLS, `nothing draws "${name}"`).toBe(true);
    }
  });

  it("every inspectable part has an inspect entry and the hint is set", async () => {
    const { INFO } = await import("../../src/shared/data/info.ts");
    for (const k of pack.inspectable) expect(INFO[k], `INFO lacks "${k}"`).toBeDefined();
    expect(pack.inspectHint.length).toBeGreaterThan(0);
  });
});

// Every level's text and data (briefs, goal wording, hints, quiz questions, chips, locks …) must equal the
// reference's final level, after all of the single file's splices and patches. Functions are compared by
// behaviour in the parity test instead.
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
describe("pack levels equal the reference's levels (text and data)", async () => {
  const html = readFileSync(new URL("../../reference/model-to-metal.html", import.meta.url), "utf8");
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://reference.test/",
    virtualConsole: new VirtualConsole(),
  });
  await new Promise((r) => setTimeout(r, 200));
  // JSON drops functions; position and number are worked out by each build, so leave them out.
  const data = (x: unknown) => JSON.stringify(x, (k, v) => (k === "idx" || k === "n" ? undefined : v));
  for (const pack of PACKS) {
    it(`World ${pack.world}`, () => {
      const want = dom.window.eval(
        `JSON.stringify({ levels: LEVELS.filter(l => l.world === ${pack.world}), lab: LABS[${pack.world}] }, (k, v) => (k === "idx" || k === "n" ? undefined : v))`,
      ) as string;
      expect(data({ levels: pack.levels, lab: pack.lab })).toBe(want);
    });
  }
});
