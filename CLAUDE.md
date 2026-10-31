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
- Some things still carry the old name on purpose. The simulated terminal command is `foundry` (for example `foundry gpu h200`), the reference file used to be `gpu-foundry.html`, and the old save key `gf-progress-v4` is still read once to convert old saves (see Saved progress below). Renaming the `foundry` command is optional. If you do it, keep `foundry` as an alias, and update every level's `answer()`, `chips` and brief text.

## How changes are planned: OpenSpec

This repo uses **OpenSpec** for specs and change proposals. CLAUDE.md describes what exists today and the rules for working on it. It does not decide what to build next.

- Product and architecture decisions, including turning this into a web app with sign-in, belong in OpenSpec change proposals under `openspec/`. Don't make those decisions outside a proposal.
- Before implementing anything bigger than a small fix, check `openspec/` for an approved change that covers it. If none exists, suggest proposing one rather than starting work.
- `docs/webapp-ideas.md` holds early notes from prototyping (an outline architecture and the order of work). Treat it as input for writing proposals, not as an agreed plan.
- Until a proposal says otherwise, `reference/model-to-metal.html` is the source of truth for behaviour, content and look. Any change should keep the game playing the same unless the proposal changes it on purpose.

## Building a change (long-running harness)

Approved changes can be built by `scripts/run-loop.sh`, one fresh `claude -p "/opsx:apply <change>"` session at a time, each checked by the `evaluator` agent and CI. The same rules apply when you run `/opsx:apply` by hand. The hooks in `.claude/settings.json` enforce some of them.

- **Start here.** Read the change's `tasks.md` (it is the progress file: ticked tasks and their "Done:" notes are the handoff), then `NEXT_FINDINGS.md` if it exists, then `git log --oneline -10`. Run `npm test` once so you know you start from a working tree. If `NEXT_FINDINGS.md` exists, fix those findings before anything else.
- **One task group per session.** Work only on the first task group (`## N. …`) that still has unticked tasks. Finish it, commit, and stop. Don't start the next group.
- **Proof before ticking.** A task is done only after you run its `Verify:` step, save the output to `evidence/<change>/<task-id>-<what>.txt` (for example `evidence/modular-web-build/9.1-npm-check.txt`), open that file with the Read tool, and see that it shows success. The `verify-gate` hook blocks ticking a task until evidence for its group has been read in this session. Tick tasks with the Edit tool, not Bash. Don't try to work around the hook.
- **The plan is read-only.** `proposal.md`, `design.md`, `specs/` and everything in `openspec/specs/` can't be edited by agents (the `protect-specs` hook). If the plan is wrong or a task needs more than it says, stop and explain why in your final message. A human will run `/opsx:update`. Planning sessions that need to edit them start Claude with `ALLOW_SPEC_EDITS=1`.
- **Commit at checkpoints.** After each task, `git add` the code, the `tasks.md` tick and its evidence file, and commit as `<change> <task-id>: <what>`. In the loop, the `Stop` hook commits anything left over as a backstop.
- **Never archive.** Don't run `/opsx:archive` or `openspec archive`. A human archives after review.
- **Steering.** Messages starting `OPERATOR STEERING:` come from a human through `STEER.md`. They override your current plan. `touch AGENT_STOP` halts every tool call.

## How the current file is organised

The single file is a concatenation of these parts, in this order (see `reference/build.sh`):

| Part | Contents |
|---|---|
| `1-head.html` | `<head>`, fonts, all CSS (design tokens, light/dark themes, components) |
| `2-body.html` | Static markup: header (Compare GPUs, Show the math toggle, XP), home screen (hero, stack map, world piers, glossary), game layout (mission panel, stack strip, sim card, terminal), Compare modal, win modal |
| `3-data.js`, `3b-data.js`, `3c-data.js` | Data: `GPUS` (NVIDIA + AMD), `MODELS`, `DTYPES`, `LAYERS` (the 10-layer stack), `INFO`, `GLOSS` (glossary), `IMAGES`, `DRIVERS`, MIG profiles, `TENANTS`, `SERVERS`, `NETS`, `KVDT` |
| `4-engine.js`, `4b-engine.js`, `4c-w0.js`, `4d-w0b.js` | Pure calculation: `w1()` single-GPU memory/speed/cost/power; `w2decode`/`w2prefill`; MIG; `w3` multi-GPU; `ncclTable`; `w4serve`/`w4train`; World 0 tokenizer, `paramParts`, attention, generation; `routeToken`/`moeBatch` (MoE); `headsCalc` (attention heads) |
| `5-levels.js` … `5e-levels.js` | Level definitions, labs, quizzes, `WORLDS`, `SOON`. Later files splice levels into `LEVELS`, finding anchors with `findLevel(id)` |
| `5f-catalog.js` | Runs once after all splices: `finaliseLevels()` checks IDs and sets `idx`/`n`, builds `LEVEL_BY_ID`; `refs()` renders `{{lvl:id}}` references |
| `6-render.js` … `6e-w0b.js` | Rendering: SVG chip, roofline, boards, cluster, World 0 panels, Compare panel, controls (`seg()` button groups) |
| `7a-more.js`, `7b-w0.js`, `7c-w0b.js` | Terminal commands per world (`smi`, `ibstat`, `ray`, `vllm`, `route`, `heads` …), help and manual text |
| `7-app.js` | App shell: global `G` state, `freshState`, terminal (`run`, `print`, history), `loadLevel`, goal checking, stars/XP, win modal, quiz, home screen, saved progress (`m2m-progress-v1`), XP from stars, one-time v4 conversion (`V4_IDS`) |

