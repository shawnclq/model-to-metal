import { GPUS, NETS, SERVERS } from "../data/hardware.ts";
import { ATT_EFF, DTYPES, KVDT, MEM_EFF, MODELS, PRE_EFF, RESERVE, activeP, kvTok } from "../data/models.ts";
import { computeRate } from "./gpu.ts";
import type { ClusterSetup } from "./inputs.ts";
import { arTime, readGBof } from "./server.ts";
/* ============ many servers: network bandwidth and multi-node serving ============ */
export function netBW(S: { net: string; gdr: boolean }) {
  const n = NETS[S.net];
  let bw = n.perGPU * n.eff;
  if (n.rdma && !S.gdr) bw *= 0.35;
  return bw;
}
export function w4serve(S: ClusterSetup) {
  const g = GPUS.h100,
    m = MODELS[S.model],
    d = DTYPES[S.dtype],
    tp = S.tp,
    pp = S.pp,
    n = tp * pp,
    act = activeP(m),
    net = NETS[S.net];
  const kvT = kvTok(m) * KVDT[S.kvdt || "bf16"].f;
  const wPer = (m.P * d.bytes) / 1e9 / n,
    kvPer = (S.batch * S.ctx * kvT) / 1e9 / n,
    usedPer = wPer + kvPer + RESERVE;
  const nodesNeeded = Math.ceil(n / 8),
    gpusAvail = S.nodes * 8;
  const fits = usedPer <= g.mem;
  const rate = computeRate(g, S.dtype) * 1e12,
    bwEff = g.bw * 1e12 * MEM_EFF;
  const nvl = SERVERS.hgx,
    netLink = { bw: netBW(S), lat: net.lat * 4 };
  const tpLink = tp <= 8 ? nvl : netLink,
    tpSpans = tp > 8;
  const nAR = 2 * m.L;
  const stageRead = ((readGBof(m, d, S.batch) / n) * 1e9) / bwEff + (kvPer * 1e9) / bwEff;
  const stageComm = (m.L / pp) * 2 * arTime(tp, S.batch * m.h * 2, tpLink);
  const send = pp > 1 ? (pp - 1) * (net.lat * 2 + (S.batch * m.h * 2) / (netBW(S) * Math.min(8, tp))) : 0;
  const tok = pp * (stageRead + stageComm) + send,
    perUser = 1 / tok;
  const preC =
    (2 * act * S.prompt) / (tp * rate * PRE_EFF) +
    (2 * S.prompt * S.prompt * m.h * m.L) / (tp * g.bf16 * 1e12 * ATT_EFF);
  const preComm = nAR * arTime(tp, S.prompt * m.h * 2, tpLink);
  const preSend = pp > 1 ? (pp - 1) * (net.lat * 2 + (S.prompt * m.h * 2) / (netBW(S) * Math.min(8, tp))) : 0;
  const ttft = preC + preComm + preSend;
  const crossNode = tpSpans || pp > 1;
  return {
    g,
    m,
    d,
    tp,
    pp,
    n,
    net,
    wPer,
    kvPer,
    usedPer,
    fits,
    nodesNeeded,
    gpusAvail,
    tpSpans,
    tpLink,
    stageRead,
    stageComm,
    send,
    tok,
    perUser,
    preC,
    preComm,
    preSend,
    ttft,
    crossNode,
    commShare: (pp * stageComm + send) / tok,
  };
}
export type W4Serve = ReturnType<typeof w4serve>;
