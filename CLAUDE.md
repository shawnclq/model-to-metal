# Model to Metal: project instructions

## What this is

Model to Metal (formerly "GPU Foundry") is an interactive, game-style learning tool that teaches the GenAI infrastructure stack, from inside the model down to GPU clusters. It's modelled loosely on k8sgames: short levels with objectives, a live visual simulation, and a fake terminal where the learner types commands.

The owner is a **product manager** learning this material, not an infrastructure engineer. Everything is built around that:

- **PM-conceptual first.** Plain language, short sentences, one idea at a time. Every term gets a plain definition the first time it appears.
- **"Show the math" is optional.** Formulas live in `.mathbox` blocks that only appear when the header toggle is on. Never put a formula in the main flow.
- **Numbers must be derivable.** Every number on screen comes from a formula in the engine using real model configs and GPU specs. If it's illustrative (router picks, which head learns what, prices), the UI says so.
- **Model concepts come before their GPU consequences.** For example, mixture of experts is taught in World 0 (how the model works) before World 1 (what it costs on a GPU).

`reference/model-to-metal.html` is the current, working, single-file version (about 2,700 lines, 330 KB). It's the source of truth for behaviour, content and look. It was published as a claude.ai artifact during prototyping.

### Naming

- The product is **Model to Metal**: it covers the GenAI stack from inside the model down to the hardware, not just GPUs. Use that name in all user-facing text.
- Some things still carry the old name on purpose. The simulated terminal command is `foundry` (for example `foundry gpu h200`), the localStorage key is `gf-progress-v4`, and the reference file used to be `gpu-foundry.html`. Don't change the progress key casually: changing it wipes every player's saved progress. Renaming the `foundry` command is optional. If you do it, keep `foundry` as an alias, and update every level's `answer()`, `chips` and brief text.

## How changes are planned: OpenSpec

This repo uses **OpenSpec** for specs and change proposals. CLAUDE.md describes what exists today and the rules for working on it. It does not decide what to build next.

- Product and architecture decisions, including turning this into a web app with sign-in, belong in OpenSpec change proposals under `openspec/`. Don't make those decisions outside a proposal.
- Before implementing anything bigger than a small fix, check `openspec/` for an approved change that covers it. If none exists, suggest proposing one rather than starting work.
- `docs/webapp-ideas.md` holds early notes from prototyping (an outline architecture and the order of work). Treat it as input for writing proposals, not as an agreed plan.
- Until a proposal says otherwise, `reference/model-to-metal.html` is the source of truth for behaviour, content and look. Any change should keep the game playing the same unless the proposal changes it on purpose.

## How the current file is organised

The single file is a concatenation of these parts, in this order (see `reference/build.sh`):

| Part | Contents |
|---|---|
| `1-head.html` | `<head>`, fonts, all CSS (design tokens, light/dark themes, components) |
| `2-body.html` | Static markup: header (Compare GPUs, Show the math toggle, XP), home screen (hero, stack map, world piers, glossary), game layout (mission panel, stack strip, sim card, terminal), Compare modal, win modal |
| `3-data.js`, `3b-data.js`, `3c-data.js` | Data: `GPUS` (NVIDIA + AMD), `MODELS`, `DTYPES`, `LAYERS` (the 10-layer stack), `INFO`, `GLOSS` (glossary), `IMAGES`, `DRIVERS`, MIG profiles, `TENANTS`, `SERVERS`, `NETS`, `KVDT` |
| `4-engine.js`, `4b-engine.js`, `4c-w0.js`, `4d-w0b.js` | Pure calculation: `w1()` single-GPU memory/speed/cost/power; `w2decode`/`w2prefill`; MIG; `w3` multi-GPU; `ncclTable`; `w4serve`/`w4train`; World 0 tokenizer, `paramParts`, attention, generation; `routeToken`/`moeBatch` (MoE); `headsCalc` (attention heads) |
| `5-levels.js` … `5e-levels.js` | Level definitions, labs, quizzes, `WORLDS`, `SOON`. Later files splice levels into `LEVELS` and renumber |
| `6-render.js` … `6e-w0b.js` | Rendering: SVG chip, roofline, boards, cluster, World 0 panels, Compare panel, controls (`seg()` button groups) |
| `7a-more.js`, `7b-w0.js`, `7c-w0b.js` | Terminal commands per world (`smi`, `ibstat`, `ray`, `vllm`, `route`, `heads` …), help and manual text |
| `7-app.js` | App shell: global `G` state, `freshState`, terminal (`run`, `print`, history), `loadLevel`, goal checking, stars/XP, win modal, quiz, home screen, progress in localStorage (`gf-progress-v4`) |

Everything is global functions and `const`s in classic `<script>` blocks that share one scope. When modularising, expect implicit cross-file dependencies (for example, `6-render.js` calls `ctrlsW0b` from `7c-w0b.js`).

### Level shape

```js
{ world, title, concept, layers:{on:[…], near:[…]}, panels:[…], controls:[…],
  brief: `<p>HTML</p>`, setup(S){…}, goals:[{t:"text", ok:S=>bool}],
  hints:[…], answer:()=>"cmd && cmd", chips:["cmd", …],
  debrief: `HTML`, links:{up:"…", down:"…"},
  // optional: locks, gpus, srvs, quiz:true + questions:[{q,o,a,why}] }
```

- `panels` decides which sim view renders; `controls` decides which button groups appear.
- `answer()` is the command sequence that solves the level. The test suite uses it.
- `id` (global sequence) and `n` (number within its world) are **assigned by position at load time**.
- Labs (`lab1`–`lab4`) are free-play sandboxes with string IDs.

### Current content (36 levels plus 4 labs)

