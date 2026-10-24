import type { ManualSection } from "../../core/types.ts";
// World 2's `help` text and Command list.
export function helpW2() {
  return `KERNEL COMMANDS (World 2, on an H100)
  nvidia-smi                          driver, CUDA version, GPU-Util
  foundry trace matmul                follow y = x @ W down the stack
  foundry inspect code|pytorch|libraries|runtime|driver|gpu
  foundry load llama-1b|llama-8b      model to profile
  foundry mode decode|prefill         one token at a time, or a whole prompt
  foundry graphs on|off               CUDA Graphs
  foundry fuse on|off                 kernel fusion
  foundry flash on|off                FlashAttention
  foundry profile                     where the time goes
  docker images | docker run [--gpus all] IMAGE
  sudo apt install nvidia-driver-N    change the host driver
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
}
export function manualW2(): ManualSection[] {
  const W2: ManualSection[] = [
    [
      "Status",
      [
        ["nvidia-smi", "driver & CUDA version"],
        ["foundry profile", "where time goes"],
      ],
    ],
    [
      "Path",
      [
        ["foundry trace matmul", ""],
        ["foundry inspect libraries", ""],
        ["foundry inspect driver", ""],
      ],
    ],
    [
      "Optimise",
      [
        ["foundry graphs on", "CUDA Graphs"],
        ["foundry fuse on", "kernel fusion"],
        ["foundry flash on", "FlashAttention"],
        ["foundry load llama-8b", ""],
        ["foundry mode prefill", ""],
      ],
    ],
    [
      "Containers",
      [
        ["docker images", ""],
        ["docker run --gpus all llm:cuda12.4", ""],
        ["sudo apt install nvidia-driver-580", ""],
      ],
    ],
  ];
  return W2;
}
