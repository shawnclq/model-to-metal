import { state } from "./state.ts";
import type { Playable } from "../../core/types.ts";
import { MIGP, MIG_ID } from "./data.ts";
import { migAssign, migCheck } from "./engine.ts";
import { WL, wlCheck } from "./render.ts";
import { foundryKv, foundryLoad, foundryPrompt } from "../../shared/bench/foundry.ts";
import { setDtype, setGpu, setNum } from "../../shared/bench/setters.ts";
import { f0, f1, f2, fmtMoney, fmtT, pad } from "../../shared/data/format.ts";
import { GPUS } from "../../shared/data/hardware.ts";
import { RESERVE } from "../../shared/data/models.ts";
import { w1 } from "../../shared/engine/gpu.ts";
import { host } from "../../shared/host.ts";
// World 1's commands: the bench and status line, foundry subcommands, MIG through nvidia-smi.
export function summary1() {
  const S = state(),
    M = w1(S);
  if (M.fits && M.m.moe && S.batch >= 32) S.flags.moe32 = true;
  if (M.fp4bad) {
    host.err(
      `FP4 needs Blackwell Tensor Cores. ${M.g.name} (${M.g.arch}) has no FP4 math. Try INT4 (weight-only) or a B200.`,
    );
    return;
  }
  if (!M.fits) {
    host.err(`CUDA out of memory: needs ${f1(M.used)} GB, ${M.g.name} has ${M.g.mem} GB`);
    return;
  }
  host.print(
    `→ ${f1(M.used)} / ${M.g.mem} GB · fits · ${f1(M.perUser)} tok/s per user · ${f0(M.total)} tok/s total · ${fmtMoney(M.cost)} per 1M tokens · TTFT ${fmtT(M.ttft)}`,
    "ok",
  );
}
export function bench() {
  const S = state(),
    M = w1(S);
  S.flags.bench = true;
  host.print(
    `Benchmark · ${M.m.name} · ${M.d.name} · ${M.g.name} · ${S.batch} user${S.batch > 1 ? "s" : ""} × ${f0(S.ctx)} context`,
    "dim",
  );
  if (!M.fits) {
    summary1();
    return;
  }
  host.print(
    [
      `  memory       ${f1(M.used)} / ${M.g.mem} GB   (weights ${f1(M.wGB)} · KV ${f1(M.kvGB)} · runtime ${RESERVE})`,
      `  step time    ${fmtT(M.step)}   (${M.bound}-bound)`,
      `  per user     ${f1(M.perUser)} tok/s`,
      `  throughput   ${f0(M.total)} tok/s`,
      `  first token  ${fmtT(M.ttft)}   (${f0(S.prompt)}-token prompt)`,
      `  bandwidth    ${f1(M.bwUtil * 100)}% of ${M.g.bw} TB/s    tensor cores ${f1(M.compUtil * 100)}% of ${f0(M.peakTF)} TFLOPS`,
      `  cost         ${fmtMoney(M.cost)} per 1M tokens at $${f2(M.g.price)}/hr`,
    ].join("\n"),
  );
}

/** foundry subcommands in World 1. Returns true if handled (the rest: guards and core). */
export function foundry(t: string[]): boolean {
  const S = state(),
    L = host.G.level!,
    sub = (t[0] || "").toLowerCase(),
    a = t[1],
    al = (t[1] || "").toLowerCase(), // the single file lower-cased the argument for workload, pick and kv
    C = L.controls || [];
  switch (sub) {
    case "kv":
      foundryKv(S, al, summary1);
      return true;
    case "workload": {
      const a = al;

      if (!(L.controls || []).includes("workload")) {
        host.err("Workloads are in the 'Pick the GPU' level.");
        return true;
      }
      if (!WL[a]) {
        host.err("foundry workload chat | doc | moe");
        return true;
      }
      S.wl = a;
      Object.assign(S, WL[a].set);
      host.print(`Workload: ${WL[a].t} · ${WL[a].d}`, "dim");
      summary1();
      return true;
    }
    case "pick": {
      const a = al;

      if (!(L.controls || []).includes("workload")) {
        host.err("foundry pick is for the 'Pick the GPU' level.");
        return true;
      }
      const c = wlCheck(S, S.wl!);
      if (!c.ok) {
        host.err(
          `${GPUS[S.gpu].name} doesn't pass ${WL[S.wl!].t}: ${c.res
            .filter((r) => !r[1])
            .map((r) => r[0])
            .join("; ")}`,
        );
        return true;
      }
      S.picks![S.wl!] = S.gpu;
      host.print(`Picked ${GPUS[S.gpu].name} for ${WL[S.wl!].t}. ${WL[S.wl!].why}`, "ok");
      return true;
    }
    case "share": {
      const a = al;

      if (!L.panels!.includes("mig")) {
        host.err("GPU sharing is in the 'Share the GPU' level.");
        return true;
      }
      if (a === "timeslice" || a === "time-slicing") {
        S.mig.share = "timeslice";
        S.mig.inst = [];
        host.print(
          "Time-slicing on: all 5 teams share the whole GPU in turns. No memory limits, no guaranteed share.",
          "dim",
        );
      } else if (a === "none") {
        S.mig.share = "none";
        S.mig.inst = [];
        host.print("Sharing off.", "dim");
      } else host.err("foundry share timeslice | none");
      return true;
    }
    case "gpu":
      if (setGpu(a)) summary1();
      return true;
    case "load":
      foundryLoad(t, summary1);
      return true;
    case "dtype":
    case "precision":
    case "quantize":
    case "quantise":
      if (setDtype(a)) summary1();
      return true;
    case "batch":
    case "users":
      if (setNum(S, "batch", a, 1, 1024, "Users")) summary1();
      return true;
    case "context":
    case "ctx":
      if (setNum(S, "ctx", a, 512, 262144, "Context")) summary1();
      return true;
    case "prompt":
      foundryPrompt(S, a, summary1);
      return true;
    case "bench":
    case "status":
      bench();
      return true;
    case "roofline":
    case "roof": {
      if (!(L.panels || []).includes("roof")) {
        host.err(host.refs("The roofline opens from {{lvl:memory-bandwidth}} onward, and in the GPU lab."));
        return true;
      }
      if (a === "off") {
        S.showRoof = false;
        host.print("Roofline hidden.", "dim");
        return true;
      }
      S.showRoof = true;
      S.flags.roof = true;
      {
        const M = w1(S);
        host.print(
          M.fits
            ? `Roofline: decode at ${f1(M.I)} FLOPs/byte, ridge at ${f0(M.ridge)}. ${M.I < M.ridge ? "Left of the ridge, so memory bandwidth is the limit." : "Right of the ridge, so compute is the limit."}`
            : "Roofline shown. Nothing is running yet: the model doesn't fit.",
          "dim",
        );
      }
      return true;
    }
  }
  return false;
}

