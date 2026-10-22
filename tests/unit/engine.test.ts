// The ported maths must give exactly the reference's numbers (spec: plays the same).
// The reference runs in jsdom as classic scripts; the port is imported as modules.
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";
import { w1 } from "../../src/shared/engine/gpu.ts";
import type { GpuSetup } from "../../src/shared/engine/inputs.ts";

let ref: (expr: string) => unknown;
beforeAll(async () => {
  const html = readFileSync(new URL("../../reference/model-to-metal.html", import.meta.url), "utf8");
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://reference.test/",
    virtualConsole: new VirtualConsole(),
  });
  await new Promise((r) => setTimeout(r, 200));
  ref = (expr) => dom.window.eval(expr);
});

// Plain numbers only: the result also carries the GPU/model objects, which are compared through their numbers.
const numbers = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v !== "object"));

const cases = [
  { gpu: "h100", model: "llama-8b", dtype: "bf16", kvdt: "bf16", batch: 1, ctx: 4096, prompt: 2048 },
  { gpu: "h200", model: "llama-70b", dtype: "fp8", kvdt: "fp8", batch: 32, ctx: 8192, prompt: 16384 },
  { gpu: "b200", model: "qwen-235b", dtype: "fp4", kvdt: "bf16", batch: 64, ctx: 4096, prompt: 2048 },
  { gpu: "mi300x", model: "llama-405b", dtype: "fp8", kvdt: "bf16", batch: 8, ctx: 32768, prompt: 512 },
];

describe("w1() matches the reference", () => {
  for (const c of cases) {
    it(`${c.gpu} · ${c.model} · ${c.dtype} · batch ${c.batch}`, () => {
      const want = ref(
        `(() => { const r = w1(${JSON.stringify(c)}); return Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v !== "object")); })()`,
      );
      const got = numbers(w1(c as GpuSetup) as unknown as Record<string, unknown>);
      expect(got).toEqual(want);
    });
  }
});
