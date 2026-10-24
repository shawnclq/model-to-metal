import type { GameState } from "./types.ts";
import type { Lab } from "./types.ts";
import { MANIFEST } from "./manifest.ts";
import { allPacks } from "./packs.ts";
import { CATALOG } from "./catalog.ts";
import { print } from "./terminal.ts";
import { refs } from "./catalog.ts";
import type { Level } from "./types.ts";
import { LEVEL_BY_ID } from "./catalog.ts";
import { show } from "./home.ts";
import { packFor } from "./packs.ts";
import { progress, saveProgress, starsHtml, starsOf } from "./progress.ts";
import { renderSim, renderStrip } from "./sim.ts";
import { G, OUT } from "./state.ts";
import { flushOut } from "./terminal.ts";
import type { Playable } from "./types.ts";
import { $, esc } from "../shared/data/format.ts";
import { stopFlicker } from "../shared/ui/flicker.ts";
// The level runner: opening a level, hints, goals, winning, quizzes.
/** Every level in the game, in order: each world's levels from its pack. */
export function allLevels(): Level[] {
  return MANIFEST.flatMap((W) => packFor(W.world).levels);
}
/** Every lab, in world order. */
export function allLabs(): Lab[] {
  return MANIFEST.flatMap((W) => {
    const lab = packFor(W.world).lab;
    return lab ? [lab] : [];
  });
}
export function getLevel(id: string): Playable | undefined {
  for (const p of allPacks()) {
    const l = p.levels?.find((x) => x.id === id) || (p.lab?.id === id ? p.lab : undefined);
    if (l) return l;
  }
  return undefined;
}
export function loadLevel(id: string) {
  const L = getLevel(id);
  if (!L) return;
  $("#cmpModal").hidden = true;
  clearTimeout(G.tt);
  clearTimeout(G.wt);
  G.level = L;
  G.S = packFor(L.world).freshState();
  if (L.setup) L.setup(G.S!);
  G.hints = 0;
  G.won = false;
  G.strip = null;
  OUT.length = 0;
  $("#mEyebrow").textContent = L.lab ? `Sandbox · World ${L.world}` : `World ${L.world} · Level ${L.n}`;
  $("#mTitle").textContent = L.title;
  $("#mConcept").textContent = L.concept;
  $("#mBrief").innerHTML =
    refs(L.brief) ||
    (L.quiz
      ? `<p>${L.questions!.length} questions on what you just did. Pick an answer; wrong picks show why, and you can try again. Fewer mistakes, more stars.</p>`
      : "");
  const gl = L.goals || [];
  $("#goalWrap").hidden = !gl.length;
  $("#mGoals").innerHTML = gl.map((g, i) => `<li data-g="${i}">${esc(refs(g.t))}</li>`).join("");
  $("#hintWrap").hidden = !L.answer;
  $("#mHints").innerHTML = "";
  $("#hintBtn").hidden = false;
  $("#hintBtn").textContent = "Show a hint";
  $("#manual").hidden = true;
  $("#manualBtn").setAttribute("aria-expanded", "false");
  $("#glossSide").hidden = true;
  $("#glossBtn").setAttribute("aria-expanded", "false");
  const quiz = !!L.quiz;
  $("#simCard").hidden = quiz;
  $("#termCard").hidden = quiz;
  $("#quiz").hidden = !quiz;
  $("#restartBtn").textContent = quiz ? "Restart quiz" : "Restart level";
  $("#manualBtn").hidden = quiz;
  renderStrip();
  if (quiz) {
    G.quizState = { picked: L.questions!.map(() => []), mistakes: 0 };
    renderQuiz();
    stopFlicker();
  } else {
    packFor(L.world).beforeIntro?.(L);
    print(
      L.lab
        ? `${L.title} ready. Type help for the command list.`
        : `World ${L.world} · Level ${L.n}: ${L.title}. Type help for commands, or hint for a nudge.`,
      "dim",
    );
    packFor(L.world).afterIntro?.(L);
    flushOut();
    renderChips();
    renderSim();
  }
  show("game");
  checkGoals();
}
export function renderChips() {
  const L = G.level!;
  $("#chips").innerHTML = (L.chips || [])
    .map((c) => `<button type="button" data-ins="${esc(c)}">${esc(c)}</button>`)
    .join("");
}
export function showHint() {
  const L = G.level!;
  if (!L.answer) return;
  const total = L.hints!.length + 1;
  if (G.hints >= total) return;
  G.hints++;
  const ol = $("#mHints");
  ol.innerHTML = "";
  L.hints!.slice(0, G.hints).forEach((h) => {
    const li = document.createElement("li");
    li.textContent = refs(h);
    ol.appendChild(li);
  });
  if (G.hints === total) {
    const a = L.answer(G.S!);
    const li = document.createElement("li");
    li.innerHTML = `<div class="answer"><span>Answer:</span> <code>${esc(a)}</code> <button class="btn" type="button" data-ins="${esc(a)}">Use it</button></div>`;
    ol.appendChild(li);
    $("#hintBtn").hidden = true;
  } else $("#hintBtn").textContent = G.hints === total - 1 ? "Show the answer" : "Next hint";
}
export const goalOk = (L: Playable, S: GameState) =>
  L.goals!.map((g) => {
    try {
      return !!g.ok(S);
    } catch (e) {
      return false;
    }
  });