Everything is global functions and `const`s in classic `<script>` blocks that share one scope. When modularising, expect implicit cross-file dependencies (for example, `6-render.js` calls `ctrlsW0b` from `7c-w0b.js`).

### Level shape

```js
{ id:"topic-slug", world, title, concept, layers:{on:[…], near:[…]}, panels:[…], controls:[…],
  brief: `<p>HTML</p>`, setup(S){…}, goals:[{t:"text", ok:S=>bool}],
  hints:[…], answer:()=>"cmd && cmd", chips:["cmd", …],
  debrief: `HTML`, links:{up:"…", down:"…"},
  // optional: locks, gpus, srvs, quiz:true + questions:[{q,o,a,why}] }
```

- `panels` decides which sim view renders; `controls` decides which button groups appear.
- `answer()` is the command sequence that solves the level. The test suite uses it.
- `id` is a **permanent topic slug** (kebab-case, for example `moe-experts`). Never change or reuse one: saved stars are keyed by it. No world or position in it, so a level can move without losing progress.
- `idx` (position in `LEVELS`) and `n` (number within its world) are worked out by `finaliseLevels()` at load. Use them only for display and "next level", never for saving.
- Labs (`gpu-lab`, `kernel-lab`, `server-lab`, `cluster-lab`) are free-play sandboxes. `LABS` is keyed by world number; each lab's `id` is its slug. Labs never earn stars.
- To point at another level in any text, write `{{lvl:<id>}}`. It renders as "World X, Level N" with current numbers. Never hand-write a level number. The test fails on an unknown ID.

### Saved progress

- Key `m2m-progress-v1`, value `{"v":1,"stars":{"<level-id>":1-3}}`. Stars only go up. Unknown IDs are kept but not counted.
- XP is never stored. It is worked out from stars: 50 per star, 75 per star on checkpoint quizzes.
- If there is no usable new save, an old `gf-progress-v4` save is converted once using the frozen `V4_IDS` table, and left untouched. Never edit `V4_IDS`.
- Adding or moving a level no longer needs a new save key.

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

- `reference/tests/test2.js` is a jsdom playthrough. It loads the HTML, plays every level using its `answer()`, checks that goals flip from false to true and the level is won, exercises the labs, and runs negative paths (wrong commands, out-of-memory, missing nodes). It also runs pass/fail checks on level IDs, `{{lvl:id}}` references and saved progress (v4 conversion, XP, reset, inserting a level), prints `CHECKS: N passed, M failed`, and exits 1 on any failure. Run it with `node test2.js path/to/model-to-metal.html`. jsdom has no canvas, so `getContext` errors in the output are expected and harmless.
- Visual checks use Playwright screenshots (`reference/tests/screenshot.mjs`). Check light and dark mode, 1280 px and 390 px widths, and that `document.documentElement.scrollWidth <= innerWidth`.
- Whatever the code becomes, keep equivalent coverage (a full playthrough plus visual checks) and run it before every commit.

## Known problems and lessons

- **Level IDs used to be positional** (fixed by the `stable-level-ids` change). Inserting a level renumbered everything, so the progress key was bumped each time and wiped progress. Levels now have permanent slugs.
- **CSS class collisions.** All CSS is global. The MoE expert grid once reused `.xp`, which broke the header XP pill. Scope component styles when modularising.
- Cross-references in text ("see Level 7") broke when levels moved. Use `{{lvl:id}}` instead (see Level shape).
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
