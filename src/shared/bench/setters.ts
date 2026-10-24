import type { W1State, W2State, W3State, W4State } from "../../core/types.ts";
import { f0, f1, f2, parseNum } from "../data/format.ts";
import { GPUS, GPU_ORDER, NV_GPUS } from "../data/hardware.ts";
import { DTYPES, MODELS, MODEL_ALIAS } from "../data/models.ts";
import { host } from "../host.ts";
// Changing the bench: GPU, model, precision and the numeric knobs (users, context, prompt).
export function setGpu(v: string | undefined) {
  const S = host.G.S!;
  v = String(v || "")
    .toLowerCase()
    .replace(/^nvidia-/, "")
    .replace(/-?sxm$/, "");
  if (!GPUS[v]) {
    host.err(`Unknown GPU "${v}". Options: ${GPU_ORDER.join(", ")}`);
    return false;
  }
  if (S.world !== 1) {
    host.err("The kernel lab runs on an H100.");
    return false;
  }
  if (!(host.G.level!.gpus || NV_GPUS).includes(v)) {
    host.err(
      `${GPUS[v].name} is not offered in this level. AMD GPUs appear in "Team red", "Pick the GPU" and the GPU lab.`,
    );
    return false;
  }
  if (v === S.gpu) {
    host.print(`Already on ${GPUS[v].name}.`, "dim");
    return true;
  }
  if (host.locked("gpu")) return false;
  S.gpu = v;
  const g = GPUS[v];
  host.print(
    `GPU: ${g.vendor === "amd" ? "AMD " : ""}${g.name} · ${g.arch} · ${g.mem} GB ${g.hbm} · ${g.bw} TB/s · ${f0(g.fp8)} TFLOPS FP8 · $${f2(g.price)}/hr (illustrative)`,
    "dim",
  );
  return true;
}
export function setModel(v: string | undefined) {
  const S = host.G.S!;
  v = String(v || "").toLowerCase();
  v = MODEL_ALIAS[v] || v;
  if (!MODELS[v]) {
    host.err(`Unknown model "${v}". Options: ${Object.keys(MODELS).join(", ")}`);
    return false;
  }
  if (S.world === 2 && !["llama-1b", "llama-8b"].includes(v)) {
    host.err("The kernel lab uses llama-1b or llama-8b.");
    return false;
  }
  if (S.world === 1 && v === "llama-1b") {
    host.err("World 1 uses llama-8b, llama-70b or llama-405b.");
    return false;
  }
  if (v !== S.model && host.locked("model")) return false;
  S.model = v;
  if (v === "llama-8b") S.flags.saw8b = true;
  host.print(`Loaded ${MODELS[v].name} (${f1(MODELS[v].P / 1e9)} B parameters)`, "dim");
  return true;
}
export function setDtype(v: string | undefined) {
  const S = host.G.S!;
  v = String(v || "")
    .toLowerCase()
    .replace("nvfp4", "fp4")
    .replace("fp16", "bf16");
  if (!DTYPES[v]) {
    host.err(`Unknown precision "${v}". Options: bf16, fp8, int4, fp4`);
    return false;
  }
  if (S.world !== 1) {
    host.err("The kernel lab runs in BF16.");
    return false;
  }
  if (v !== S.dtype && host.locked("dtype")) return false;
  S.dtype = v;
  return true;
}
/** Worlds whose bench has users, context and prompt length. */
export type NumState = W1State | W2State | W3State | W4State;
export function setNum(
  S: NumState,
  key: "batch" | "ctx" | "prompt",
  v: string | undefined,
  min: number,
  max: number,
  label: string,
) {
  const n = parseNum(v);
  if (!isFinite(n) || n < min || n > max) {
    host.err(`${label} must be a number from ${f0(min)} to ${f0(max)}${key !== "batch" ? " (you can write 8k)" : ""}.`);
    return false;
  }
  if (n !== S[key] && host.locked(key)) return false;
  S[key] = n;
  if (key === "prompt" && S.world === 1 && S.ctx < n) {
    S.ctx = n;
    host.print(`(context raised to ${f0(n)} so the prompt fits)`, "dim");
  }
  if (key === "ctx" && S.world === 1 && S.prompt > n) {
    S.prompt = n;
    host.print(`(prompt lowered to ${f0(n)} to fit the context)`, "dim");
  }
  if (key === "prompt" && S.world === 2) S.ctx = Math.max(S.ctx, n);
  return true;
}
