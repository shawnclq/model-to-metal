import type { W0State } from "../../core/types.ts";
import { TOK_SAMPLE } from "./engine.ts";
import { host } from "../../shared/host.ts";
// World 0's sim state.
export function freshState(): W0State {
  return {
    world: 0,
    gpu: "h100",
    model: "llama-8b",
    calcModel: "llama-8b",
    text: TOK_SAMPLE,
    att: { i: -1, head: 1 },
    gen: { k: 0, cache: true, sel: null },
    moe: { tok: -1, batch: 1, seen: [] },
    hd: { design: "gqa", q: -1 },
    flags: {},
    inspected: [],
    info: null,
  };
}
/** The open level's state. Pack code runs only while one of World 0's levels is open, so it is World 0's. */
export function state(): W0State {
  return host.G.S as W0State;
}
