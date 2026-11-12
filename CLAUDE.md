# Model to Metal: project instructions

## What this is

Model to Metal (formerly "GPU Foundry") is an interactive, game-style learning tool that teaches the GenAI infrastructure stack, from inside the model down to GPU clusters. It's modelled loosely on k8sgames: short levels with objectives, a live visual simulation, and a fake terminal where the learner types commands.

The owner is a **product manager** learning this material, not an infrastructure engineer. Everything is built around that:

- **PM-conceptual first.** Plain language, short sentences, one idea at a time. Every term gets a plain definition the first time it appears.
- **"Show the math" is optional.** Formulas live in `.mathbox` blocks that only appear when the header toggle is on. Never put a formula in the main flow.
- **Numbers must be derivable.** Every number on screen comes from a formula in the engine using real model configs and GPU specs. If it's illustrative (router picks, which head learns what, prices), the UI says so.
- **Model concepts come before their GPU consequences.** For example, mixture of experts is taught in World 0 (how the model works) before World 1 (what it costs on a GPU).

The game is a Vite + TypeScript web app. **`src/` is the source of truth** for behaviour, content and look. `reference/` holds the original single-file version (`reference/model-to-metal.html`, its `source-parts/` and its old tests). It is **frozen**: kept for history and as the recording source for the parity test, never edited. Don't change anything under `reference/`, and don't tell anyone to.

### Naming

- The product is **Model to Metal**: it covers the GenAI stack from inside the model down to the hardware, not just GPUs. Use that name in all user-facing text.
- Some things still carry the old name on purpose. The simulated terminal command is `foundry` (for example `foundry gpu h200`), and the old save key `gf-progress-v4` is still read once to convert old saves (see Saved progress below). Renaming the `foundry` command is optional. If you do it, keep `foundry` as an alias, update every level's `answer()`, `chips` and brief text, and re-record the parity file from a build you have reviewed (see Testing).

## How changes are planned: OpenSpec

This repo uses **OpenSpec** for specs and change proposals. CLAUDE.md describes what exists today and the rules for working on it. It does not decide what to build next.

- Product and architecture decisions, including sign-in, sync and paid worlds, belong in OpenSpec change proposals under `openspec/`. Don't make those decisions outside a proposal.
- Before implementing anything bigger than a small fix, check `openspec/` for an approved change that covers it. If none exists, suggest proposing one rather than starting work.
- `docs/webapp-ideas.md` holds early notes from prototyping (an outline architecture and the order of work). Treat it as input for writing proposals, not as an agreed plan.
- Any change should keep the game playing the same unless the proposal changes it on purpose. The parity test (see Testing) is how "the same" is checked.

## Building a change (long-running harness)

Approved changes can be built by `scripts/run-loop.sh`, one fresh `claude -p "/opsx:apply <change>"` session at a time, each checked by the `evaluator` agent and CI. The same rules apply when you run `/opsx:apply` by hand. The hooks in `.claude/settings.json` enforce some of them.

- **Start here.** Read the change's `tasks.md` (it is the progress file: ticked tasks and their "Done:" notes are the handoff), then `NEXT_FINDINGS.md` if it exists, then `git log --oneline -10`. Run `npm test` once so you know you start from a working tree. If `NEXT_FINDINGS.md` exists, fix those findings before anything else.
- **One task group per session.** Work only on the first task group (`## N. …`) that still has unticked tasks. Finish it, commit, and stop. Don't start the next group.
- **Proof before ticking.** A task is done only after you run its `Verify:` step, save the output to `evidence/<change>/<task-id>-<what>.txt` (for example `evidence/modular-web-build/9.1-npm-check.txt`), open that file with the Read tool, and see that it shows success. The `verify-gate` hook blocks ticking a task until evidence for its group has been read in this session. Tick tasks with the Edit tool, not Bash. Don't try to work around the hook.
- **The plan is read-only.** `proposal.md`, `design.md`, `specs/` and everything in `openspec/specs/` can't be edited by agents (the `protect-specs` hook). If the plan is wrong or a task needs more than it says, stop and explain why in your final message. A human will run `/opsx:update`. Planning sessions that need to edit them start Claude with `ALLOW_SPEC_EDITS=1`.
- **Commit at checkpoints.** After each task, `git add` the code, the `tasks.md` tick and its evidence file, and commit as `<change> <task-id>: <what>`. In the loop, the `Stop` hook commits anything left over as a backstop.
- **Human-only tasks.** Tasks listed in `scripts/human-tasks.txt` (for example ones needing a phone play-through) are left for a human. The loop stops when only those remain, and the gate won't let the builder tick them.
- **Never archive.** Don't run `/opsx:archive` or `openspec archive`. A human archives after review.
- **Steering.** Messages starting `OPERATOR STEERING:` come from a human through `STEER.md`. They override your current plan. `touch AGENT_STOP` halts every tool call.

