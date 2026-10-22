// The shared data tables must equal the reference game's tables exactly, as they stand once every script
// has loaded (spec: plays the same). JSON comparison also pins key order, which some screens iterate.
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";
import * as format from "../../src/shared/data/format.ts";
import * as hardware from "../../src/shared/data/hardware.ts";
import * as models from "../../src/shared/data/models.ts";
import * as stack from "../../src/shared/data/stack.ts";
import * as info from "../../src/shared/data/info.ts";
import * as colors from "../../src/shared/ui/colors.ts";

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
  ref = (expr) => JSON.parse(dom.window.eval(`JSON.stringify(${expr})`) as string);
});

const tables: Record<string, unknown> = {
  GPUS: hardware.GPUS,
  GPU_ORDER: hardware.GPU_ORDER,
  NV_GPUS: hardware.NV_GPUS,
  ALL_GPUS: hardware.ALL_GPUS,
  SERVERS: hardware.SERVERS,
  DRIVERS: hardware.DRIVERS,
  MODELS: models.MODELS,
  MODEL_ALIAS: models.MODEL_ALIAS,
  DTYPES: models.DTYPES,
  DT_ORDER: models.DT_ORDER,
  KVDT: models.KVDT,
  BATCH_STEPS: models.BATCH_STEPS,
  CTX_STEPS: models.CTX_STEPS,
  PROMPT_STEPS: models.PROMPT_STEPS,
  "[RESERVE, MEM_EFF, DEC_EFF, PRE_EFF, ATT_EFF]": [
    models.RESERVE,
    models.MEM_EFF,
    models.DEC_EFF,
    models.PRE_EFF,
    models.ATT_EFF,
  ],
  LAYERS: stack.LAYERS,
  STACK_COVER: stack.STACK_COVER,
  INFO: info.INFO,
  GLOSS: info.GLOSS,
  TCOL: colors.TCOL,
};

describe("shared data equals the reference's final tables", () => {
  for (const [name, value] of Object.entries(tables)) {
    it(name, () => expect(JSON.stringify(value)).toBe(JSON.stringify(ref(name))));
  }
  it("inspect aliases: every name the reference understands maps to the same entry", () => {
    // The reference builds this map inside inspect(): a built-in table plus inspectMap(). Rebuild it the same way.
    const want = ref(
      `(() => { const m = {sm:"sm",sms:"sm",tensor:"sm","tensor-cores":"sm",hbm:"hbm",memory:"hbm",bandwidth:"bw",bw:"bw",link:"link",code:"code",python:"code",pytorch:"torch",torch:"torch",libraries:"lib",library:"lib",lib:"lib",cublas:"lib",runtime:"runtime",cuda:"runtime",driver:"driver",gpu:"gpu",hardware:"gpu"}; return Object.assign(m, inspectMap()); })()`,
    );
    expect(info.INSPECT_ALIASES).toEqual(want);
  });
  it("formatters give the reference's text", () => {
    const samples = [0, 0.5, 1.25, 999.5, 1234.567, 1e6, 2.5e-7, Infinity];
    for (const n of samples) {
      expect([format.f0(n), format.f1(n), format.f2(n), format.fmtT(n), format.fmtMoney(n), format.kfmt(n)]).toEqual(
        ref(`[f0(${n}), f1(${n}), f2(${n}), fmtT(${n}), fmtMoney(${n}), kfmt(${n})]`),
      );
    }
  });
});

// Data used by only one world. It still lives in src/legacy and moves into that world's pack in group 6;
// checked here because a broken table (e.g. an empty MIG_ID) can hide from the parity replay.
import * as w1data from "../../src/legacy/3b-data.ts";
import * as w2data from "../../src/legacy/3-data.ts";
describe("world-only data equals the reference's final tables", () => {
  const world: Record<string, unknown> = {
    MIGP: w1data.MIGP,
    MIG_ID: w1data.MIG_ID,
    MIG_PRESETS: w1data.MIG_PRESETS,
    TENANTS: w1data.TENANTS,
    TP_STEPS: w1data.TP_STEPS,
    NETS: w1data.NETS,
    IMAGES: w2data.IMAGES,
    STACK2: w2data.STACK2,
  };
  for (const [name, value] of Object.entries(world)) {
    it(name, () => expect(JSON.stringify(value)).toBe(JSON.stringify(ref(name))));
  }
});
