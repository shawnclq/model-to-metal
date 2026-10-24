import type { Model } from "../../shared/data/types.ts";
import type { W0State } from "../../core/types.ts";
import { f1, f2 } from "../../shared/data/format.ts";
import { MODELS, RESERVE, kvTok } from "../../shared/data/models.ts";
import type { MoeConfig } from "../../shared/data/types.ts";
// World 0's maths: the approximate tokenizer, parameter counts, attention, generation, MoE routing, heads.
/** One token from the approximate tokenizer: its text, its kind (word, split, num, space, intl, punct) and the whole word it came from. */
export interface Tok {
  t: string;
  k: string;
  w?: string;
}
/* ============ World 0: inside the model ============ */
/* --- approximate tokenizer, modelled on Llama 3's rules (not its real vocabulary) --- */
export const COMMON = new Set(
  "the of and to a in is it that for on with as was at by be this have from or one had but not what all were we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like him into time has look two more write go see number no way could people my than first water been call who now find long down day did get come made may part over new take only little work know place year live me back give most very after thing our just name good man think say great where help through much before line right too mean old any same tell follow came want show also around form three small set put end does another well large must big even such because turn here why ask went men read need land different home us move try kind hand again change off play air away house point page letter mother answer found study still learn should world cat sat mat tired capital france paris model models token tokens price cost costs dollars hello hi are you today chip memory city art food known famous text word words language english data cloud user users question answer short long simple fast slow large small every never always".split(
    " ",
  ),
);
export const SUFFIX = [
  "ization",
  "ation",
  "tion",
  "sion",
  "ness",
  "ment",
  "able",
  "ible",
  "ing",
  "ally",
  "ous",
  "ive",
  "ful",
  "less",
  "est",
  "ed",
  "er",
  "ly",
  "es",
  "s",
];
export function splitWord(w: string): string[] {
  const lw = w.toLowerCase();
  if (COMMON.has(lw) || w.length <= 4) return [w];
  for (const sf of SUFFIX) {
    if (lw.endsWith(sf) && lw.length - sf.length >= 3) {
      const root = w.slice(0, w.length - sf.length);
      const rl = root.toLowerCase();
      const rootParts = COMMON.has(rl) || root.length <= 6 ? [root] : chunk(root);
      return [...rootParts, w.slice(w.length - sf.length)];
    }
  }
  return w.length <= 7 ? [w] : chunk(w);
}
export function chunk(w: string) {
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    const n = w.length - i <= 6 ? w.length - i : 4;
    out.push(w.slice(i, i + n));
    i += n;
  }
  return out;
}
export function tokenize(text: string) {
  const toks: Tok[] = [];
  const re = /( ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]|\n|\s+)/gu;
  let m: unknown;
  const s = String(text || "");
  for (const part of s.match(/ ?[A-Za-z]+| ?[0-9]+|\n| +|[^\sA-Za-z0-9 ]/gu) || []) {
    if (/^ ?[A-Za-z]+$/.test(part)) {
      const lead = part.startsWith(" ") ? " " : "";
      const w = part.trim();
      const ps = splitWord(w);
      ps.forEach((p, i) => toks.push({ t: (i === 0 ? lead : "") + p, k: ps.length > 1 ? "split" : "word", w }));
    } else if (/^ ?[0-9]+$/.test(part)) {
      const lead = part.startsWith(" ") ? " " : "";
      const d = part.trim();
      for (let i = 0; i < d.length; i += 3) toks.push({ t: (i === 0 ? lead : "") + d.slice(i, i + 3), k: "num" });
    } else if (part === "\n") toks.push({ t: "\\n", k: "space" });
    else if (/^ +$/.test(part)) {
      if (part.length > 1) toks.push({ t: part.slice(1), k: "space" });
    } else if (/[^\x00-\x7F]/.test(part)) toks.push({ t: part, k: "intl" });
    else toks.push({ t: part, k: "punct" });
  }
  return toks;
}
export function tokId(t: string) {
  let h = 2166136261 >>> 0;
  for (const ch of t) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 128256;
}
export const TOK_SAMPLE = "The capital of France is Paris. Tokenization isn't always one word per token!";

/* --- parameter breakdown from real config.json values --- */
export function paramParts(m: Model) {
  const q = m.h * m.heads * m.hd,
    kv = m.h * m.kvh * m.hd,
    o = m.heads * m.hd * m.h;
  const moeLayerMlp = m.moe ? m.moe.expTotal / m.L : 3 * m.h * m.inter;
  const attn = q + 2 * kv + o,
    mlp = moeLayerMlp,
    embed = m.vocab * m.h,
    head = m.tied ? 0 : m.vocab * m.h;
  const total = embed + head + m.L * (attn + mlp);
  return { q, kv, o, attn, mlp, embed, head, total, attnAll: attn * m.L, mlpAll: mlp * m.L };
}
export const W0_MODELS = ["llama-1b", "llama-8b", "llama-70b", "llama-405b"];
export const fB = (n: number) => (n >= 1e9 ? f2(n / 1e9) + " B" : f1(n / 1e6) + " M");