/** nvidia-smi's MIG commands (only reached in a level with the MIG panel). */
export function smi(args: string[]) {
  const S = state(),
    a = args.join(" ");
  const mm = a.match(/-mig\s+([01])/);
  if (mm && !/^mig\b/.test(a)) {
    if (!host.G.level!.panels!.includes("mig")) {
      host.err("MIG is in the 'Share the GPU' level.");
      return;
    }
    const on = mm[1] === "1";
    S.mig.mode = on;
    S.mig.inst = [];
    if (on) S.mig.share = "none";
    host.print(
      on
        ? "Enabled MIG Mode for GPU 00000000:18:00.0\nAll done."
        : "Disabled MIG Mode for GPU 00000000:18:00.0\nAll done.",
    );
    return;
  }

  if (!host.G.level!.panels!.includes("mig")) {
    host.err("MIG is in the 'Share the GPU' level.");
    return;
  }
  if (!S.mig.mode) {
    host.err("Unable to create GPU instance: MIG mode is not enabled. Run: sudo nvidia-smi -i 0 -mig 1");
    return;
  }
  if (/-lgip/.test(a)) {
    host.print(
      "GPU instance profiles (GPU 0, H100 80GB):\n  " +
        pad("Name", 10) +
        pad("ID", 5) +
        pad("Compute", 9) +
        pad("Memory", 8) +
        "Max\n" +
        Object.entries(MIGP)
          .map(
            ([k, v]) =>
              "  " +
              pad(k, 10) +
              pad(v.id, 5) +
              pad(v.c + "/7", 9) +
              pad(v.gb + " GB", 8) +
              Math.floor(Math.min(7 / v.c, 8 / v.m)),
          )
          .join("\n"),
    );
    return;
  }
  if (/-lgi\b/.test(a)) {
    host.print(
      S.mig.inst.length
        ? S.mig.inst.map((p, i) => `  GPU 0  instance ${i}  ${p}  (profile ${MIGP[p].id})`).join("\n")
        : "No GPU instances found.",
    );
    return;
  }
  if (/-dci|-dgi/.test(a)) {
    S.mig.inst = [];
    S.mig.share = "none";
    host.print("Destroyed all compute and GPU instances on GPU 0.");
    return;
  }
  const ci = args.indexOf("-cgi");
  if (ci >= 0) {
    const list = (args[ci + 1] || "")
      .split(",")
      .filter(Boolean)
      .map((x: string) => MIG_ID[x] || x);
    const ck = migCheck(list);
    if (!list.length) {
      host.err("-cgi needs a comma-separated list of profiles, e.g. 1g.10gb,2g.20gb");
      return;
    }
    if (!ck.ok) {
      host.err(`Unable to create GPU instances: ${ck.why}.`);
      return;
    }
    S.mig.inst = list;
    S.mig.share = "mig";
    host.print(
      list
        .map(
          (p: string, i: number) =>
            `Successfully created GPU instance ID ${i} on GPU 0 using profile MIG ${p} (ID ${MIGP[p].id})`,
        )
        .join("\n") +
        (args.includes("-C")
          ? `\nCreated ${list.length} compute instance${list.length > 1 ? "s" : ""}.`
          : "\n(add -C to create compute instances too; done for you here)"),
    );
    const A = migAssign(S);
    A.res.forEach((r) =>
      host.print(
        r.inst
          ? `  ${pad(r.t.n, 14)} → ${r.inst.p} #${r.inst.i}`
          : `  ${pad(r.t.n, 14)} → no instance with ${r.t.need} GB left`,
        r.inst ? "ok" : "err",
      ),
    );
    return;
  }
  host.err("Try: nvidia-smi mig -lgip | -cgi PROFILES -C | -lgi | -dci");
  return;
}

/** Level start: say so when the default setup doesn't fit (not on the chip tour, MIG or Pick the GPU). */
export function afterIntro(L: Playable) {
  if (L.title !== "Meet the chip" && !L.panels!.includes("mig") && !L.panels!.includes("pick")) {
    const M = w1(state());
    if (!M.fits) summary1();
  }
}

/** Inspecting the die-to-die link on a one-die GPU. */
export function onInspect(k: string) {
  if (k === "link" && GPUS[state().gpu].dies === 1)
    host.print("(This GPU has one die. The link only exists on Blackwell.)", "dim");
}
