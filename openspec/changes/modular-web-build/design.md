# Design

## Context

See proposal.md for why. What the code looks like today, from reading `reference/source-parts/` and running it:

- **About 330 KB in 25 parts** that share one global scope. There are 236 top-level names. Many are used across parts; for example, `6-render.js` calls functions in seven other parts.
- **The "core" isn't core yet.** `7-app.js` holds the terminal and level runner, and also World 1 and 2 logic: `setGpu`, `bench`, `summary1/2`, `trace`, `profile`, `dockerCmd`, `driverInstall`, the inline `freshState` per world, and the help text for Worlds 1 and 2.
- **Dispatch is by world number** in a few places: `run()` (a fixed chain of command handlers), `foundry()` plus `foundryMore()`, `renderSim()`, `renderCtrls()` plus `ctrlsMore()`/`ctrlsW0()`, `printHelp()`, `renderManual()` and `freshState()`.
- **Worlds 1, 3 and 4 share a lot:**
  - the GPU bench controls (gpu, model, dtype, batch, ctx, prompt);
  - `nvidia-smi` and its multi-GPU form;
  - most `foundry` subcommands;
  - the math in `computeRate`, `kvTok` and `activeP`.
  World 0's MoE panel uses `readGBof` from the multi-GPU engine.
- **Out-of-world commands** are handled per command. Most print a fixed sentence, such as `ibstat: no InfiniBand devices on this bench (World 4).` World 0's commands (except `tokenize`) fall through to `command not found` in other worlds.
- **Known bugs that "play the same" must keep for now:**
  - In World 0, `foundry load`, `foundry prompt`, `foundry status` and `foundry kv` change state, then print `error: Cannot read properties of undefined (reading 'name')`.
  - `nvidia-smi` in World 0 prints `NaN W` and `NaN MiB`.
  - `foundry inspect` with an unknown name shows the World 2 hint in Worlds 0, 3 and 4.
- **CSS** is 431 lines in one `<style>`, in sections: top bar, home, game, stack strip, controls, then per-world sections (world 1 sim, world 2 sim, MIG, compare + picks, world 0, world 0 moe + heads).
- **Randomness:** only the chip "flicker" animation uses `Math.random`. MoE routing and head roles use a seeded generator, so every text output is repeatable.
- **Tests:** `reference/tests/test2.js` runs in jsdom with classic scripts. jsdom cannot run ES modules, so the test can't be pointed at a Vite build as is.

## Goals / Non-Goals

**Goals:**
- Same game, same look, proved by machine (spec: plays the same, looks the same), not by eye.
- A pack boundary that matches how worlds actually share code, so adding World 5 means adding a pack plus one list entry.
- A loader boundary (`loadPack(world)`) that a later change can put behind a subscription check without touching levels.
- One `npm run check` that type-checks, runs every test and builds. CI runs it on every push.

**Non-Goals:**
- Fixing the known bugs above. Parity first; each fix is a later, deliberate change that updates the recorded expected output.
- New content, text edits, or design changes.
- Deploying anywhere (`accounts-and-sync` adds Vercel).
- A UI framework. Rendering stays as string templates plus `innerHTML`, as today.
- Changing `level-catalog` or `player-progress` behaviour.

## Decisions

### 1. Layout: core, shared, packs

```
index.html              static markup from 2-body.html, plus <script type="module" src="/src/main.ts">
src/
  main.ts               boots the app
  core/                 always loaded: app shell, terminal, level runner, goals, stars, progress,
                        home screen, glossary, Compare panel, theme, loader, manifest
  shared/               always loaded: code used by more than one world, or by core
    data/               GPUS, MODELS, DTYPES, LAYERS, INFO (all keys), GLOSS, formats (f0, esc …)
    engine/             math used by 2+ worlds: computeRate, w1, w2*, readGBof, kvTok, activeP, w3 …
    bench/              GPU bench used by Worlds 1, 3, 4: controls, nvidia-smi family, shared foundry subcommands
    ui/                 seg(), infoHtml, flicker
  packs/
    w0-model/  w1-gpu/  w2-software/  w3-server/  w4-cluster/
      index.ts          the pack object (Decision 2)
      levels.ts         the world's levels in final order, plus its lab
      engine.ts         math only this world uses (e.g. tokenizer, headsCalc, ncclTable, w4serve)
      render.ts         sim panel
      commands.ts       terminal commands only this world does real work in
      help.ts           help text and command list
      pack.css          styles, scoped (Decision 6)
tests/                  Vitest unit tests, Playwright parity and visual tests, recorded reference output
```

