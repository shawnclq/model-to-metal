import type { Model } from "../../shared/data/types.ts";
import type { W0State } from "../../core/types.ts";
import {
  ATT_TOKS,
  GEN_OUT,
  GEN_PROMPT,
  HEAD_DESIGNS,
  HEAD_ROLES,
  MOE_TOKS,
  TOK_SAMPLE,
  Tok,
  attScores,
  fB,
  genRuns,
  headsCalc,
  moeBatch,
  paramParts,
  routeToken,
  softmax,
  tokId,
  tokenize,
} from "./engine.ts";
import { state } from "./state.ts";
import { $, esc, f0, f1, f2 } from "../../shared/data/format.ts";
import { DTYPES, MODELS, RESERVE, kvTok } from "../../shared/data/models.ts";
import type { MoeConfig } from "../../shared/data/types.ts";
import { readGBof } from "../../shared/engine/server.ts";
import { host } from "../../shared/host.ts";
import { stopFlicker } from "../../shared/ui/flicker.ts";
// World 0's sim panels: tokens, the anatomy of a model, attention, generation, MoE, heads.
/* ============ World 0 visuals ============ */
export const TOKCOL = ["#1D5C88", "#2A8A5D", "#B97A00", "#8E6AC8", "#C0603A", "#2E9C9C", "#B5487A", "#6F7F2A"];
export function tokChip(t: Tok, i: number) {
  const shown = t.t.replace(/^ /, "·");
  return `<span class="tk" style="--c:${TOKCOL[i % TOKCOL.length]}" title="token #${i + 1} · id ${tokId(t.t)} (illustrative)">${esc(shown)}</span>`;
}
export function tokStatsHtml(S: W0State) {
  const toks = tokenize(S.text),
    words = (S.text.match(/\S+/g) || []).length,
    chars = S.text.length;
  const splitW = [...new Set(toks.filter((t) => t.k === "split").map((t) => t.w))];
  return `<div class="tkrow">${toks.map(tokChip).join("") || '<span class="tip">Type something above.</span>'}</div>
  <div class="tiles" style="margin-top:12px"><div class="tile"><div class="k">Characters</div><div class="v">${f0(chars)}</div></div><div class="tile"><div class="k">Words</div><div class="v">${f0(words)}</div></div><div class="tile"><div class="k">Tokens</div><div class="v">${f0(toks.length)}</div><div class="s">${words ? f2(toks.length / words) + " tokens per word" : ""}</div></div><div class="tile"><div class="k">Price to read it</div><div class="v">$${((toks.length * 3) / 1e6).toFixed(6)}</div><div class="s">at an illustrative $3 per 1M tokens</div></div></div>
  ${
    splitW.length
      ? `<p class="map-cap" style="margin:10px 0 0">Split into pieces: ${splitW
          .slice(0, 6)
          .map((w) => `<b>${esc(w)}</b>`)
          .join(", ")}. Rare words are built from smaller, common pieces.</p>`
      : ""
  }`;
}
export function renderTokPanel() {
  const S = state();
  $("#simBody").innerHTML =
    `<div class="w2grid"><div><label class="sec-h" for="tokIn"><span>Your text</span><b>· marks a space that belongs to the token</b></label><textarea id="tokIn" rows="3" spellcheck="false">${esc(S.text)}</textarea></div><div id="tokOut">${tokStatsHtml(S)}</div>
   <p class="map-cap" style="margin:0">Tokenizer here approximates Llama 3's rules (common words whole, rare words in pieces, numbers in groups of up to 3 digits). Each piece maps to a fixed number in a 128,256-entry vocabulary; hover a chip for an illustrative id.</p></div>`;
  const ta = $<HTMLTextAreaElement>("#tokIn");
  ta.oninput = () => {
    setTokText(ta.value);
    $("#tokOut").innerHTML = tokStatsHtml(state());
    host.checkGoals();
  };
}
export function setTokText(v: string) {
  const S = state();
  S.text = v;
  if (v.trim() && v !== TOK_SAMPLE) S.flags.owntext = true;
  const toks = tokenize(v);
  if (toks.some((t) => t.k === "split")) S.flags.split = true;
  if (S.flags.owntext && toks.some((t) => t.k === "num" || t.k === "intl")) S.flags.numintl = true;
  if (S.flags.owntext && /\b(selamat|apa|khabar|bonjour|hola|terima|kasih|gracias|merci|danke)\b/i.test(v))
    S.flags.numintl = true;
}

