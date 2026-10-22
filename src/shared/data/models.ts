import type { Dtype, Model } from "./types.ts";
// Model configs (from each model's config.json), precisions, and the modelling constants every world uses.
/* Qwen3-235B-A22B is a mixture-of-experts model: 94 layers, 64 Q / 4 KV heads, 128 experts, 8 per token. */
export const MODELS: Record<string, Model> = {
  "llama-1b": {
    key: "llama-1b",
    name: "Llama 3.2 1B",
    P: 1.24e9,
    L: 16,
    h: 2048,
    inter: 8192,
    heads: 32,
    kvh: 8,
    hd: 64,
    vocab: 128256,
    tied: true,
  },
  "llama-8b": {
    key: "llama-8b",
    name: "Llama 3.1 8B",
    P: 8.03e9,
    L: 32,
    h: 4096,
    inter: 14336,
    heads: 32,
    kvh: 8,
    hd: 128,
    vocab: 128256,
  },
  "llama-70b": {
    key: "llama-70b",
    name: "Llama 3.1 70B",
    P: 70.6e9,
    L: 80,
    h: 8192,
    inter: 28672,
    heads: 64,
    kvh: 8,
    hd: 128,
    vocab: 128256,
  },
  "llama-405b": {
    key: "llama-405b",
    name: "Llama 3.1 405B",
    P: 405.8e9,
    L: 126,
    h: 16384,
    inter: 53248,
    heads: 128,
    kvh: 8,
    hd: 128,
    vocab: 128256,
  },
  "qwen-235b": {
    key: "qwen-235b",
    name: "Qwen3 235B-A22B",
    P: 235e9,
    L: 94,
    h: 4096,
    inter: 12288,
    heads: 64,
    kvh: 4,
    hd: 128,
    vocab: 151936,
    moe: { E: 128, k: 8, expTotal: 227e9, nonExp: 8e9, active: 22.2e9 },
  },
};
export const MODEL_ALIAS: Record<string, string> = {
  "1b": "llama-1b",
  "8b": "llama-8b",
  "70b": "llama-70b",
  "405b": "llama-405b",
  "llama-3.2-1b": "llama-1b",
  "llama-3.1-8b": "llama-8b",
  "llama-3.1-70b": "llama-70b",
  "llama-3.1-405b": "llama-405b",
  qwen: "qwen-235b",
  qwen3: "qwen-235b",
  "qwen3-235b": "qwen-235b",
  moe: "qwen-235b",
};
export const kvTok = (m: Model) => 2 * m.L * m.kvh * m.hd * 2;
export const activeP = (m: Model) => (m.moe ? m.moe.active : m.P);
/* bytes per token, K and V, 16-bit */
export const DTYPES: Record<string, Dtype> = {
  bf16: { key: "bf16", name: "BF16", bytes: 2, q: "Reference quality", tier: 3 },
  fp8: { key: "fp8", name: "FP8", bytes: 1, q: "Near-reference quality", tier: 3 },
  int4: { key: "int4", name: "INT4", bytes: 0.5, q: "Some quality loss: test on your task", tier: 2, weightOnly: true },
  fp4: {
    key: "fp4",
    name: "FP4",
    bytes: 0.5,
    q: "Some quality loss: needs calibration (NVFP4)",
    tier: 2,
    blackwell: true,
  },
};
export const DT_ORDER = ["bf16", "fp8", "int4", "fp4"];
export const KVDT: Record<string, { name: string; f: number }> = {
  bf16: { name: "16-bit", f: 1 },
  fp8: { name: "FP8", f: 0.5 },
};
export const BATCH_STEPS = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256];
export const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 131072];
export const PROMPT_STEPS = [512, 2048, 8192, 16384, 32768];
export const RESERVE = 3,
  MEM_EFF = 0.8,
  DEC_EFF = 0.6,
  PRE_EFF = 0.65,
  ATT_EFF = 0.5;
