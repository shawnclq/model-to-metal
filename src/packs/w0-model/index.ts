// World 0 · Inside the model.
import type { WorldPack } from "../../core/types.ts";
import { w0Cmd, onClickW0 } from "./commands.ts";
import { w0bCmd } from "./commands.ts";
import { CONTROLS, CONTROL_ORDER } from "./controls.ts";
import { helpW0, manualW0 } from "./help.ts";
import { LEVELS } from "./levels.ts";
import { renderW0 } from "./render.ts";
import { freshState } from "./state.ts";
import { foundryLoad } from "../../shared/bench/foundry.ts";
import { f0, parseNum } from "../../shared/data/format.ts";
import { KVDT } from "../../shared/data/models.ts";
import { host } from "../../shared/host.ts";
import "./pack.css"; // this world's own styles, downloaded with the pack

// KNOWN BUG, kept for parity (see design.md): in the single file, a bench change in World 0 ran World 4's status
// line, which failed on World 0's state with exactly this error, after the change itself was made.
// The follow-up bug-fix change replaces this with a real World 0 response.
function afterChange(): void {
  throw new TypeError("Cannot read properties of undefined (reading 'name')");
}

export const PACK: WorldPack = {
  world: 0,
  levels: LEVELS,
  freshState: () => freshState(),
  renderSim: renderW0,
  redrawOnTap: true,
  controlOrder: CONTROL_ORDER,
  controls: CONTROLS,
  commands: (v, t) => w0bCmd(v, t) || w0Cmd(v, t),
  // World 0 itself handles only the bench subcommands the single file let through (each ends in afterChange).
  foundry(t) {
    const sub = (t[0] || "").toLowerCase();
    if (sub === "load") foundryLoad(t, afterChange);
    else if (sub === "prompt") {
      // The single file ran the shared prompt setter here, writing a field World 0 doesn't have (nothing reads it),
      // then failed in afterChange. What the player sees: the range check, then that error.
      const n = parseNum(t[1]);
      if (!isFinite(n) || n < 128 || n > 262144)
        host.err(`Prompt must be a number from ${f0(128)} to ${f0(262144)} (you can write 8k).`);
      else afterChange();
    } else if (sub === "kv") {
      // Likewise for the KV-cache precision: the name check and message, then the error.
      const a = (t[1] || "").toLowerCase();
      if (!KVDT[a]) host.err("foundry kv bf16 | fp8");
      else {
        host.print(`KV cache stored in ${KVDT[a].name}`, "dim");
        afterChange();
      }
    } else if (sub === "status") afterChange();
    else return false;
    return true;
  },
  afterChange,
  help: helpW0,
  manual: manualW0,
  inspectable: ["embed", "attn", "mlp", "head", "layer"],
  // Suggests World 2's parts, as the single file did (a known quirk kept for parity; see design.md).
  inspectHint: "code, pytorch, libraries, runtime, driver, gpu",
  onClick: onClickW0,
};
