import type { W4State } from "../../core/types.ts";
import { w4train } from "./engine.ts";
import { state } from "./state.ts";
import { $, esc, f0, f1, f2, fmtT, kfmt } from "../../shared/data/format.ts";
import { NETS } from "../../shared/data/hardware.ts";
import { INFO } from "../../shared/data/info.ts";
import { w4serve } from "../../shared/engine/cluster.ts";
import { host } from "../../shared/host.ts";
import { TCOL } from "../../shared/ui/colors.ts";
import { stopFlicker } from "../../shared/ui/flicker.ts";
import { infoHtml } from "../../shared/ui/info.ts";
// World 4's sim panel: servers, NICs, leaf and spine switches, and what runs where.
export interface ClusterInfo {
  u: number;
  color: (gi: number) => string | null;
  label?: (gi: number) => string;
}
export function clusterSVG(S: W4State, info: ClusterInfo) {
  const n = S.nodes,
    W = 640,
    gap = 14,
    nw = (W - 24 - gap * (n - 1)) / n,
    ny = 128,
    nh = 150,
    net = NETS[S.net];
  const u = info.u,
    dur = Math.max(0.3, 1.6 - u * 1.3).toFixed(2);
  let o = `<svg viewBox="0 0 ${W} 290" role="img" aria-label="${n} servers on ${esc(net.name)}">`;
  o += `<g data-i="spine" style="cursor:pointer"><rect x="${W / 2 - 150}" y="8" width="300" height="24" rx="4" class="die"/><text class="dielbl" x="${W / 2}" y="24" text-anchor="middle" fill="#DCE8E3">spine switches</text></g>`;
  for (let k = 0; k < 5; k++) {
    const x = W / 2 - 120 + k * 60;
    o += `<line class="lane${u < 0.01 ? " idle" : ""}" data-i="spine" x1="${x}" y1="32" x2="${x}" y2="66" style="--dur:${dur}s;opacity:${(0.3 + u * 0.7).toFixed(2)}"/>`;
  }
  o += `<g data-i="leaf" style="cursor:pointer"><rect x="12" y="66" width="${W - 24}" height="24" rx="4" class="die"/><text class="dielbl" x="${W / 2}" y="82" text-anchor="middle" fill="#DCE8E3">leaf switches · ${net.rdma ? "one per rail (GPU 1–8)" : "one Ethernet switch"} · ${esc(net.name)}</text></g>`;
  for (let i = 0; i < n; i++) {
    const x = 12 + i * (nw + gap),
      host = "node-" + (i + 1),
      isHead = S.ray && S.ray.head === host,
      isW = S.ray && S.ray.workers.includes(host),
      cur = S.host === host;
    const nics = net.key === "eth" ? [x + nw / 2] : [...Array(8)].map((_, k) => x + 10 + (k * (nw - 20)) / 7);
    nics.forEach((nx) => {
      o += `<line class="lane${u < 0.01 ? " idle" : ""}" data-i="nic" x1="${nx}" y1="${ny}" x2="${nx}" y2="90" style="--dur:${dur}s;opacity:${(0.3 + u * 0.7).toFixed(2)};stroke-width:${net.key === "eth" ? 2 : 3}"/>`;
    });
    o += `<g data-i="node" style="cursor:pointer"><rect x="${x}" y="${ny}" width="${nw}" height="${nh}" rx="8" fill="var(--panel)" stroke="${cur ? "var(--signal)" : "var(--rule)"}" stroke-width="${cur ? 3 : 1.5}"/>`;
    o += `<text class="chiplbl" x="${x + 8}" y="${ny + 20}">${host}${cur ? " · you" : ""}</text></g>`;
    if (isHead || isW)
      o += `<g data-i="rayhead" style="cursor:pointer"><rect x="${x + nw - 62}" y="${ny + 8}" width="54" height="16" rx="3" fill="${isHead ? "var(--sea)" : "var(--ok)"}"/><text x="${x + nw - 35}" y="${ny + 20}" text-anchor="middle" style="font-family:var(--mono);font-size:10px;fill:#fff">${isHead ? "ray head" : "worker"}</text></g>`;
    nics.forEach((nx) => {
      o += `<rect data-i="nic" x="${nx - 4}" y="${ny - 4}" width="8" height="8" rx="1" fill="var(--signal)" style="cursor:pointer"/>`;
    });
    const cols = 4,
      gw = (nw - 24 - 3 * 6) / cols,
      gh = 34;
    for (let k = 0; k < 8; k++) {
      const gx = x + 12 + (k % 4) * (gw + 6),
        gy = ny + 34 + Math.floor(k / 4) * (gh + 8),
        gi = i * 8 + k;
      const c = info.color(gi);
      o += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="3" fill="${c || "var(--panel-2)"}" stroke="var(--rule)" data-i="node" style="cursor:pointer"/><text x="${gx + 5}" y="${gy + 14}" style="font-family:var(--mono);font-size:9.5px;fill:${c ? "#fff" : "var(--muted)"}">GPU ${k}</text>${info.label ? `<text x="${gx + 5}" y="${gy + 27}" style="font-family:var(--mono);font-size:9px;fill:${c ? "#fff" : "var(--muted)"}">${info.label(gi) || ""}</text>` : ""}`;
    }
    o += `<text class="chiplbl dim" x="${x + 8}" y="${ny + nh - 10}">8 × H100 · NVLink inside</text>`;
  }
  return o + `</svg>`;
}
export function rayGPUs(S: W4State) {
  return S.ray.head ? 8 * (1 + S.ray.workers.length) : 0;
}
export function renderW4() {
  const S = state(),
    L = host.G.level!;
  stopFlicker();
  $("#simActs").innerHTML = "";
  const net = NETS[S.net];
  let tiles: [string, string, string][] = [],
    math: string[] = [],
    info: ClusterInfo;
  $("#simTitle").textContent =
    S.mode === "train"
      ? `Training cluster · ${S.nodes} node${S.nodes > 1 ? "s" : ""} · ${net.name}`
      : `Cluster · ${S.nodes} nodes · ${net.name}`;
  $("#simCap").innerHTML =
    `Each box is one 8-GPU server. Yellow squares on top are its NICs (one per GPU on RDMA fabrics); lines run up to the leaf and spine switches. Dashes move with cross-server traffic.${S.mode === "serve" ? " GPU colours show pipeline stages." : ""}`;
  if (S.mode === "train") {
    const T = w4train(S);
    info = {
      u: S.nodes > 1 ? Math.min(1, 0.2 + (T.inter / T.step) * 2) : 0,
      color: () => "var(--sea)",
      label: () => "DP rank",
    };
    tiles = [
      ["Step time", fmtT(T.step), `compute ${fmtT(T.c)}`],
      ["Scaling", f1(T.eff * 100) + "%", S.nodes > 1 ? `of ideal on ${S.nodes} nodes` : "baseline: one node"],
      ["Throughput", f0(T.tput / 1e3) + "k tok/s", `ideal ${f0(T.ideal / 1e3)}k`],
      ["Gradient sync", fmtT(T.intra + T.inter), `network part ${fmtT(T.inter)}`],
      [
        "Per-GPU network",
        f1(T.bw / 1e9) + " GB/s",
        `${net.rdma ? (S.gdr ? "RDMA + GPUDirect" : "RDMA via CPU memory") : "TCP, no RDMA"}`,
      ],
    ];
    math = [
      `<span class="h">ONE TRAINING STEP</span> · ${T.m.name} · ${S.nodes} × 8 GPUs · ${f0(T.tokGPU)} tokens per GPU`,
      `compute  = 6 × ${f2(T.m.P / 1e9)} B × ${f0(T.tokGPU)} tokens ÷ (989 TFLOPS × 45%) = ${fmtT(T.c)}`,
      `gradients = ${f1(T.grad / 1e9)} GB (BF16), all-reduced every step`,
      `inside each node (NVLink) = 2 × 7/8 × ${f1(T.grad / 1e9)} GB ÷ 450 GB/s = ${fmtT(T.intra)}`,
      S.nodes > 1
        ? `across nodes (per rail) = 2 × ${S.nodes - 1}/${S.nodes} × ${f1(T.grad / 8e9)} GB ÷ ${f1(T.bw / 1e9)} GB/s = ${fmtT(T.inter)}`
        : `across nodes = none (one node)`,
      `   per-GPU bandwidth: ${esc(net.d)}${net.rdma && !S.gdr ? "; without GPUDirect, copies through CPU memory cut it to ~35%" : ""}`,
      `step = ${fmtT(T.c)} + ${fmtT(T.intra)} + ${fmtT(T.inter)} = ${fmtT(T.step)}`,
      `scaling efficiency = one-node step ÷ this step = ${fmtT(T.one)} ÷ ${fmtT(T.step)} = ${f1(T.eff * 100)}%`,
    ];
  } else if (S.mode === "serve") {
    const R = S.job ? w4serve(S) : null;
    info = {
      u: R ? Math.min(1, R.tpSpans ? 0.25 + R.commShare * 1.5 : 0.12) : 0,
      color: (gi: number) => {
        if (!R || gi >= R.n) return null;
        return TCOL[Math.floor(gi / R.tp) % TCOL.length];
      },
      label: (gi: number) => (!R || gi >= R.n ? "" : R.pp > 1 ? "stage " + (Math.floor(gi / R.tp) + 1) : "TP " + gi),
    };
    if (R) {
      tiles = [
        [
          "TP × PP",
          `${R.tp} × ${R.pp}`,
          R.tpSpans ? "TP group crosses servers" : R.pp > 1 ? "TP inside, PP across" : "one server",
        ],
        ["Per user", R.fits ? f1(R.perUser) + " tok/s" : "—", "speed each person sees"],
        ["First token", R.fits ? fmtT(R.ttft) : "—", `${kfmt(S.prompt)}-token prompt`],
        ["Per GPU", f1(R.usedPer) + " GB", "of 80 GB"],
        ["Talking", f0(R.commShare * 100) + "%", "of each token's time"],
        [
          "Ray",
          rayGPUs(S) + " GPUs",
          S.ray.head ? `${1 + S.ray.workers.length} node${S.ray.workers.length ? "s" : ""}` : "not started",
        ],
      ];
      math = [
        `<span class="h">LAYOUT</span> ${R.m.name} ${R.d.name} on TP ${R.tp} × PP ${R.pp} = ${R.n} GPUs`,
        `per GPU = ${f0((R.m.P * R.d.bytes) / 1e9)} GB ÷ ${R.n} + KV ${f1(R.kvPer)} + 3 = ${f1(R.usedPer)} GB → ${R.fits ? "fits" : '<span class="r">does not fit</span>'}`,
        `TP all-reduces travel over ${R.tpSpans ? '<span class="r">the network (' + esc(R.net.name) + ")</span>" : "NVLink (inside a server)"}; PP hand-offs ${R.pp > 1 ? "cross the network once per stage" : "none"}`,
        "",
        `<span class="h">ONE TOKEN</span> walks through ${R.pp} stage${R.pp > 1 ? "s" : ""} in turn`,
        `per stage: read ${fmtT(R.stageRead)} + ${f0((R.m.L / R.pp) * 2)} all-reduces ${fmtT(R.stageComm)}`,
        `token = ${R.pp} × (${fmtT(R.stageRead)} + ${fmtT(R.stageComm)}) + hand-offs ${fmtT(R.send)} = ${fmtT(R.tok)} → ${f1(R.perUser)} tok/s`,
        "",
        `<span class="h">PREFILL</span> ${f0(S.prompt)} tokens`,
        `math ${fmtT(R.preC)} + all-reduces ${fmtT(R.preComm)} (${f0((S.prompt * R.m.h * 2) / 1e6)} MB each, ${R.m.L * 2} of them) + hand-offs ${fmtT(R.preSend)} = ${fmtT(R.ttft)}`,
      ];
    } else
      tiles = [
        [
          "Ray",
          rayGPUs(S) + " GPUs",
          S.ray.head ? `${1 + S.ray.workers.length} node${S.ray.workers.length ? "s" : ""} joined` : "not started",
        ],
        ["Model", "not running", "needs 812 GB: 2 servers"],
        ["You are on", S.host, "ssh node-2 / exit"],
      ];
  } else {
    info = { u: S.flags.ibbw ? 0.6 : 0, color: () => null };
    tiles = [
      ["Network", net.name, net.s + " per server"],
      ["Per GPU", f1(net.perGPU / 1e9) + " GB/s", net.rdma ? "its own NIC (rail)" : "shared NIC"],
      ["NVLink per GPU", "450 GB/s", "each way, inside a server"],
      ["Gap", `${f0(450e9 / net.perGPU)}×`, "slower to leave the server"],
    ];
  }
  $("#simBody").innerHTML = `<div class="w2grid"><div class="tlwrap">${clusterSVG(S, info)}</div>
   <div class="tiles">${tiles.map((x) => `<div class="tile"><div class="k">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${x[2]}</div></div>`).join("")}</div>
   <div class="inspect" id="inspect">${S.info && INFO[S.info] ? infoHtml(S.info) : '<span class="tip">Tap a server, a NIC (yellow), a leaf or spine switch, or a Ray badge.</span>'}</div>
   ${math.length ? `<pre class="mathbox">${math.join("\n")}</pre>` : ""}</div>`;
}
