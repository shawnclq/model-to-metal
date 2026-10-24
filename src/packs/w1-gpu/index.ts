// World 1 · Inside one GPU.
import type { WorldPack } from "../../core/types.ts";
import { afterIntro, foundry, onInspect, smi, summary1 } from "./commands.ts";
import { CONTROLS, CONTROL_ORDER } from "./controls.ts";
import { helpW1, manualW1 } from "./help.ts";
import { LAB, LEVELS } from "./levels.ts";
import { renderW1, simHeader } from "./render.ts";
import { freshState } from "./state.ts";

export const PACK: WorldPack = {
  world: 1,
  levels: LEVELS,
  lab: LAB,
  freshState: () => freshState(),
  simHeader,
  renderSim: renderW1,
  controlOrder: CONTROL_ORDER,
  controls: CONTROLS,
  commands: () => false,
  foundry,
  smi,
  afterChange: summary1,
  help: helpW1,
  manual: manualW1,
  inspectable: ["sm", "hbm", "bw", "link", "mig", "cu", "xcd"],
  inspectHint: "sm, hbm, bandwidth, link",
  onInspect,
  afterIntro,
};
