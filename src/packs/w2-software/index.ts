// World 2 · The software path.
import type { WorldPack } from "../../core/types.ts";
import { beforeIntro, commands, foundry, summary2 } from "./commands.ts";
import { CONTROLS, CONTROL_ORDER } from "./controls.ts";
import { helpW2, manualW2 } from "./help.ts";
import { LAB, LEVELS } from "./levels.ts";
import { renderW2, simHeader } from "./render.ts";
import { freshState } from "./state.ts";
import "./pack.css"; // this world's own styles, downloaded with the pack

export const PACK: WorldPack = {
  world: 2,
  levels: LEVELS,
  lab: LAB,
  freshState: () => freshState(),
  simHeader,
  renderSim: renderW2,
  redrawOnTap: true,
  controlOrder: CONTROL_ORDER,
  controls: CONTROLS,
  commands,
  foundry,
  afterChange: summary2,
  help: helpW2,
  manual: manualW2,
  inspectable: ["code", "torch", "lib", "runtime", "driver", "gpu"],
  inspectHint: "code, pytorch, libraries, runtime, driver, gpu",
  beforeIntro,
};
