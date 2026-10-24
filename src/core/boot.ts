import { PACK as W4_PACK } from "../packs/w4-cluster/index.ts";
import { PACK as W3_PACK } from "../packs/w3-server/index.ts";
import { PACK as W2_PACK } from "../packs/w2-software/index.ts";
import { PACK as W1_PACK } from "../packs/w1-gpu/index.ts";
import { PACK as W0_PACK } from "../packs/w0-model/index.ts";
import { CATALOG, attachLevels } from "./catalog.ts";
import { MANIFEST } from "./manifest.ts";
import { packFor } from "./packs.ts";
import { refs } from "./catalog.ts";
import { printHelp } from "./help.ts";
import { print } from "./terminal.ts";
import { inspect } from "./inspect.ts";
import { err, flushOut, needWorld } from "./terminal.ts";
import { finaliseLevels } from "./catalog.ts";
import { renderCompare } from "./compare.ts";
import { renderManual } from "./help.ts";
import { renderGloss, renderHome, setMath, show } from "./home.ts";
import { checkGoals, loadLevel, renderQuiz, showHint } from "./levels.ts";
import { registerPack } from "./packs.ts";
import { bindReset, nextLevelId } from "./progress.ts";
import { renderSim, renderStrip } from "./sim.ts";
import { G } from "./state.ts";
import { exec, insert, locked, run } from "./terminal.ts";
import type { Level } from "./types.ts";
import { $, store } from "../shared/data/format.ts";
import { host } from "../shared/host.ts";
import { infoHtml } from "../shared/ui/info.ts";
// Start-up: wire the page's buttons and keys, register the worlds, and show the home screen.
for (const p of [W0_PACK, W1_PACK, W2_PACK, W3_PACK, W4_PACK]) registerPack(p);
finaliseLevels(); // check the manifest's IDs and number every level
// Each world's full levels must match the manifest; they get their numbers from it.
for (const W of MANIFEST) attachLevels(W.world, packFor(W.world).levels);
// Fill in what shared and world code needs from the running game (see src/shared/host.ts).
Object.assign(host, {
  G,
  print,
  err,
  locked,
  exec,
  needWorld,
  refs,
  renderSim,
  flushOut,
  checkGoals,
  inspect,
  printHelp,
  worldSmi: (args: string[]) => packFor(G.S!.world).smi?.(args),
});
/* ============ events ============ */
document.addEventListener("click", (e) => {
  const lv = (e.target as Element).closest<HTMLElement>("[data-level]");
  if (lv) {
    loadLevel(lv.dataset.level!);
    return;
  }
  const ins = (e.target as Element).closest<HTMLElement>("[data-ins]");
  if (ins) {
    insert(ins.dataset.ins!);
    return;
  }
  const cm = (e.target as Element).closest<HTMLButtonElement>("[data-cmd]");
  if (cm && !cm.disabled) {
    exec(cm.dataset.cmd!);
    return;
  }
  const st = (e.target as Element).closest<HTMLElement>("[data-strip]");
  if (st) {
    G.strip = Number(st.dataset.strip);
    renderStrip();
    return;
  }
  const ii = (e.target as Element).closest<HTMLElement>("[data-i]");
  if (ii && G.S && G.mode === "game") {
    const S = G.S!,
      k = ii.dataset.i!;
    if (!S.inspected.includes(k)) S.inspected.push(k);
    S.info = k;
    const box = $("#inspect");
    if (box) box.innerHTML = infoHtml(k);
    if (packFor(S.world).redrawOnTap) renderSim();
    checkGoals();
    return;
  }
  if (G.S && packFor(G.S.world).onClick?.(e.target as Element)) return;
  const cp = (e.target as Element).closest("[data-compare]");
  if (cp) {
    renderCompare();
    $("#cmpModal").hidden = false;
    try {
      $("#cmpClose").focus();
    } catch (_) {}
    return;
  }
  const q = (e.target as Element).closest<HTMLButtonElement>("[data-q]");
  if (q && !q.disabled) {
    const i = +q.dataset.q!,
      j = +q.dataset.o!,
      st2 = G.quizState!;
    if (!st2.picked[i].includes(j)) {
      st2.picked[i].push(j);
      if (j !== G.level!.questions![i].a) st2.mistakes++;
    }
    renderQuiz();
    return;
  }
});
$("#cmdForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const i = $<HTMLInputElement>("#cmd");
  run(i.value);
  i.value = "";
});
$("#cmd").addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") {
    if (G.hi > 0) {
      G.hi--;
      (e.target as HTMLInputElement).value = G.hist[G.hi] || "";
    }
    e.preventDefault();
  } else if (e.key === "ArrowDown") {
    if (G.hi < G.hist.length) {
      G.hi++;
      (e.target as HTMLInputElement).value = G.hist[G.hi] || "";
    }
    e.preventDefault();
  }
});
$("#homeBtn").onclick = () => show("home");
$("#levelsBtn").onclick = () => show("home");
$("#startBtn").onclick = () => loadLevel(nextLevelId() || CATALOG[0].id);
$("#hintBtn").onclick = showHint;
$("#restartBtn").onclick = () => loadLevel(G.level!.lab ? G.level!.id : G.level!.id);
$("#manualBtn").onclick = () => {
  const m = $("#manual"),
    open = m.hidden;
  if (open) renderManual();
  m.hidden = !open;
  $("#manualBtn").setAttribute("aria-expanded", String(open));
};
$("#glossBtn").onclick = () => {
  const m = $("#glossSide"),
    open = m.hidden;
  if (open) renderGloss(m);
  m.hidden = !open;
  $("#glossBtn").setAttribute("aria-expanded", String(open));
};
$("#mathBtn").onclick = () => setMath(!document.documentElement.classList.contains("math-on"));
$("#dNext").onclick = () => {
  $("#modal").hidden = true;
  const n = CATALOG[(G.level as Level).idx + 1];
  /* Next is hidden for labs */ if (n) loadLevel(n.id);
};
$("#dStay").onclick = () => {
  $("#modal").hidden = true;
};
$("#dLevels").onclick = () => {
  $("#modal").hidden = true;
  show("home");
};
$("#modal").addEventListener("click", (e) => {
  if ((e.target as Element).id === "modal") $("#modal").hidden = true;
});
$("#cmpClose").onclick = () => {
  $("#cmpModal").hidden = true;
};
$("#cmpModal").addEventListener("click", (e) => {
  if ((e.target as Element).id === "cmpModal") $("#cmpModal").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#modal").hidden = true;
    $("#cmpModal").hidden = true;
  }
});
bindReset();
renderGloss($("#glossList"));
setMath(!!store.get("gf-math", false));
renderHome();
