// World 3 · Many GPUs, one server.
import type { WorldPack } from "../../core/types.ts";
import { afterIntro, commands, foundry, summary3 } from "./commands.ts";
import { CONTROLS, CONTROL_ORDER } from "./controls.ts";
import { help, manual } from "./help.ts";
import { LAB, LEVELS } from "./levels.ts";
import { renderW3 } from "./render.ts";
import { freshState } from "./state.ts";

export const PACK: WorldPack = {
  world: 3,
  levels: LEVELS,
  lab: LAB,
  freshState: () => freshState(),
  renderSim: renderW3,
  controlOrder: CONTROL_ORDER,
  controls: CONTROLS,
  commands,
  foundry,
  afterChange: summary3,
  help,
  manual,
  inspectable: ["nvswitch", "nvlink", "pcie", "gpu8", "ifmesh"],
  // Suggests World 2's parts, as the single file did (a known quirk kept for parity; see design.md).
  inspectHint: "code, pytorch, libraries, runtime, driver, gpu",
  afterIntro,
};
