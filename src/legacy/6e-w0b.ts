import { paramParts } from "./4c-w0.ts";
import { HEAD_DESIGNS, HEAD_ROLES, MOE_TOKS, headsCalc, moeBatch, routeToken } from "./4d-w0b.ts";
import { TOKCOL } from "./6d-w0.ts";
import { late } from "./late.ts";
import type { GameState, Model, MoeConfig } from "./types.ts";
import { $, esc, f0, f1, f2 } from "../shared/data/format.ts";
import { DTYPES, MODELS, RESERVE } from "../shared/data/models.ts";
import { readGBof } from "../shared/engine/server.ts";
export function renderMoE() {
  const S = late.G.S!,
    m = MODELS["qwen-235b"] as Model & { moe: MoeConfig },
    E = m.moe.E,
    B = S.moe.batch;
  const single = B === 1 && S.moe.tok >= 0,
    route = single ? routeToken(MOE_TOKS[S.moe.tok]) : null;
  const wmap: Record<number, number> = {};
  if (route) route.forEach((x) => (wmap[x.e] = x.w));
  const bat = B > 1 ? moeBatch(B) : null;
  $("#simTitle").textContent = "Inside one MoE layer · Qwen3 235B-A22B";
  $("#simCap").textContent =
    "Each square is one expert (a small MLP). The router sends every token to 8 of the 128. Squares light up when an expert is used.";
  const cells = [...Array(E)]
    .map((_, i) => {
      let cls = "",
        st = "";
      if (route && wmap[i] != null) {
        cls = "on";
        st = `opacity:${(0.45 + wmap[i] * 2.2).toFixed(2)}`;
      } else if (bat && bat.used.has(i)) cls = "on";
      return `<span class="xcell ${cls}" style="${st}" title="Expert ${i + 1}"></span>`;
    })
    .join("");
  const P = paramParts(m);
  const tiles = bat
    ? [
        ["Tokens at once", String(B), "from different users"],
        ["Experts used", `${bat.used.size} of ${E}`, `${f0(bat.frac * 100)}% (expected ${f0(bat.expect * 100)}%)`],
        ["Weights read", f0(bat.readGB) + " GB", "this step, at FP8"],
        ["Math per token", f1(m.moe.active / 1e9) + " B", "parameters; still 8 experts each"],
      ]
    : [
        ["Experts in this layer", String(E), "all in memory"],
        ["Used by this token", route ? "8" : "–", route ? "6% of the experts" : "tap a token"],
        ["Active per token", f1(m.moe.active / 1e9) + " B", "of " + f0(m.P / 1e9) + " B total"],
        ["Weights read", route ? f0(readGBof(m, DTYPES.fp8, 1)) + " GB" : "–", "per token, at FP8"],
      ];
  $("#simBody").innerHTML = `<div class="w2grid">
   <div><div class="sec-h"><span>Pick a token</span><b>${B > 1 ? "batch mode: " + B + " tokens" : "one token at a time"}</b></div><div class="tkrow">${MOE_TOKS.map((t, i) => `<button type="button" class="tk tkb${B === 1 && S.moe.tok === i ? " sel" : ""}" data-moe="${i}">${esc(t.replace(/^ /, "·"))}</button>`).join("")}</div></div>
   <div class="moewrap"><div><div class="sec-h"><span>Router → 128 experts (one layer of 94)</span><b>lit = used</b></div><div class="xgrid">${cells}</div></div>
    <div>${
      route
        ? `<div class="sec-h"><span>Router's top 8 for "${esc(MOE_TOKS[S.moe.tok].trim())}"</span><b>weights add to 100%</b></div>${route.map((x) => `<div class="prow"><span>Expert ${x.e + 1}</span><span class="pbar" style="width:${(x.w * 260).toFixed(0)}px;background:var(--signal)"></span><span>${f0(x.w * 100)}%</span></div>`).join("")}<p class="map-cap" style="margin:8px 0 0">The token goes through these 8 experts only; their outputs are mixed using these weights. The other 120 sit idle for this token.</p>`
        : bat
          ? `<p class="map-cap" style="margin:0">${B} tokens from different conversations each pick their own 8 experts. Together they wake up ${bat.used.size} of the ${E} experts, so the GPU has to read ${f0(bat.frac * 100)}% of the expert weights this step, even though each token still only computes with 8.</p>`
          : `<p class="map-cap" style="margin:0">Tap a token above to send it through the router.</p>`
    }</div></div>
   <div class="tiles">${tiles.map((t) => `<div class="tile"><div class="k">${t[0]}</div><div class="v">${t[1]}</div><div class="s">${t[2]}</div></div>`).join("")}</div>
   <div><div class="sec-h"><span>Total vs active parameters</span><b>memory holds the total; each token uses the active part</b></div>
    <div class="membar"><span style="width:${((m.moe.nonExp / m.P) * 100).toFixed(1)}%;background:var(--sea)"></span><span style="width:${(((m.moe.expTotal * m.moe.k) / m.moe.E / m.P) * 100).toFixed(1)}%;background:var(--signal)"></span><span style="width:${(((m.moe.expTotal * (1 - m.moe.k / m.moe.E)) / m.P) * 100).toFixed(1)}%;background:var(--rule)"></span></div>
    <div class="memleg"><span><i style="background:var(--sea)"></i>Shared parts (attention, embeddings) ${f0(m.moe.nonExp / 1e9)} B</span><span><i style="background:var(--signal)"></i>8 chosen experts × 94 layers ${f1((m.moe.expTotal * m.moe.k) / m.moe.E / 1e9)} B</span><span><i style="background:var(--rule)"></i>Idle experts ${f0((m.moe.expTotal * (1 - m.moe.k / m.moe.E)) / 1e9)} B</span></div></div>
   <pre class="mathbox">active  = shared ${f0(m.moe.nonExp / 1e9)} B + experts ${f0(m.moe.expTotal / 1e9)} B × 8/128 = ${f1(m.moe.active / 1e9)} B
