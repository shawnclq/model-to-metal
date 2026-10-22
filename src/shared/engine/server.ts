import { GPUS, SERVERS } from "../data/hardware.ts";
import { ATT_EFF, DEC_EFF, DTYPES, KVDT, MEM_EFF, MODELS, PRE_EFF, RESERVE, activeP, kvTok } from "../data/models.ts";
import type { Dtype, Model } from "../data/types.ts";
import { computeRate } from "./gpu.ts";
import type { ServerSetup } from "./inputs.ts";
/** Anything a collective can run over: a server's GPU links or the network. */
export interface Link {
  bw: number;
  lat: number;
}
/* ============ one 8-GPU server: tensor-parallel groups and all-reduce time ============ */
export function arTime(n: number, msg: number, link: Link) {
  if (n <= 1) return 0;
  return link.lat * (1 + 0.15 * (n - 2)) + (((2 * (n - 1)) / n) * msg) / link.bw;
}
export function readGBof(m: Model, d: Dtype, batch: number) {
  const t = m.moe ? 1 - Math.pow(1 - m.moe.k / m.moe.E, batch) : 1;
  return m.moe ? ((m.moe.nonExp + m.moe.expTotal * t) * d.bytes) / 1e9 : (m.P * d.bytes) / 1e9;
}
export function w3(S: ServerSetup) {
  const srv = SERVERS[S.srv],
    g = GPUS[srv.gpu!],
    m = MODELS[S.model],
    d = DTYPES[S.dtype],
    tp = S.tp,
    rep = 8 / tp,
    act = activeP(m);
  const kvT = kvTok(m) * KVDT[S.kvdt || "bf16"].f;
  const wPer = (m.P * d.bytes) / 1e9 / tp,
    kvPer = (S.batch * S.ctx * kvT) / 1e9 / tp,
    usedPer = wPer + kvPer + RESERVE,
    fits = usedPer <= g.mem && !(S.dtype === "fp4" && !g.fp4);
  const rate = computeRate(g, S.dtype) * 1e12,
    bwEff = g.bw * 1e12 * MEM_EFF;
  const readPer = readGBof(m, d, S.batch) / tp;
  const tMem = ((readPer + kvPer) * 1e9) / bwEff,
    tComp = (2 * act * S.batch) / tp / (rate * DEC_EFF);
  const nAR = 2 * m.L,
    arDec = arTime(tp, S.batch * m.h * 2, srv),
    tComm = nAR * arDec;
  const step = Math.max(tMem, tComp) + tComm,
    perUser = 1 / step,
    repT = S.batch / step,
    total = rep * repT;
  const preC =
    (2 * act * S.prompt) / (tp * rate * PRE_EFF) +
    (2 * S.prompt * S.prompt * m.h * m.L) / (tp * g.bf16 * 1e12 * ATT_EFF);
  const arPre = arTime(tp, S.prompt * m.h * 2, srv),
    preComm = nAR * arPre,
    ttft = preC + preComm;
  const cost = (srv.price / (total * 3600)) * 1e6;
  const linkUtil = tp > 1 ? Math.min(1, ((((nAR * 2 * (tp - 1)) / tp) * S.batch * m.h * 2) / step / srv.bw) * 6) : 0;
  return {
    g,
    srv,
    m,
    d,
    tp,
    rep,
    act,
    kvT,
    wPer,
    kvPer,
    usedPer,
    fits,
    readPer,
    tMem,
    tComp,
    nAR,
    arDec,
    tComm,
    step,
    perUser,
    repT,
    total,
    preC,
    arPre,
    preComm,
    ttft,
    cost,
    commShare: tComm / step,
    linkUtil,
    bound: tMem >= tComp ? "memory" : "compute",
  };
}
export type W3Result = ReturnType<typeof w3>;
