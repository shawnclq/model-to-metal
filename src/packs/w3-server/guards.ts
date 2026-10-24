// What other worlds say when one of World 3's commands is typed there (see src/core/manifest.ts).
// World 4 runs all_reduce_perf itself, with its own answer.
import { host } from "../../shared/host.ts";
import type { WorldInfo } from "../../core/manifest.ts";

const nccl = () => host.err("all_reduce_perf needs several GPUs: World 3.");
export const GUARDS: WorldInfo["guards"] = {
  commands: { all_reduce_perf: nccl, "./all_reduce_perf": nccl, "./build/all_reduce_perf": nccl },
};