/* --- attention demo --- */
export const ATT_TOKS = ["The", " cat", " sat", " on", " the", " mat", " because", " it", " was", " tired"];
export const ATT_SEM: Record<number, Record<number, number>> = {
  7: { 1: 3.6, 5: 2.0, 6: 0.9, 2: 0.8 },
  8: { 7: 2.8, 1: 1.6 },
  9: { 1: 2.6, 7: 2.3, 8: 1.5 },
  2: { 1: 2.8 },
  5: { 4: 1.2, 2: 1.6, 3: 1.8 },
  3: { 2: 2.4 },
  4: { 3: 1.6 },
  6: { 2: 1.3, 1: 0.9 },
};
export function attScores(i: number, head: number) {
  const s: number[] = [];
  for (let j = 0; j <= i; j++) {
    let v = 0;
    if (j === 0) v += 1.2;
    if (j === i) v += 1.0;
    if (head === 1) {
      v += (ATT_SEM[i] && ATT_SEM[i][j]) || 0;
    } else {
      if (j === i - 1) v += 3.5;
    }
    s.push(v);
  }
  return s;
}
export function softmax(a: number[]) {
  const mx = Math.max(...a);
  const e = a.map((x) => Math.exp(x - mx));
  const z = e.reduce((p, c) => p + c, 0);
  return e.map((x) => x / z);
}

/* --- generation demo --- */
export const GEN_PROMPT = ["The", " capital", " of", " France", " is"];
export const GEN_OUT: { t: string; c: [string, number][] }[] = [
  {
    t: " Paris",
    c: [
      [" Paris", 0.91],
      [" a", 0.04],
      [" the", 0.02],
    ],
  },
  {
    t: ",",
    c: [
      [",", 0.46],
      [".", 0.38],
      [" and", 0.04],
    ],
  },
  {
    t: " known",
    c: [
      [" known", 0.31],
      [" a", 0.22],
      [" the", 0.18],
    ],
  },
  {
    t: " for",
    c: [
      [" for", 0.88],
      [" as", 0.07],
      [" worldwide", 0.01],
    ],
  },
  {
    t: " art",
    c: [
      [" art", 0.34],
      [" its", 0.29],
      [" the", 0.12],
    ],
  },
  {
    t: " and",
    c: [
      [" and", 0.52],
      [",", 0.31],
      [".", 0.08],
    ],
  },
  {
    t: " food",
    c: [
      [" food", 0.44],
      [" fashion", 0.21],
      [" culture", 0.12],
    ],
  },
  {
    t: "<|eot_id|>",
    c: [
      ["<|eot_id|>", 0.63],
      [".", 0.27],
      [",", 0.04],
    ],
  },
];
export function genRuns(S: W0State) {
  const m = MODELS["llama-8b"],
    wGB = (m.P * 2) / 1e9,
    kvT = kvTok(m);
  const runs = [];
  let fed = 0,
    comp = 0;
  for (let k = 1; k <= S.gen.k; k++) {
    const ctx = GEN_PROMPT.length + k - 1;
    const n = k === 1 ? GEN_PROMPT.length : S.gen.cache ? 1 : ctx;
    fed += n;
    runs.push({
      k,
      type: k === 1 ? "prefill" : "decode",
      n,
      ctx,
      out: GEN_OUT[k - 1],
      wGB,
      kvGB: S.gen.cache ? (ctx * kvT) / 1e9 : 0,
    });
  }
  return {
    runs,
    fed,
    weightsGB: S.gen.k * wGB,
    kvMB: S.gen.cache ? ((GEN_PROMPT.length + Math.max(0, S.gen.k - 1)) * kvT) / 1e6 : 0,
    kvT,
  };
}
/* ============ World 0: mixture of experts ============ */
export const MOE_TOKS = [" Paris", " def", " 42", " gracias", " protein", " the"];
export function seedRand(str: string) {
  let h = 2166136261 >>> 0;
  for (const ch of str) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h / 4294967296;
  };
}
export function routeToken(tok: string) {
  const m = MODELS["qwen-235b"],
    moe: MoeConfig = m.moe!,
    E = moe.E,
    k = moe.k,
    r = seedRand(tok + "#route");
  const scores = [...Array(E)].map((_, i) => ({ i, s: r() * 2 + (r() < 0.08 ? 2.2 : 0) }));
  const top = scores.sort((a, b) => b.s - a.s).slice(0, k);
  const w = softmax(top.map((x) => x.s * 2.2));
  return top.map((x, j) => ({ e: x.i, w: w[j] }));
}
export function moeBatch(B: number) {
  const m = MODELS["qwen-235b"] as (typeof MODELS)[string] & { moe: MoeConfig },
    used = new Set<number>();
  for (let i = 0; i < B; i++) routeToken(B === 1 ? MOE_TOKS[0] : "tok" + i).forEach((x) => used.add(x.e));
  const expect = 1 - Math.pow(1 - m.moe.k / m.moe.E, B);
  return {
    used,
    frac: used.size / m.moe.E,
    expect,
    readGB: (m.moe.nonExp + (m.moe.expTotal * used.size) / m.moe.E) / 1e9,
  };
}

/* ============ World 0: heads and KV heads ============ */
export const HEAD_DESIGNS: Record<string, { n: number; name: string; note: string }> = {
  mha: { n: 32, name: "Multi-head (MHA)", note: "every query head has its own keys and values" },
  gqa: { n: 8, name: "Grouped-query (GQA)", note: "groups of 4 query heads share one key/value head" },
  mqa: { n: 1, name: "Multi-query (MQA)", note: "all 32 query heads share a single key/value head" },
};
export const HEAD_ROLES = [
  "looks at the previous word",
  "links pronouns to the nouns they mean",
  "tracks the subject of the sentence",
  "watches punctuation and sentence ends",
  "finds matching quotes and brackets",
  "attends to the first token (a resting spot)",
  "copies repeated names",
  "follows verbs to their objects",
];
export function headsCalc(design: string) {
  const m = MODELS["llama-8b"],
    n = HEAD_DESIGNS[design].n,
    kvt = 2 * m.L * n * m.hd * 2,
    ctx = 4096;
  const free = 80 - (m.P * 2) / 1e9 - RESERVE,
    perUser = (kvt * ctx) / 1e9;
  return { n, kvt, perUser, users: Math.floor(free / perUser), free, long: (kvt * 131072) / 1e9 };
}
