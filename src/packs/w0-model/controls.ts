import type { ControlRenderer } from "../../core/types.ts";
import { GEN_OUT, HEAD_DESIGNS, W0_MODELS } from "./engine.ts";
import { state } from "./state.ts";
import { MODELS } from "../../shared/data/models.ts";
import { seg } from "../../shared/ui/controls.ts";
// World 0's controls, one renderer per name.
export const CONTROLS: Record<string, ControlRenderer> = {
  model0: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("model0"))
      h += seg(
        "Model",
        "model",
        W0_MODELS.map((k) => ({ v: k, l: MODELS[k].name.replace("Llama ", ""), cmd: "params " + k })),
        S.model,
      );
    return h;
  },
  head: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("head"))
      h += seg(
        "Attention head",
        "head",
        [
          { v: 1, l: "Head 1", s: "meaning", cmd: "head 1" },
          { v: 2, l: "Head 2", s: "previous word", cmd: "head 2" },
        ],
        S.att.head,
      );
    return h;
  },
  cache: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("cache"))
      h += seg(
        "KV cache",
        "cache",
        [
          { v: false, l: "Off", cmd: "kv off" },
          { v: true, l: "On", cmd: "kv on" },
        ],
        S.gen.cache,
      );
    return h;
  },
  gen: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("gen"))
      h += `<div class="ctl"><span>Generate</span><div class="seg" role="group" aria-label="Generate"><button type="button" class="on" data-cmd="generate step" ${S.gen.k >= GEN_OUT.length ? "disabled" : ""}>Next step</button><button type="button" data-cmd="generate all" ${S.gen.k >= GEN_OUT.length ? "disabled" : ""}>Run all</button><button type="button" data-cmd="generate reset">Reset</button></div></div>`;
    return h;
  },
  moebatch: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("moebatch"))
      h += seg(
        "Tokens at once",
        "moebatch",
        [1, 4, 8, 16, 32, 64].map((b) => ({ v: b, l: String(b), cmd: "batch " + b })),
        S.moe.batch,
      );
    return h;
  },
  hdesign: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("hdesign"))
      h += seg(
        "Design",
        "hdesign",
        ["mha", "gqa", "mqa"].map((k) => ({
          v: k,
          l: HEAD_DESIGNS[k].name.split(" (")[0],
          s: HEAD_DESIGNS[k].n + " KV head" + (HEAD_DESIGNS[k].n > 1 ? "s" : ""),
          cmd: "heads " + k,
        })),
        S.hd.design,
      );
    return h;
  },
};
/** World 0's controls in the order they appear. */
export const CONTROL_ORDER = ["model0", "head", "cache", "gen", "moebatch", "hdesign"];
