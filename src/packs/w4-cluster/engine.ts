import type { W4State } from "../../core/types.ts";
import { GPUS, NETS, SERVERS } from "../../shared/data/hardware.ts";
import { MODELS } from "../../shared/data/models.ts";
import { netBW } from "../../shared/engine/cluster.ts";
// World 4's own maths: data-parallel training across nodes.
export const TRAIN = { model: "llama-8b", seqs: 4, seq: 4096, mfu: 0.45 };
export function w4train(S: W4State) {
  const m = MODELS[TRAIN.model],
    N = S.nodes,
    net = NETS[S.net],
    grad = m.P * 2;
  const tokGPU = TRAIN.seqs * TRAIN.seq,
    c = (6 * m.P * tokGPU) / (GPUS.h100.bf16 * 1e12 * TRAIN.mfu);
  const intra = (((2 * 7) / 8) * grad) / SERVERS.hgx.bw;
  const bw = netBW(S),
    inter = N > 1 ? (((2 * (N - 1)) / N) * (grad / 8)) / bw + 2 * (N - 1) * net.lat : 0;
  const one = c + intra,
    step = c + intra + inter,
    eff = N > 1 ? one / step : 1,
    tput = (N * 8 * tokGPU) / step;
  return { m, N, net, grad, tokGPU, c, intra, bw, inter, one, step, eff, tput, ideal: (N * 8 * tokGPU) / one };
}
export type W4Train = ReturnType<typeof w4train>;