export function checkGoals() {
  const L = G.level!;
  if (!L || L.quiz || !G.S) return;
  const res = goalOk(L, G.S);
  document.querySelectorAll("#mGoals li").forEach((li, i) => li.classList.toggle("ok", !!res[i]));
  if (G.won || !L.goals!.length) return;
  clearTimeout(G.wt);
  if (res.every(Boolean)) {
    const S = G.S!;
    G.wt = setTimeout(() => {
      if (G.level === L && G.S === S && !G.won && goalOk(L, S).every(Boolean)) win();
    }, 900);
  }
}
// Only levels are ever won: labs have no goals, so G.level is a Level here.
export function win(stars?: number) {
  const L = G.level as Level;
  G.won = true;
  if (stars === undefined) {
    const total = L.hints!.length + 1;
    stars = G.hints === 0 ? 3 : G.hints < total ? 2 : 1;
  }
  if (stars > starsOf(L.id)) {
    progress.stars[L.id] = stars;
    saveProgress();
  } // stars only go up
  $("#dEyebrow").textContent = L.quiz ? "Checkpoint complete" : `World ${L.world} · Level ${L.n} cleared`;
  $("#dTitle").textContent = L.title;
  $("#dStars").innerHTML = starsHtml(stars);
  $("#dBody").innerHTML =
    refs(L.debrief) +
    (L.links
      ? `<div class="links"><div><b>↑ Up</b><span>${esc(refs(L.links.up))}</span></div><div><b>↓ Down</b><span>${esc(refs(L.links.down))}</span></div></div>`
      : "") +
    (stars < 3
      ? `<p style="color:var(--muted);font-size:13px;margin-top:10px">${L.quiz ? "Retake with fewer wrong picks for 3 stars." : "Replay without the answer hint for 3 stars."}</p>`
      : "");
  const nxt = L.lab ? null : CATALOG[L.idx + 1];
  $("#dNext").hidden = !nxt;
  if (nxt) $("#dNext").textContent = `Next: ${nxt.title}`;
  $("#modal").hidden = false;
  try {
    $("#dNext").hidden ? $("#dStay").focus() : $("#dNext").focus();
  } catch (e) {}
}
export function renderQuiz() {
  const L = G.level!,
    st = G.quizState!;
  $("#quiz").innerHTML = L.questions!.map((q, i) => {
    const done = st.picked[i].includes(q.a);
    return `<div class="q"><h4>${i + 1}. ${esc(refs(q.q))}</h4><div class="opts">${q.o.map((o, j) => `<button type="button" data-q="${i}" data-o="${j}" class="${st.picked[i].includes(j) ? (j === q.a ? "right" : "wrong") : ""}" ${done ? "disabled" : ""}>${esc(refs(o))}</button>`).join("")}</div>${done ? `<div class="why">${esc(refs(q.why))}</div>` : st.picked[i].length ? `<div class="why">Not quite. Try another answer.</div>` : ""}</div>`;
  }).join("");
  if (L.questions!.every((q, i) => st.picked[i].includes(q.a)) && !G.won) {
    const m = st.mistakes;
    setTimeout(() => win(m === 0 ? 3 : m <= 2 ? 2 : 1), 500);
  }
}
