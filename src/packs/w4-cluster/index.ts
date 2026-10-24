// World 4 · Many servers.
import type { WorldPack } from "../../core/types.ts";
import { commands, foundry, summary4 } from "./commands.ts";
import { CONTROLS, CONTROL_ORDER } from "./controls.ts";
import { help, manual } from "./help.ts";
import { LAB, LEVELS } from "./levels.ts";
import { renderW4 } from "./render.ts";
import { freshState, state } from "./state.ts";

export const PACK: WorldPack = {
  world: 4,
  levels: LEVELS,
  lab: LAB,
  freshState: () => freshState(),
  renderSim: renderW4,
  promptLabel: () => state().host + "$",
  controlOrder: CONTROL_ORDER,
  controls: CONTROLS,
  commands,
  foundry,
  afterChange: summary4,
  help,
  manual,
  inspectable: ["nic", "leaf", "spine", "node", "rayhead"],
  // Suggests World 2's parts, as the single file did (a known quirk kept for parity; see design.md).
  inspectHint: "code, pytorch, libraries, runtime, driver, gpu",
};
