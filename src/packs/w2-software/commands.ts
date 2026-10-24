import type { Playable } from "../../core/types.ts";
import { IMAGES } from "./data.ts";
import { state } from "./state.ts";
import { foundryLoad, foundryPrompt } from "../../shared/bench/foundry.ts";
import { f0, f1, fmtT, lpad, pad } from "../../shared/data/format.ts";
import { DRIVERS } from "../../shared/data/hardware.ts";
import { MODELS } from "../../shared/data/models.ts";
import { W2BW, w2decode, w2prefill } from "../../shared/engine/kernels.ts";
import { host } from "../../shared/host.ts";
// World 2's commands: the status line, trace, profile, toggles, containers and drivers, and its foundry.
export function summary2() {
  const S = state();
  if (S.mode === "prefill") {
    const R = w2prefill(S);
    if (R.oom)
      host.err(
        `torch.OutOfMemoryError: tried to allocate ${f1(R.scoresGB)} GB for attention scores; ${f1(R.free)} GB free`,
      );
    else host.print(`→ prefill ${f0(R.N)} tokens · first token in ${fmtT(R.ttft)}`, "ok");
  } else {
    const R = w2decode(S);
    host.print(
      `→ ${R.n} kernels per token · ${fmtT(R.step / 1e6)} per token (${f0(R.tps)} tok/s) · GPU busy ${f1(R.busy * 100)}%`,
      "ok",
    );
  }
}
export function trace() {
  const S = state();
  S.flags.trace = true;
  const m = MODELS["llama-8b"],
    bytes = m.h * m.inter * 2,
    us = (bytes / W2BW) * 1e6;
  const lines = [
    `[trace] y = x @ W        x: [1, ${m.h}] bf16    W: [${m.h}, ${m.inter}] bf16 (${f0(bytes / 1e6)} MB)`,
    `  1 python    model.py:42  self.up_proj(x)  →  torch.matmul(x, W)`,
    `  2 pytorch   aten::mm → dispatch key CUDA → at::cuda::blas::gemm<bf16>`,
    `  3 library   cublasLtMatmul → heuristic picks sm90_xmma_gemm_bf16bf16_bf16f32 (Hopper Tensor Core kernel)`,
    `  4 runtime   cudaLaunchKernel  grid = 132 blocks × 384 threads  (one block per SM)`,
    `  5 driver    ${S.driver} pushes the launch onto stream 7's command queue`,
    `  6 gpu       132 SMs × 4 Tensor Cores · read ${f0(bytes / 1e6)} MB of W from HBM · ${f1(us)} µs`,
  ];
  host.print(lines[0], "dim");
  let i = 0;
  S.traceAt = 0;
  host.renderSim();
  const step = () => {
    if (host.G.S !== S) return;
    host.print(lines[i + 1]);
    host.flushOut();
    S.traceAt = i;
    host.renderSim();
    i++;
    if (i < 6) host.G.tt = setTimeout(step, 420);
    else
      host.G.tt = setTimeout(() => {
        if (host.G.S !== S) return;
        S.traceAt = -1;
        host.print("[trace] done · one line of Python, five layers of software, one kernel", "ok");
        host.flushOut();
        host.renderSim();
        host.checkGoals();
      }, 700);
  };
  clearTimeout(host.G.tt);
  host.G.tt = setTimeout(step, 250);
}
export function profile() {
  const S = state();
  if (S.mode === "prefill") {
    const R = w2prefill(S);
    if (R.oom) {
      host.err(
        `profile: run crashed in attn_scores (out of memory: ${f1(R.scoresGB)} GB requested, ${f1(R.free)} GB free)`,
      );
      return;
    }
    S.flags.profiledOk = true;
    const t = R.ttft;
    host.print(`Profile · prefill ${f0(R.N)} tokens · ${MODELS[S.model].name} · H100`, "dim");
    host.print(
      [
        ["Category", "Time", "Share"],
        ["matrix multiplies (GEMM)", fmtT(R.gemm), f1((R.gemm / t) * 100) + "%"],
        [S.flash ? "flash_attn" : "attention (scores, softmax, values)", fmtT(R.attn), f1((R.attn / t) * 100) + "%"],
        [`small ops (${R.nE}/layer)`, fmtT(R.elem), f1((R.elem / t) * 100) + "%"],
        ["total → first token", fmtT(t), "100%"],
      ]
        .map((r) => "  " + pad(r[0], 38) + lpad(r[1], 10) + lpad(r[2], 9))
        .join("\n"),
    );
    return;
  }
  const R = w2decode(S);
  S.flags.profiledOk = true;
  const agg: Record<string, { c: number; t: number }> = {};
  R.ks.forEach((k) => {
    const a = agg[k.n] || (agg[k.n] = { c: 0, t: 0 });
    a.c++;
    a.t += k.t;
  });
  const rows = Object.entries(agg)
    .sort((a, b) => b[1].t - a[1].t)
    .slice(0, 8);
  host.print(
    `Profile · decode 1 token · ${MODELS[S.model].name} · H100 · ${S.graphs ? "CUDA Graphs on" : "eager launches"}`,
    "dim",
  );
  host.print(
    "  " +
      pad("Kernel", 18) +
      lpad("Calls", 7) +
      lpad("GPU µs", 10) +
      lpad("Share", 8) +
      "\n" +
      rows
        .map(([n, a]) => "  " + pad(n, 18) + lpad(a.c, 7) + lpad(f0(a.t), 10) + lpad(f1((a.t / R.step) * 100) + "%", 8))
        .join("\n"),
  );
  host.print(
    `  ${pad("GPU idle", 18)}${lpad("", 7)}${lpad(f0(R.step - R.sum), 10)}${lpad(f1((1 - R.busy) * 100) + "%", 8)}`,
    R.busy < 0.7 ? "err" : "",
  );
  host.print(`  per token ${fmtT(R.step / 1e6)} · ${R.n} kernels · CPU spent ${fmtT(R.cpuT / 1e6)} launching`, "dim");
}
export function dockerCmd(t: string[]) {
  const S = state();
  if (S.world !== 2) {
    host.err("docker: not needed here. This bench already has the model loaded. Containers are in World 2.");
    return;
  }
  const sub = t[0];
  if (sub === "images") {
    host.print(
      "REPOSITORY   TAG          SIZE\n" +
        Object.entries(IMAGES)
          .map(([k, v]) => {
            const [r, tg] = k.split(":");
            return pad(r, 13) + pad(tg, 13) + v.size;
          })
          .join("\n"),
    );
    return;
  }
  if (sub === "ps") {
    host.print("CONTAINER ID   IMAGE   STATUS\n(no running containers)");
    return;
  }
  if (sub !== "run") {
    host.err(`docker: '${sub || ""}' isn't simulated here. Try docker images or docker run --gpus all IMAGE`);
    return;
  }
  let gpus = false,
    image: string | null = null;
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (a === "--gpus") {
      gpus = !!t[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--gpus=")) {
      gpus = true;
      continue;
    }
    if (a === "--rm" || a === "-it" || a === "-d" || a === "-i" || a === "-t") continue;
    if (a.startsWith("-")) continue;
    image = a;
    break;
  }
  if (!image) {
    host.err('"docker run" requires at least 1 argument: the image name. Try docker images.');
    return;
  }
  if (!IMAGES[image]) {
    host.err(`Unable to find image '${image}' locally. Available: ${Object.keys(IMAGES).join(", ")}`);
    return;
  }
  const img = IMAGES[image],
    drv = DRIVERS[S.driver],
    dmaj = parseInt(drv.cuda);
  host.print(`==========\n== CUDA ==\n==========\nCUDA Version ${img.cuda}.1   ·   PyTorch ${img.torch}`, "dim");
  if (!gpus) {
    S.lastRun = { image, gpus: false, ok: false };
    host.print(">>> torch.cuda.is_available()\nFalse");
    host.err(
      "No GPU devices inside the container. Start it with --gpus all so the NVIDIA Container Toolkit can pass the GPU and driver in.",
    );
    return;
  }
  const ok = img.major <= dmaj && S.driver >= img.minDrv;
  S.lastRun = { image, gpus: true, ok };
  if (!ok) {
    host.print(">>> torch.cuda.is_available()");
    host.err(
      `RuntimeError: the NVIDIA driver on this host is too old (driver ${S.driver} supports CUDA ${drv.cuda}).\nThis image's CUDA ${img.cuda} runtime needs driver ${img.minDrv} or newer. Upgrade the driver or use an image built for CUDA ${drv.cuda.split(".")[0]}.x.`,
    );
    return;
  }
  host.print(">>> torch.cuda.is_available()\nTrue\n>>> torch.cuda.get_device_name(0)\n'NVIDIA H100 80GB HBM3'", "ok");
  if (parseFloat(img.cuda) > parseFloat(drv.cuda))
    host.print(
      `(CUDA ${img.cuda} runtime on a ${drv.cuda} driver works through minor-version compatibility: same major version, 12.)`,
      "dim",
    );
}
export function driverInstall(v: string) {
  const S = state();
  if (S.world !== 2) {
    host.err("Drivers are a World 2 topic. This bench's driver is already fine.");
    return;
  }
  const n = parseInt(v);
  if (!DRIVERS[n]) {
    host.err(`E: Unable to locate package nvidia-driver-${v}. Available: ${Object.keys(DRIVERS).join(", ")}`);
    return;
  }
  if (n === S.driver) {
    host.print(`nvidia-driver-${n} is already the newest version (${DRIVERS[n].full}).`);
    return;
  }
  host.print(
    [
      `Draining GPU workloads on gpu-node-01 ...`,
      `Unpacking nvidia-driver-${n} (${DRIVERS[n].full}) ...`,
      `Building kernel module nvidia.ko ...`,
      `Rebooting gpu-node-01 ... back online after 3m 41s`,
      `Driver ${DRIVERS[n].full} loaded · supports CUDA ${DRIVERS[n].cuda}`,
    ].join("\n"),
    "dim",
  );
  S.driver = n;
  S.flags.driver = true;
  host.print(
    "(On a real cluster this is a rolling, node-by-node job. The GPU Operator automates it in World 5.)",
    "dim",
  );
}
export function toggle(key: "graphs" | "fuse" | "flash", v: string | undefined) {
  const S = state();
  if (!host.needWorld(2)) return false;
  const on = v === undefined ? !S[key] : /^(on|true|1|yes|enable)$/i.test(v);
  S[key] = on;
  const names: Record<string, string> = { graphs: "CUDA Graphs", fuse: "Kernel fusion", flash: "FlashAttention" };
  host.print(`${names[key]} ${on ? "on" : "off"}`, "dim");
  return true;
}
export function commands(v: string, t: string[]): boolean {
  const S = state();
  if (v === "docker") dockerCmd(t.slice(1));
  else if (v === "apt" || v === "apt-get") {
    const pk = t.find((x) => /nvidia-driver-\d+/.test(x));
    if (t[1] === "install" && pk) driverInstall(pk.match(/nvidia-driver-(\d+)/)![1]);
    else host.err("apt: try sudo apt install nvidia-driver-580");
  } else if (v === "python" || v === "python3")
    host.err(
      S.world === 2
        ? "python: run code inside a container: docker run --gpus all IMAGE"
        : "python: not needed. foundry commands drive the bench.",
    );
  else return false;
  return true;
}

