import { hasBench } from "../shared/bench/controls.ts";
import { packFor } from "./packs.ts";
import { G } from "./state.ts";
import { BENCH_CONTROLS, BenchControl, bindBenchControls } from "../shared/bench/controls.ts";
import { $, esc } from "../shared/data/format.ts";
import { LAYERS } from "../shared/data/stack.ts";
// The sim card: header, controls bar and the world's panel, redrawn after every command.
export function renderStrip() {
  const L = G.level!,
    on = L.layers.on,
    near = L.layers.near;
  $("#strip").innerHTML =
    `<span class="lead">Stack</span>` +
    LAYERS.map(
      (x) =>
        `<button type="button" data-strip="${x.n}" class="${on.includes(x.n) ? "on" : near.includes(x.n) ? "near" : ""}${G.strip === x.n ? " sel" : ""}" title="${esc(x.name)}">${x.n} ${esc(x.s)}</button>`,
    ).join("");
  const sel = LAYERS.find((x) => x.n === (G.strip || on[0]))!;
  $("#stripNote").innerHTML =
    `<b>${sel.n} · ${esc(sel.name)}.</b> ${esc(sel.d)} ${on.includes(sel.n) ? "<i>This level works here.</i>" : near.includes(sel.n) ? "<i>This level touches it.</i>" : ""}`;
}
export function renderCtrls() {
  const S = G.S!,
    L = G.level!,
    C = L.controls || [],
    lk = L.locks || {},
    pack = packFor(S.world);
  let h = "";
  // Each world lists its controls in the order they appear; the shared bench draws the ones it doesn't own.
  for (const name of pack.controlOrder) {
    if (!C.includes(name)) continue;
    const own = pack.controls[name];
    if (own) h += own(C, lk);
    else if (name in BENCH_CONTROLS && hasBench(S)) h += BENCH_CONTROLS[name as BenchControl](S, L, lk);
  }
  $("#ctrls").innerHTML = h;
  $("#ctrls").hidden = !h;
  bindBenchControls();
}
export function renderSim() {
  const S = G.S!,
    L = G.level!;
  if (!S || L.quiz) return;
  const pack = packFor(S.world);
  pack.simHeader?.(L);
  renderCtrls();
  $("#cmdForm label").textContent = pack.promptLabel?.() ?? "$";
  pack.renderSim();
}
