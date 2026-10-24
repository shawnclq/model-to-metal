import type { Playable, W2State } from "../../core/types.ts";
import { IMAGES, STACK2 } from "./data.ts";
import { state } from "./state.ts";
import { $, esc, f0, f1, f2, fmtT } from "../../shared/data/format.ts";
import { DRIVERS } from "../../shared/data/hardware.ts";
import { INFO } from "../../shared/data/info.ts";
import { ATT_EFF, MODELS, PRE_EFF, RESERVE } from "../../shared/data/models.ts";
import {
  CPU_LAUNCH,
  GRAPH_LAUNCH,
  Kernel,
  W2BW,
  W2Decode,
  W2Prefill,
  nonEmbed,
  w2decode,
  w2prefill,
} from "../../shared/engine/kernels.ts";
import { host } from "../../shared/host.ts";
import { setUtil, stopFlicker } from "../../shared/ui/flicker.ts";
import { infoHtml } from "../../shared/ui/info.ts";
// World 2's sim panels: the software stack, the kernel timeline, memory, containers and drivers.
export function stackHtml(S: W2State) {
  return `<div class="stackdiag">${STACK2.map((r, i) => `<button type="button" class="srow${S.traceAt === i ? " lit" : ""}${S.inspected.includes(r.id) ? " seen" : ""}${r.boundary ? " boundary" : ""}" data-i="${r.id}"><span class="i">${r.i}</span><span><span class="lyr">${esc(r.lyr)}</span><span class="nm">${esc(r.name)}</span><span class="tg">${esc(r.tag)}</span><code>${esc(r.id === "driver" ? `driver ${S.driver} queues the launch on the GPU's command stream` : r.code)}</code></span></button>`).join("")}</div>
  <div class="inspect" id="inspect">${S.info && INFO[S.info] && STACK2.some((r) => r.id === S.info) ? infoHtml(S.info) : '<span class="tip">Tap a row to see what that layer does. Rows 1–4 ship inside your container image; the line above row 5 is where the host begins.</span>'}</div>`;
}
export function tlSVG(S: W2State, R: W2Decode | W2Prefill) {
  const W = 640,
    H = 150,
    ml = 44,
    mr = 10;
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kernel timeline"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--bad)" stroke-width="2" opacity=".5"/></pattern></defs>`;
  let ks: Kernel[],
    span: number,
    unit: string,
    cpu: [number, number][] = [];
  if (S.mode === "prefill") {
    ks = (R as W2Prefill).layer;
    span = ks[ks.length - 1].e!;
    unit = "ms";
  } else {
    const D = R as W2Decode;
    const endIdx = D.ks.findIndex((k) => k.layerEnd === 1);
    ks = D.ks.slice(0, endIdx + 1);
    span = Math.max(ks[ks.length - 1].e!, S.graphs ? GRAPH_LAUNCH : 0);
    unit = "µs";
    cpu = S.graphs ? [[0, GRAPH_LAUNCH]] : D.cpu.slice(0, ks.length).filter((c) => c[0] < span);
  }
  const sx = (t: number) => ml + (t / span) * (W - ml - mr);
  const yC = 26,
    yG = 78,
    hL = 26;
  o += `<text class="tl-lane" x="4" y="${yC + 17}">CPU</text><text class="tl-lane" x="4" y="${yG + 17}">GPU</text>`;
  o += `<rect x="${ml}" y="${yC}" width="${W - ml - mr}" height="${hL}" fill="var(--panel-2)" stroke="var(--rule)"/><rect x="${ml}" y="${yG}" width="${W - ml - mr}" height="${hL}" fill="url(#hatch)" stroke="var(--rule)"/>`;
  if (S.mode === "prefill")
    o += `<text class="tl-lane" x="${ml + 6}" y="${yC + 17}">launches take microseconds; each kernel below runs for milliseconds</text>`;
  else if (S.graphs)
    o += `<rect class="tl-graph" x="${sx(0)}" y="${yC + 2}" width="${Math.max(2, sx(GRAPH_LAUNCH) - sx(0))}" height="${hL - 4}"/><text class="tl-lane" x="${sx(GRAPH_LAUNCH) + 6}" y="${yC + 17}">one graph replay launches every kernel in the token</text>`;
  else
    cpu.forEach((c, i) => {
      o += `<rect class="${i % 2 ? "tl-cpu2" : "tl-cpu"}" x="${sx(c[0])}" y="${yC + 2}" width="${Math.max(1, sx(Math.min(c[1], span)) - sx(c[0]))}" height="${hL - 4}"><title>CPU launches kernel ${i + 1}</title></rect>`;
    });
  ks.forEach((k) => {
    const x = sx(k.s!),
      w = Math.max(1.2, sx(k.e!) - x);
    o += `<rect class="tl-k-${k.k}" x="${x}" y="${yG + 1}" width="${w}" height="${hL - 2}"><title>${esc(k.n)} · ${unit === "ms" ? f2(k.t) + " ms" : f1(k.t) + " µs"}</title></rect>`;
    if (w > 58)
      o += `<text class="tl-name${k.k === "a" ? " dk" : ""}" x="${x + 4}" y="${yG + 16}">${esc(k.n.length > 16 ? k.n.slice(0, 15) + "…" : k.n)}</text>`;
  });
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const t = (span * i) / ticks;
    o += `<line class="ax" x1="${sx(t)}" y1="${yG + hL + 2}" x2="${sx(t)}" y2="${yG + hL + 7}"/><text class="axt" x="${sx(t)}" y="${yG + hL + 19}" text-anchor="middle">${unit === "ms" ? f1(t) : f0(t)} ${unit}</text>`;
  }
  o += `<text class="axt" x="${ml}" y="14">${S.mode === "prefill" ? "One transformer layer of " + MODELS[S.model].L + " (prefill)" : "First 2 of " + MODELS[S.model].L + " layers in one token (decode)"}</text>`;
  return o + `</svg>`;
}
export function tlLegend() {
  return `<div class="tlleg"><span><i style="background:var(--sea)"></i>matrix multiply (GEMM)</span><span><i style="background:var(--signal)"></i>attention</span><span><i style="background:var(--idle)"></i>small ops (norm, add, activation)</span><span><i style="background:color-mix(in srgb,var(--ink) 55%,transparent)"></i>CPU launch</span><span><i style="background:var(--ok)"></i>graph replay</span><span><i style="background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--bad) 50%,transparent) 0 2px,transparent 2px 6px)"></i>GPU idle</span></div>`;
}
export function w2Math(S: W2State) {
  const m = MODELS[S.model];
  const L = [];
  if (S.mode === "prefill") {
    const R = w2prefill(S);
    L.push(`<span class="h">PREFILL · ${m.name} · ${f0(R.N)} tokens · H100 BF16</span>`);
    L.push(
      `linear layers = 2 × ${f2(nonEmbed(m) / 1e9)} B × ${f0(R.N)} = ${f0(R.gemmFl / 1e12)} TFLOP ÷ (989 × ${PRE_EFF * 100}%) = ${fmtT(R.gemm)}`,
    );
    L.push(`attention     = 2 × ${f0(R.N)}² × ${m.h} × ${m.L} = ${f0(R.attFl / 1e12)} TFLOP`);
    if (S.flash) L.push(`                FlashAttention: tiles in SRAM, ${ATT_EFF * 100}% of peak = ${fmtT(R.attn)}`);
    else {
      L.push(
        `                score matrix per layer = ${m.heads} heads × ${f0(R.N)}² × 2 bytes = ${f1(R.scoresGB)} GB`,
      );
      L.push(
        `                free HBM = 80 − ${f1(R.wGB)} − ${f1(R.kvGB)} − ${RESERVE} = ${f1(R.free)} GB → ${R.oom ? '<span class="r">does not fit</span>' : "fits"}`,
      );
      if (!R.oom)
        L.push(
          `                write + read + write + read = ${f0(R.attnTraffic / 1e9)} GB of HBM traffic = ${fmtT(R.attnTraffic / W2BW)}`,
        );
    }
    L.push(
      `small ops     = ${R.nE} per layer × ${m.L} × read+write ${f2((2 * R.N * m.h * 2) / 1e9)} GB = ${f0(R.elemB / 1e9)} GB ÷ ${f2(W2BW / 1e12)} TB/s = ${fmtT(R.elem)}`,
    );
    L.push(`first token   ≈ ${R.oom ? '<span class="r">crashes</span>' : fmtT(R.ttft)}`);
  } else {
    const R = w2decode(S);
    L.push(`<span class="h">DECODE · ${m.name} · 1 user · H100 BF16</span>`);
    L.push(`kernels per token = ${R.n}  (${m.L} layers × ${(R.n - 3) / m.L} + 3)`);
    L.push(
      `GPU work          = ${f0(R.sum)} µs (weights ${f1((m.P * 2) / 1e9)} GB ÷ ${f2(W2BW / 1e12)} TB/s ≈ ${f0(((m.P * 2) / W2BW) * 1e6)} µs + small-kernel floors)`,
    );
    L.push(
      S.graphs
        ? `CPU launch        = one graph replay ≈ ${GRAPH_LAUNCH} µs`
        : `CPU launch        = ${R.n} × ${CPU_LAUNCH} µs = ${f0(R.cpuT)} µs`,
    );
    L.push(`step              = ${f0(R.step)} µs → ${f0(R.tps)} tok/s, GPU busy ${f1(R.busy * 100)}%`);
  }
  return `<pre class="mathbox">${L.join("\n")}</pre>`;
}
export function contHtml(S: W2State) {
  const img = S.lastRun && IMAGES[S.lastRun.image],
    drv = DRIVERS[S.driver];
  const runOk = S.lastRun && S.lastRun.ok,
    gp = S.lastRun && S.lastRun.gpus;
  let chk;
  if (!S.lastRun) chk = `<div class="check na">No container run yet</div>`;
  else if (!gp) chk = `<div class="check bad">✗ started without --gpus: the container can't see any GPU</div>`;
  else if (runOk)
    chk = `<div class="check ok">✓ CUDA ${img!.cuda} runtime works with driver ${S.driver} (supports CUDA ${drv.cuda})</div>`;
  else
    chk = `<div class="check bad">✗ CUDA ${img!.cuda} runtime needs driver ${img!.minDrv}+; host has ${S.driver} (CUDA ${drv.cuda})</div>`;
  return `<div class="cont">
   <div class="cgroup ctr"><span class="gl">Container image · ${esc(S.lastRun ? S.lastRun.image : "none")}</span>
    <div class="cbox"><span class="nm">Your app</span><span class="ds">python serve.py</span></div>
    <div class="cbox"><span class="nm">PyTorch ${img ? img.torch : "—"}</span><span class="ds">framework + kernel libraries (cuBLAS, cuDNN)</span></div>
    <div class="cbox ${S.lastRun && gp ? (runOk ? "ok" : "bad") : ""}"><span class="nm">CUDA runtime ${img ? img.cuda : "—"}</span><span class="ds">bundled in the image</span></div>
   </div>
   ${chk}
   <div class="cbox ${gp ? "ok" : S.lastRun ? "bad" : ""}"><span class="nm">NVIDIA Container Toolkit</span><span class="ds">${gp ? "--gpus all: passes GPU devices + driver libraries in" : "only connects when the container starts with --gpus"}</span></div>
   <div class="cgroup"><span class="gl">Host · gpu-node-01</span>
    <div class="cbox ${S.lastRun && gp ? (runOk ? "ok" : "bad") : ""}"><span class="nm">NVIDIA driver ${drv.full}</span><span class="ds">supports CUDA ≤ ${drv.cuda}</span></div>
    <div class="cbox"><span class="nm">GPU</span><span class="ds">NVIDIA H100 80GB HBM3</span></div>
   </div></div>`;
}
export function renderW2() {
  const S = state(),
    L = host.G.level!,
    P = L.panels!;
  $("#simActs").innerHTML = "";
  setUtil(0);
  stopFlicker();
  let h = "";
  if (P.includes("stack")) h += `<div>${stackHtml(S)}</div>`;
  if (P.includes("container")) h += contHtml(S);
  const showMem = P.includes("memory") && S.mode === "prefill";
  if (showMem) {
    const R = w2prefill(S),
      cap = 80,
      u = R.wGB + R.kvGB + RESERVE;
    const sc = Math.min(100, (R.scoresGB / cap) * 100),
      freeP = (Math.max(0, R.free) / cap) * 100;
    h += `<div><div class="sec-h"><span>HBM memory · H100 80 GB</span><b>${f1(u)} GB used before attention</b></div>
     <div class="membar"><span class="w" style="width:${((R.wGB / cap) * 100).toFixed(1)}%"></span><span class="k" style="width:${((R.kvGB / cap) * 100).toFixed(1)}%"></span><span class="r" style="width:${((RESERVE / cap) * 100).toFixed(1)}%"></span></div>
     <div class="memleg"><span><i style="background:var(--wt)"></i>Weights ${f1(R.wGB)} GB</span><span><i style="background:var(--kv)"></i>KV cache ${f1(R.kvGB)} GB</span><span><i style="background:var(--rsv)"></i>Runtime ${RESERVE} GB</span><span>Free ${f1(R.free)} GB</span></div>
     <div class="sec-h" style="margin-top:12px"><span>Attention scratch space, one layer</span><b>${S.flash ? "FlashAttention: ~0 GB in HBM" : f1(R.scoresGB) + " GB score matrix"}</b></div>
     <div class="scores">${S.flash ? `<span style="width:1.5%;background:var(--ok)"></span>` : `<span style="width:${Math.min(sc, freeP).toFixed(1)}%;background:var(--signal)"></span>${R.oom ? `<span class="x" style="width:${Math.max(0, Math.min(100, sc) - freeP).toFixed(1)}%;background:repeating-linear-gradient(135deg,var(--bad) 0 6px,color-mix(in srgb,var(--bad) 60%,transparent) 6px 12px)"></span>` : ""}`}</div>
     <div class="memstat${R.oom ? " bad" : ""}">${S.flash ? "Score tiles live in each SM's 228 KB of on-chip memory and are thrown away after use." : R.oom ? `Out of memory: tried to allocate ${f1(R.scoresGB)} GB with ${f1(R.free)} GB free.` : `Fits, but writing and re-reading it costs ${f0(R.attnTraffic / 1e9)} GB of HBM traffic.`}</div></div>`;
  }
  if (P.includes("timeline")) {
    if (S.mode === "prefill") {
      const R = w2prefill(S);
      h += `<div><div class="tlwrap">${tlSVG(S, R)}</div>${tlLegend()}</div>
      <div class="tiles"><div class="tile${R.oom ? " flag" : ""}"><div class="k">First token</div><div class="v">${R.oom ? "crash" : fmtT(R.ttft)}</div><div class="s">${f0(R.N)}-token prompt</div></div>
      <div class="tile"><div class="k">Linear layers</div><div class="v">${fmtT(R.gemm)}</div><div class="s">compute-bound GEMMs</div></div>
      <div class="tile${R.oom ? " flag" : ""}"><div class="k">Attention</div><div class="v">${R.oom ? "OOM" : fmtT(R.attn)}</div><div class="s">${S.flash ? "FlashAttention" : "plain, via HBM"}</div></div>
      <div class="tile"><div class="k">Small ops</div><div class="v">${fmtT(R.elem)}</div><div class="s">${R.nE} per layer${S.fuse ? ", fused" : ""}</div></div></div>`;
    } else {
      const R = w2decode(S);
      h += `<div><div class="tlwrap">${tlSVG(S, R)}</div>${tlLegend()}</div>
      <div class="tiles"><div class="tile"><div class="k">Per token</div><div class="v">${fmtT(R.step / 1e6)}</div><div class="s">${f0(R.tps)} tok/s</div></div>
      <div class="tile${R.busy < 0.6 ? " flag" : ""}"><div class="k">GPU busy</div><div class="v">${f1(R.busy * 100)}%</div><div class="s">time a kernel is running</div></div>
      <div class="tile"><div class="k">Kernels</div><div class="v">${R.n}</div><div class="s">per token</div></div>
      <div class="tile"><div class="k">CPU launching</div><div class="v">${fmtT(R.cpuT / 1e6)}</div><div class="s">${S.graphs ? "one graph replay" : "one launch at a time"}</div></div></div>`;
    }
  }
  if (P.includes("timeline") || showMem) h += w2Math(S);
  $("#simBody").innerHTML = `<div class="w2grid">${h}</div>`;
}
/** The sim card's title and caption, set before the controls are drawn. */
export function simHeader(L: Playable) {
  const S = state();
  $("#simTitle").textContent = L.panels!.includes("container")
    ? "GPU server · containers"
    : L.panels!.includes("stack") && !L.panels!.includes("timeline")
      ? "From Python to silicon"
      : `Kernel profiler · H100 · ${MODELS[S.model].name}`;
  $("#simCap").innerHTML = L.panels!.includes("container")
    ? "What runs where on one GPU server. Green means that link works, red means it's the problem."
    : L.panels!.includes("timeline")
      ? "A timeline of what the CPU and GPU are doing. Each block on the GPU row is one kernel; hatched red means the GPU is sitting idle."
      : "Each row is one layer of software. Tap a row to inspect it.";
}
