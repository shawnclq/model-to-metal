import type { W3State } from "../../core/types.ts";
import { state } from "./state.ts";
import { $, esc, f0, f1, f2, fmtMoney, fmtT, kfmt } from "../../shared/data/format.ts";
import { computeRate } from "../../shared/engine/gpu.ts";
import { W3Result, w3 } from "../../shared/engine/server.ts";
import { TCOL } from "../../shared/ui/colors.ts";
import { stopFlicker } from "../../shared/ui/flicker.ts";
import { infoHtml } from "../../shared/ui/info.ts";
// World 3's sim panel: the 8-GPU board and its links.
export function boardSVG(S: W3State, M: W3Result) {
  const hgx = S.srv === "hgx" || S.srv === "hgxb200",
    mesh = !!M.srv.mesh,
    u = M.tp > 1 ? Math.min(1, 0.25 + M.commShare * 1.6) : 0,
    dur = Math.max(0.3, 1.6 - u * 1.3).toFixed(2);
  let o = `<svg viewBox="0 0 600 290" role="img" aria-label="${esc(M.srv.name)}: 8 GPUs, ${M.rep} replicas of TP ${M.tp}">`;
  o += `<rect x="4" y="4" width="592" height="282" rx="12" class="pkg"/>`;
  const pos = (i: number) => ({ x: 22 + (i % 4) * 143, y: i < 4 ? 18 : 198, w: 127, h: 74 });
  const lane = (x1: number, y1: number, x2: number, y2: number, k: string) =>
    `<line class="lane${u < 0.01 ? " idle" : ""}" data-i="${k}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="--dur:${dur}s;opacity:${(0.3 + u * 0.7).toFixed(2)};stroke-width:${hgx ? 3 : 2}"/>`;
  if (mesh) {
    const ctr = (i: number) => {
      const p = pos(i);
      return [p.x + p.w / 2, i < 4 ? p.y + p.h : p.y];
    };
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        const [a, b] = ctr(i),
          [c, d] = ctr(j);
        o += lane(a, b, c, d, "ifmesh").replace("stroke-width:2", "stroke-width:1.4");
      }
    o += `<g data-i="ifmesh" style="cursor:pointer"><rect x="215" y="131" width="170" height="28" rx="4" class="die"/><text class="dielbl" x="300" y="149" text-anchor="middle" fill="#DCE8E3">Infinity Fabric mesh</text></g>`;
  } else if (hgx) {
    const sw = [0, 1, 2, 3].map((j) => ({ x: 135 + j * 90, y: 128, w: 62, h: 34 }));
    for (let i = 0; i < 8; i++) {
      const p = pos(i),
        cx = p.x + p.w / 2,
        cy = i < 4 ? p.y + p.h : p.y;
      sw.forEach((s) => {
        o += lane(cx, cy, s.x + s.w / 2, i < 4 ? s.y : s.y + s.h, "nvlink");
      });
    }
    sw.forEach((s) => {
      o += `<g data-i="nvswitch" style="cursor:pointer"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" class="die"/><text class="dielbl" x="${s.x + s.w / 2}" y="${s.y + 21}" text-anchor="middle" fill="#DCE8E3">NVSwitch</text></g>`;
    });
  } else {
    const ps = [
        { x: 70, y: 128, w: 96, h: 34, l: "PCIe switch" },
        { x: 434, y: 128, w: 96, h: 34, l: "PCIe switch" },
      ],
      cpu = [
        { x: 214, y: 128, w: 70, h: 34, l: "CPU 0" },
        { x: 316, y: 128, w: 70, h: 34, l: "CPU 1" },
      ];
    for (let i = 0; i < 8; i++) {
      const p = pos(i),
        s = ps[i % 4 < 2 ? 0 : 1],
        cx = p.x + p.w / 2,
        cy = i < 4 ? p.y + p.h : p.y;
      o += lane(cx, cy, s.x + s.w / 2, i < 4 ? s.y : s.y + s.h, "pcie");
    }
    o += lane(166, 145, 214, 145, "pcie") + lane(284, 145, 316, 145, "pcie") + lane(386, 145, 434, 145, "pcie");
    [...ps, ...cpu].forEach((s) => {
      o += `<g data-i="pcie" style="cursor:pointer"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" class="die"/><text class="dielbl" x="${s.x + s.w / 2}" y="${s.y + 21}" text-anchor="middle" fill="#DCE8E3">${s.l}</text></g>`;
    });
  }
  for (let i = 0; i < 8; i++) {
    const p = pos(i),
      grp = Math.floor(i / M.tp),
      c = TCOL[grp % TCOL.length],
      fr = Math.min(1, M.usedPer / M.g.mem);
    o += `<g data-i="gpu8" style="cursor:pointer"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="var(--panel)" stroke="${c}" stroke-width="2"/><rect x="${p.x}" y="${p.y}" width="${p.w}" height="7" rx="3" fill="${c}"/>`;
    o += `<text class="chiplbl" x="${p.x + 8}" y="${p.y + 25}">${M.g.vendor === "amd" ? "GPU " + i + " · " + M.g.name : "GPU " + i}</text><text class="chiplbl dim" x="${p.x + p.w - 8}" y="${p.y + 25}" text-anchor="end">${M.rep > 1 ? "replica " + (grp + 1) : "TP rank " + i}</text>`;
    o += `<rect x="${p.x + 8}" y="${p.y + 38}" width="${p.w - 16}" height="11" rx="2" fill="var(--panel-2)" stroke="var(--rule)"/><rect x="${p.x + 8}" y="${p.y + 38}" width="${((p.w - 16) * fr).toFixed(1)}" height="11" rx="2" fill="${M.fits ? "var(--wt)" : "var(--bad)"}"/>`;
    o += `<text class="chiplbl dim" x="${p.x + 8}" y="${p.y + 65}">${f1(M.usedPer)} / ${M.g.mem} GB</text></g>`;
  }
  return o + `</svg>`;
}
export function w3Math(S: W3State, M: W3Result) {
  const m = M.m,
    L: string[] = [],
    srv = M.srv;
  L.push(`<span class="h">LAYOUT</span>  8 GPUs = ${M.rep} replica${M.rep > 1 ? "s" : ""} × TP ${M.tp}`);
  L.push(`weights per GPU = ${f1((m.P * M.d.bytes) / 1e9)} GB ÷ ${M.tp} = ${f1(M.wPer)} GB`);
  L.push(
    `KV per GPU      = ${S.batch} users × ${f0(S.ctx)} tokens × ${f2(M.kvT / 1e6)} MB ÷ ${M.tp} = ${f1(M.kvPer)} GB`,
  );
  L.push(
    `total per GPU   = ${f1(M.usedPer)} GB of ${M.g.mem} → ${M.fits ? "fits" : '<span class="r">does not fit</span>'}`,
  );
  L.push("");
  L.push(`<span class="h">ONE DECODE STEP</span> (per replica, ${S.batch} users)`);
  L.push(`read = ${f1(M.readPer + M.kvPer)} GB per GPU ÷ (${M.g.bw} TB/s × 80%)        = ${fmtT(M.tMem)}`);
  L.push(
    `math = 2 × ${f1(M.act / 1e9)} B × ${S.batch} ÷ ${M.tp} GPUs ÷ (${f0(computeRate(M.g, S.dtype))} × 60%) = ${fmtT(M.tComp)}`,
  );
  L.push(
    M.tp > 1
      ? `talk = ${M.nAR} all-reduces (2 per layer × ${m.L}) × ${f1(M.arDec * 1e6)} µs each = ${fmtT(M.tComm)}`
      : `talk = none (TP 1: GPUs never talk)`,
  );
  if (M.tp > 1)
    L.push(
      `       each all-reduce: ${f0((S.batch * m.h * 2) / 1e3)} KB over ${srv.short}, ${f0(srv.bw / 1e9)} GB/s, ~${f0(srv.lat * 1e6)} µs latency`,
    );
  L.push(`step = max(read, math) + talk = ${fmtT(M.step)}  (talk = ${f0(M.commShare * 100)}%)`);
  L.push(
    `per user ${f1(M.perUser)} tok/s · replica ${f0(M.repT)} tok/s · server ${M.rep} × ${f0(M.repT)} = ${f0(M.total)} tok/s`,
  );
  L.push(`cost = $${srv.price}/hr ÷ (${f0(M.total)} × 3,600) × 1M = ${fmtMoney(M.cost)} per 1M tokens`);
  L.push("");
  L.push(`<span class="h">PREFILL</span> (${f0(S.prompt)}-token prompt)`);
  L.push(
    `math = ${fmtT(M.preC)} · talk = ${M.nAR} × all-reduce of ${f0((S.prompt * m.h * 2) / 1e6)} MB = ${fmtT(M.preComm)} → first token ${fmtT(M.ttft)}`,
  );
  return `<pre class="mathbox">${L.join("\n")}</pre>`;
}
export function renderW3() {
  const S = state(),
    M = w3(S);
  stopFlicker();
  $("#simActs").innerHTML = "";
  $("#simTitle").textContent = `${M.srv.name} · ${M.m.name}`;
  $("#simCap").innerHTML =
    `Eight ${M.g.name}s on one board. ${M.srv.mesh ? "Every GPU has its own <b>Infinity Fabric</b> link to every other GPU (a mesh, no switch)" : S.srv === "pcie" ? "GPUs reach each other through <b>PCIe switches</b> and the <b>CPUs</b>" : "Each GPU links to all four <b>NVSwitch</b> chips"}. Same colour = one copy of the model (a replica); the bar in each GPU is its memory. Dashes move when GPUs talk.`;
  const t = [
    ["Layout", `${M.rep} × TP ${M.tp}`, M.rep > 1 ? `${M.rep} copies of the model` : "one copy across 8 GPUs"],
    ["Per user", M.fits ? f1(M.perUser) + " tok/s" : "—", "speed each person sees"],
    ["Server", M.fits ? f0(M.total) + " tok/s" : "—", "all replicas combined"],
    ["First token", M.fits ? fmtT(M.ttft) : "—", `${kfmt(S.prompt)}-token prompt`],
    ["GPUs talking", M.fits ? f0(M.commShare * 100) + "%" : "—", "of each decode step"],
    ["Cost", M.fits ? fmtMoney(M.cost) : "—", "per 1M tokens"],
  ];
  $("#simBody").innerHTML = `<div class="w2grid"><div class="chipwrap">${boardSVG(S, M)}</div>
   ${M.fits ? "" : `<div class="memstat bad">Out of memory: each GPU needs ${f1(M.usedPer)} GB of ${M.g.mem} GB.</div>`}
   <div class="tiles">${t.map((x) => `<div class="tile${M.fits ? "" : " flag"}"><div class="k">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${x[2]}</div></div>`).join("")}</div>
   <div class="inspect" id="inspect">${S.info ? infoHtml(S.info) : '<span class="tip">Tap a GPU, an NVSwitch or a link to learn what it does.</span>'}</div>
   ${w3Math(S, M)}</div>`;
}
