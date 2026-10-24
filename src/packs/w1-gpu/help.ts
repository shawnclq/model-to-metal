import type { ManualSection } from "../../core/types.ts";
import { host } from "../../shared/host.ts";
// World 1's `help` text and Command list.
export function helpW1() {
  return host.refs(`GPU COMMANDS (World 1)
  nvidia-smi                          GPU status, the way operators see it
  foundry status | bench              memory, speed, cost for the current setup
  foundry gpu h100|h200|b200|b300     swap the GPU
  foundry load llama-8b|llama-70b|llama-405b [--dtype fp8]
  foundry dtype bf16|fp8|int4|fp4     precision (fp4 needs Blackwell)
  foundry batch N                     users served in the same step
  foundry context N                   tokens kept per conversation (8k ok)
  foundry prompt N                    prompt length for time to first token
  foundry roofline [off]              show the roofline chart (from {{lvl:memory-bandwidth}})
  foundry inspect sm|hbm|bandwidth|link
OTHER   clear   hint   help   ↑/↓ history   chain with &&`);
}
export function manualW1(): ManualSection[] {
  const W1: ManualSection[] = [
    [
      "Status",
      [
        ["nvidia-smi", "GPU status"],
        ["foundry status", "memory, speed, cost"],
        ["foundry bench", "full benchmark"],
      ],
    ],
    [
      "Hardware",
      [
        ["foundry gpu h100", ""],
        ["foundry gpu h200", ""],
        ["foundry gpu b200", ""],
        ["foundry gpu b300", ""],
      ],
    ],
    [
      "Model & precision",
      [
        ["foundry load llama-70b", ""],
        ["foundry dtype fp8", ""],
        ["foundry dtype int4", "weight-only"],
        ["foundry dtype fp4", "Blackwell only"],
      ],
    ],
    [
      "Workload",
      [
        ["foundry batch 32", "users per step"],
        ["foundry context 8192", "tokens per conversation"],
        ["foundry prompt 16384", "for first-token time"],
      ],
    ],
    [
      "Look closer",
      [
        ["foundry roofline", ""],
        ["foundry inspect sm", ""],
        ["foundry inspect hbm", ""],
      ],
    ],
  ];
  return W1;
}
