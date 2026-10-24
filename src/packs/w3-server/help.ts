import type { ManualSection } from "../../core/types.ts";
// World 3's `help` text and Command list.
export function help() {
  return `SERVER COMMANDS (World 3, one 8-GPU server)
  nvidia-smi | nvidia-smi topo -m        GPUs and how they're connected
  all_reduce_perf -b 8 -e 8G -f 16 -g 8  NCCL benchmark (nccl-tests)
  foundry status                         memory, speed, cost for the layout
  foundry server hgx|pcie                NVLink board or PCIe server
  foundry tp 1|2|4|8                     tensor parallel size (8 ÷ TP = replicas)
  foundry load llama-70b|llama-405b|qwen-235b    foundry dtype bf16|fp8|int4
  foundry batch N  (users per replica)   foundry context N   foundry prompt N   foundry kv fp8
  foundry inspect nvswitch|nvlink|pcie
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
}
export function manual(): ManualSection[] {
  return [
    [
      "Look",
      [
        ["nvidia-smi topo -m", "how GPUs connect"],
        ["all_reduce_perf -b 8 -e 8G -f 16 -g 8", "NCCL benchmark"],
        ["foundry status", ""],
      ],
    ],
    [
      "Layout",
      [
        ["foundry tp 1", "8 replicas"],
        ["foundry tp 2", ""],
        ["foundry tp 4", ""],
        ["foundry tp 8", "one big model"],
        ["foundry batch 64", "users per replica"],
      ],
    ],
    [
      "Hardware",
      [
        ["foundry server hgx", "NVLink"],
        ["foundry server pcie", "no NVLink"],
      ],
    ],
    [
      "Model",
      [
        ["foundry load llama-405b", ""],
        ["foundry load qwen-235b", "MoE"],
        ["foundry kv fp8", ""],
      ],
    ],
  ];
}
