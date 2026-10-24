import { state } from "./state.ts";
import { NETS } from "../../shared/data/hardware.ts";
import { seg } from "../../shared/ui/controls.ts";
// World 4's own controls (the bench controls are shared), and the order every control appears in.
import type { ControlRenderer } from "../../core/types.ts";
export const CONTROLS: Record<string, ControlRenderer> = {
  mode4: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("mode4"))
      h += seg(
        "Workload",
        "mode",
        [
          { v: "serve", l: "Serve", s: "one model, many GPUs", cmd: "foundry mode serve" },
          { v: "train", l: "Train", s: "data parallel", cmd: "foundry mode train" },
        ],
        S.mode,
      );
    return h;
  },
  layout: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("layout") && S.mode === "serve")
      h += seg(
        "Layout (relaunches vLLM)",
        "layout",
        [
          [16, 1],
          [8, 2],
          [4, 4],
        ].map(([t, p]) => ({ v: t + "x" + p, l: `TP ${t} × PP ${p}`, cmd: `foundry layout ${t}x${p}` })),
        S.job ? S.job.tp + "x" + S.job.pp : "",
        lk.layout,
      );
    return h;
  },
  nodes: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("nodes") && (S.mode === "train" || C.includes("mode4")))
      h += seg(
        "Nodes",
        "nodes",
        [1, 2, 4].map((n) => ({ v: n, l: String(n), s: n * 8 + " GPUs", cmd: "foundry nodes " + n })),
        S.nodes,
        lk.nodes,
      );
    return h;
  },
  net: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("net"))
      h += seg(
        "Network",
        "net",
        Object.values(NETS).map((n) => ({ v: n.key, l: n.name, s: n.s, cmd: "foundry net " + n.key })),
        S.net,
        lk.net,
      );
    return h;
  },
  gdr: (C, lk) => {
    const S = state();
    let h = "";
    const tog = (k: string, l: string, cur: unknown, cmdBase: string) =>
      seg(
        l,
        k,
        [
          { v: false, l: "Off", cmd: cmdBase + " off" },
          { v: true, l: "On", cmd: cmdBase + " on" },
        ],
        !!cur,
        lk[k],
      );
    if (C.includes("gdr")) h += tog("gdr", "GPUDirect RDMA", S.gdr, "foundry gdr");
    return h;
  },
};
export const CONTROL_ORDER = [
  "gpu",
  "model",
  "kv",
  "dtype",
  "batch",
  "ctx",
  "prompt",
  "mode4",
  "layout",
  "nodes",
  "net",
  "gdr",
];
