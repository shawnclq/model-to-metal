import type { W3State } from "../../core/types.ts";
import { host } from "../../shared/host.ts";
// World 3's sim state.
export function freshState(): W3State {
  return {
    world: 3,
    gpu: "h100",
    srv: "hgx",
    model: "llama-70b",
    dtype: "fp8",
    kvdt: "bf16",
    tp: 1,
    batch: 16,
    ctx: 4096,
    prompt: 8192,
    flags: {},
    inspected: [],
    info: null,
  };
}

/** The open level's state. Pack code runs only while one of World 3's levels is open, so it is World 3's. */
export function state(): W3State {
  return host.G.S as W3State;
}