experts used by B tokens ≈ 1 − (1 − 8/128)^B   →   B=1: 6% · B=8: 40% · B=32: 87% · B=64: 98%
one expert = 3 matrices of ${f0(m.h)} × ${f0(1536)} = ${f1((3 * m.h * 1536) / 1e6)} M parameters, × 128 experts × 94 layers = ${f0(m.moe.expTotal / 1e9)} B</pre></div>`;
}

export function headsSVG(S: GameState) {
  const d = HEAD_DESIGNS[S.hd.design],
    n = d.n,
    q = S.hd.q,
    grp = 32 / n,
    W = 680;
  const qx = (i: number) => 24 + i * 20,
    kx = (j: number) => (n === 1 ? W / 2 - 9 : 24 + (j + 0.5) * ((32 * 20) / n) - 9);
  let o = `<svg viewBox="0 0 ${W} 262" role="img" aria-label="${n} key/value heads shared by 32 query heads">`;
  o += `<text class="axt" x="24" y="16">token vector · 4,096 numbers, split into 32 heads of 128</text>`;
  for (let i = 0; i < 32; i++)
    o += `<rect x="${qx(i)}" y="24" width="18" height="14" rx="2" fill="${TOKCOL[i % 8]}" opacity=".55"/>`;
  o += `<text class="axt" x="24" y="66">query heads · 32 questions</text>`;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < grp; k++) {
      const qi = i * grp + k,
        hl = q >= 0 && Math.floor(q / grp) === i;
      o += `<line x1="${qx(qi) + 9}" y1="96" x2="${kx(i) + 9}" y2="176" stroke="${hl ? "var(--signal)" : "var(--rule)"}" stroke-width="${hl ? 2.5 : 1}"/>`;
    }
  for (let i = 0; i < 32; i++) {
    const sel = i === q,
      inG = q >= 0 && Math.floor(i / grp) === Math.floor(q / grp);
    o += `<rect data-qh="${i}" x="${qx(i)}" y="74" width="18" height="22" rx="3" fill="${sel ? "var(--signal)" : inG ? "color-mix(in srgb,var(--signal) 45%,var(--panel-2))" : "var(--sea)"}" style="cursor:pointer"><title>Query head ${i + 1}</title></rect>`;
  }
  o += `<text class="axt" x="24" y="226">key/value heads (green) · stored in the KV cache</text>`;
  for (let j = 0; j < n; j++) {
    const hl = q >= 0 && Math.floor(q / grp) === j;
    o += `<rect x="${kx(j)}" y="${176 + 2}" width="18" height="${n === 32 ? 22 : 26}" rx="3" fill="${hl ? "var(--signal)" : "var(--ok)"}"/>`;
  }
  o += `<text class="axt" x="24" y="252">${esc(d.name)}: ${esc(d.note)}</text>`;
  return o + `</svg>`;
}
export function renderHeads() {
  const S = late.G.S!,
    d = HEAD_DESIGNS[S.hd.design],
    c = headsCalc(S.hd.design),
    m = MODELS["llama-8b"],
    q = S.hd.q;
  $("#simTitle").textContent = "Attention heads · Llama 3.1 8B, one layer";
  $("#simCap").textContent =
    "Blue boxes are query heads (the questions). Green boxes are key/value heads (the stored notes they search). Lines show who shares what.";
  const all = ["mha", "gqa", "mqa"].map((k) => [k, headsCalc(k)] as const);
  $("#simBody").innerHTML = `<div class="w2grid"><div class="tlwrap">${headsSVG(S)}</div>
   <div class="tiles"><div class="tile"><div class="k">KV heads per layer</div><div class="v">${c.n}</div><div class="s">${32 / c.n} query head${32 / c.n > 1 ? "s" : ""} each</div></div><div class="tile"><div class="k">KV per token</div><div class="v">${f2(c.kvt / 1e6)} MB</div><div class="s">all 32 layers</div></div><div class="tile"><div class="k">One 4k chat</div><div class="v">${f2(c.perUser)} GB</div><div class="s">${f1(c.long)} GB at 128k</div></div><div class="tile"><div class="k">Users on one H100</div><div class="v">${f0(c.users)}</div><div class="s">4k chats in the ${f0(c.free)} GB left after weights</div></div></div>
   <div class="inspect">${q >= 0 ? `<b>Query head ${q + 1}</b>In a trained model each head learns its own pattern. This one might be the head that ${HEAD_ROLES[q % HEAD_ROLES.length]} (illustrative). It searches key/value head ${Math.floor(q / (32 / c.n)) + 1}${32 / c.n > 1 ? `, shared with ${32 / c.n - 1} other query head${32 / c.n > 2 ? "s" : ""}` : ""}.` : `<b>Why heads?</b>One attention can only ask one kind of question. Splitting into 32 heads lets each learn its own: previous word, which noun "it" means, sentence boundaries, and so on. Their 32 small results are joined back into 4,096 numbers. Tap a query head.`}</div>
   <div class="tlwrap"><table class="cmp mini"><thead><tr><th>Design</th><th>KV heads</th><th>KV per token</th><th>Users on one H100 (4k chats)</th></tr></thead><tbody>${all.map(([k, x]) => `<tr class="${k === S.hd.design ? "sel" : ""}"><th>${esc(HEAD_DESIGNS[k].name)}</th><td>${x.n}</td><td>${f2(x.kvt / 1e6)} MB</td><td>${f0(x.users)}</td></tr>`).join("")}</tbody></table></div>
   <pre class="mathbox">KV per token = 2 (key + value) × ${m.L} layers × ${c.n} KV heads × ${m.hd} numbers × 2 bytes = ${f0(c.kvt)} bytes
memory left on an H100 = 80 − ${f1((m.P * 2) / 1e9)} (weights) − ${RESERVE} = ${f1(c.free)} GB → ${f0(c.users)} users × ${f2(c.perUser)} GB</pre></div>`;
}

Object.assign(late, { renderHeads, renderMoE });
