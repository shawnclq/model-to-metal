import type { ManualSection } from "../../core/types.ts";
// World 0's `help` text and Command list.
export function helpW0() {
  return `MODEL COMMANDS (World 0)
  tokenize YOUR TEXT                 split text into tokens
  config llama-8b                    the model's key config.json fields
  params llama-70b                   where the parameters come from
  route Paris | batch 32             mixture of experts: router and experts
  foundry inspect embed|attn|mlp|head|layer
  attend it | head 2                 attention: which earlier words a word looks at
  heads mha|gqa|mqa | qhead 5        attention heads and shared key/value heads
  generate step | all | reset        run the model one token at a time
  generate inspect N                 top next-token choices for run N
  kv on | kv off                     switch the KV cache
  kv per-token llama-70b             KV cache size per token
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
}
export function manualW0(): ManualSection[] {
  return [
    [
      "Tokens",
      [
        ["tokenize Hello world", ""],
        ["tokenize Tokenization of 1234567", ""],
      ],
    ],
    [
      "Weights",
      [
        ["config llama-8b", ""],
        ["params llama-70b", ""],
        ["foundry inspect mlp", ""],
      ],
    ],
    [
      "Experts",
      [
        ["route Paris", ""],
        ["batch 32", ""],
      ],
    ],
    [
      "Attention",
      [
        ["attend it", ""],
        ["head 2", ""],
        ["qhead 5", ""],
        ["heads mha", ""],
      ],
    ],
    [
      "Generate",
      [
        ["generate step", ""],
        ["generate all", ""],
        ["generate inspect 1", ""],
        ["kv off", ""],
        ["kv per-token llama-70b", ""],
      ],
    ],
  ];
}
