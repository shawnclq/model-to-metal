import {
  ATT_TOKS,
  GEN_OUT,
  TOK_SAMPLE,
  W0_MODELS,
  attScores,
  fB,
  genRuns,
  paramParts,
  softmax,
  tokenize,
} from "./4c-w0.ts";
import { setTokText } from "./6d-w0.ts";
import { WORLD_INSPECT } from "./7a-more.ts";
import { late } from "./late.ts";
import type { GameState, ManualSection } from "./types.ts";
import { f0, f1, f2 } from "../shared/data/format.ts";
import { INFO } from "../shared/data/info.ts";
import { MODELS, MODEL_ALIAS, kvTok } from "../shared/data/models.ts";
import { seg } from "../shared/ui/controls.ts";
/* ============ World 0 state, controls and commands ============ */
// PASS-1: World 0 builds only its own fields; see freshState in 7-app.
export function freshW0(): GameState {
  return {
    world: 0,
    gpu: "h100",
    model: "llama-8b",
    calcModel: "llama-8b",
    text: TOK_SAMPLE,
    att: { i: -1, head: 1 },
    gen: { k: 0, cache: true, sel: null },
    moe: { tok: -1, batch: 1, seen: [] },
    hd: { design: "gqa", q: -1 },
    flags: {},
    inspected: [],
    info: null,
  } as unknown as GameState;
}
export function ctrlsW0(S: GameState, C: string[]) {
  let h = "";
  if (C.includes("model0"))
    h += seg(
      "Model",
      "model",
      W0_MODELS.map((k) => ({ v: k, l: MODELS[k].name.replace("Llama ", ""), cmd: "params " + k })),
      S.model,
    );
  if (C.includes("head"))
    h += seg(
      "Attention head",
      "head",
      [
        { v: 1, l: "Head 1", s: "meaning", cmd: "head 1" },
        { v: 2, l: "Head 2", s: "previous word", cmd: "head 2" },
      ],
      S.att.head,
    );
  if (C.includes("cache"))
    h += seg(
      "KV cache",
      "cache",
      [
        { v: false, l: "Off", cmd: "kv off" },
        { v: true, l: "On", cmd: "kv on" },
      ],
      S.gen.cache,
    );
  if (C.includes("gen"))
    h += `<div class="ctl"><span>Generate</span><div class="seg" role="group" aria-label="Generate"><button type="button" class="on" data-cmd="generate step" ${S.gen.k >= GEN_OUT.length ? "disabled" : ""}>Next step</button><button type="button" data-cmd="generate all" ${S.gen.k >= GEN_OUT.length ? "disabled" : ""}>Run all</button><button type="button" data-cmd="generate reset">Reset</button></div></div>`;
  return h;
}
export function genStep() {
  const S = late.G.S!;
  if (S.gen.k >= GEN_OUT.length) {
    late.print("The model already finished (it output its end-of-turn token). generate reset to start again.", "dim");
    return false;
  }
  S.gen.k++;
  const R = genRuns(S),
    r = R.runs[R.runs.length - 1];
  late.print(
    `Run ${r.k} (${r.type}): fed ${r.n} token${r.n > 1 ? "s" : ""}${r.k > 1 && r.n > 1 ? " (recomputing every earlier token)" : ""} · read ${f1(r.wGB)} GB of weights → next token ${JSON.stringify(r.out.t)} (${f0(r.out.c[0][1] * 100)}%)`,
    r.k === GEN_OUT.length ? "ok" : "",
  );
  if (S.gen.k === GEN_OUT.length) {
    late.print(
      `Done: ${S.gen.k} runs, ${R.fed} tokens processed, ${f0(R.weightsGB)} GB of weights read in total.`,
      "ok",
    );
    if (late.G.level!.panels!.includes("kv")) {
      if (S.gen.cache) S.flags.genOn = true;
      else S.flags.genOff = true;
    }
  }
  return true;
}
export function w0Cmd(v: string, t: string[]) {
  const S = late.G.S!,
    a = t.slice(1),
    arg = (a[0] || "").toLowerCase();
  if (v === "tokenize") {
    if (S.world !== 0 || !late.G.level!.panels!.includes("tok")) {
      late.err("The tokenizer is in World 0, 'Words into tokens'.");
      return true;
    }
    const text = t
      .slice(1)
      .join(" ")
      .replace(/^["']|["']$/g, "");
    if (!text) {
      late.err("tokenize YOUR TEXT, e.g. tokenize Hello world");
      return true;
    }
    setTokText(text);
    const toks = tokenize(text);
    late.print(`${toks.length} tokens: ` + toks.map((x) => "[" + x.t + "]").join(""));
    return true;
  }
  if (S.world !== 0) return false;
  if (v === "config") {
    const m = MODELS[MODEL_ALIAS[arg] || arg] || MODELS[S.model];
    late.print(
      `{  // ${m.name} · config.json (key fields)\n  "hidden_size": ${m.h},\n  "num_hidden_layers": ${m.L},\n  "num_attention_heads": ${m.heads},\n  "num_key_value_heads": ${m.kvh},\n  "head_dim": ${m.hd},\n  "intermediate_size": ${m.inter},\n  "vocab_size": ${m.vocab},\n  "torch_dtype": "bfloat16"\n}`,
    );
    return true;
  }
  if (v === "params") {
    const k = MODEL_ALIAS[arg] || arg || S.model;
    if (!W0_MODELS.includes(k)) {
      late.err("params llama-1b | llama-8b | llama-70b | llama-405b");
      return true;
    }
    if (!late.G.level!.panels!.includes("anatomy")) {
      const P = paramParts(MODELS[k]);
      late.print(`${MODELS[k].name}: ${fB(P.total)} parameters`);
      return true;
    }
    S.model = k;
    if (k === "llama-70b") S.flags.saw70 = true;
    const P = paramParts(MODELS[k]);
    late.print(
      `${MODELS[k].name}: ${fB(P.total)} parameters = embeddings ${fB(P.embed)} + ${MODELS[k].L} layers × ${fB(P.attn + P.mlp)} + head ${fB(P.head)} · ${f1((P.total * 2) / 1e9)} GB in BF16`,
      "ok",
    );
    return true;
  }
  if (v === "attend") {
    if (!late.G.level!.panels!.includes("attn")) {
      late.err("Attention is in the 'Who is \"it\"?' level.");
      return true;
    }
    let j = parseInt(arg);
    if (isNaN(j)) j = ATT_TOKS.findIndex((x) => x.trim().toLowerCase() === arg);
    if (arg === "the" && a[0] !== "the") j = 0;
    if (a[0] === "the") j = 4;
    if (j < 0 || j >= ATT_TOKS.length) {
      late.err(`attend WORD, one of: ${ATT_TOKS.map((x) => x.trim()).join(", ")}`);
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
    late.print(
      `"${ATT_TOKS[j].trim()}" (head ${S.att.head}) attends to: ` +
        top.map(([x, k]) => `${ATT_TOKS[k].trim()} ${f0(x * 100)}%`).join(", "),
    );
    return true;
  }
  if (v === "head") {
    if (!late.G.level!.panels!.includes("attn")) {
      late.err("Heads are in the 'Who is \"it\"?' level.");
      return true;
    }
    const n = parseInt(arg);
    if (n !== 1 && n !== 2) {
      late.err("head 1 | head 2");
      return true;
    }
    S.att.head = n;
    if (n === 2) S.flags.head2 = true;
    late.print(
      `Head ${n}: ${n === 1 ? "links meaning, e.g. pronouns to nouns" : "looks mostly at the previous word"}`,
      "dim",
    );
    if (S.att.i >= 0) w0Cmd("attend", ["attend", String(S.att.i)]);
    return true;
  }
  if (v === "generate") {
    if (!late.G.level!.panels!.includes("gen")) {
      late.err("Generation is in the 'One word at a time' and 'Notes to self' levels.");
      return true;
    }
    if (arg === "reset" || (arg === "" && false)) {
      S.gen.k = 0;
      S.gen.sel = null;
      late.print("Reset: back to the prompt.", "dim");
      return true;
    }
    if (arg === "all") {
      if (S.gen.k >= GEN_OUT.length) {
        S.gen.k = 0;
        S.gen.sel = null;
        late.print("Starting again from the prompt.", "dim");
      }
      while (genStep() && S.gen.k < GEN_OUT.length) {}
      return true;
    }
    if (arg === "inspect") {
      const n = parseInt(a[1]);
      if (!(n >= 1 && n <= S.gen.k)) {
        late.err(`generate inspect N, where N is a run that has happened (1–${S.gen.k || 1})`);
        return true;
      }
      S.gen.sel = n - 1;
      S.flags.genSel = true;
      const o = GEN_OUT[n - 1];
      late.print(`Run ${n} top choices: ` + o.c.map((c) => `${JSON.stringify(c[0])} ${f0(c[1] * 100)}%`).join(", "));
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
        late.err("kv per-token llama-8b | llama-70b | llama-405b | qwen-235b");
        return true;
      }
      S.calcModel = k;
      if (k === "llama-70b") S.flags.kv70 = true;
      const b = kvTok(m);
      late.print(
        `${m.name}: 2 × ${m.L} layers × ${m.kvh} KV heads × ${m.hd} dims × 2 bytes = ${f0(b)} bytes ≈ ${f2(b / 1e6)} MB per token · ${f1((b * 131072) / 1e9)} GB for a 128k conversation`,
        "ok",
      );
      return true;
    }
    if (!late.G.level!.panels!.includes("kv")) {
      late.err("The KV cache switch is in the 'Notes to self' level.");
      return true;
    }
    if (arg !== "on" && arg !== "off") {
      late.err("kv on | kv off | kv per-token MODEL");
      return true;
    }
    S.gen.cache = arg === "on";
    S.gen.k = 0;
    S.gen.sel = null;
    late.print(`KV cache ${arg}. Generation reset to the prompt.`, "dim");
    return true;
  }
  return false;
}
export function helpW0() {
  return `MODEL COMMANDS (World 0)
  tokenize YOUR TEXT                 split text into tokens
  config llama-8b                    the model's key config.json fields
  params llama-70b                   where the parameters come from
  route Paris | batch 32             mixture of experts: router and experts
  foundry inspect embed|attn|mlp|head|layer
  attend it | head 2                 attention: which earlier words a word looks at
  heads mha|gqa|mqa | qhead 5        attention heads and shared key/value heads
  generate step | all | reset        run the model one token at a time
  generate inspect N                 top next-token choices for run N
  kv on | kv off                     switch the KV cache
  kv per-token llama-70b             KV cache size per token
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
}
export function manualW0(): ManualSection[] {
  return [
    [
      "Tokens",
      [
        ["tokenize Hello world", ""],
        ["tokenize Tokenization of 1234567", ""],
      ],
    ],
    [
      "Weights",
      [
        ["config llama-8b", ""],
        ["params llama-70b", ""],
        ["foundry inspect mlp", ""],
      ],
    ],
    [
      "Experts",
      [
        ["route Paris", ""],
        ["batch 32", ""],
      ],
    ],
    [
      "Attention",
      [
        ["attend it", ""],
        ["head 2", ""],
        ["qhead 5", ""],
        ["heads mha", ""],
      ],
    ],
    [
      "Generate",
      [
        ["generate step", ""],
        ["generate all", ""],
        ["generate inspect 1", ""],
        ["kv off", ""],
        ["kv per-token llama-70b", ""],
      ],
    ],
  ];
}
WORLD_INSPECT[0] = ["embed", "attn", "mlp", "head", "layer"];

Object.assign(late, { ctrlsW0 });
