import { state } from "./state.ts";
import { kfmt } from "../../shared/data/format.ts";
import { MODELS } from "../../shared/data/models.ts";
import { seg } from "../../shared/ui/controls.ts";
// World 2's controls, one renderer per name, in the order they appear.
import type { ControlRenderer } from "../../core/types.ts";
export const CONTROLS: Record<string, ControlRenderer> = {
  model2: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("model2"))
      h += seg(
        "Model",
        "model",
        ["llama-1b", "llama-8b"].map((k) => ({
          v: k,
          l: MODELS[k].name.replace("Llama ", ""),
          cmd: "foundry load " + k,
        })),
        S.model,
        lk.model,
      );
    return h;
  },
  mode: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("mode"))
      h += seg(
        "Phase",
        "mode",
        [
          { v: "decode", l: "Decode", s: "1 token at a time", cmd: "foundry mode decode" },
          { v: "prefill", l: "Prefill", s: "read a prompt", cmd: "foundry mode prefill" },
        ],
        S.mode,
      );
    return h;
  },
  prompt2: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("prompt2") && S.mode === "prefill")
      h += seg(
        "Prompt",
        "prompt",
        [4096, 8192, 16384, 32768].map((v) => ({ v, l: kfmt(v), cmd: "foundry prompt " + v })),
        S.prompt,
      );
    return h;
  },
  graphs: (C, lk) => {
    const S = state();
    let h = "";
    const tog = (k: "graphs" | "fuse" | "flash", l: string) =>
      seg(
        l,
        k,
        [
          { v: false, l: "Off", cmd: `foundry ${k} off` },
          { v: true, l: "On", cmd: `foundry ${k} on` },
        ],
        !!S[k],
      ).replace("<span>" + l + "</span>", `<span>${l}</span>`);
    if (C.includes("graphs")) h += tog("graphs", "CUDA Graphs");
    return h;
  },
  fuse: (C, lk) => {
    const S = state();
    let h = "";
    const tog = (k: "graphs" | "fuse" | "flash", l: string) =>
      seg(
        l,
        k,
        [
          { v: false, l: "Off", cmd: `foundry ${k} off` },
          { v: true, l: "On", cmd: `foundry ${k} on` },
        ],
        !!S[k],
      ).replace("<span>" + l + "</span>", `<span>${l}</span>`);
    if (C.includes("fuse")) h += tog("fuse", "Kernel fusion");
    return h;
  },
  flash: (C, lk) => {
    const S = state();
    let h = "";
    const tog = (k: "graphs" | "fuse" | "flash", l: string) =>
      seg(
        l,
        k,
        [
          { v: false, l: "Off", cmd: `foundry ${k} off` },
          { v: true, l: "On", cmd: `foundry ${k} on` },
        ],
        !!S[k],
      ).replace("<span>" + l + "</span>", `<span>${l}</span>`);
    if (C.includes("flash")) h += tog("flash", "FlashAttention");
    return h;
  },
};
export const CONTROL_ORDER = ["model2", "mode", "prompt2", "graphs", "fuse", "flash"];
