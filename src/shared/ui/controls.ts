import { esc } from "../data/format.ts";
// Segmented button groups: the GPU / precision / batch pickers above every sim panel.
/** One button in a segmented control: its value, label, optional small print and the command it types. */
export interface SegOpt {
  v: string | number | boolean;
  l: string;
  s?: string;
  cmd: string;
}
export function seg(label: string, key: string, opts: SegOpt[], cur: SegOpt["v"] | undefined, lock?: string) {
  return `<div class="ctl${lock ? " locked" : ""}" title="${lock ? esc(lock) : ""}"><span>${label}</span><div class="seg" role="group" aria-label="${label}">${opts.map((o) => `<button type="button" class="${o.v === cur ? "on" : ""}" ${lock ? "disabled" : ""} data-cmd="${esc(o.cmd)}" aria-pressed="${o.v === cur}">${o.l}${o.s ? `<small>${o.s}</small>` : ""}</button>`).join("")}</div></div>`;
}
