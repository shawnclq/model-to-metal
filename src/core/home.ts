import { CATALOG, LEVEL_BY_ID } from "./catalog.ts";
import { MANIFEST, SOON } from "./manifest.ts";
import { refs } from "./catalog.ts";
import { nextLevelId, starsHtml, starsOf, updateXp } from "./progress.ts";
import { G } from "./state.ts";
import { $, esc, store } from "../shared/data/format.ts";
import { GLOSS } from "../shared/data/info.ts";
import { LAYERS, STACK_COVER } from "../shared/data/stack.ts";
import { stopFlicker } from "../shared/ui/flicker.ts";
// The home screen, the glossary and the Show-the-math switch.
export function renderHome() {
  const next = nextLevelId();
  $("#stackMap").innerHTML = LAYERS.map((x) => {
    const c = STACK_COVER[x.n];
    return `<div class="${c ? c[1] : ""}"><span class="num">${String(x.n).padStart(2, "0")}</span><span><b>${esc(x.name)}</b></span><span class="w">${c ? c[0] : "later chapters"}</span></div>`;
  }).join("");
  $("#piers").innerHTML = MANIFEST.map(
    (W) =>
      `<section class="pier"><div class="pier-head"><h2>${esc(W.heading)}</h2><p>${esc(W.blurb)}</p></div><div class="levels">${W.levels
        .map(
          (l) =>
            `<button class="lvl${l.id === next ? " next" : ""}" data-level="${l.id}">${l.id === next ? '<span class="badge">Up next</span>' : ""}<span class="n">${String(LEVEL_BY_ID.get(l.id)!.n).padStart(2, "0")}</span><span class="t">${esc(l.title)}</span><span class="c">${esc(l.concept)}</span><span class="stars">${starsOf(l.id) ? starsHtml(starsOf(l.id)) : '<span class="off">★★★</span>'}</span></button>`,
        )
        .join(
          "",
        )}${W.lab ? `<button class="lvl lab" data-level="${W.lab.id}"><span class="n">∞</span><span class="t">${W.lab.title}</span><span class="c">Sandbox: every knob unlocked</span><span class="stars"></span></button>` : ""}</div></section>`,
  ).join("");
  $("#soon").innerHTML = SOON.map(
    (s) =>
      `<div class="lvl soon" aria-disabled="true"><span class="n">${s.n}</span><span class="t">${esc(s.t)}</span><span class="c">${esc(s.c)}</span><span class="stars"></span></div>`,
  ).join("");
  $("#startBtn").textContent = next
    ? next === CATALOG[0].id
      ? "Start level 1"
      : refs(`Continue: {{lvl:${next}}}`)
    : "Replay level 1";
  updateXp();
}
export function show(mode: string) {
  G.mode = mode;
  $("#home").hidden = mode !== "home";
  $("#game").hidden = mode !== "game";
  $("#levelsBtn").hidden = mode !== "game";
  if (mode === "home") {
    renderHome();
    stopFlicker();
  }
  try {
    window.scrollTo(0, 0);
  } catch (e) {}
}
export function renderGloss(el: HTMLElement) {
  el.innerHTML = GLOSS.map(([t, s, d]) => `<div><dt>${esc(t)}<span>${esc(s)}</span></dt><dd>${esc(d)}</dd></div>`).join(
    "",
  );
}
export function setMath(on: boolean) {
  document.documentElement.classList.toggle("math-on", on);
  $("#mathBtn").setAttribute("aria-pressed", String(on));
  store.set("gf-math", on);
}
