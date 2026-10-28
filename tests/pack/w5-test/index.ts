// A test-only world (task 7.4): the smallest pack that fills the whole contract, to prove a world can be
// added without editing the core. One level, one command (`ping`), and a `.xp` style to check that pack
// styles stay inside the pack (the header's XP pill also uses `.xp`).
import type { BaseState, Level, LevelDef, WorldPack } from "../../../src/core/types.ts";
import { host } from "../../../src/shared/host.ts";
import "./pack.css";

export interface W5State extends BaseState {
  world: 5;
  pings: number;
}
// Adds World 5 to the game's state types from here, not from the core (see WorldStates in core/types.ts).
declare module "../../../src/core/types.ts" {
  interface WorldStates {
    5: W5State;
  }
}

const state = () => host.G.S as W5State;

const LEVELS: Level<W5State>[] = [
  {
    id: "test-ping",
    world: 5,
    title: "Ping the test pack",
    concept: "A world added by a pack",
    layers: { on: [1], near: [] }, // stack layers are numbered 1–10
    controls: [],
    brief: "<p>This world exists only in tests. Type <code>ping</code>.</p>",
    goals: [{ t: "Run ping", ok: (S) => S.pings > 0 }],
    hints: ["The command is in the chips below the terminal."],
    answer: () => "ping",
    chips: ["ping"],
    debrief: "<p>A pack and one manifest entry are all a world needs.</p>",
    links: { up: "Above: nothing, it's a test.", down: "Below: nothing, it's a test." },
  } satisfies LevelDef<W5State> as LevelDef<W5State> as Level<W5State>,
];

export const PACK: WorldPack = {
  world: 5,
  levels: LEVELS,
  freshState: (): W5State => ({
    world: 5,
    gpu: "h100",
    model: "llama-8b",
    pings: 0,
    flags: {},
    inspected: [],
    info: null,
  }),
  renderSim() {
    document.querySelector("#simTitle")!.textContent = "Test pack";
    document.querySelector("#simCap")!.textContent = "";
    document.querySelector("#ctrls")!.innerHTML = "";
    document.querySelector("#simBody")!.innerHTML = `<div class="xp">${state().pings} pings</div>`;
  },
  controlOrder: [],
  controls: {},
  commands(v) {
    if (v !== "ping") return false;
    state().pings++;
    host.print("pong");
    host.renderSim();
    return true;
  },
  foundry: () => false,
  afterChange: () => {},
  help: () => "ping   answer pong",
  manual: () => [],
  inspectable: [],
  inspectHint: "nothing to inspect here",
};
