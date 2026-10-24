import { print } from "./terminal.ts";
import { packFor } from "./packs.ts";
import { G } from "./state.ts";
import { err } from "./terminal.ts";
import { INFO, INSPECT_ALIASES } from "../shared/data/info.ts";
// `foundry inspect NAME` and tapping a part: what it is, if it's on screen in this world.
export function inspect(id: string) {
  const S = G.S!,
    pack = packFor(S.world);
  const map = INSPECT_ALIASES; // every inspect name, in src/shared/data/info.ts
  const k = map[String(id || "").toLowerCase()] || id;
  if (!INFO[k]) {
    err(`Nothing called "${id}" to inspect. Try: ${pack.inspectHint}`);
    return false;
  }
  if (!pack.inspectable.includes(k)) {
    err(`Not on screen here. Try: ${pack.inspectable.join(", ")}`);
    return false;
  }
  pack.onInspect?.(k);
  S.info = k;
  if (!S.inspected.includes(k)) S.inspected.push(k);
  print(`${INFO[k].t}: ${INFO[k].d}`, "dim");
  return true;
}
