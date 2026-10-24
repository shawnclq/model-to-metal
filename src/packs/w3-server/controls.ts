import { TP_STEPS } from "./data.ts";
import { state } from "./state.ts";
import { SERVERS } from "../../shared/data/hardware.ts";
import { host } from "../../shared/host.ts";
import { seg } from "../../shared/ui/controls.ts";
// World 3's own controls (the bench controls are shared), and the order every control appears in.
import type { ControlRenderer } from "../../core/types.ts";
export const CONTROLS: Record<string, ControlRenderer> = {
  srv: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("srv"))
      h += seg(
        "Server",
        "srv",
        (host.G.level!.srvs || ["hgx", "pcie"])
          .map((k) => SERVERS[k])
          .map((x) => ({ v: x.key, l: x.short, s: "$" + x.price + "/hr", cmd: "foundry server " + x.key })),
        S.srv,
        lk.srv,
      );
    return h;
  },
  tp: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("tp"))
      h += seg(
        "Tensor parallel size",
        "tp",
        TP_STEPS.map((t) => ({
          v: t,
          l: "TP " + t,
          s: 8 / t + " replica" + (t < 8 ? "s" : ""),
          cmd: "foundry tp " + t,
        })),
        S.tp,
        lk.tp,
      );
    return h;
  },
};
export const CONTROL_ORDER = ["gpu", "model", "kv", "dtype", "batch", "ctx", "prompt", "srv", "tp"];
