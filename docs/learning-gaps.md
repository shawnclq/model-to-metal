# Model to Metal: learning gaps backlog

A running record of questions raised while playing Model to Metal, formerly GPU Foundry (https://claude.ai/artifact/CyUqY33T5R6AmchrQtbYRL). Each question points to something the game doesn't yet explain well enough. Status: **Open** (not covered), **Partial** (touched but not well enough), **Addressed** (built into the game).

Last updated: 19 Oct 2026. World 0 now has 8 levels: 1 tokens, 2 parameters, 3 mixture of experts, 4 attention, 5 attention heads, 6 generation, 7 KV cache, 8 checkpoint.

## Open and partial gaps

| # | Learner question | The gap in the game | Proposed fix | Status |
|---|---|---|---|---|
| 1 | How are the World 1 tiles (per user, throughput, first token, cost, power, model reads) derived? | Formulas only appear behind the "Show the math" toggle; tiles have no explanation of their own. The power formula is a rough estimate that isn't explained anywhere. | Add a "how is this calculated?" popover to every tile. Introduce the metrics on World 1 Level 1. State plainly that power is a rough model. | Open |
| 2 | Where do "4,096 context" and "2,048 prompt" come from, and what do they mean? | They read as model properties but are workload settings chosen for the level. Context and prompt aren't defined; the model's real maximum (128k) isn't shown. | Label them as workload settings on World 1 Level 1, show the model's max context, and add glossary entries for context length and prompt. | Open |
| 3 | How do you calculate KV cache per token? | World 0 Level 7 calculator and Level 5 (heads) show the formula. Still check it explains where each config.json field comes from. | Point at each config.json field as it's used. | Partial |
| 4 | Explain "prefill is compute-bound, decode is memory-bound" more simply (asked three times). | World 1 Level 6 brief is too dense. No visual shows "one trip, lots of work" vs "one trip, little work". | An animated side-by-side of prefill vs decode (data moved vs math done per run), added to World 0 Level 6 and World 1 Level 6. | Open |
| 5 | Is "on-chip memory" the SM? | The memory hierarchy (registers, shared memory/L1 inside each SM, L2 shared, HBM beside the die) isn't shown. Only HBM is drawn. | Add L2 and per-SM memory to the World 1 chip view, plus a short level or explainer on the memory hierarchy. Connect it to FlashAttention (World 2). | Open |
| 6 | Is prefill time the time to process the whole prompt? | Time to first token isn't broken into its parts (queueing + prefill + first decode). Chunked prefill and prefix caching aren't covered. | Show a TTFT breakdown. Cover chunked prefill and prefix caching in a serving chapter. | Open |
| 7 | Does decode still calculate based on previous tokens? | Decode's per-step work (all weights + attention over the KV cache) isn't broken down. That decode slows as conversations get longer isn't shown. | Per-run breakdown in World 0 Levels 6/7 (weights read, KV read, math). In World 1, show tokens/s falling as context grows. | Open |
| 8 | Will prefill/decode be covered later? Am I jumping ahead? | No roadmap showing which concepts belong to which chapter, and no prerequisites per level. The serving chapter doesn't exist yet. | A learning-path view: concepts mapped to worlds, with "you'll go deeper in…" links. Build the serving chapter. | Open |
| 11 | What does "memory-bound" mean? | "Bound", "bottleneck", "compute-bound" and "memory-bound" are used as jargon without definitions. | Glossary entries, plus a plain definition on first use (World 1 Level 4). The "factory with a slow delivery truck" framing worked. | Open |
| 12 | Does "faster memory" mean the speed of moving data from memory to the calculators? | Capacity (GB), bandwidth (TB/s) and latency aren't contrasted anywhere. What raises bandwidth (HBM generation, number of stacks, wide connections) isn't explained. | A "three memory numbers" explainer in World 1 and in the Compare GPUs panel. | Open |
| 13 | Does disaggregated serving mean prefill and decode run on separate GPUs? | Mentioned only in a debrief; no simulation. KV cache transfer between pools isn't shown. | Centrepiece of a serving chapter: separate prefill and decode pools, KV transfer over NVLink/InfiniBand, sizing each pool. | Open |

## Addressed

| # | Learner question | What was built | Status |
|---|---|---|---|
| 9 | Do I need a model architecture chapter first? Weights and KV are hard to follow. | World 0 "Inside the model". | Addressed |
| 10 | What is a KV head? What is a head for? | World 0 Level 5 "Many heads, shared notes": the 4,096-number vector split into 32 heads of 128; tap a query head to see which KV head it shares; switch between multi-head (32 KV heads), grouped-query (8) and multi-query (1) and see KV per token and users per H100 change. Two checkpoint questions added. | Addressed (19 Oct) |
| 14 | I can't fully understand mixture of experts; I want to visualise it. Should it be in World 0? | World 0 Level 3 "A team of experts", right after parameters: a 128-expert grid for one Qwen3 235B-A22B layer; tap a token to see the router's top 8 with weights; raise tokens-at-once to 32 to see ~87% of experts woken; total vs active parameter bar. World 1 "Many experts" now points back to it. Follow-ons not yet built: shared experts (debrief only), expert parallelism across GPUs. | Addressed (19 Oct) |

## Already addressed by earlier requests

- Differences between H100, H200, B200 and B300 → Compare GPUs panel and the "Pick the GPU" level.
- AMD GPUs (MI300X, MI325X, MI355X) → playable GPUs, "Team red" level, AMD board in the Server lab.
- KV-cache quantisation, mixture of experts (GPU side), power per token, MIG sharing → World 1 levels.
- InfiniBand, multi-node, Ray clusters → World 4.
- NVLink, NCCL, tensor parallelism → World 3.

## Themes across the gaps

- **Jargon before definition:** terms like "bound", "context", "bandwidth" appear before they're explained. Every level needs plain definitions on first use.
- **Numbers without derivation:** the game shows results; learners want to see where each number comes from without hunting for a toggle.
- **Prefill/decode is the central concept** and needs a dedicated visual explanation, not just text.
- **Model concepts should come before their GPU consequences:** done for MoE and heads; apply the same rule to new concepts.
- **The serving layer is the biggest missing chapter:** gaps 6, 8 and 13 all point to it.
