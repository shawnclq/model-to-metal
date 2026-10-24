import { state } from "./state.ts";
import { MIG_PRESETS } from "./data.ts";
import { WL } from "./render.ts";
import { seg } from "../../shared/ui/controls.ts";
// World 1's own controls (the bench controls are shared), and the order every control appears in.
import type { ControlRenderer } from "../../core/types.ts";
export const CONTROLS: Record<string, ControlRenderer> = {
  workload: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("workload"))
      h += seg(
        "Workload",
        "wl",
        Object.entries(WL).map(([k, w]) => ({ v: k, l: w.t, cmd: "foundry workload " + k })),
        S.wl!,
      );
    return h;
  },
  mig: (C, lk) => {
    const S = state();
    let h = "";
    if (C.includes("mig")) {
      h += seg(
        "MIG mode",
        "migmode",
        [
          { v: false, l: "Off", cmd: "sudo nvidia-smi -i 0 -mig 0" },
          { v: true, l: "On", cmd: "sudo nvidia-smi -i 0 -mig 1" },
        ],
        S.mig.mode,
      );
      const cur = S.mig.share === "mig" ? S.mig.inst.join(",") : S.mig.share === "timeslice" ? "ts" : "";
      h += `<div class="ctl"><span>Layout</span><div class="seg" role="group" aria-label="MIG layout">${MIG_PRESETS.map((p) => `<button type="button" class="${cur === p.v ? "on" : ""}" ${S.mig.mode ? "" : "disabled"} data-cmd="nvidia-smi mig -cgi ${p.v} -C">${p.l}</button>`).join("")}<button type="button" class="${cur === "ts" ? "on" : ""}" data-cmd="foundry share timeslice">Time-slicing</button></div></div>`;
    }
    return h;
  },
};
export const CONTROL_ORDER = ["gpu", "model", "workload", "kv", "dtype", "batch", "ctx", "prompt", "mig"];
