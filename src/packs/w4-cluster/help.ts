import type { ManualSection } from "../../core/types.ts";
import { state } from "./state.ts";
// World 4's `help` text and Command list.
export function help() {
  return `CLUSTER COMMANDS (World 4, you're on ${state().host})
  ibstat                                 NIC status (InfiniBand / RoCE)
  ib_write_bw node-2                     RDMA bandwidth test to another server
  iperf3 -c node-2                       plain TCP test
  ssh node-2 | exit | hostname           move between servers
  ray start --head --port=6379           start a Ray cluster here
  ray start --address=node-1:6379        join this server to the cluster
  ray status | ray stop
  vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray
  foundry layout 8x2                     shortcut: relaunch with TP 8 × PP 2
  foundry status | foundry mode serve|train | foundry nodes 1|2|4
  foundry net ib|roce|eth | foundry gdr on|off
  foundry inspect nic|leaf|spine|node|ray
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
}
export function manual(): ManualSection[] {
  return [
    [
      "Network",
      [
        ["ibstat", ""],
        ["ib_write_bw node-2", ""],
        ["iperf3 -c node-2", "TCP"],
      ],
    ],
    [
      "Ray",
      [
        ["ray start --head --port=6379", "on node-1"],
        ["ssh node-2", ""],
        ["ray start --address=node-1:6379", "on a worker"],
        ["exit", ""],
        ["ray status", ""],
      ],
    ],
    [
      "Serve",
      [
        [
          "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",
          "",
        ],
        ["foundry layout 8x2", ""],
        ["foundry status", ""],
      ],
    ],
    [
      "Train",
      [
        ["foundry net ib", ""],
        ["foundry gdr on", ""],
        ["foundry nodes 4", ""],
      ],
    ],
  ];
}
