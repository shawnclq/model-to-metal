// What other worlds say when one of World 1's commands is typed there (see src/core/manifest.ts).
import { host } from "../../shared/host.ts";
import type { WorldInfo } from "../../core/manifest.ts";

export const GUARDS: WorldInfo["guards"] = {
  foundry: {
    gpu: () => void host.needWorld(1),
    dtype: () => void host.needWorld(1),
    precision: () => void host.needWorld(1),
    quantize: () => void host.needWorld(1),
    quantise: () => void host.needWorld(1),
    batch: () => void host.needWorld(1),
    users: () => void host.needWorld(1),
    context: () => void host.needWorld(1),
    ctx: () => void host.needWorld(1),
    bench: () => void host.needWorld(1),
    roofline: () => void host.needWorld(1),
    roof: () => void host.needWorld(1),
    share: () => host.err("GPU sharing is in the 'Share the GPU' level."),
  },
};
