import { print } from "./terminal.ts";
import { packFor } from "./packs.ts";
import { G } from "./state.ts";
import type { ManualSection } from "./types.ts";
import { $, esc } from "../shared/data/format.ts";
// The `help` text and the Command list panel, from the open level's world.
export function printHelp() {
  print(packFor(G.S!.world).help(), "dim");
}
/** One Command list section per heading; each command is a button that types itself into the terminal. */
function sections(m: ManualSection[]) {
  return m
    .map(
      ([h, cs]) =>
        `<h4>${h}</h4>` +
        cs
          .map(
            ([c, d]) =>
              `<button type="button" data-ins="${esc(c)}">${esc(c)}${d ? `<span>${esc(d)}</span>` : ""}</button>`,
          )
          .join(""),
    )
    .join("");
}
export function renderManual() {
  const w = G.S ? G.S!.world : 1;
  $("#manual").innerHTML = sections(packFor(w).manual());
}
