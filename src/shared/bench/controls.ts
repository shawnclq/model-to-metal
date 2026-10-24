import { $, esc, f2, kfmt } from "../data/format.ts";
import { GPUS, NV_GPUS } from "../data/hardware.ts";
import { BATCH_STEPS, CTX_STEPS, DTYPES, DT_ORDER, MODELS, PROMPT_STEPS } from "../data/models.ts";
import { seg } from "../ui/controls.ts";
import { host } from "../host.ts";
// The GPU bench's controls (Worlds 1 and 3, the GPU and server labs): one renderer per control name.
// renderCtrls() calls them in the same order as before, between world-specific controls.
import type { GpuSetup } from "../engine/inputs.ts";

/** What the bench controls read: the bench setup, plus the world (labels differ in World 3). */
export type BenchView = GpuSetup & { world: number; kvdt: string };
/** The open level's choices: which GPUs it offers. */
export interface BenchLevel {
  gpus?: string[];
}
/** The worlds whose state has a GPU bench (the bench controls appear only in their levels). */
export function hasBench(S: { world: number }): S is BenchView {
  return S.world === 1 || S.world === 3 || S.world === 4;
}
export type BenchControl = "gpu" | "model" | "kv" | "dtype" | "batch" | "ctx" | "prompt";

export const BENCH_CONTROLS: Record<BenchControl, (S: BenchView, L: BenchLevel, lk: Record<string, string>) => string> =
  {
    gpu: (S, L, lk) =>
      seg(
        "GPU",
        "gpu",
        (L.gpus || NV_GPUS).map((k) => ({
          v: k,
          l: GPUS[k].name.replace(" SXM", ""),
          s: "$" + f2(GPUS[k].price) + "/hr",
          cmd: "foundry gpu " + k,
        })),
        S.gpu,
        lk.gpu,
      ),

    model: (S, L, lk) =>
      `<div class="ctl${lk.model ? " locked" : ""}" title="${esc(lk.model || "")}"><span>Model</span><select id="selModel" ${lk.model ? "disabled" : ""}>${(S.world === 1 || S.world === 3 ? ["llama-8b", "llama-70b", "llama-405b", "qwen-235b"] : ["llama-70b", "llama-405b"]).map((k) => `<option value="${k}" ${k === S.model ? "selected" : ""}>${MODELS[k].name}</option>`).join("")}</select></div>`,

    kv: (S, L, lk) =>
      seg(
        "KV cache",
        "kvdt",
        [
          { v: "bf16", l: "16-bit", cmd: "foundry kv bf16" },
          { v: "fp8", l: "FP8", cmd: "foundry kv fp8" },
        ],
        S.kvdt || "bf16",
        lk.kvdt,
      ),

    dtype: (S, L, lk) =>
      seg(
        "Precision",
        "dtype",
        DT_ORDER.map((k) => ({ v: k, l: DTYPES[k].name, s: DTYPES[k].bytes + " B/param", cmd: "foundry dtype " + k })),
        S.dtype,
        lk.dtype,
      ),

    batch: (S, L, lk) => {
      const i = Math.max(0, BATCH_STEPS.indexOf(S.batch));
      return `<div class="ctl${lk.batch ? " locked" : ""}" title="${esc(lk.batch || "")}"><span>${S.world === 3 ? "Users per replica" : "Users at once"}</span><div class="range"><input type="range" id="rngBatch" min="0" max="${BATCH_STEPS.length - 1}" step="1" value="${BATCH_STEPS.includes(S.batch) ? i : BATCH_STEPS.findIndex((b) => b >= S.batch)}" ${lk.batch ? "disabled" : ""} aria-label="Users at once"><output id="outBatch">${S.batch}</output></div></div>`;
    },

    ctx: (S, L, lk) =>
      seg(
        "Context per user",
        "ctx",
        CTX_STEPS.map((v) => ({ v, l: kfmt(v), cmd: "foundry context " + v })),
        S.ctx,
        lk.ctx,
      ),

    prompt: (S, L, lk) =>
      seg(
        "Prompt",
        "prompt",
        PROMPT_STEPS.map((v) => ({ v, l: kfmt(v), cmd: "foundry prompt " + v })),
        S.prompt,
        lk.prompt,
      ),
  };

/** Hook up the bench controls that aren't plain buttons: the model picker and the users slider. */
export function bindBenchControls() {
  const sm = $<HTMLSelectElement>("#selModel");
  if (sm) sm.onchange = () => host.exec("foundry load " + sm.value);
  const rb = $<HTMLInputElement>("#rngBatch");
  if (rb) {
    rb.oninput = () => {
      $("#outBatch").textContent = String(BATCH_STEPS[Number(rb.value)]);
    };
    rb.onchange = () => host.exec("foundry batch " + BATCH_STEPS[Number(rb.value)]);
  }
}