- **World 0 · Inside the model:** Words into tokens · What's in 8 billion parameters · A team of experts (MoE) · Who is "it"? (attention) · Many heads, shared notes (MHA/GQA/MQA) · One word at a time · Notes to self (KV cache) · Checkpoint quiz
- **World 1 · Inside one GPU:** Meet the chip · Will it fit? · Room to talk · Fast chip, slow tokens · Fill the factory · Two speeds · Long memories · Many experts · Watts per token · Share the GPU (MIG) · Team red (AMD) · Pick the GPU · Checkpoint
- **World 2 · The software path:** Follow one matmul · Waiting on the CPU · The 32k prompt · Driver says no · Checkpoint
- **World 3 · Many GPUs, one server:** Meet the HGX board · Too big for one · The slow road · Shards or replicas? · Checkpoint
- **World 4 · Many servers:** Meet the fabric · Two boxes, one model · Split the right way · Train across racks · Checkpoint
- Coming soon (in `SOON`): World 5 Kubernetes/orchestration, a serving chapter, and a finale.

## Modelling assumptions (keep these consistent)

- Efficiencies: `MEM_EFF .8`, `DEC_EFF .6`, `PRE_EFF .65`, `ATT_EFF .5`, `RESERVE 3` GB per GPU.
- KV cache per token = 2 × layers × KV heads × head_dim × bytes.
- Power ≈ TDP × (0.14 + 0.42 × bandwidth utilisation + 0.5 × compute utilisation). This is a rough model and the UI should say so.
- MoE: share of experts used by a batch of B tokens ≈ 1 − (1 − k/E)^B.
- GPU specs (memory GB / bandwidth TB/s / BF16 TFLOPS / price per hour, which is illustrative):

| GPU | Memory | Bandwidth | BF16 TFLOPS | Power | Price/hr |
|---|---|---|---|---|---|
| H100 | 80 | 3.35 | 989 | 700 W | $2.5 |
| H200 | 141 | 4.8 | 989 | 700 W | $3.5 |
| B200 | 180 | 8 | 2,250 | 1,000 W | $5.5 |
| B300 | 288 | 8 | 2,250 | 1,400 W | $7 |
| MI300X | 192 | 5.3 | 1,307 | 750 W | $2.2 |
| MI325X | 256 | 6 | 1,307 | 1,000 W | $2.8 |
| MI355X | 288 | 8 | 2,516 | 1,400 W | $5 |

  FP8 is 2× BF16. FP4 is 9,000 on B200, 15,000 on B300 and 10,066 on MI355X.
- Models: Llama 3.2 1B; Llama 3.1 8B, 70B and 405B; Qwen3 235B-A22B (94 layers, hidden 4096, 64 Q / 4 KV heads, 128 experts, top-8, ~22.2 B active).

If you update a spec, update it in `3-data.js`/`3c-data.js` **and** check level goals and quiz answers that depend on it. The playthrough test will catch most breakage.

## Look and feel

The visual style matches the owner's "Kube Harbor" artifact:

- Fonts: Saira Stencil One (logo), Atkinson Hyperlegible (body), JetBrains Mono (labels, terminal, numbers).
- Colours: CSS tokens on `:root` (`--ink`, `--muted`, `--panel`, `--panel-2`, `--rule`, `--sea`, `--signal`, `--ok` …), with dark mode via `prefers-color-scheme` and a `data-theme` override.
- The background is a faint grid paper, with cards that have soft borders.
- Keep it working at phone width with no horizontal scroll.

## Writing style for in-game text

- Short, plain sentences. Second person ("Tap a token…"). No jargon without a definition.
- A brief is 2–3 short paragraphs ending with what to do. A debrief is a one-line takeaway plus 3–4 bullets, and the `links.up`/`links.down` lines tie the level to the layers above and below.
- Mark anything illustrative as illustrative. Never present invented numbers as real benchmarks.
- Refer to levels as "World X, Level N" (per-world numbering).

## Testing

- `reference/tests/test2.js` is a jsdom playthrough. It loads the HTML, plays every level using its `answer()`, checks that goals flip from false to true and the level is won, exercises the labs, and runs negative paths (wrong commands, out-of-memory, missing nodes). Run it with `node test2.js path/to/model-to-metal.html`. jsdom has no canvas, so `getContext` errors in the output are expected and harmless.
- Visual checks use Playwright screenshots (`reference/tests/screenshot.mjs`). Check light and dark mode, 1280 px and 390 px widths, and that `document.documentElement.scrollWidth <= innerWidth`.
- Whatever the code becomes, keep equivalent coverage (a full playthrough plus visual checks) and run it before every commit.

## Known problems and lessons

- **Level IDs are positional.** Inserting a level renumbers everything, so the progress key was bumped to `gf-progress-v4` each time, which wiped progress. A likely fix is a permanent slug per level (for example `w0-moe`), but this should go through an OpenSpec proposal.
- **CSS class collisions.** All CSS is global. The MoE expert grid once reused `.xp`, which broke the header XP pill. Scope component styles when modularising.
- Cross-references in text ("see Level 7") break when levels move. Prefer references by slug that are rendered into "World X, Level N" at runtime.
- The tokenizer is approximate, and router picks and head roles are seeded pseudo-random. They're illustrative by design.

## Learning-gaps backlog

`docs/learning-gaps.md` records the questions the owner asked while playing. Each one is a gap the game should eventually close. Keep it updated: when the owner asks a conceptual question, add it as a gap with a proposed fix. Major open themes:

- A visual explanation of prefill vs decode.
- Explaining how every tile's number is derived.
- The memory hierarchy (registers, SM shared memory, L2, HBM).
- Capacity vs bandwidth vs latency.
- Plain definitions of "bound" terms.
- A serving chapter (TTFT breakdown, chunked prefill, prefix caching, disaggregated prefill/decode).
- A learning-path map.