**The rule for where code goes.** Code used by exactly one world goes in that world's pack. Code used by two or more worlds, or by core (Compare panel, home screen), goes in `shared/`. Where the inventory shows a "World 1" function used by Worlds 3 and 4 (the bench), it goes in `shared/bench/`.

*Why not "one pack per world, nothing shared"?* Worlds 1, 3 and 4 run the same bench. Copying it three times would let the copies drift apart, and any copy would break parity.

*Why not keep World 1 inside core?* Then core grows with every world that reuses the bench, which is the problem the proposal is trying to fix.

### 2. The pack contract

```ts
interface WorldPack {
  world: number;
  levels: Level[];                 // final order, must match the manifest (Decision 3)
  lab?: Lab;
  freshState(): GameState;
  renderSim(ctx: SimContext): void;               // sets title, caption, body for this world
  controls?: Record<string, ControlRenderer>;     // controls only this world uses (e.g. moebatch)
  commands?: CommandHandler[];                    // (verb, args, ctx) => handled?
  foundry?: FoundryHandler;                       // world-only foundry subcommands
  help(ctx): string;
  manual(ctx): ManualSection[];
  inspectable: string[];                          // today's WORLD_INSPECT[world]
  onLevelStart?(level, ctx): void;                // today's loadLevel special cases (driverStart, summaries)
}
```

Core keeps the **dispatch order** exactly as today's `run()` chain (sudo, smi, foundry, docker, apt, clear/help/hint, python, World 0 commands, vllm, the multi-GPU commands, mpirun/torchrun, kubectl, not found). Each slot is filled by the current world's pack, by `shared/`, or by a guard (Decision 4).

Types: `GameState` is a union by world (`W0State | W1State | …`), because each world's `freshState` has different fields. The union is built from an interface, `WorldStates` (world number → state type), so a new world adds its own entry from inside its pack with a `declare module` block, without editing the core. Checks like `S.world === 3` still narrow as before. `ctx` gives packs `print`, `err`, `G`, `refs`, `exec` and the shared modules, so packs never reach into core's internals.

### 3. Manifest and on-demand loading

`src/core/manifest.ts` is the list of worlds. Each entry has:
- the world number, home-screen heading and blurb;
- a level list: `{id, title, concept, quiz}` for every level, plus the lab's `{id, title}`;
- `load: () => import("../packs/w3-server")`;
- the world's out-of-world command answers (Decision 4).

`SOON` (coming soon) lives here too.

- The **home screen, XP, done count, "Up next", `refs()` and the save conversion** use only the manifest. So the spec's "home screen needs no pack" holds, and level references to other worlds still render.
- `loadPack(world)` caches the promise, so each pack downloads at most once. `loadLevel(id)` becomes async: look up the world in the manifest, `await loadPack`, then start the level exactly as today.
- While waiting, the mission panel shows "Loading World N…". On failure it shows "Couldn't load World N. Check your connection." with a **Try again** button and the usual Home button. The cached promise is dropped on failure so "Try again" really retries.
- Vite splits each `import()` into its own chunk, with that pack's CSS.
- A test checks that each pack's `levels` match its manifest entry (IDs, titles, concepts, quiz flags, order), and fails naming the world and level.

*Why a hand-written manifest rather than generating it from the packs?* Generating it would mean loading every pack at build time and adding a Vite plugin. A hand-written list plus a test that catches drift is simpler. It's also exactly the small public catalogue a server would send later.

*Why not load all packs up front and only "prepare" the boundary?* You chose on-demand loading. The cost is small: one `await` in `loadLevel`, a loading message, and handling errors.

### 4. Commands typed in another world

Each command goes in one of three places:

