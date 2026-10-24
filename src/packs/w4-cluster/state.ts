import type { W4State } from "../../core/types.ts";
import { host } from "../../shared/host.ts";
// World 4's sim state.
export function freshState(): W4State {
  return {
    world: 4,
    gpu: "h100",
    mode: "fabric",
    nodes: 2,
    net: "ib",
    gdr: true,
    model: "llama-405b",
    dtype: "bf16",
    kvdt: "bf16",
    tp: 8,
    pp: 2,
    batch: 8,
    ctx: 4096,
    prompt: 8192,
    ray: { head: null, workers: [] },
    host: "node-1",
    job: null,
    flags: {},
    inspected: [],
    info: null,
  };
}

/** The open level's state. Pack code runs only while one of World 4's levels is open, so it is World 4's. */
export function state(): W4State {
  return host.G.S as W4State;
}
