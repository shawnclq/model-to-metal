import type { W1State } from "../../core/types.ts";
import { host } from "../../shared/host.ts";
// World 1's sim state.
export function freshState(): W1State {
  return {
    world: 1,
    gpu: "h100",
    model: "llama-8b",
    dtype: "bf16",
    kvdt: "bf16",
    batch: 1,
    ctx: 4096,
    prompt: 2048,
    flags: {},
    inspected: [],
    showRoof: false,
    info: null,
    mig: { mode: false, inst: [], share: "none" },
  };
}

/** The open level's state. Pack code runs only while one of World 1's levels is open, so it is World 1's. */
export function state(): W1State {
  return host.G.S as W1State;
}