export function renderAnatomy() {
  const S = state(),
    m = MODELS[S.model],
    P = paramParts(m),
    sel = S.info || "layer";
  const blk = (id: string, name: string, sub: string, n: number) =>
    `<button type="button" class="ablk${sel === id ? " on" : ""}" data-i="${id}"><b>${name}</b><span>${sub}</span><i>${fB(n)}</i></button>`;
  const layer = (k: number) =>
    `<div class="alayer"><span class="ln">Layer ${k}</span>${blk("attn", "Attention", "Q · K · V · O", P.attn)}${blk("mlp", "Feed-forward (MLP)", "gate · up · down", P.mlp)}</div>`;
  const parts = (
    [
      ["Embedding table", P.embed, "var(--signal)"],
      ["Attention (all layers)", P.attnAll, "var(--sea)"],
      ["MLP (all layers)", P.mlpAll, "var(--ok)"],
      ["Output head", P.head, "#8E6AC8"],
    ] as [string, number, string][]
  ).filter((x) => x[1] > 0);
  const det: Record<string, [title: string, body: string, params: number]> = {
    embed: [
      `Embedding table · ${f0(m.vocab)} × ${f0(m.h)}`,
      `One row of ${f0(m.h)} numbers for every token in the vocabulary. Reading a token = looking up its row. This list of numbers (a <b>vector</b>) is what flows through the layers.`,
      P.embed,
    ],
    attn: [
      `Attention block · per layer`,
      `Four matrices. <b>Q</b> (${f0(m.h)} × ${f0(m.heads * m.hd)}) makes the query, <b>K</b> and <b>V</b> (${f0(m.h)} × ${f0(m.kvh * m.hd)} each) make keys and values, <b>O</b> (${f0(m.heads * m.hd)} × ${f0(m.h)}) mixes the result back. K and V are smaller because ${m.heads} query heads share ${m.kvh} key/value heads.`,
      P.attn,
    ],
    mlp: [
      `Feed-forward (MLP) block · per layer`,
      `Three matrices: <b>gate</b> and <b>up</b> (${f0(m.h)} × ${f0(m.inter)}) widen each token's vector ${f1(m.inter / m.h)}×, then <b>down</b> (${f0(m.inter)} × ${f0(m.h)}) shrinks it back. It works on each token on its own, and holds most of the parameters.`,
      P.mlp,
    ],
    head: [
      m.tied ? `Output head · shares the embedding table` : `Output head · ${f0(m.h)} × ${f0(m.vocab)}`,
      `Turns the final vector into one score for each of the ${f0(m.vocab)} tokens. The highest-scoring token is the prediction.${m.tied ? " This small model reuses the embedding table for it, saving parameters." : ""}`,
      P.head || P.embed,
    ],
    layer: [
      `One layer · ${m.L} of them`,
      `Every layer has the same design: attention then MLP, each followed by a small normalisation. Layers differ only in their learned numbers. Stacking more layers (depth) and widening the vector (hidden size) is how models grow.`,
      P.attn + P.mlp,
    ],
  };
  const d = det[sel] || det.layer;
  $("#simBody").innerHTML = `<div class="simgrid"><div><div class="astack">
    <div class="aio">token “ cat”</div>
    ${blk("embed", "Embedding table", `${f0(m.vocab)} tokens × ${f0(m.h)} numbers`, P.embed)}
    ${layer(1)}${layer(2)}<button type="button" class="amore" data-i="layer">… ${m.L - 3} more identical layers …</button>${layer(m.L)}
    ${blk("head", "Output head", `scores for all ${f0(m.vocab)} tokens`, P.head || 0)}
    <div class="aio">next token “ sat”</div></div></div>
   <div class="side"><div><div class="sec-h"><span>${esc(m.name)}</span><b>${fB(P.total)} parameters · ${f1((P.total * 2) / 1e9)} GB in BF16</b></div>
     <div class="membar">${parts.map((p) => `<span style="width:${((p[1] / P.total) * 100).toFixed(1)}%;background:${p[2]}"></span>`).join("")}</div>
     <div class="memleg">${parts.map((p) => `<span><i style="background:${p[2]}"></i>${p[0]} ${f0((p[1] / P.total) * 100)}%</span>`).join("")}</div></div>
    <div class="inspect"><b>${d[0]}</b>${d[1]}<div class="tip" style="margin-top:6px">${fB(d[2])} parameters${sel === "attn" || sel === "mlp" ? ` per layer × ${m.L} layers = ${fB(d[2] * m.L)}` : ""}</div></div>
    <div><div class="sec-h"><span>A corner of one matrix</span><b>each square is one learned number</b></div><canvas id="wcv" width="288" height="120" style="width:100%;max-width:420px;height:auto;border-radius:4px;display:block"></canvas></div>
    <pre class="mathbox"><span class="h">WHERE ${esc(m.name.toUpperCase())}'S PARAMETERS COME FROM</span> (config.json)
hidden_size ${m.h} · layers ${m.L} · heads ${m.heads} · KV heads ${m.kvh} · MLP size ${m.inter} · vocab ${m.vocab}
attention / layer = ${m.h}×${m.heads * m.hd} + 2×${m.h}×${m.kvh * m.hd} + ${m.heads * m.hd}×${m.h} = ${fB(P.attn)}
MLP / layer       = 3 × ${m.h} × ${m.inter} = ${fB(P.mlp)}
layers            = ${m.L} × (${fB(P.attn)} + ${fB(P.mlp)}) = ${fB(m.L * (P.attn + P.mlp))}
embeddings + head = ${fB(P.embed + P.head)}${m.tied ? " (shared)" : ""}
total             ≈ ${fB(P.total)}  → × 2 bytes = ${f1((P.total * 2) / 1e9)} GB</pre></div></div>`;
  const cv = $<HTMLCanvasElement>("#wcv");
  let c: CanvasRenderingContext2D | null = null;
  try {
    c = cv && cv.getContext ? cv.getContext("2d") : null;
  } catch (e) {}
  if (c) {
    let seed = sel.length * 977 + m.h;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const dark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 24; x++) {
        const v = (rnd() + rnd() + rnd()) / 3 - 0.5;
        const a = Math.min(1, Math.abs(v) * 3.2);
        c.fillStyle = v >= 0 ? `rgba(29,92,136,${0.12 + a * 0.88})` : `rgba(194,61,42,${0.12 + a * 0.88})`;
        c.fillRect(x * 12 + 1, y * 12 + 1, 10, 10);
      }
    void dark;
  }
}

