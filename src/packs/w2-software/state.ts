import type { W2State } from "../../core/types.ts";
import { host } from "../../shared/host.ts";
// World 2's sim state.
export function freshState(): W2State {
  return {
    world: 2,
    gpu: "h100",
    model: "llama-1b",
    dtype: "bf16",
    batch: 1,
    ctx: 2048,
    prompt: 32768,
    mode: "decode",
    graphs: false,
    fuse: false,
    flash: false,
    driver: 580,
    flags: {},
    inspected: [],
    info: null,
    lastRun: null,
    traceAt: -1,
  };
}

/** The open level's state. Pack code runs only while one of World 2's levels is open, so it is World 2's. */
export function state(): W2State {
  return host.G.S as W2State;
}
