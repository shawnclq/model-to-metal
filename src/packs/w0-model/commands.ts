import {
  ATT_TOKS,
  GEN_OUT,
  HEAD_DESIGNS,
  MOE_TOKS,
  W0_MODELS,
  attScores,
  fB,
  genRuns,
  headsCalc,
  moeBatch,
  paramParts,
  routeToken,
  softmax,
  tokenize,
} from "./engine.ts";
import { setTokText } from "./render.ts";
import { state } from "./state.ts";
import { f0, f1, f2 } from "../../shared/data/format.ts";
import { MODELS, MODEL_ALIAS, kvTok } from "../../shared/data/models.ts";
import { host } from "../../shared/host.ts";
// World 0's terminal commands (tokenize, config, params, attend, generate, kv, route, batch, heads, qhead)
// and its panel shortcuts. They run only while a World 0 level is open.
export function genStep() {
  const S = state();
  if (S.gen.k >= GEN_OUT.length) {
    host.print("The model already finished (it output its end-of-turn token). generate reset to start again.", "dim");
    return false;
  }
  S.gen.k++;
  const R = genRuns(S),
    r = R.runs[R.runs.length - 1];
  host.print(
    `Run ${r.k} (${r.type}): fed ${r.n} token${r.n > 1 ? "s" : ""}${r.k > 1 && r.n > 1 ? " (recomputing every earlier token)" : ""} · read ${f1(r.wGB)} GB of weights → next token ${JSON.stringify(r.out.t)} (${f0(r.out.c[0][1] * 100)}%)`,
    r.k === GEN_OUT.length ? "ok" : "",
  );
  if (S.gen.k === GEN_OUT.length) {
    host.print(
      `Done: ${S.gen.k} runs, ${R.fed} tokens processed, ${f0(R.weightsGB)} GB of weights read in total.`,
      "ok",
    );
    if (host.G.level!.panels!.includes("kv")) {
      if (S.gen.cache) S.flags.genOn = true;
      else S.flags.genOff = true;
    }
  }
  return true;
}
export function w0Cmd(v: string, t: string[]) {
  const S = state(),
    a = t.slice(1),
    arg = (a[0] || "").toLowerCase();
  if (v === "tokenize") {
    if (S.world !== 0 || !host.G.level!.panels!.includes("tok")) {
      host.err("The tokenizer is in World 0, 'Words into tokens'.");
      return true;
    }
    const text = t
      .slice(1)
      .join(" ")
      .replace(/^["']|["']$/g, "");
    if (!text) {
      host.err("tokenize YOUR TEXT, e.g. tokenize Hello world");
      return true;
    }
    setTokText(text);
    const toks = tokenize(text);
    host.print(`${toks.length} tokens: ` + toks.map((x) => "[" + x.t + "]").join(""));
    return true;
  }
  if (S.world !== 0) return false;
  if (v === "config") {
    const m = MODELS[MODEL_ALIAS[arg] || arg] || MODELS[S.model];
    host.print(
      `{  // ${m.name} · config.json (key fields)\n  "hidden_size": ${m.h},\n  "num_hidden_layers": ${m.L},\n  "num_attention_heads": ${m.heads},\n  "num_key_value_heads": ${m.kvh},\n  "head_dim": ${m.hd},\n  "intermediate_size": ${m.inter},\n  "vocab_size": ${m.vocab},\n  "torch_dtype": "bfloat16"\n}`,
    );
    return true;
  }
  if (v === "params") {
    const k = MODEL_ALIAS[arg] || arg || S.model;
    if (!W0_MODELS.includes(k)) {
      host.err("params llama-1b | llama-8b | llama-70b | llama-405b");
      return true;
    }
    if (!host.G.level!.panels!.includes("anatomy")) {
      const P = paramParts(MODELS[k]);
      host.print(`${MODELS[k].name}: ${fB(P.total)} parameters`);
      return true;
    }
    S.model = k;
    if (k === "llama-70b") S.flags.saw70 = true;
    const P = paramParts(MODELS[k]);
    host.print(
      `${MODELS[k].name}: ${fB(P.total)} parameters = embeddings ${fB(P.embed)} + ${MODELS[k].L} layers × ${fB(P.attn + P.mlp)} + head ${fB(P.head)} · ${f1((P.total * 2) / 1e9)} GB in BF16`,
      "ok",
    );
    return true;
  }
  if (v === "attend") {
    if (!host.G.level!.panels!.includes("attn")) {
      host.err("Attention is in the 'Who is \"it\"?' level.");
      return true;
    }
    let j = parseInt(arg);
    if (isNaN(j)) j = ATT_TOKS.findIndex((x) => x.trim().toLowerCase() === arg);
    if (arg === "the" && a[0] !== "the") j = 0;
    if (a[0] === "the") j = 4;
    if (j < 0 || j >= ATT_TOKS.length) {
      host.err(`attend WORD, one of: ${ATT_TOKS.map((x) => x.trim()).join(", ")}`);
      return true;
    }
    S.att.i = j;
    if (j === 7 && S.att.head === 1) S.flags.attIt = true;
    if (j === 0) S.flags.attFirst = true;
    const w = softmax(attScores(j, S.att.head));
    const top = w
      .map((x, k) => [x, k])
      .sort((p, q) => q[0] - p[0])
      .slice(0, 3);
    host.print(
      `"${ATT_TOKS[j].trim()}" (head ${S.att.head}) attends to: ` +
        top.map(([x, k]) => `${ATT_TOKS[k].trim()} ${f0(x * 100)}%`).join(", "),
    );
    return true;
  }
  if (v === "head") {
    if (!host.G.level!.panels!.includes("attn")) {
      host.err("Heads are in the 'Who is \"it\"?' level.");
      return true;
    }
    const n = parseInt(arg);
    if (n !== 1 && n !== 2) {
      host.err("head 1 | head 2");
      return true;
    }
    S.att.head = n;
    if (n === 2) S.flags.head2 = true;
    host.print(
      `Head ${n}: ${n === 1 ? "links meaning, e.g. pronouns to nouns" : "looks mostly at the previous word"}`,
      "dim",
    );
    if (S.att.i >= 0) w0Cmd("attend", ["attend", String(S.att.i)]);
    return true;
  }
  if (v === "generate") {
    if (!host.G.level!.panels!.includes("gen")) {
      host.err("Generation is in the 'One word at a time' and 'Notes to self' levels.");
      return true;
    }
    if (arg === "reset" || (arg === "" && false)) {
      S.gen.k = 0;
      S.gen.sel = null;
      host.print("Reset: back to the prompt.", "dim");
      return true;
    }
    if (arg === "all") {
      if (S.gen.k >= GEN_OUT.length) {
        S.gen.k = 0;
        S.gen.sel = null;
        host.print("Starting again from the prompt.", "dim");
      }
      while (genStep() && S.gen.k < GEN_OUT.length) {}
      return true;
    }
    if (arg === "inspect") {
      const n = parseInt(a[1]);
      if (!(n >= 1 && n <= S.gen.k)) {
        host.err(`generate inspect N, where N is a run that has happened (1–${S.gen.k || 1})`);
        return true;
      }
      S.gen.sel = n - 1;
      S.flags.genSel = true;
      const o = GEN_OUT[n - 1];
      host.print(`Run ${n} top choices: ` + o.c.map((c) => `${JSON.stringify(c[0])} ${f0(c[1] * 100)}%`).join(", "));
      return true;
    }
    genStep();
    return true;
  }
  if (v === "kv") {
    if (arg === "per-token") {
      const k = MODEL_ALIAS[(a[1] || "").toLowerCase()] || (a[1] || "").toLowerCase() || "llama-8b";
      const m = MODELS[k];
      if (!m || (k === "llama-1b" && false)) {
        host.err("kv per-token llama-8b | llama-70b | llama-405b | qwen-235b");
        return true;
      }
      S.calcModel = k;
      if (k === "llama-70b") S.flags.kv70 = true;
      const b = kvTok(m);
      host.print(
        `${m.name}: 2 × ${m.L} layers × ${m.kvh} KV heads × ${m.hd} dims × 2 bytes = ${f0(b)} bytes ≈ ${f2(b / 1e6)} MB per token · ${f1((b * 131072) / 1e9)} GB for a 128k conversation`,
        "ok",
      );
      return true;
    }
    if (!host.G.level!.panels!.includes("kv")) {
      host.err("The KV cache switch is in the 'Notes to self' level.");
      return true;
    }
    if (arg !== "on" && arg !== "off") {
      host.err("kv on | kv off | kv per-token MODEL");
      return true;
    }
    S.gen.cache = arg === "on";
    S.gen.k = 0;
    S.gen.sel = null;
    host.print(`KV cache ${arg}. Generation reset to the prompt.`, "dim");
    return true;
  }
  return false;
}

export function w0bCmd(v: string, t: string[]) {
  const S = state();
  if (S.world !== 0) return false;
  const a = (t[1] || "").toLowerCase(),
    P = host.G.level!.panels!;
  if (v === "route") {
    if (!P.includes("moe")) {
      host.err("Routing is in World 0, 'A team of experts'.");
      return true;
    }
    const i = isNaN(parseInt(a)) ? MOE_TOKS.findIndex((x) => x.trim().toLowerCase() === a) : parseInt(a);
    if (i < 0 || i >= MOE_TOKS.length) {
      host.err(`route TOKEN, one of: ${MOE_TOKS.map((x) => x.trim()).join(", ")}`);
      return true;
    }
    S.moe.tok = i;
    S.moe.batch = 1;
    if (!S.moe.seen.includes(i)) S.moe.seen.push(i);
    const r = routeToken(MOE_TOKS[i]);
    host.print(
      `"${MOE_TOKS[i].trim()}" → experts ${r.map((x) => x.e + 1).join(", ")} (top weight ${f0(r[0].w * 100)}%). 120 experts idle for this token.`,
      "ok",
    );
    return true;
  }
  if (v === "batch") {
    if (!P.includes("moe")) {
      host.err("batch here is for the MoE level; GPU batching is in World 1.");
      return true;
    }
    const n = parseInt(a);
    if (!(n >= 1 && n <= 256)) {
      host.err("batch N, from 1 to 256");
      return true;
    }
    S.moe.batch = n;
    if (n === 1) {
      if (S.moe.tok < 0) S.moe.tok = 0;
      host.print("One token at a time.", "dim");
      return true;
    }
    const b = moeBatch(n);
    host.print(
      `${n} tokens at once → ${b.used.size} of 128 experts used (${f0(b.frac * 100)}%) · ${f0(b.readGB)} GB of weights read this step`,
      "ok",
    );
    return true;
  }
  if (v === "heads") {
    if (!P.includes("heads")) {
      host.err("Head designs are in World 0, 'Many heads, shared notes'.");
      return true;
    }
    if (!HEAD_DESIGNS[a]) {
      host.err("heads mha | gqa | mqa");
      return true;
    }
    S.hd.design = a;
    if (a === "mha") S.flags.mha = true;
    if (a === "mqa") S.flags.mqa = true;
    const c = headsCalc(a);
    host.print(
      `${HEAD_DESIGNS[a].name}: ${c.n} KV heads · ${f2(c.kvt / 1e6)} MB per token · ${f0(c.users)} users with 4k chats fit on one H100`,
      "ok",
    );
    return true;
  }
  if (v === "qhead") {
    if (!P.includes("heads")) {
      host.err("Query heads are in World 0, 'Many heads, shared notes'.");
      return true;
    }
    const n = parseInt(a);
    if (!(n >= 1 && n <= 32)) {
      host.err("qhead N, from 1 to 32");
      return true;
    }
    S.hd.q = n - 1;
    S.flags.qhead = true;
    const g = 32 / HEAD_DESIGNS[S.hd.design].n;
    host.print(
      `Query head ${n} searches key/value head ${Math.floor((n - 1) / g) + 1}${g > 1 ? ` (shared with ${g - 1} others)` : ""}.`,
      "dim",
    );
    return true;
  }
  return false;
}

/** World 0's panel shortcuts: tapping a token, a query head, an attention row or a generation row. */
export function onClickW0(target: Element): boolean {
  const mo = target.closest<HTMLElement>("[data-moe]");
  if (mo) {
    host.exec("route " + MOE_TOKS[+mo.dataset.moe!].trim());
    return true;
  }
  const qh = target.closest<HTMLElement>("[data-qh]");
  if (qh) {
    host.exec("qhead " + (+qh.dataset.qh! + 1));
    return true;
  }
  const at = target.closest<HTMLElement>("[data-att]");
  if (at) {
    host.exec("attend " + at.dataset.att);
    return true;
  }
  const gr = target.closest<HTMLElement>("[data-genrow]");
  if (gr) {
    host.exec("generate inspect " + (+gr.dataset.genrow! + 1));
    return true;
  }
  return false;
}
