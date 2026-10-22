import { MIGP, MIG_ID } from "../../legacy/3b-data.ts";
import { migAssign, migCheck, w4serve } from "../../legacy/4b-engine.ts";
import { f1, lpad, pad } from "../data/format.ts";
import { DRIVERS, GPUS, SERVERS } from "../data/hardware.ts";
import { w1 } from "../engine/gpu.ts";
import { w2decode, w2prefill, w2used } from "../engine/kernels.ts";
import { w3 } from "../engine/server.ts";
import { host } from "../host.ts";
// nvidia-smi and amd-smi as each world's bench sees them: one GPU (Worlds 0–2), an 8-GPU server or a
// cluster node (Worlds 3–4), MIG partitions (World 1), and AMD Instinct boards (Worlds 1 and 3).
export function smi() {
  const S = host.G.S!;
  host.G.S!.flags.smi = true;
  if (S.world >= 3) {
    smiMulti();
    return;
  }
  const drv = S.world === 2 ? DRIVERS[S.driver] : DRIVERS[580];
  let g, usedMiB: number, totMiB: number, util: number, pw: number;
  if (S.world === 1) {
    const M = w1(S);
    g = M.g;
    totMiB = g.smiMiB;
    usedMiB = M.fits ? Math.round((M.used * 1e9) / 1048576) : 0;
    util = M.fits ? 100 : 0;
    pw = M.fits
      ? Math.min(g.tdp, Math.round(g.tdp * (0.14 + 0.42 * M.bwUtil + 0.5 * M.compUtil)))
      : Math.round(g.tdp * 0.1);
  } else {
    g = GPUS.h100;
    totMiB = g.smiMiB;
    if (host.G.level!.panels!.includes("container")) {
      usedMiB = 0;
      util = 0;
      pw = 72;
    } else {
      usedMiB = Math.round((w2used(S) * 1e9) / 1048576);
      const b = S.mode === "prefill" ? (w2prefill(S).oom ? 0 : 0.99) : w2decode(S).busy;
      util = Math.round(b * 100);
      pw = Math.round(700 * (0.12 + 0.6 * b));
    }
  }
  const line = "+-----------------------------------------------------------------------------------------+";
  const row = (a: string, b: string, c: string) => "| " + pad(a, 40) + "| " + pad(b, 23) + "| " + pad(c, 21) + "|";
  host.print(
    [
      line,
      "| " +
        pad(`NVIDIA-SMI ${drv.full}`, 34) +
        pad(`Driver Version: ${drv.full}`, 32) +
        pad(`CUDA Version: ${drv.cuda}`, 22) +
        "|",
      "|-----------------------------------------+------------------------+----------------------+",
      row("GPU  Name                 Persistence-M", "Bus-Id          Disp.A", "Volatile Uncorr. ECC"),
      row("Fan  Temp   Perf          Pwr:Usage/Cap", "          Memory-Usage", "GPU-Util  Compute M."),
      "|=========================================+========================+======================|",
      row("  0  " + pad(g.smi, 26) + "      On", "00000000:18:00.0 Off", "                   0"),
      row(
        `N/A   ${util > 50 ? 58 : 36}C    P0      ${lpad(pw, 5)}W / ${lpad(g.tdp, 4)}W`,
        `${lpad(usedMiB + "MiB", 10)} / ${totMiB}MiB`,
        `${lpad(util + "%", 8)}     Default`,
      ),
      "+-----------------------------------------+------------------------+----------------------+",
    ].join("\n"),
  );
  if (S.world === 1) {
    const M = w1(S);
    if (M.fits)
      host.print(
        `(GPU-Util ${util}% only means a kernel was always running. Tensor Cores are actually ${f1(M.compUtil * 100)}% busy.)`,
        "dim",
      );
    else host.print("(Nothing is running: the model failed to load.)", "dim");
  }
  if (S.world === 1 && host.G.level!.panels!.includes("mig") && S.mig.share === "mig")
    host.print("MIG devices:\n" + S.mig.inst.map((p, i) => `  GPU 0 · instance ${i} · ${p}`).join("\n"));
  if (S.world === 2 && host.G.level!.driverStart)
    host.print(`(Top right: this driver supports CUDA up to ${drv.cuda}.)`, "dim");
}
/* ============ nvidia-smi variants ============ */
export function smiCmd(args: string[]) {
  const S = host.G.S!,
    a = args.join(" ");
  const gv = S.world === 1 ? GPUS[S.gpu] : S.world === 3 ? GPUS[SERVERS[S.srv].gpu!] : null;
  if (gv && gv.vendor === "amd") {
    host.err(
      `nvidia-smi: command not found. This is an AMD ${gv.name}: use amd-smi${/topo/.test(a) ? " or rocm-smi --showtopo" : ""}.`,
    );
    return;
  }
  if (!args.length || (args[0] === "-L" && false)) {
    smi();
    return;
  }
  if (/^topo\b/.test(a)) {
    if (S.world < 3) {
      host.err("This bench has one GPU. Topology matters from World 3.");
      return;
    }
    topo();
    return;
  }
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
  if (/^mig\b/.test(a)) {
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
  smi();
}
export function smiMulti() {
  const S = host.G.S!;
  const drv = DRIVERS[580];
  let used = 0,
    util = 0;
  const gname = S.world === 3 ? GPUS[SERVERS[S.srv].gpu!].smi : "NVIDIA H100 80GB HBM3",
    gmib = S.world === 3 ? GPUS[SERVERS[S.srv].gpu!].smiMiB : 81559;
  if (S.world === 3) {
    const M = w3(S);
    used = M.fits ? M.usedPer : 0;
    util = M.fits ? 100 : 0;
  } else if (S.mode === "serve" && S.job) {
    const R = w4serve(S);
    used = R.fits ? R.usedPer : 0;
    util = R.fits ? 100 : 0;
  } else if (S.mode === "train") {
    used = 62;
    util = 100;
  }
  host.print(
    `NVIDIA-SMI ${drv.full}   Driver Version: ${drv.full}   CUDA Version: ${drv.cuda}${S.world === 4 ? "   host: " + S.host : ""}`,
    "dim",
  );
  host.print(
    "GPU  Name                    Memory-Usage           GPU-Util\n" +
      [...Array(8)]
        .map(
          (_, i) =>
            `  ${i}  ${pad(gname, 22)}  ${lpad(Math.round((used * 1e9) / 1048576) + "MiB", 9)} / ${gmib}MiB    ${lpad(util + "%", 4)}`,
        )
        .join("\n"),
  );
}
export function topo() {
  const S = host.G.S!;
  host.G.S!.flags.topo = true;
  const hgx = S.world === 4 || S.srv === "hgx" || S.srv === "hgxb200";
  const cell = (i: number, j: number) =>
    i === j
      ? " X "
      : hgx
        ? "NV18"
        : Math.floor(i / 2) === Math.floor(j / 2)
          ? "PIX"
          : Math.floor(i / 4) === Math.floor(j / 4)
            ? "NODE"
            : "SYS";
  host.print(
    "        " +
      [...Array(8)].map((_, j) => pad("GPU" + j, 6)).join("") +
      (S.world === 4 ? "NIC0  " : "") +
      "CPU Affinity",
  );
  for (let i = 0; i < 8; i++)
    host.print(
      pad("GPU" + i, 8) +
        [...Array(8)].map((_, j) => pad(cell(i, j), 6)).join("") +
        (S.world === 4 ? pad(i === 0 ? "PIX" : "SYS", 6) : "") +
        (i < 4 ? "0-55" : "56-111"),
    );
  host.print(
    hgx
      ? "\nNV18 = connection through 18 bonded NVLinks (via NVSwitch)."
      : "\nPIX = same PCIe switch · NODE = same CPU socket · SYS = crosses between CPUs. No NVLink.",
    "dim",
  );
}
export function amdSmi(v: string, args: string[]) {
  const S = host.G.S!;
  const g = S.world === 1 ? GPUS[S.gpu] : S.world === 3 ? GPUS[SERVERS[S.srv].gpu!] : null;
  if (!g || g.vendor !== "amd") {
    host.err(`${v}: no AMD GPUs found. This machine has NVIDIA GPUs: use nvidia-smi.`);
    return;
  }
  if (v === "rocm-smi" && /showtopo/.test(args.join(" "))) {
    S.flags.topo = true;
    host.print("        " + [...Array(8)].map((_, j) => pad("GPU" + j, 7)).join(""));
    for (let i = 0; i < 8; i++)
      host.print(pad("GPU" + i, 8) + [...Array(8)].map((_, j) => pad(i === j ? "0" : "XGMI", 7)).join(""));
    host.print("\nXGMI = direct Infinity Fabric link. Every pair has one: a full mesh.", "dim");
    return;
  }
  S.flags.amdsmi = true;
  let used,
    util,
    pw,
    n = S.world === 3 ? 8 : 1;
  if (S.world === 1) {
    const M = w1(S);
    used = M.fits ? M.used : 0;
    util = M.fits ? 100 : 0;
    pw = M.fits ? Math.round(M.power) : Math.round(g.tdp * 0.1);
  } else {
    const M = w3(S);
    used = M.fits ? M.usedPer : 0;
    util = M.fits ? 100 : 0;
    pw = Math.round(g.tdp * 0.55);
  }
  host.print(`AMD SMI · ROCm 7 · amdgpu driver`, "dim");
  host.print(
    "GPU  NAME                     POWER        GFX_UTIL   VRAM_USED / TOTAL\n" +
      [...Array(n)]
        .map(
          (_, i) =>
            `  ${i}  ${pad(g.smi, 22)}  ${lpad(pw + " W", 6)} / ${g.tdp} W  ${lpad(util + "%", 5)}     ${lpad(f1(used), 6)} / ${g.mem} GB`,
        )
        .join("\n"),
  );
  if (S.world === 1 && w1(S).fits)
    host.print(
      `(Like nvidia-smi, GFX_UTIL means a kernel is running. Matrix Cores are actually ${f1(w1(S).compUtil * 100)}% busy.)`,
      "dim",
    );
}
