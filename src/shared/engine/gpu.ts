import { GPUS } from "../data/hardware.ts";
import { ATT_EFF, DEC_EFF, DTYPES, KVDT, MEM_EFF, MODELS, PRE_EFF, RESERVE, activeP, kvTok } from "../data/models.ts";
import type { Gpu } from "../data/types.ts";
import type { GpuSetup } from "./inputs.ts";
/* ============ one GPU serving one model: memory, speed, cost, power ============ */
export function computeRate(g: Gpu, dt: string) {
  return dt === "fp8" ? g.fp8 : dt === "fp4" ? g.fp4 || g.bf16 : g.bf16;
}
/* INT4 weight-only: math runs in 16-bit */
export function w1(S: GpuSetup) {
  const g = GPUS[S.gpu],
    m = MODELS[S.model],
    d = DTYPES[S.dtype];
  const fp4bad = S.dtype === "fp4" && !g.fp4;
  const kvd = KVDT[S.kvdt || "bf16"],
    kvT = kvTok(m) * kvd.f,
    act = activeP(m);
  const wGB = (m.P * d.bytes) / 1e9,
    kvGB = (S.batch * S.ctx * kvT) / 1e9,
    used = wGB + kvGB + RESERVE;
  const fits = !fp4bad && used <= g.mem;
  const touched = m.moe ? 1 - Math.pow(1 - m.moe.k / m.moe.E, S.batch) : 1;
  const readGB = m.moe ? ((m.moe.nonExp + m.moe.expTotal * touched) * d.bytes) / 1e9 : wGB;
  const bwEff = g.bw * 1e12 * MEM_EFF,
    peakTF = computeRate(g, S.dtype),
    rate = peakTF * 1e12;
  const bytes = (readGB + kvGB) * 1e9,
    tMem = bytes / bwEff,
    flops = 2 * act * S.batch,
    tComp = flops / (rate * DEC_EFF);
  const step = Math.max(tMem, tComp),
    perUser = 1 / step,
    total = S.batch / step;
  const preFl = 2 * act * S.prompt,
    preG = preFl / (rate * PRE_EFF);
  const attFl = 2 * S.prompt * S.prompt * m.h * m.L,
    preA = attFl / (g.bf16 * 1e12 * ATT_EFF);
  const preM = (wGB * 1e9) / bwEff,
    ttft = Math.max(preG + preA, preM);
  const cost = (g.price / (total * 3600)) * 1e6;
  const bwUtil = bytes / step / (g.bw * 1e12),
    compUtil = flops / step / rate;
  const power = Math.min(g.tdp, g.tdp * (0.14 + 0.42 * bwUtil + 0.5 * compUtil)),
    tpk = (total * 3600) / (power / 1000);
  const I = flops / bytes,
    achTF = flops / step / 1e12,
    ridge = peakTF / g.bw;
  const preI = preFl / (readGB * 1e9),
    preTF = preFl / preG / 1e12;
  return {
    g,
    m,
    d,
    kvd,
    act,
    touched,
    readGB,
    fp4bad,
    kvT,
    wGB,
    kvGB,
    used,
    fits,
    bwEff,
    peakTF,
    rate,
    bytes,
    tMem,
    flops,
    tComp,
    step,
    perUser,
    total,
    preFl,
    preG,
    attFl,
    preA,
    preM,
    ttft,
    cost,
    bwUtil,
    compUtil,
    power,
    tpk,
    I,
    achTF,
    ridge,
    preI,
    preTF,
    bound: tMem >= tComp ? "memory" : "compute",
  };
}
export type W1Result = ReturnType<typeof w1>;