## How the code is organised

`index.html` is the static page (header, home screen, game layout, modals). It loads `src/main.ts`, which pulls in the core stylesheet and `src/core/boot.ts`. Everything is plain TypeScript modules with string-template rendering and `innerHTML`; there is no UI framework. TypeScript is fully strict and `any` is not used.

| Folder | Loaded | Contents |
|---|---|---|
| `src/core/` | always | The app shell: `boot.ts` (start-up), `terminal.ts` (`run`, `print`, history, the command dispatch chain), `levels.ts` (`loadLevel`, goals, stars, win modal, quiz), `progress.ts` (saves, XP, v4 conversion), `home.ts` (home screen, glossary, theme, math toggle), `compare.ts` (Compare GPUs), `sim.ts` (sim card and stack strip), `help.ts`, `inspect.ts`, `foundry.ts` (shared `foundry` dispatch), `catalog.ts` (level numbering, `{{lvl:id}}` references), `packs.ts` (`loadPack`, the pack registry), `manifest.ts` (the list of worlds), `types.ts` (the pack contract and per-world state types), `core.css` |
| `src/shared/` | always | Code used by two or more worlds or by the core. `data/` (`GPUS`, `MODELS`, `DTYPES`, `KVDT`, `LAYERS`, `INFO` with every inspect key, `GLOSS`, number formats), `engine/` (`w1`, `w2decode`/`w2prefill`, `w3`, `w4serve`, `computeRate`, `kvTok`, `activeP` …), `bench/` (the GPU bench controls, the `nvidia-smi` family, shared `foundry` subcommands), `ui/` (`seg()` button groups, info box, flicker), `host.ts` (see below) |
| `src/packs/w0-model/` … `w4-cluster/` | on demand | One folder per world: `index.ts` (the `PACK` object), `levels.ts` (levels in final order plus the lab), `state.ts`, `engine.ts` (math only this world uses), `render.ts`, `controls.ts`, `commands.ts`, `help.ts`, `guards.ts` (what other worlds say to this world's commands), `pack.css` (scoped styles; Worlds 3 and 4 have none) |
| `tests/` | — | `unit/` (Vitest), `parity/` (the recorded play-through and `reference.json`), `visual/` (screenshots and computed styles), `loading/` (on-demand loading), `pack/` (a test-only World 5 that proves a world can be added without touching the core), `targets.ts` (opens the reference or the build) |

**Three layers, one direction.** `shared/` never imports `core/` or a pack. Packs never import the core (other than types) or each other. The core imports packs only through the manifest's `import()`. `tests/unit/layers.test.ts` fails if this is broken.

**How world code reaches the game.** Shared and pack code talk to the running game only through `src/shared/host.ts`: an object (`G`, `print`, `err`, `exec`, `needWorld`, `refs`, `renderSim`, `checkGoals` …) that `boot.ts` fills in at start-up. This keeps module load order simple and keeps packs independent of the core's internals.

**No world-number branches in the core.** The core never does `if (S.world === 3)`. It asks the open level's pack (`packFor(world)`) for its state, panel, controls, commands, `foundry` subcommands, help, manual and inspectable parts. Packs may narrow on `S.world` inside their own code.

**On-demand loading.** The home screen, XP, done count, "Up next" and `{{lvl:id}}` references read only `src/core/manifest.ts`, so no pack downloads until a level of that world opens. `loadPack(world)` caches one promise per world and forgets it on failure, so **Try again** really retries. Vite emits one chunk per pack.

### Where code goes

- Code used by **exactly one world** goes in that world's pack.
- Code used by **two or more worlds, or by the core** (Compare, home) goes in `src/shared/`. The GPU bench is shared because Worlds 1, 3 and 4 all run it.
- Every `INFO` entry and inspect alias stays in `src/shared/data/`, so `foundry inspect` gives the same "not on screen here" answer in every world.
- A command that works in one world but should answer with a fixed sentence elsewhere (for example `ibstat` in World 1) is a **guard entry** in that world's `guards.ts`. Guards are data the core can answer from without downloading the pack. A command that should just fall through to "command not found" elsewhere needs no guard.

### How to add a world

1. Create `src/packs/<slug>/` with an `index.ts` exporting `PACK: WorldPack` (see `src/core/types.ts`). `tests/pack/w5-test/index.ts` is the smallest complete example.
2. Declare the world's state type and add it to `WorldStates` from inside the pack with a `declare module` block, as the test pack does. Don't edit `types.ts`.
3. Add one entry to `MANIFEST` in `src/core/manifest.ts`: world number, `load: () => import("../packs/<slug>/index.ts")`, heading, blurb, every level's `{id, title, concept, quiz}` in order, the lab, and `guards`. Boot and `tests/unit/packs.test.ts` fail loudly if the pack's levels and the manifest disagree.
4. Put the world's styles in `pack.css`, with **every selector starting with `#simCard[data-world="N"]`**. The core sets `data-world` when a level starts. `tests/unit/css-scope.test.ts` rejects unprefixed selectors and `@keyframes`/`@font-face`/`@import` in a pack. Rules for anything outside the sim card belong in `core.css`.
5. Add the world to the content list below, remove its card from `SOON`, and extend the parity script (`tests/parity/script.ts`) so the new levels are recorded.

### Level shape

```ts
{ id:"topic-slug", world, title, concept, layers:{on:[…], near:[…]}, panels:[…], controls:[…],
  brief: `<p>HTML</p>`, setup(S){…}, goals:[{t:"text", ok:S=>bool}],
  hints:[…], answer:()=>"cmd && cmd", chips:["cmd", …],
  debrief: `HTML`, links:{up:"…", down:"…"},
  // optional: locks, gpus, srvs, quiz:true + questions:[{q,o,a,why}] }
```

- Levels are written as `{...} satisfies LevelDef<WNState> as LevelDef<WNState> as Level<WNState>`, so `setup`, `goals` and `answer` are typed against their world's state. `finaliseLevels()` fills in `idx` and `n` at boot.
- `panels` decides which sim view renders; `controls` decides which button groups appear (shared bench controls plus the pack's own `controls`).
- `answer()` is the command sequence that solves the level. The parity script stores a copy of each one.
- `id` is a **permanent topic slug** (kebab-case, for example `moe-experts`). Never change or reuse one: saved stars are keyed by it. No world or position in it, so a level can move without losing progress.
- `idx` (position in the catalog) and `n` (number within its world) are worked out at load. Use them only for display and "next level", never for saving.
- Labs (`gpu-lab`, `kernel-lab`, `server-lab`, `cluster-lab`) are free-play sandboxes, one per pack as `PACK.lab`. Labs never earn stars.
- To point at another level in any text, write `{{lvl:<id>}}`. It renders as "World X, Level N" with current numbers. Never hand-write a level number. The test fails on an unknown ID.

### Saved progress

- Key `m2m-progress-v1`, value `{"v":1,"stars":{"<level-id>":1-3}}`. Stars only go up. Unknown IDs are kept but not counted.
- XP is never stored. It is worked out from stars: 50 per star, 75 per star on checkpoint quizzes.
- If there is no usable new save, an old `gf-progress-v4` save is converted once using the frozen `V4_IDS` table in `src/core/progress.ts`, and left untouched. Never edit `V4_IDS`.
- Adding or moving a level does not need a new save key.

### Current content (36 levels plus 4 labs)

- **World 0 · Inside the model:** Words into tokens · What's in 8 billion parameters · A team of experts (MoE) · Who is "it"? (attention) · Many heads, shared notes (MHA/GQA/MQA) · One word at a time · Notes to self (KV cache) · Checkpoint quiz
- **World 1 · Inside one GPU:** Meet the chip · Will it fit? · Room to talk · Fast chip, slow tokens · Fill the factory · Two speeds · Long memories · Many experts · Watts per token · Share the GPU (MIG) · Team red (AMD) · Pick the GPU · Checkpoint
- **World 2 · The software path:** Follow one matmul · Waiting on the CPU · The 32k prompt · Driver says no · Checkpoint
- **World 3 · Many GPUs, one server:** Meet the HGX board · Too big for one · The slow road · Shards or replicas? · Checkpoint
- **World 4 · Many servers:** Meet the fabric · Two boxes, one model · Split the right way · Train across racks · Checkpoint
- Coming soon (in `SOON`, in the manifest): World 5 Kubernetes/orchestration, a serving chapter, and a finale.

## Modelling assumptions (keep these consistent)

- Efficiencies: `MEM_EFF .8`, `DEC_EFF .6`, `PRE_EFF .65`, `ATT_EFF .5`, `RESERVE 3` GB per GPU (in `src/shared/data/models.ts`).
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

If you update a spec, update it in `src/shared/data/hardware.ts` or `models.ts` **and** check level goals and quiz answers that depend on it. The parity test will show every number that changed on screen; re-record it only after reviewing that diff.

## Look and feel

The visual style matches the owner's "Kube Harbor" artifact:

- Fonts: Saira Stencil One (logo), Atkinson Hyperlegible (body), JetBrains Mono (labels, terminal, numbers).
- Colours: CSS tokens on `:root` (`--ink`, `--muted`, `--panel`, `--panel-2`, `--rule`, `--sea`, `--signal`, `--ok` …) in `src/core/core.css`, with dark mode via `prefers-color-scheme` and a `data-theme` override.
- The background is a faint grid paper, with cards that have soft borders.
- Keep it working at phone width with no horizontal scroll (the visual test checks this at 390 px).

## Writing style for in-game text

- Short, plain sentences. Second person ("Tap a token…"). No jargon without a definition.
- A brief is 2–3 short paragraphs ending with what to do. A debrief is a one-line takeaway plus 3–4 bullets, and the `links.up`/`links.down` lines tie the level to the layers above and below.
- Mark anything illustrative as illustrative. Never present invented numbers as real benchmarks.
- Refer to levels as "World X, Level N" (per-world numbering).

## Testing

`npm run check` is the whole suite, and CI (`.github/workflows/check.yml`) runs it on every push and pull request. It runs, in order: type check (`src/` and `tests/`), Prettier check, Vitest, the Vite build, then the Playwright projects `parity`, `visual`, `loading` and `pack`. Run it before every commit. Playwright needs Chromium once: `npx playwright install chromium`.

- **Unit tests** (`npm test`, `tests/unit/`): the catalog and `{{lvl:id}}` checks, saved progress (v4 conversion, XP, reset, inserting a level), the engine against the reference, each pack against its manifest entry and against the reference's level text, the layering rule, CSS scoping, and the loader.
- **Parity** (`npm run test:parity`, `tests/parity/`): a Playwright recorder plays every level and lab through the screen only (open, help, each chip, each `answer()` command one at a time, win or quiz, debrief), plus a cross-world command sweep, `foundry inspect`, the negative paths, Compare and home. After every step it records the text and normalised HTML of the mission panel, sim card, terminal and modals. The build's recording must equal `tests/parity/reference.json` exactly; a failure names the level, step and first differing line, and the actual recording is left in `test-results/parity-actual.json`.
- **Visual** (`npm run test:visual`, `tests/visual/`): screenshots of the reference and the build side by side in light and dark mode at 1280 px and 390 px (`pixelmatch`, flicker masked), a `scrollWidth <= innerWidth` check at 390 px, and a computed-style comparison of every visible element after every parity step.
- **Loading** and **pack** (`npm run test:loading`, `npm run test:pack`): no pack downloads on the home screen, one chunk per world, the failure state and **Try again**, and the test-only World 5.

**Changing what the player sees on purpose.** `reference.json` is the game's snapshot. Today it is recorded from the frozen reference (`PARITY_TARGET=reference npm run parity:update`), and only extra coverage (new steps in `tests/parity/script.ts`) should be re-recorded that way. A deliberate content change or bug fix is a reviewed diff to `reference.json`: make the change, run `npm run test:parity` and read the diff, then `npm run parity:update` (which records the build) and commit the JSON change with the code. Never update it to make an unexplained failure go away.

**Evidence for the harness** goes in `evidence/<change>/` (committed on purpose; see Building a change).

## Known problems and lessons

- **Known bugs kept on purpose, for parity.** The single file had these, and the port copies them so the recorded play-through still matches. Each is marked `KNOWN BUG` or `known quirk` in the code with a pointer to `openspec/changes/modular-web-build/design.md`. Fix them only in a change that updates `reference.json` deliberately:
  - In World 0, `foundry load`, `foundry prompt`, `foundry status` and `foundry kv` change state, then print `error: Cannot read properties of undefined (reading 'name')` (`src/packs/w0-model/index.ts`).
  - `nvidia-smi` in World 0 prints `NaN W` and `NaN MiB` (`src/shared/bench/smi.ts`).
  - `foundry inspect` with an unknown name shows World 2's hint in Worlds 0, 3 and 4 (`inspectHint` in those packs).
- **Level IDs used to be positional** (fixed by the `stable-level-ids` change). Inserting a level renumbered everything, so the progress key was bumped each time and wiped progress. Levels now have permanent slugs.
- **CSS class collisions.** All CSS is global. The MoE expert grid once reused `.xp`, which broke the header XP pill. Pack styles are now prefixed with `#simCard[data-world="N"]` and a test enforces it; keep new rules inside that prefix.
- Cross-references in text ("see Level 7") broke when levels moved. Use `{{lvl:id}}` instead (see Level shape).
- The tokenizer is approximate, and router picks and head roles are seeded pseudo-random. They're illustrative by design, and seeded so the parity recording is repeatable.

## Learning-gaps backlog

`docs/learning-gaps.md` records the questions the owner asked while playing. Each one is a gap the game should eventually close. Keep it updated: when the owner asks a conceptual question, add it as a gap with a proposed fix. Major open themes:

- A visual explanation of prefill vs decode.
- Explaining how every tile's number is derived.
- The memory hierarchy (registers, SM shared memory, L2, HBM).
- Capacity vs bandwidth vs latency.
- Plain definitions of "bound" terms.
- A serving chapter (TTFT breakdown, chunked prefill, prefix caching, disaggregated prefill/decode).
- A learning-path map.
