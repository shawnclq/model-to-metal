import { GPUS } from "../data/hardware.ts";
import { ATT_EFF, MEM_EFF, MODELS, PRE_EFF, RESERVE, kvTok } from "../data/models.ts";
import type { Model } from "../data/types.ts";
import type { KernelSetup } from "./inputs.ts";
/** One GPU kernel on the World 2 timeline. s/e (start/end, µs or ms) are filled in when the timeline is laid out. */
export interface Kernel {
  n: string;
  k: string;
  t: number;
  b?: number;
  s?: number;
  e?: number;
  layerEnd?: number;
}
/* ============ kernels on an H100: one decode step, or a whole prefill ============ */
export const W2G = GPUS.h100,
  W2BW = W2G.bw * 1e12 * MEM_EFF,
  CPU_LAUNCH = 18,
  GRAPH_LAUNCH = 15,
  MINK = 2.5;
export function nonEmbed(m: Model) {
  return m.P - (m.tied ? 1 : 2) * m.vocab * m.h;
}
export function layerMats(m: Model) {
  return {
    qkv: m.h * (m.heads * m.hd + 2 * m.kvh * m.hd),
    o: m.heads * m.hd * m.h,
    gu: 2 * m.h * m.inter,
    dn: m.inter * m.h,
  };
}
export function decodeKernels(S: KernelSetup) {
  const m = MODELS[S.model],
    M = layerMats(m),
    us = (b: number) => (b / W2BW) * 1e6;
  const kvL = S.ctx * m.kvh * m.hd * 2 * 2;
  const G = (n: string, p: number): Kernel => ({ n, k: "g", t: Math.max(MINK, us(p * 2)) + 1, b: p * 2 });
  const E = (n: string): Kernel => ({ n, k: "e", t: MINK, b: 0 });
  const A = (n: string, b: number): Kernel => ({ n, k: "a", t: us(b) + 3, b });
  const out: Kernel[] = [];
  for (let l = 0; l < m.L; l++) {
    const att: Kernel[] = S.flash
      ? [A("flash_attn", kvL)]
      : [A("attn_scores", kvL / 2), { n: "softmax", k: "a", t: MINK, b: 0 }, A("attn_values", kvL / 2)];
    if (S.fuse)
      out.push(
        E("add_rmsnorm"),
        G("qkv_proj", M.qkv),
        E("rope"),
        ...att,
        G("o_proj", M.o),
        E("add_rmsnorm"),
        G("gate_up_proj", M.gu),
        E("silu_and_mul"),
        G("down_proj", M.dn),
      );
    else
      out.push(
        E("rmsnorm"),
        G("qkv_proj", M.qkv),
        E("rope"),
        ...att,
        G("o_proj", M.o),
        E("add"),
        E("rmsnorm"),
        G("gate_up_proj", M.gu),
        E("silu"),
        E("mul"),
        G("down_proj", M.dn),
        E("add"),
      );
    out[out.length - 1].layerEnd = l;
  }
  out.push(E("final_norm"), G("lm_head", m.vocab * m.h), E("argmax"));
  return out;
}
export function w2decode(S: KernelSetup) {
  const ks = decodeKernels(S);
  let ge = 0,
    sum = 0;
  const cpu: [number, number][] = [];
  ks.forEach((k, i) => {
    let ready: number;
    if (S.graphs) {
      ready = GRAPH_LAUNCH;
    } else {
      ready = CPU_LAUNCH * (i + 1);
      cpu.push([CPU_LAUNCH * i, CPU_LAUNCH * (i + 1)]);
    }
    const st = Math.max(ready, ge + (S.graphs ? 0.6 : 1));
    k.s = st;
    k.e = st + k.t;
    ge = k.e;
    sum += k.t;
  });
  const step = ge,
    busy = sum / step,
    cpuT = S.graphs ? GRAPH_LAUNCH : CPU_LAUNCH * ks.length;
  return { ks, cpu, step, busy, sum, cpuT, n: ks.length, tps: 1e6 / step };
}
export function w2prefill(S: KernelSetup) {
  const m = MODELS[S.model],
    N = S.prompt,
    M = layerMats(m),
    peak = W2G.bf16 * 1e12;
  const wGB = (m.P * 2) / 1e9,
    kvGB = (N * kvTok(m)) / 1e9,
    free = W2G.mem - wGB - kvGB - RESERVE;
  const gemmFl = 2 * nonEmbed(m) * N,
    gemm = gemmFl / (peak * PRE_EFF);
  const attFl = 2 * N * N * m.h * m.L;
  const scoresGB = (m.heads * N * N * 2) / 1e9;
  const nE = S.fuse ? 4 : 7,
    elemB = nE * m.L * (2 * N * m.h * 2),
    elem = elemB / W2BW;
  let oom = false,
    attn: number,
    attnTraffic = 0;
  if (S.flash) {
    attn = attFl / (peak * ATT_EFF);
  } else {
    if (scoresGB > free) oom = true;
    attnTraffic = 4 * scoresGB * 1e9 * m.L;
    attn = attFl / (peak * 0.4) + attnTraffic / W2BW;
  }
  const ttft = gemm + attn + elem;
  /* one layer's kernels at ms scale */
  const tot = M.qkv + M.o + M.gu + M.dn,
    gl = gemm / m.L,
    el = elem / (nE * m.L),
    al = attn / m.L,
    ms = (x: number) => x * 1e3;
  const G = (n: string, p: number): Kernel => ({ n, k: "g", t: ms((gl * p) / tot) }),
    E = (n: string): Kernel => ({ n, k: "e", t: ms(el) });
  let att: Kernel[];
  if (S.flash) att = [{ n: "flash_attn", k: "a", t: ms(al) }];
  else if (oom) att = [{ n: "attn_scores · OOM", k: "x", t: ms(gl) }];
  else {
    const f = attFl / m.L / (peak * 0.4),
      tr = attnTraffic / m.L / W2BW;
    att = [
      { n: "attn_scores", k: "a", t: ms(f / 2 + tr / 4) },
      { n: "softmax", k: "a", t: ms(tr / 2) },
      { n: "attn_values", k: "a", t: ms(f / 2 + tr / 4) },
    ];
  }
  const layer = S.fuse
    ? [
        E("add_rmsnorm"),
        G("qkv_proj", M.qkv),
        E("rope"),
        ...att,
        G("o_proj", M.o),
        E("add_rmsnorm"),
        G("gate_up_proj", M.gu),
        E("silu_and_mul"),
        G("down_proj", M.dn),
      ]
    : [
        E("rmsnorm"),
        G("qkv_proj", M.qkv),
        E("rope"),
        ...att,
        G("o_proj", M.o),
        E("add"),
        E("rmsnorm"),
        G("gate_up_proj", M.gu),
        E("silu"),
        E("mul"),
        G("down_proj", M.dn),
        E("add"),
      ];
  let t = 0;
  layer.forEach((k) => {
    k.s = t;
    k.e = t + k.t;
    t = k.e;
  });
  return { N, wGB, kvGB, free, gemm, gemmFl, attFl, attn, elem, elemB, nE, scoresGB, oom, ttft, layer, attnTraffic };
}
export function w2used(S: KernelSetup) {
  const m = MODELS[S.model];
  const n = S.mode === "prefill" ? S.prompt : S.ctx;
  return (m.P * 2) / 1e9 + (n * kvTok(m)) / 1e9 + RESERVE;
}
export type W2Decode = ReturnType<typeof w2decode>;
export type W2Prefill = ReturnType<typeof w2prefill>;
