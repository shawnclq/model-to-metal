import { CATALOG } from "./catalog.ts";
import { renderHome } from "./home.ts";
import type { Progress } from "./types.ts";
import { $, store } from "../shared/data/format.ts";
/* ============ state ============ */
/* ---- saved progress: best stars per permanent level ID. XP is never stored; it's worked out from stars. ---- */
export const SAVE_KEY = "m2m-progress-v1",
  V4_KEY = "gf-progress-v4";
// FROZEN: the 36 levels in the order gf-progress-v4 numbered them (number 1 = index 0). Never edit or re-sort:
// it decodes old saves forever, whatever happens to LEVELS later.
export const V4_IDS = [
  "tokens",
  "parameters",
  "moe-experts",
  "attention",
  "attention-heads",
  "generation",
  "kv-cache-basics",
  "quiz-inside-model",
  "gpu-anatomy",
  "memory-fit",
  "kv-cache-memory",
  "memory-bandwidth",
  "batching",
  "prefill-decode",
  "kv-quantisation",
  "moe-on-gpu",
  "perf-per-watt",
  "gpu-sharing",
  "amd-gpus",
  "gpu-choice",
  "quiz-one-gpu",
  "software-path",
  "launch-overhead",
  "kernel-fusion",
  "driver-stack",
  "quiz-software-path",
  "hgx-board",
  "tensor-parallel",
  "nvlink-vs-pcie",
  "tp-vs-replicas",
  "quiz-one-server",
  "fabric",
  "multi-node",
  "pipeline-parallel",
  "data-parallel",
  "quiz-cluster",
];
export const XP_PER_STAR = 50,
  XP_PER_STAR_QUIZ = 75;
// whole numbers per star, so XP never needs rounding
export const freshProgress = (): Progress => ({ v: 1, stars: {} });
export const validStars = (n: unknown): n is 1 | 2 | 3 => n === 1 || n === 2 || n === 3;
export function loadProgress(): Progress {
  // Whatever is stored is untrusted until checked: a partial shape, then validated field by field below.
  const p = store.get<{ v?: unknown; stars?: unknown } | null>(SAVE_KEY, null);
  if (p && typeof p === "object" && p.v === 1 && p.stars && typeof p.stars === "object" && !Array.isArray(p.stars))
    return p as Progress;
  // No usable new save: convert a v4 save once if there is one. The v4 save itself is never written or deleted (rollback safety).
  const old = store.get<{ done?: unknown } | null>(V4_KEY, null),
    out = freshProgress();
  if (old && typeof old === "object" && old.done && typeof old.done === "object") {
    for (const [k, n] of Object.entries(old.done as Record<string, unknown>)) {
      const id = /^\d+$/.test(k) ? V4_IDS[Number(k) - 1] : undefined;
      if (id && validStars(n)) out.stars[id] = n;
    }
    store.set(SAVE_KEY, out);
  }
  return out;
}
export let progress = loadProgress();
// Entries for IDs not in LEVELS stay in the save untouched (a restored level gets its stars back); they just aren't counted.
export const starsOf = (id: string) => {
  const n = progress.stars[id];
  return validStars(n) ? n : 0;
};
export const totalXp = () => CATALOG.reduce((t, l) => t + starsOf(l.id) * (l.quiz ? XP_PER_STAR_QUIZ : XP_PER_STAR), 0);
export function saveProgress() {
  store.set(SAVE_KEY, progress);
  updateXp();
}
export function updateXp() {
  $("#xpNum").textContent = String(totalXp());
  $("#totNum").textContent = String(CATALOG.length);
  $("#doneNum").textContent = String(CATALOG.filter((l) => starsOf(l.id)).length);
}
export function nextLevelId() {
  const l = CATALOG.find((l) => !starsOf(l.id));
  return l ? l.id : null;
}
export function starsHtml(n: number) {
  return [1, 2, 3].map((i) => (i <= n ? "★" : '<span class="off">★</span>')).join("");
}
export function bindReset() {
  $("#resetAll").onclick = () => {
    $("#resetWrap").innerHTML =
      '<span class="confirm">Erase all stars and XP? <button class="btn" id="resetYes">Erase</button> <button class="btn ghost" id="resetNo">Keep</button></span>';
    $("#resetYes").onclick = () => {
      progress = freshProgress();
      saveProgress();
      restoreReset();
      renderHome();
    };
    $("#resetNo").onclick = restoreReset;
  };
}
export function restoreReset() {
  $("#resetWrap").innerHTML = '<button class="btn ghost" id="resetAll">Reset progress</button>';
  bindReset();
}
