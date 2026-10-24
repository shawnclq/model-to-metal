// What other worlds say when one of World 4's commands is typed there (see src/core/manifest.ts).
import { host } from "../../shared/host.ts";
import type { WorldInfo } from "../../core/manifest.ts";

const logout = () => host.print("(you're on the main machine)", "dim");
export const GUARDS: WorldInfo["guards"] = {
  commands: {
    ibstat: () => host.err("ibstat: no InfiniBand devices on this bench (World 4)."),
    ib_write_bw: () => host.err("ib_write_bw: the network is World 4."),
    iperf3: () => host.err("iperf3: the network is World 4."),
    ssh: () => host.err("ssh: there's only one machine here. Multi-node is World 4."),
    ray: () => host.err("ray: Ray clusters are in World 4."),
    vllm: () =>
      host.err("vllm is the next layer up (serving). Here, foundry load MODEL --dtype fp8 does the same job."),
    exit: logout,
    logout,
    hostname: () => host.print("gpu-node-01"),
  },
};