export function renderAttn() {
  const S = state(),
    i = S.att.i,
    h = S.att.head;
  let w = null;
  if (i >= 0) w = softmax(attScores(i, h));
  const top = w ? w.map((x, j) => [x, j]).sort((a, b) => b[0] - a[0]) : [];
  $("#simBody").innerHTML =
    `<div class="w2grid"><div><div class="sec-h"><span>Tap a word to see what it pays attention to</span><b>head ${h} · ${h === 1 ? "links meaning (e.g. pronouns)" : "looks at the previous word"}</b></div>
   <div class="attrow">${ATT_TOKS.map((t, j) => {
     const ww = w && j <= i ? w[j] : 0;
     return `<button type="button" class="atok${j === i ? " focus" : ""}${w && j > i ? " future" : ""}" data-att="${j}"><span class="abar" style="height:${(ww * 60).toFixed(0)}px"></span><span class="aw">${w && j <= i ? f0(ww * 100) + "%" : ""}</span><span class="at">${esc(t.trim())}</span></button>`;
   }).join("")}</div>
   ${w ? `<p class="map-cap" style="margin:8px 0 0">"${esc(ATT_TOKS[i].trim())}" can only look at itself and earlier words. Greyed words come later, so they're invisible to it.</p>` : ""}</div>
   ${
     w
       ? `<div><div class="sec-h"><span>How the weights were made</span><b>query of "${esc(ATT_TOKS[i].trim())}" · keys of earlier words</b></div>
    <div class="tlwrap"><table class="cmp mini"><thead><tr><th>Earlier word</th><th>Match score (query · key)</th><th>Weight after softmax</th><th>Share of the value mix</th></tr></thead><tbody>${top.map(([x, j]) => `<tr><th>${esc(ATT_TOKS[j].trim())}</th><td>${f1(attScores(i, h)[j])}</td><td>${f1(x * 100)}%</td><td><span class="vbar" style="width:${Math.max(2, x * 160).toFixed(0)}px"></span></td></tr>`).join("")}</tbody></table></div>
    <p class="map-cap" style="margin:8px 0 0">Softmax turns scores into weights that add up to 100%. "${esc(ATT_TOKS[i].trim())}" leaves this layer carrying mostly the value of "${esc(ATT_TOKS[top[0][1]].trim())}". Scores here are illustrative; real ones come from multiplying learned vectors.</p></div>`
       : ""
   }
   <div class="inspect"><b>Query, key, value</b>Think of a library. Your <b>query</b> is the question you walk in with. Each book's <b>key</b> is its catalogue card. Its <b>value</b> is what's inside. You compare your question with every card, then read mostly from the best matches.<div class="tip" style="margin-top:4px">Each token makes all three by multiplying its vector by the Q, K and V matrices from the previous level.</div></div></div>`;
}

export function renderGen(withKV: boolean) {
  const S = state(),
    R = genRuns(S),
    m = MODELS["llama-8b"],
    P = paramParts(m);
  const seq = [
    ...GEN_PROMPT.map((t) => `<span class="tk" style="--c:var(--sea)">${esc(t.replace(/^ /, "·"))}</span>`),
    ...R.runs.map((r) => `<span class="tk" style="--c:var(--ok)">${esc(r.out.t.replace(/^ /, "·"))}</span>`),
    S.gen.k < GEN_OUT.length ? `<span class="tk ghost">?</span>` : "",
  ].join("");
  const sel = S.gen.sel != null ? R.runs[S.gen.sel] : null;
  const maxN = GEN_PROMPT.length + GEN_OUT.length - 1;
  let kvHtml = "";
  if (withKV) {
    const cols = GEN_PROMPT.length + Math.max(0, S.gen.k - 1) + (S.gen.k ? 1 : 0) - 1,
      stored = S.gen.cache ? Math.max(0, GEN_PROMPT.length + S.gen.k - 1) : 0,
      cur = R.runs.length ? R.runs[R.runs.length - 1] : null;
    const rows = [1, 2, 3, "…", 32];
    const ncol = GEN_PROMPT.length + GEN_OUT.length - 1;
    const cell = (c: number) => {
      if (!cur) return "empty";
      if (S.gen.cache) {
        if (c < stored) return c >= stored - cur.n ? "new" : "kept";
        return "empty";
      }
      return c < cur.ctx ? "redo" : "empty";
    };
    kvHtml = `<div><div class="sec-h"><span>KV cache · layers × tokens</span><b>${S.gen.cache ? "cache ON: each token's keys and values are kept" : "cache OFF: nothing is kept, everything is recomputed"}</b></div>
     <div class="kvgrid" style="grid-template-columns:64px repeat(${ncol},minmax(14px,1fr))"><span></span>${[...GEN_PROMPT, ...GEN_OUT.slice(0, -1).map((o) => o.t)].map((t) => `<span class="kvh">${esc(t.trim().slice(0, 5))}</span>`).join("")}
      ${rows.map((r) => `<span class="kvl">${r === "…" ? "…" : "layer " + r}</span>` + [...Array(ncol)].map((_, c) => (r === "…" ? `<span class="kvdot"></span>` : `<span class="kvc ${cell(c)}"><i></i><i></i></span>`)).join("")).join("")}</div>
     <div class="tlleg"><span><i style="background:var(--ok)"></i>stored key + value</span><span><i style="background:var(--signal)"></i>computed this run</span>${S.gen.cache ? "" : `<span><i style="background:var(--bad)"></i>recomputed again (no cache)</span>`}</div></div>`;
    const bars = R.runs
      .map(
        (r) =>
          `<div class="gbar"><span style="height:${((r.n / maxN) * 70).toFixed(0)}px;background:${r.n > 1 && r.k > 1 ? "var(--bad)" : "var(--sea)"}"></span><i>${r.n}</i></div>`,
      )
      .join("");
    kvHtml += `<div><div class="sec-h"><span>Tokens processed in each run</span><b>total ${R.fed} to write ${R.runs.length} token${R.runs.length === 1 ? "" : "s"}</b></div><div class="gbars">${bars || '<span class="tip">Run the model to see the bars.</span>'}</div></div>`;
    const cm = MODELS[S.calcModel],
      kvt = kvTok(cm);
    kvHtml += `<div><div class="sec-h"><span>KV calculator</span><b>from the model's config.json</b></div><div class="seg" role="group" aria-label="Calculator model">${["llama-8b", "llama-70b", "llama-405b", "qwen-235b"].map((k) => `<button type="button" class="${S.calcModel === k ? "on" : ""}" data-cmd="kv per-token ${k}">${esc(MODELS[k].name.replace("Llama ", ""))}</button>`).join("")}</div>
     <pre class="mathbox" style="display:block;margin-top:8px">KV per token = 2 × ${cm.L} layers × ${cm.kvh} KV heads × ${cm.hd} dims × 2 bytes = ${f0(kvt)} bytes ≈ <span class="h">${f2(kvt / 1e6)} MB</span>
× 4,096-token chat  = ${f2((kvt * 4096) / 1e9)} GB per user
× 128k-token chat   = ${f1((kvt * 131072) / 1e9)} GB per user
without shared KV heads (${cm.heads} instead of ${cm.kvh}) it would be ${f2((kvt * cm.heads) / cm.kvh / 1e6)} MB per token</pre></div>`;
  }
  $("#simBody").innerHTML = `<div class="w2grid">
   <div><div class="sec-h"><span>The text so far</span><b>blue = your prompt · green = written by the model</b></div><div class="tkrow">${seq}</div></div>
   <div class="tiles"><div class="tile"><div class="k">Model runs</div><div class="v">${S.gen.k}</div><div class="s">${S.gen.k ? `1 prefill + ${S.gen.k - 1} decode` : "none yet"}</div></div><div class="tile"><div class="k">Weights read</div><div class="v">${f0(R.weightsGB)} GB</div><div class="s">all 16 GB, every run</div></div><div class="tile"><div class="k">Tokens processed</div><div class="v">${R.fed}</div><div class="s">${S.gen.cache ? "cache on" : "cache off: earlier tokens redone"}</div></div><div class="tile"><div class="k">KV cache</div><div class="v">${S.gen.cache ? f1(R.kvMB) + " MB" : "0 MB"}</div><div class="s">${f2(R.kvT / 1e6)} MB per token</div></div></div>
   <div class="tlwrap"><table class="cmp mini runs"><thead><tr><th>Run</th><th>Phase</th><th>Tokens fed in</th><th>Output</th><th>Weights read</th></tr></thead><tbody>${R.runs.map((r, i) => `<tr class="${S.gen.sel === i ? "sel" : ""}" data-genrow="${i}"><th>${r.k}</th><td>${r.type}</td><td>${r.n}${r.k > 1 && r.n > 1 ? " (recompute)" : ""}</td><td><b>${esc(r.out.t)}</b> <small>${f0(r.out.c[0][1] * 100)}%</small></td><td>${f1(r.wGB)} GB</td></tr>`).join("") || `<tr><td colspan="5" class="n">Press Next step to run the model on the prompt.</td></tr>`}</tbody></table></div>
   ${sel ? `<div class="inspect"><b>Run ${sel.k}: the model's top choices for the next token</b>${sel.out.c.map((c) => `<div class="prow"><span>${esc(c[0])}</span><span class="pbar" style="width:${(c[1] * 220).toFixed(0)}px"></span><span>${f0(c[1] * 100)}%</span></div>`).join("")}<div class="tip" style="margin-top:4px">The model scores all 128,256 tokens; these are the top three. We take the highest (greedy). ${sel.out.t === "<|eot_id|>" ? "&lt;|eot_id|&gt; is Llama 3's end-of-turn token: the model's way of saying it's done." : ""}</div></div>` : ""}
   ${kvHtml}</div>`;
}

export function renderW0() {
  const S = state(),
    L = host.G.level!,
    P = L.panels!;
  $("#simActs").innerHTML = "";
  stopFlicker();
  if (P.includes("moe")) return renderMoE();
  if (P.includes("heads")) return renderHeads();
  const titles = {
    tok: ["Tokenizer", "Text goes in as tokens. Each chip below is one token."],
    anatomy: [
      `Inside ${MODELS[S.model].name}`,
      "The model as a stack: tokens enter at the top, a prediction comes out at the bottom. Tap a block.",
    ],
    attn: ["Attention", "One layer's attention on a short sentence. Bars show how much each earlier word contributes."],
    gen: ["Generating text", "The model writes one token per run. Every run uses all of its weights."],
  };
  const k = P.includes("anatomy") ? "anatomy" : P.includes("attn") ? "attn" : P.includes("tok") ? "tok" : "gen";
  $("#simTitle").textContent = titles[k][0];
  $("#simCap").textContent = titles[k][1];
  if (k === "tok") renderTokPanel();
  else if (k === "anatomy") renderAnatomy();
  else if (k === "attn") renderAttn();
  else renderGen(P.includes("kv"));
}

export function renderMoE() {
  const S = state(),
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

export function headsSVG(S: W0State) {
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
  const S = state(),
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