/** foundry subcommands in World 2. Returns true if handled (the rest: guards and core). */
export function foundry(t: string[]): boolean {
  const S = state(),
    L = host.G.level!,
    sub = (t[0] || "").toLowerCase(),
    a = t[1];
  const after = summary2;
  switch (sub) {
    case "kv":
      host.err("The kernel lab doesn't model KV precision.");
      return true;
    case "load":
      foundryLoad(t, after);
      return true;
    case "prompt":
      if (!(L.controls || []).includes("prompt2")) {
        host.err("Locked in this level: the document is 32,768 tokens.");
        return true;
      }
      foundryPrompt(S, a, after);
      return true;
    case "status":
      after();
      return true;
    case "trace":
      if (!(L.panels || []).includes("stack")) {
        host.err(host.refs("The trace view is in {{lvl:software-path}} and the kernel lab."));
        return true;
      }
      trace();
      return true;
    case "graphs":
    case "cuda-graphs":
      if (!(L.controls || []).includes("graphs")) {
        host.err("Not part of this level.");
        return true;
      }
      if (toggle("graphs", a)) after();
      return true;
    case "fuse":
    case "fusion":
      if (!(L.controls || []).includes("fuse")) {
        host.err("Not part of this level.");
        return true;
      }
      if (toggle("fuse", a)) after();
      return true;
    case "flash":
    case "flashattention":
      if (!(L.controls || []).includes("flash")) {
        host.err("Not part of this level.");
        return true;
      }
      if (toggle("flash", a)) after();
      return true;
    case "mode":
      if (!(L.controls || []).includes("mode")) {
        host.err("Locked in this level.");
        return true;
      }
      if (a !== "decode" && a !== "prefill") {
        host.err("foundry mode decode | prefill");
        return true;
      }
      S.mode = a;
      host.print(`Phase: ${a}`, "dim");
      after();
      return true;
    case "profile":
      if (!(L.panels || []).includes("timeline")) {
        host.err("The profiler is in the World 2 timeline levels and the kernel lab.");
        return true;
      }
      profile();
      return true;
    case "driver":
      if (a === "install") {
        driverInstall(t[2]);
        return true;
      }
      host.err("foundry driver install VERSION");
      return true;
  }
  return false;
}

/** Level start: the driver level opens on a container that failed to start. */
export function beforeIntro(L: Playable) {
  if (L.driverStart) {
    host.print("$ docker run --gpus all llm:cuda13.0", "cmd");
    host.print("==========\n== CUDA ==\n==========\nCUDA Version 13.0.1   ·   PyTorch 2.9.0", "dim");
    host.print(">>> torch.cuda.is_available()");
    host.err(
      "RuntimeError: the NVIDIA driver on this host is too old (driver 535 supports CUDA 12.2).\nThis image's CUDA 13.0 runtime needs driver 580 or newer.",
    );
  }
}