| Kind | Example | Lives in | Out-of-world answer |
|---|---|---|---|
| Works in 2+ worlds | `nvidia-smi`, `foundry load/status/kv/inspect`, `exit`, `hostname`, `python`, `docker`, `apt` | `shared/` or core | Today's code, unchanged (it already checks the world) |
| Works in one world, fixed answer elsewhere | `ibstat`, `ray`, `vllm`, `all_reduce_perf`, `ssh`, `tokenize`, `foundry trace/profile/graphs/server/nodes…` | That world's pack | A **guard entry in the manifest**: verb → exact sentence (or `needWorld(N)`) |
| Works in one world, falls through elsewhere | World 0's `config`, `params`, `route`, `heads`, `attend`, `generate`, `kv` | World 0 pack | None: falls through to the next slot, ending in `command not found` |

A guard entry is data, so core can answer without downloading the pack. Panel-specific checks inside a world (for example `tokenize` in a World 0 level without the tokenizer panel) stay in the pack, because that pack is loaded.

*Keep `INFO` and every inspect alias in `shared/data`.* If World 0's `INFO` entries moved into its pack, `foundry inspect embed` typed in World 1 would change from "Not on screen here" to "Nothing called". `WORLD_INSPECT` lists move to `pack.inspectable`, and the manifest repeats them for the out-of-world message.

### 5. Proving it plays the same: recorded reference output

This is the main safety net, and it is built **before** any porting.

- **Recorder** (`tests/parity/record.ts`) drives a page only through the screen: it clicks level buttons, types into the command box, clicks quiz options and reads `textContent`. It knows nothing about internals, so the same recorder works on the reference file and on the new build.
- **Script** (`tests/parity/script.ts`), per level and lab:
  1. Open it, then record the brief, goals, controls, sim text and terminal.
  2. Run `help`, then each chip, then the `answer()` commands one at a time, recording terminal, sim and goals after each.
  3. Record the stars, debrief and links.
  4. In every world, run one command from every other world (out-of-world answers), plus `foundry inspect` with a few names, the existing negative paths from `test2.js`, the Compare panel and the home screen.
  The answers to send are read once from the reference and stored in the script, so the recorder never calls `answer()`.
- **Run in Playwright (real Chromium)** for both builds: the reference through `file://`, the new build through `vite preview`. The recorded reference output is committed as `tests/parity/reference.json`.
- **The check:** the new build's recording must equal `reference.json` exactly. A diff points at the level, step and line.

After this change, the same file becomes the game's **snapshot test**. Any later content change or bug fix updates it on purpose (`npm run parity:update`), and the diff shows exactly what changed for players.

*Why Playwright rather than jsdom?* jsdom can't run ES modules or `import()`, so it can't run the new build. A real browser also tests on-demand loading for real.

*Why record rather than port `test2.js` checks one by one?* `test2.js` mostly prints output for a person to read. A recording turns all of that into exact comparisons, about 36 levels × several steps each.

### 6. Scoped pack styles

- `src/core/core.css` holds every rule for the header, home, mission panel, stack strip, controls frame, terminal and modals.
- Each pack's `pack.css` holds its world section from today's CSS, and **every selector starts with `#simCard[data-world="N"]`**. Core sets `data-world` on `#simCard` when a level starts.
- A Vitest test parses each `pack.css` and fails if any selector lacks the prefix. Another test loads a pack that defines `.xp` and checks that the header XP pill's computed style is unchanged (spec: pack styles stay inside the pack).
- Rules in a world section that style something outside `#simCard` (to be checked line by line while porting) move to `core.css`, so the look doesn't change.

*Why not CSS Modules?* Every class name is written inside HTML strings. CSS Modules would mean rewriting all of them to imported names, which is a large, risky change for the same result.

*Why not Shadow DOM?* It would change how the sim card's DOM and styles work, and the existing click handlers look for `data-*` attributes across the whole page.

### 7. Visual check

A Playwright test opens both builds side by side and takes screenshots in light and dark mode at 1280 and 390 px. It covers the home screen, one level per world, the MIG level, the win modal and Compare, and compares the images with `pixelmatch` (threshold 0.1, ≤ 0.1% of pixels different). The flicker animation is masked. The test also asserts `scrollWidth <= innerWidth` at 390 px. Fonts come from the same Google Fonts link in both builds, and the test waits for `document.fonts.ready`.

### 8. Porting in two passes

