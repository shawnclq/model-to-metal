import { state } from "./state.ts";
import type { Gpu } from "../../shared/data/types.ts";
import type { W1State } from "../../core/types.ts";
import { MIGP, TENANTS } from "./data.ts";
import { migAssign } from "./engine.ts";
import { $, esc, f0, f1, f2, fmtMoney, fmtT, kfmt } from "../../shared/data/format.ts";
import { ALL_GPUS, GPUS } from "../../shared/data/hardware.ts";
import { ATT_EFF, DEC_EFF, DTYPES, MEM_EFF, PRE_EFF, RESERVE } from "../../shared/data/models.ts";
import { W1Result, w1 } from "../../shared/engine/gpu.ts";
import { host } from "../../shared/host.ts";
import { TCOL } from "../../shared/ui/colors.ts";
import { setUtil, startFlicker, stopFlicker } from "../../shared/ui/flicker.ts";
import { infoHtml } from "../../shared/ui/info.ts";
// World 1's sim panels: the chip seen from above (NVIDIA and AMD), the roofline, MIG partitions, Pick the GPU.
export const DIS_H = [7, 19, 30, 44, 51, 66, 78, 85, 99, 110, 122, 137];
export function chipSVG(S: W1State, M: W1Result) {
  if (M.g.vendor === "amd") return chipSVGamd(S, M);
  const g = M.g,
    frac = Math.min(1, M.used / g.mem),
    oom = !M.fits;
  const u = M.fits ? M.bwUtil : 0,
    dur = Math.max(0.35, 1.7 - u * 1.6).toFixed(2);
  let o = `<svg viewBox="0 0 600 300" role="img" aria-label="${esc(g.name)} package: ${g.sms} SMs, ${g.active} HBM stacks, memory ${Math.round(frac * 100)}% full">`;
  o += `<rect x="8" y="8" width="584" height="284" rx="16" class="pkg"/>`;
  const dies =
    g.dies === 1
      ? [{ x: 205, y: 44, w: 190, h: 206 }]
      : [
          { x: 168, y: 44, w: 128, h: 206 },
          { x: 304, y: 44, w: 128, h: 206 },
        ];
  const st: { x: number; y: number; w: number; h: number; side: string }[] = [];
  if (g.dies === 1) {
    [0, 1, 2].forEach((i) => {
      st.push({ x: 112, y: 44 + i * 72, w: 78, h: 62, side: "l" });
      st.push({ x: 410, y: 44 + i * 72, w: 78, h: 62, side: "r" });
    });
  } else {
    [0, 1, 2, 3].forEach((i) => {
      st.push({ x: 56, y: 44 + i * 53, w: 96, h: 45, side: "l" });
      st.push({ x: 448, y: 44 + i * 53, w: 96, h: 45, side: "r" });
    });
  }
  st.forEach((s, i) => {
    const dummy = i >= g.active * 1 && g.active < g.stacks && i === st.length - 1;
    const cy = s.y + s.h / 2,
      x1 = s.side === "l" ? s.x + s.w + 3 : s.x - 3,
      x2 =
        s.side === "l"
          ? g.dies === 1
            ? dies[0].x - 2
            : dies[0].x - 2
          : g.dies === 1
            ? dies[0].x + dies[0].w + 2
            : dies[1].x + dies[1].w + 2;
    if (!dummy)
      o += `<line class="lane${u < 0.01 ? " idle" : ""}" data-i="bw" x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" style="--dur:${dur}s;opacity:${(0.3 + u * 0.85).toFixed(2)}"><title>Memory bandwidth</title></line>`;
    const fh = dummy ? 0 : Math.max(0, s.h - 4) * frac;
    o += `<g class="stack${oom ? " oom" : ""}${dummy ? " dummy" : ""}" data-i="hbm"><title>${dummy ? "Spacer (no memory)" : g.hbm + " stack · " + g.stackGB + " GB"}</title><rect class="shell" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4"/>`;
    if (!dummy)
      o += `<rect class="fill" x="${s.x + 2}" y="${(s.y + s.h - 2 - fh).toFixed(1)}" width="${s.w - 4}" height="${fh.toFixed(1)}" rx="2"/><text class="stklbl" x="${s.x + 6}" y="${s.y + 14}">${g.stackGB} GB</text>`;
    else o += `<text class="chiplbl dim" x="${s.x + 8}" y="${s.y + s.h / 2 + 4}">spacer</text>`;
    o += `</g>`;
  });
  const perDie = g.smPhys! / g.dies!,
    enabled = g.sms! / g.dies!; /* NVIDIA past this point: AMD returned above */
  dies.forEach((d, di) => {
    o += `<rect class="die" data-i="sm" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="3"><title>GPU die</title></rect>`;
    const cols = g.dies === 1 ? 12 : 8,
      rows = Math.ceil(perDie / cols),
      gap = 2,
      cw = (d.w - 12 - gap * (cols - 1)) / cols,
      ch = (d.h - 30 - gap * (rows - 1)) / rows;
    let drawn = 0;
    for (let i = 0; i < perDie; i++) {
      const c = i % cols,
        r = Math.floor(i / cols);
      const x = d.x + 6 + c * (cw + gap),
        y = d.y + 6 + r * (ch + gap);
      let dis = false;
      if (g.dies === 1) dis = DIS_H.includes(i);
      else dis = i >= enabled;
      if (!dis) drawn++;
      o += `<rect class="sm${dis ? " dis" : ""}" ${dis ? "" : 'data-i="sm"'} x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="1"/>`;
    }
    o += `<text class="dielbl" x="${d.x + 6}" y="${d.y + d.h - 8}" fill="#DCE8E3">${g.dies === 1 ? g.sms + " SMs · 528 Tensor Cores" : "die " + (di + 1) + " · " + enabled + " SMs"}</text>`;
  });
  if (g.dies === 2)
    o += `<rect class="linkbar" data-i="link" x="297" y="110" width="6" height="80" rx="2"><title>Die-to-die link</title></rect>`;
  o += `<text class="chiplbl" x="22" y="276">${esc(g.name)} · ${esc(g.arch)} · ${g.mem} GB ${g.hbm} · ${g.bw} TB/s · ${f0(g.fp8)} TFLOPS FP8${g.fp4 ? " · " + f0(g.fp4) + " FP4" : ""}</text>`;
  if (oom)
    o += `<text class="chiplbl" x="400" y="34" fill="var(--bad)" style="fill:var(--bad);font-weight:600">OUT OF MEMORY</text>`;
  return o + `</svg>`;
}
export function roofSVG(S: W1State, M: W1Result) {
  const g = M.g,
    W = 600,
    H = 270,
    ml = 56,
    mr = 18,
    mt = 18,
    mb = 42;
  const xmin = 0.5,
    xmax = 16384,
    ymin = 0.5,
    ymax = Math.pow(10, Math.ceil(Math.log10(M.peakTF * 1.8)));
  const L10 = Math.log10,
    lx = (v: number) => ml + ((L10(v) - L10(xmin)) / (L10(xmax) - L10(xmin))) * (W - ml - mr),
    ly = (v: number) => H - mb - ((L10(Math.max(v, ymin)) - L10(ymin)) / (L10(ymax) - L10(ymin))) * (H - mt - mb);
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Roofline chart">`;
  [1, 10, 100, 1000, 10000].forEach((x) => {
    o += `<line class="ax" x1="${lx(x)}" y1="${mt}" x2="${lx(x)}" y2="${H - mb}"/><text class="axt" x="${lx(x)}" y="${H - mb + 14}" text-anchor="middle">${f0(x)}</text>`;
  });
  for (let y = 1; y <= ymax; y *= 10) {
    o += `<line class="ax" x1="${ml}" y1="${ly(y)}" x2="${W - mr}" y2="${ly(y)}"/><text class="axt" x="${ml - 6}" y="${ly(y) + 3}" text-anchor="end">${f0(y)}</text>`;
  }
  o += `<text class="axt" x="${(ml + W - mr) / 2}" y="${H - 8}" text-anchor="middle">arithmetic intensity: FLOPs per byte read from HBM (log)</text>`;
  o += `<text class="axt" x="14" y="${(mt + H - mb) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(mt + H - mb) / 2})">TFLOPS achieved (log)</text>`;
  const ridge = M.ridge;
  o += `<polyline class="roof" points="${lx(xmin)},${ly(g.bw * xmin)} ${lx(ridge)},${ly(M.peakTF)} ${lx(xmax)},${ly(M.peakTF)}"/>`;
  o += `<line class="ridge" x1="${lx(ridge)}" y1="${ly(M.peakTF)}" x2="${lx(ridge)}" y2="${H - mb}"/>`;
  o += `<text class="axt" x="${lx(ridge) + 5}" y="${H - mb - 6}">ridge ≈ ${f0(ridge)}</text>`;
  o += `<text class="zone" x="${lx(2) + 12}" y="${ly(g.bw * 2) + 18}">memory roof: ${g.bw} TB/s</text>`;
  o += `<text class="zone" x="${lx(ridge) + 8}" y="${ly(M.peakTF) - 6}">compute roof: ${f0(M.peakTF)} TFLOPS ${DTYPES[S.dtype].name}</text>`;
  if (M.fits) {
    const px = lx(Math.min(xmax, Math.max(xmin, M.I))),
      py = ly(M.achTF);
    o += `<circle class="pt-dec" cx="${px}" cy="${py}" r="7"/><text class="ptl" x="${px + 10}" y="${py + 16}">decode · ${S.batch} user${S.batch > 1 ? "s" : ""} · ${f1(M.achTF)} TFLOPS</text>`;
    const qx = lx(Math.min(xmax, M.preI)),
      qy = ly(M.preTF);
    o += `<circle class="pt-pre" cx="${qx}" cy="${qy}" r="7"/><text class="ptl" x="${qx + 10}" y="${qy + 22}" text-anchor="end">prefill · ${kfmt(S.prompt)}-token prompt</text>`;
  }
  return o + `</svg>`;
}
export function w1Math(S: W1State, M: W1Result) {
  const g = M.g,
    m = M.m,
    d = M.d,
    kvMB = M.kvT / 1e6;
  const L = [];
  L.push(`<span class="h">MEMORY</span>`);
  L.push(
    `Weights   = ${f1(m.P / 1e9)} B params × ${d.bytes} byte${d.bytes === 1 ? "" : "s"} (${d.name})${" ".repeat(Math.max(1, 14 - d.name.length))}= ${f1(M.wGB)} GB`,
  );
  L.push(
    `KV cache  = ${S.batch} user${S.batch > 1 ? "s" : ""} × ${f0(S.ctx)} tokens × ${f2(kvMB)} MB/token = ${f1(M.kvGB)} GB`,
  );
  L.push(
    `            (${f2(kvMB)} MB = 2 [K,V] × ${m.L} layers × ${m.kvh} KV heads × ${m.hd} dims × ${M.kvd.f === 1 ? "2 bytes" : "1 byte (FP8 KV)"})`,
  );
  L.push(`Runtime   ≈ ${RESERVE} GB (CUDA context, activations, workspace)`);
  L.push(
    `Total     = ${f1(M.used)} GB  vs  ${g.mem} GB on ${g.name}  → ${M.fits ? "fits" : '<span class="r">does not fit</span>'}`,
  );
  if (M.fp4bad) L.push(`<span class="r">FP4 needs Blackwell Tensor Cores. Hopper has no FP4 math.</span>`);
  L.push("");
  L.push(`<span class="h">ONE DECODE STEP</span> (one new token for every user)`);
  if (m.moe)
    L.push(
      `experts touched = 1 − (1 − ${m.moe.k}/${m.moe.E})^${S.batch} = ${f0(M.touched * 100)}% of ${f0(m.moe.expTotal / 1e9)} B expert params; + ${f0(m.moe.nonExp / 1e9)} B shared → read ${f1(M.readGB)} GB of weights`,
    );
  L.push(`read  = ${f1(M.readGB + M.kvGB)} GB ÷ (${g.bw} TB/s × ${MEM_EFF * 100}% achievable)  = ${fmtT(M.tMem)}`);
  L.push(
    `math  = 2 × ${f1(M.act / 1e9)} B${m.moe ? " active" : ""} × ${S.batch} = ${f1(M.flops / 1e12)} TFLOP ÷ (${f0(M.peakTF)} TFLOPS × ${DEC_EFF * 100}%) = ${fmtT(M.tComp)}${S.dtype === "int4" ? "   (INT4 is weight-only: math runs at BF16 speed)" : ""}`,
  );
  L.push(`step  = the slower of the two = ${fmtT(M.step)} → <span class="h">${M.bound}-bound</span>`);
  L.push(`Per user    = 1 ÷ ${fmtT(M.step)} = ${f1(M.perUser)} tok/s`);
  L.push(`Throughput  = ${S.batch} × ${f1(M.perUser)} = ${f0(M.total)} tok/s`);
  L.push(
    `Cost        = $${f2(g.price)}/hr ÷ (${f0(M.total)} tok/s × 3,600 s) × 1M = ${fmtMoney(M.cost)} per 1M tokens`,
  );
  L.push(
    `Power       ≈ ${f0(g.tdp)} W rated × (14% + 42% × ${f0(M.bwUtil * 100)}% bandwidth + 50% × ${f1(M.compUtil * 100)}% math) = ${f0(M.power)} W (rough)`,
  );
  L.push(`Energy      = ${f0(M.total)} tok/s × 3,600 ÷ ${f2(M.power / 1000)} kW = ${f1(M.tpk / 1e6)} M tokens per kWh`);
  L.push(
    `Intensity   = ${f1(M.flops / 1e12)} TFLOP ÷ ${f1(M.bytes / 1e9)} GB = ${f1(M.I)} FLOPs/byte (ridge ${f0(M.ridge)})`,
  );
  L.push("");
  L.push(`<span class="h">PREFILL</span> (reading a ${f0(S.prompt)}-token prompt)`);
  L.push(
    `linear layers = 2 × ${f1(M.act / 1e9)} B × ${f0(S.prompt)} = ${f1(M.preFl / 1e15)} PFLOP ÷ (${f0(M.peakTF)} × ${PRE_EFF * 100}%) = ${fmtT(M.preG)}`,
  );
  L.push(
    `attention     = 2 × ${f0(S.prompt)}² × ${m.h} × ${m.L} layers = ${f2(M.attFl / 1e15)} PFLOP ÷ (${f0(g.bf16)} BF16 × ${ATT_EFF * 100}%) = ${fmtT(M.preA)}`,
  );
  L.push(`first token   ≈ ${fmtT(M.ttft)}`);
  return `<pre class="mathbox">${L.join("\n")}</pre>`;
}
export function renderW1() {
  const S = state(),
    L = host.G.level!;
  if (L.panels!.includes("mig")) {
    renderMIG();
    return;
  }
  const M = w1(S);
  setUtil(M.fits ? M.compUtil : 0);
  const g = M.g,
    pct = (x: number) => Math.max(0, Math.min(100, x)).toFixed(1);
  const cap = g.mem,
    scale = Math.max(cap, M.used);
  const wP = (M.wGB / scale) * 100,
    kP = (M.kvGB / scale) * 100,
    rP = (RESERVE / scale) * 100,
    xP = M.used > cap ? ((M.used - cap) / scale) * 100 : 0;
  /* draw bar: weights, kv, reserve; overflow region hatched beyond capacity */
  let bar = `<div class="membar" role="img" aria-label="Memory ${f1(M.used)} of ${cap} GB"><span class="w" style="width:${pct(Math.min(wP, 100 - xP))}%"></span><span class="k" style="width:${pct(Math.max(0, Math.min(kP, 100 - xP - Math.min(wP, 100 - xP))))}%"></span><span class="r" style="width:${pct(Math.max(0, Math.min(rP, 100 - xP - wP - kP)))}%"></span>${xP ? `<span class="x" style="width:${pct(xP)}%;margin-left:auto"></span>` : ""}</div>`;
  const tiles = [
    ["Per user", M.fits ? f1(M.perUser) + " tok/s" : "—", "speed each person sees"],
    ["Throughput", M.fits ? f0(M.total) + " tok/s" : "—", "all users combined"],
    ["First token", M.fits ? fmtT(M.ttft) : "—", `for a ${kfmt(S.prompt)}-token prompt`],
    ["Cost", M.fits ? fmtMoney(M.cost) : "—", "per 1M output tokens"],
    [
      "Power",
      M.fits ? f0(M.power) + " W" : "—",
      M.fits ? `${f1(M.tpk / 1e6)}M tokens per kWh` : `rated ${f0(g.tdp)} W`,
    ],
    [
      "Model reads",
      M.fits ? f0(M.readGB) + " GB" : "—",
      M.m.moe ? `per step · ${f0(M.touched * 100)}% of experts` : "of weights per step",
    ],
  ];
  const showRoof = L.panels!.includes("roof") && S.showRoof;
  $("#simActs").innerHTML =
    `<button class="btn" type="button" data-compare="1">Compare GPUs</button> ` +
    (L.panels!.includes("roof")
      ? `<button class="btn${S.showRoof ? " primary" : ""}" type="button" data-cmd="foundry roofline${S.showRoof ? " off" : ""}">${S.showRoof ? "Hide roofline" : "Roofline"}</button>`
      : "");
  $("#simBody").innerHTML =
    (L.panels!.includes("pick") ? pickHtml(S) : "") +
    `<div class="simgrid">
   <div><div class="chipwrap">${chipSVG(S, M)}</div><div class="inspect" id="inspect">${infoHtml(S.info)}</div></div>
   <div class="side">
    <div><div class="sec-h"><span>HBM memory</span><b>${f1(M.used)} / ${cap} GB</b></div>${bar}
     <div class="memleg"><span><i style="background:var(--wt)"></i>Weights ${f1(M.wGB)} GB</span><span><i style="background:var(--kv)"></i>KV cache${M.kvd.f < 1 ? " (FP8)" : ""} ${f1(M.kvGB)} GB</span><span><i style="background:var(--rsv)"></i>Runtime ${RESERVE} GB</span></div>
     ${M.fits ? `<div class="memstat">${f1(cap - M.used)} GB free</div>` : `<div class="memstat bad">${M.fp4bad ? "FP4 isn't supported on " + g.arch + " GPUs" : "Out of memory: needs " + f1(M.used) + " GB, has " + cap + " GB"}</div>`}</div>
    <div class="quality"><span class="pill">${esc(M.d.name)}</span>${esc(M.d.q)} · <span class="pill">${esc(M.m.name)}</span>${M.m.moe ? "MoE, " + f0(M.act / 1e9) + "B active · " : ""}${S.batch} user${S.batch > 1 ? "s" : ""} × ${kfmt(S.ctx)} context</div>
    <div class="tiles">${tiles.map((t) => `<div class="tile${M.fits ? "" : " flag"}"><div class="k">${t[0]}</div><div class="v">${t[1]}</div><div class="s">${t[2]}</div></div>`).join("")}</div>
    <div class="meters">
     <div class="meter"><span>HBM bandwidth in use</span><b>${M.fits ? pct(M.bwUtil * 100) + "%" : "—"}</b><div class="bar"><span style="width:${M.fits ? pct(M.bwUtil * 100) : 0}%"></span></div></div>
     <div class="meter t"><span>Tensor Core math in use</span><b>${M.fits ? pct(M.compUtil * 100) + "%" : "—"}</b><div class="bar"><span style="width:${M.fits ? pct(M.compUtil * 100) : 0}%"></span></div></div>
     <div>${M.fits ? `<span class="pill ${M.bound === "memory" ? "mem" : "cmp"}">${M.bound === "memory" ? "Memory-bound" : "Compute-bound"}</span> <span class="mathhint">Turn on Show the math to see why.</span>` : `<span class="pill bad">Not running</span>`}</div>
    </div>
   </div></div>
   <div style="margin-top:14px">${w1Math(S, M)}</div>
   ${showRoof ? `<div class="roofsec"><div class="sec-h"><span>Roofline · ${esc(g.name)} · ${esc(DTYPES[S.dtype].name)}</span><b>blue = decode, yellow = prefill</b></div><div style="overflow-x:auto">${roofSVG(S, M)}</div><p class="map-cap" style="margin:6px 0 0">Anything left of the ridge is limited by memory bandwidth (the sloped roof). Right of it, by Tensor Core speed (the flat roof). More users per step moves decode right; a long prompt already sits far right.</p></div>` : ""}`;
  startFlicker();
}
export function renderMIG() {
  const S = state();
  $("#simTitle").textContent = "GPU partitions · H100 80GB";
  $("#simActs").innerHTML = "";
  stopFlicker();
  $("#simCap").innerHTML =
    "An H100 split for sharing. The top row is its 7 <b>compute slices</b> (groups of SMs), the bottom row its 8 <b>memory slices</b> of 10 GB. Each coloured block is one isolated GPU instance.";
  const A = S.mig.share === "mig" ? migAssign(S) : null;
  let comp = "",
    mem = "";
  if (S.mig.share === "mig") {
    S.mig.inst.forEach((p, i) => {
      const x = MIGP[p],
        c = TCOL[i % TCOL.length],
        who = A!.inst[i].used;
      comp += `<div class="mblk" data-i="mig" style="grid-column:span ${x.c};background:${c}">${p}${who ? `<small>${esc(who)}</small>` : "<small>unused</small>"}</div>`;
      mem += `<div class="mblk" data-i="mig" style="grid-column:span ${x.m};background:${c}">${x.gb} GB</div>`;
    });
    const cu = S.mig.inst.reduce((a, p) => a + MIGP[p].c, 0),
      mu = S.mig.inst.reduce((a, p) => a + MIGP[p].m, 0);
    for (let i = cu; i < 7; i++) comp += `<div class="mblk free">idle</div>`;
    for (let i = mu; i < 8; i++) mem += `<div class="mblk free">unused</div>`;
  } else if (S.mig.share === "timeslice") {
    comp = `<div class="mblk ts" style="grid-column:span 7">whole GPU · teams take turns</div>`;
    mem = `<div class="mblk ts" style="grid-column:span 8">80 GB shared by everyone · no limits per team</div>`;
  } else {
    comp = `<div class="mblk one" style="grid-column:span 7">${S.mig.mode ? "MIG on · no instances yet" : "one GPU, one owner"}</div>`;
    mem = `<div class="mblk one" style="grid-column:span 8">80 GB</div>`;
  }
  const rows = TENANTS.map((t) => {
    let st,
      cls = "";
    if (S.mig.share === "mig") {
      const r = A!.res.find((r) => r.t === t)!;
      if (r.inst) {
        st = `✓ own ${r.inst.p} (#${r.inst.i})`;
        cls = "ok";
      } else {
        st = "✗ no instance big enough left";
        cls = "bad";
      }
    } else if (S.mig.share === "timeslice") {
      st = "shares the whole GPU · no isolation";
      cls = "warn";
    } else {
      st = "waiting for a GPU";
      cls = "";
    }
    return `<div class="trow ${cls}"><b>${esc(t.n)}</b><span class="need">${t.need} GB</span><span class="ds">${esc(t.d)}</span><span class="st">${st}</span></div>`;
  }).join("");
  $("#simBody").innerHTML = `<div class="w2grid">
   <div><div class="sec-h"><span>Compute slices · 7</span><b>${S.mig.mode ? "MIG mode on" : "MIG mode off"}</b></div><div class="miggrid c7">${comp}</div></div>
   <div><div class="sec-h"><span>Memory slices · 8 × 10 GB</span></div><div class="miggrid m8">${mem}</div></div>
   <div><div class="sec-h"><span>Teams</span><b>${A ? (A.all ? "everyone has an instance" : A.res.filter((r) => r.inst).length + " of 5 placed") : ""}</b></div><div class="tenants">${rows}</div></div>
   <div class="inspect" id="inspect">${S.info === "mig" ? infoHtml("mig") : '<span class="tip">Tap an instance to learn how MIG isolates teams. Valid layouts use at most 7 compute and 8 memory slices.</span>'}</div>
  </div>`;
}
export interface Workload {
  t: string;
  d: string;
  set: Partial<W1State>;
  req: [string, (M: W1Result) => boolean, string][];
  why: string;
}
export function chipSVGamd(S: W1State, M: W1Result) {
  // AMD chip: the AMD-only fields (cus, cuPhys, cuPerXcd) are present.
  const g = M.g as Required<Gpu>,
    frac = Math.min(1, M.used / g.mem),
    oom = !M.fits,
    u = M.fits ? M.bwUtil : 0,
    dur = Math.max(0.35, 1.7 - u * 1.6).toFixed(2);
  let o = `<svg viewBox="0 0 600 300" role="img" aria-label="${esc(g.name)} package: 8 compute chiplets, ${g.cus} CUs, 8 HBM stacks, memory ${Math.round(frac * 100)}% full">`;
  o += `<rect x="8" y="8" width="584" height="284" rx="16" class="pkg"/>`;
  const area = { x: 168, y: 44, w: 264, h: 206 },
    st: { x: number; y: number; w: number; h: number; side: string }[] = [];
  [0, 1, 2, 3].forEach((i) => {
    st.push({ x: 56, y: 44 + i * 53, w: 96, h: 45, side: "l" });
    st.push({ x: 448, y: 44 + i * 53, w: 96, h: 45, side: "r" });
  });
  st.forEach((s) => {
    const cy = s.y + s.h / 2,
      x1 = s.side === "l" ? s.x + s.w + 3 : s.x - 3,
      x2 = s.side === "l" ? area.x - 2 : area.x + area.w + 2;
    o += `<line class="lane${u < 0.01 ? " idle" : ""}" data-i="bw" x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" style="--dur:${dur}s;opacity:${(0.3 + u * 0.85).toFixed(2)}"><title>Memory bandwidth</title></line>`;
    const fh = Math.max(0, s.h - 4) * frac;
    o += `<g class="stack${oom ? " oom" : ""}" data-i="hbm"><title>${g.hbm} stack · ${g.stackGB} GB</title><rect class="shell" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4"/><rect class="fill" x="${s.x + 2}" y="${(s.y + s.h - 2 - fh).toFixed(1)}" width="${s.w - 4}" height="${fh.toFixed(1)}" rx="2"/><text class="stklbl" x="${s.x + 6}" y="${s.y + 14}">${g.stackGB} GB</text></g>`;
  });
  o += `<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" rx="4" fill="var(--die-edge)" opacity=".55"/>`;
  const xw = (area.w - 6 * 5) / 4,
    xh = (area.h - 24 - 6 * 3) / 2,
    cols = g.cuPhys === 40 ? 5 : 6,
    rows = Math.ceil(g.cuPhys / cols);
  for (let k = 0; k < 8; k++) {
    const x = area.x + 6 + (k % 4) * (xw + 6),
      y = area.y + 6 + Math.floor(k / 4) * (xh + 6);
    o += `<rect class="die" data-i="xcd" x="${x}" y="${y}" width="${xw}" height="${xh}" rx="2"><title>XCD ${k}</title></rect>`;
    const gap = 1.5,
      cw = (xw - 6 - gap * (cols - 1)) / cols,
      ch = (xh - 18 - gap * (rows - 1)) / rows;
    for (let i = 0; i < g.cuPhys; i++) {
      const c = i % cols,
        r = Math.floor(i / cols),
        dis = i >= g.cuPerXcd;
      o += `<rect class="sm${dis ? " dis" : ""}" ${dis ? "" : 'data-i="cu"'} x="${(x + 3 + c * (cw + gap)).toFixed(1)}" y="${(y + 3 + r * (ch + gap)).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx=".8"/>`;
    }
    o += `<text class="dielbl" x="${x + 3}" y="${y + xh - 4}" fill="#DCE8E3">XCD ${k}</text>`;
  }
  o += `<text class="dielbl" x="${area.x + 6}" y="${area.y + area.h - 6}" fill="#DCE8E3">8 compute chiplets on 4 I/O dies · ${g.cus} CUs · ${g.cus * 4} Matrix Cores</text>`;
  o += `<text class="chiplbl" x="22" y="276">${esc(g.name)} · AMD ${esc(g.arch)} · ${g.mem} GB ${g.hbm} · ${g.bw} TB/s · ${f0(g.fp8)} TFLOPS FP8${g.fp4 ? " · " + f0(g.fp4) + " FP4" : ""}</text>`;
  if (oom) o += `<text class="chiplbl" x="400" y="34" style="fill:var(--bad);font-weight:600">OUT OF MEMORY</text>`;
  return o + `</svg>`;
}
export const WL: Record<string, Workload> = {
  chat: {
    t: "Busy chatbot",
    d: "Llama 3.1 70B FP8 · 64 users at once · 4k context",
    set: { model: "llama-70b", dtype: "fp8", batch: 64, ctx: 4096, prompt: 2048, kvdt: "bf16" },
    req: [
      ["Fits in memory", (M) => M.fits, "not enough memory"],
      ["At least 25 tokens/s per user", (M) => M.fits && M.perUser >= 25, "too slow per user"],
      ["At most $0.60 per 1M tokens", (M) => M.fits && M.cost <= 0.6, "too costly per token"],
    ],
    why: "Limited by memory capacity (64 conversations of KV cache) and cost per token. Hopper runs out of memory; the B300 costs too much per token for what it adds.",
  },
  doc: {
    t: "Contract Q&A",
    d: "Llama 3.1 70B FP8 · 16k-token prompts · 1 user at a time",
    set: { model: "llama-70b", dtype: "fp8", batch: 1, ctx: 32768, prompt: 16384, kvdt: "bf16" },
    req: [
      ["Fits in memory", (M) => M.fits, "not enough memory"],
      ["First token in at most 1.5 s", (M) => M.fits && M.ttft <= 1.5, "first token too slow"],
      ["At most $6.00 per GPU-hour", (M) => M.g.price <= 6, "over $6/hr"],
    ],
    why: "Limited by compute: reading a long prompt is prefill. Only the newest generations (Blackwell, CDNA 4) have the FP8 math, and the B300's extra memory isn't worth its price here.",
  },
  moe: {
    t: "Frontier MoE",
    d: "Qwen3 235B-A22B FP8 · 4 users · 8k context · one GPU",
    set: { model: "qwen-235b", dtype: "fp8", batch: 4, ctx: 8192, prompt: 2048, kvdt: "bf16" },
    req: [
      ["Fits on one GPU", (M) => M.fits, "doesn't fit"],
      ["At least 50 tokens/s per user", (M) => M.fits && M.perUser >= 50, "too slow per user"],
    ],
    why: "Limited by memory capacity: 235 GB of experts must be resident. Only GPUs with 256 GB or more qualify; after that, bandwidth sets the speed.",
  },
};
export function wlCheck(S: W1State, key: string, gpu?: string) {
  const T = Object.assign({}, S, WL[key].set, { gpu: gpu || S.gpu });
  const M = w1(T);
  return {
    M,
    res: WL[key].req.map((r) => [r[0], !!r[1](M), r[2]] as [string, boolean, string]),
    ok: WL[key].req.every((r) => r[1](M)),
  };
}
export function pickHtml(S: W1State) {
  const all = Object.keys(WL).every((k) => S.picks![k]);
  let h = `<div class="picks">${Object.entries(WL)
    .map(([k, w]) => {
      const c = wlCheck(S, k),
        cur = S.wl === k,
        p = S.picks![k];
      return `<button type="button" class="pick${cur ? " cur" : ""}${p ? " done" : ""}" data-cmd="foundry workload ${k}"><span class="pt">${esc(w.t)}</span><span class="pd">${esc(w.d)}</span>
      ${cur ? `<span class="pr">${c.res.map((r) => `<i class="${r[1] ? "y" : "n"}">${r[1] ? "✓" : "✗"} ${esc(r[0])}</i>`).join("")}</span>` : ""}
      <span class="pp">${p ? `Picked: <b>${esc(GPUS[p].name)}</b>` : cur ? "Choose a GPU, then foundry pick" : "Tap to load this workload"}</span></button>`;
    })
    .join("")}</div>`;
  if (all)
    h += `<div class="sec-h" style="margin-top:12px"><span>Every GPU against every workload</span><b>✓ = meets all requirements</b></div><div class="tlwrap"><table class="cmp mini"><thead><tr><th>GPU</th>${Object.values(
      WL,
    )
      .map((w) => `<th>${esc(w.t)}</th>`)
      .join("")}</tr></thead><tbody>${ALL_GPUS.map(
      (g) =>
        `<tr><th>${esc(GPUS[g].name)}</th>${Object.keys(WL)
          .map((k) => {
            const c = wlCheck(S, k, g);
            return `<td class="${c.ok ? "y" : "n"}">${c.ok ? "✓" : "✗ " + esc((c.res.find((r) => !r[1]) || ["", "", ""])[2])}</td>`;
          })
          .join("")}</tr>`,
    ).join("")}</tbody></table></div>`;
  return h;
}
/** The sim card's title and caption, set before the controls are drawn. */
export function simHeader() {
  const S = state();
  $("#simTitle").textContent = `GPU bench · ${GPUS[S.gpu].name}`;
  $("#simCap").innerHTML =
    GPUS[S.gpu].vendor === "amd"
      ? "The package from above: 8 compute chiplets (<b>XCDs</b>) covered in <b>Compute Units</b> (lit when doing math), with <b>HBM</b> stacks beside them (fill shows how full memory is). Dashes are data moving between them."
      : "The package as seen from above: the dark <b>die</b> covered in <b>SMs</b> (lit when doing math), with <b>HBM</b> stacks beside it (fill shows how full memory is). Dashes are data moving between them.";
}