1. **Mechanical pass.** Turn each part into a TypeScript module, keeping today's file split. Add `import`/`export` for every cross-file name (the dependency map lists all 236). Wrap mutable globals (`G`, `OUT`, `progress`, `flickT`, `LEVEL_BY_ID`) in a single exported `state` object, because ES module bindings can't be reassigned from another file. Everything is still one bundle. The parity and visual tests must pass.
2. **Restructure pass.** Move code into core, shared and packs (Decisions 1–4), turn the `run`/`foundry`/`renderSim`/`renderCtrls`/`help` chains into pack lookups, add the manifest and loader, and split the CSS. Parity and visual must still pass, with no change to `reference.json`.

*Why two passes?* If parity breaks in pass 1, the cause is an import or a binding. If it breaks in pass 2, it's the restructure. Debugging one kind of mistake at a time is much faster.

Code style: Prettier formats `src/`. TypeScript is **fully strict everywhere** (owner's decision): `strict` on, every function input and exported value has an explicit type, and no file skips checking (no `@ts-nocheck`), including the temporary pass-1 files. Types are added during pass 1, so they move with the code in pass 2. Data shapes get named types (`Gpu`, `Model`, `Level`, per-world states). `any` is not used; where a value really can be several shapes, it's a union or `unknown` narrowed with a check. Adding types must not change behaviour: no new defaults, no reordered logic, and the parity test confirms it.

*Cost, accepted:* roughly double the porting effort of a loosely typed port, in exchange for type errors being caught everywhere, including inside world packs.

### 9. Tooling

- **Node:** 20+ (`engines` in `package.json`), with npm.
- **Dev dependencies:** `vite`, `typescript`, `vitest`, `jsdom` (for Vitest unit tests of pure modules), `@playwright/test`, `pixelmatch`, `pngjs`, `prettier`. Nothing at run time.
- **Scripts:**
  - `dev` / `build` / `preview`
  - `test` (Vitest)
  - `test:parity`, `test:visual` (Playwright)
  - `parity:update`
  - `check`: tsc, Prettier check, test, build, then parity and visual
- **CI:** `.github/workflows/check.yml` runs `npm ci`, installs Playwright Chromium and runs `npm run check` on every push and pull request.
- **Unit tests ported from `test2.js`:** the catalog, `{{lvl:}}` reference and saved-progress checks now run in Vitest against the core modules, plus the new manifest-match, CSS-scope and loader tests.

## Risks / Trade-offs

- [Some behaviour is hard to see in the recording, such as a click handler that only changes classes] → The recording includes the sim area's `innerHTML` with whitespace normalised, not just `textContent`, for each step. Screenshots cover the look.
- [Timing differences: the win modal appears after 900 ms; packs load asynchronously] → The recorder waits for visible states ("modal shown", "level title set"), never fixed sleeps.
- [Moving a mutable global into `state` changes when something sees an update] → Pass 1 is purely mechanical, and parity runs after every file.
- [Copying known bugs on purpose looks odd] → They're listed in Context, and fixing them is a follow-up change. The recording makes each fix visible as a small, reviewed diff.
- [A new world forgets a guard entry, so its command says "not found" elsewhere instead of a helpful sentence] → Not a parity risk, since existing worlds are recorded. The pack-authoring note in CLAUDE.md lists the step.
- [Players on the claude.ai artifact won't see their saves on the new site] → Browsers keep saves per site, so this can't be avoided. The save format is identical, so nothing is lost on the same site. Worth one line on the eventual launch page; it's not part of this change.
- [Big change, long branch] → Tasks are grouped so each group ends with tests green and can be committed on its own.

## Migration Plan

1. Build the recorder and record `reference.json` from the current reference. Commit before any porting.
2. Pass 1 (mechanical), then pass 2 (restructure), each ending with parity and visual green.
3. When done: `src/` becomes the source of truth. `reference/` is frozen: kept for history, no further edits. CLAUDE.md is updated to say so and to describe the pack layout and how to add a world.
4. **Rollback:** nothing is deployed by this change, and `reference/model-to-metal.html` keeps working on its own.

## Open Questions

- Which follow-up fixes the known bugs (World 0 `foundry load` and similar, World 0 `nvidia-smi` NaN, the inspect hint)? They can be one small change after this, or folded into the next content change. This doesn't affect the plan here.
