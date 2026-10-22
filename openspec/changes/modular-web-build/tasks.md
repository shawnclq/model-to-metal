# Tasks

Ground rule: from group 3 on, every task ends with `npm run test:parity` and `npm run test:visual` green unless it says otherwise. `tests/parity/reference.json` is only ever recorded from `reference/model-to-metal.html` (`PARITY_TARGET=reference npm run parity:update`), never from the new build. Adding steps to the script and re-recording from the reference is how coverage grows.

## 1. Project setup

- [x] 1.1 Add `package.json` (Node ≥ 20, npm, dev dependencies from design Decision 9, scripts `dev`, `build`, `preview`, `test`, `test:parity`, `test:visual`, `parity:update`, `check`), `tsconfig.json` (`strict`), `vite.config.ts`, `.prettierrc`, and add `dist/`, `test-results/`, `playwright-report/` to `.gitignore`. Verify: `npm ci && npx tsc --noEmit` succeed on an empty `src/main.ts`.
- [x] 1.2 Create `index.html` with the static markup from `reference/source-parts/2-body.html` and the same `<head>` (fonts, meta) as `1-head.html` minus the CSS, loading `/src/main.ts`. Verify: `npm run build && npm run preview` serves a page whose header and home markup match the reference (no game logic yet).
- [ ] 1.3 Add `.github/workflows/check.yml` running `npm ci`, `npx playwright install --with-deps chromium`, `npm run check` on push and pull request. Verify: the workflow passes on GitHub with the scripts that exist so far.

## 2. Safety net, built against the reference only

- [x] 2.1 Write `tests/parity/script.ts`: for every level and lab, the steps from design Decision 5 (open, help, each chip, each `answer()` command one by one, win/quiz, debrief), plus a cross-world command sweep (one command per world-only verb and `foundry` subcommand from the inventory in design Decision 4, run in one level of each world), `foundry inspect` with `sm`, `embed`, `nvswitch`, `nope`, the negative paths from `reference/tests/test2.js`, the Compare panel and the home screen. Read the `answer()` strings from the reference once and store them in the script. Verify: the script lists 36 levels, 4 labs and the sweep.
- [x] 2.2 Write `tests/parity/record.ts`, a screen-only recorder for Playwright: it clicks, types into `#cmd`, waits for visible states (no fixed sleeps), and records `textContent` and normalised `innerHTML` of the mission panel, `#simCard`, `#out`, `#modal` and `#cmpModal` after each step. Verify: recording the reference twice gives byte-identical output.
- [x] 2.3 Record `tests/parity/reference.json` from `reference/model-to-metal.html` and commit it. Add `npm run test:parity`, which records the target build and diffs it against the file, reporting level, step and first differing line. Verify: pointing it at the reference passes; pointing it at a copy of the reference with one debrief word changed fails, naming that level.
- [x] 2.4 Write `tests/visual/compare.spec.ts` from design Decision 7: both builds side by side, light and dark, 1280 and 390 px, the listed screens, flicker masked, `pixelmatch` thresholds, and a `scrollWidth <= innerWidth` check at 390 px. Verify: reference against itself passes; reference against a copy with one colour token changed fails.

## 3. Pass 1: mechanical port (one bundle, today's file split)

- [x] 3.1 Port the data parts (`3-data.js`, `3b-data.js`, `3c-data.js`) to `src/legacy/` TypeScript modules with explicit exports, and move the CSS from `1-head.html` to `src/legacy/styles.css` unchanged. Verify: `tsc` passes.
- [x] 3.2 Port the engine parts (`4-engine.js`, `4b-engine.js`, `4c-w0.js`, `4d-w0b.js`) with explicit imports and exports. Verify: `tsc` passes, and a Vitest test checks `w1()` for H100 + Llama 3.1 8B BF16 batch 1 equals the reference's value read via jsdom.
- [x] 3.3 Port the level parts (`5-levels.js` … `5f-catalog.js`) and render parts (`6-*.js`). Keep the splices for now. Verify: `tsc` passes.
- [x] 3.4 Port the command parts (`7a`, `7b`, `7c`) and `7-app.js`. Move mutable globals (`G`, `OUT`, `progress`, `flickT`, `LEVEL_BY_ID`, the `let` in `5f`) into one exported `state` object, and wire `src/main.ts` to boot. Verify: the game runs in `npm run dev`, and `npm run test:parity` and `npm run test:visual` pass. *Done note: the shared `state` object turned out unnecessary. `tsc` shows no file reassigns another file's variable; files only change the contents of `G` and `OUT`, which modules allow. Calls from earlier files to later ones go through a temporary bridge (`src/legacy/late.ts`) so files still run in the original order; pass 2 removes it.*
- [x] 3.5 Port the pass/fail checks from `reference/tests/test2.js` (catalog, `{{lvl:}}` references, saved progress, v4 conversion, insert-a-level) to Vitest tests against the modules. Verify: `npm test` runs at least the same 37 checks and all pass; breaking `XP_PER_STAR_QUIZ` makes the XP test fail.
- [x] 3.6 Run Prettier over `src/`. Verify: `npm run check` passes end to end, with parity and visual unchanged.

## 4. Pass 2: shared layer

- [x] 4.1 Move the data and formatters to `src/shared/data/`, including every `INFO` key (also World 0's from `7b-w0.js`) and every inspect alias. Verify: parity green, including the `foundry inspect` sweep.
- [x] 4.2 Move multi-world math to `src/shared/engine/` (`computeRate`, `w1`, `w2decode`, `w2prefill`, `w2used`, `W2BW`, `nonEmbed`, `readGBof`, `kvTok`, `activeP`, `w3`), and leave single-world math in `src/legacy/` for now. Verify: parity green; Vitest engine test still passes.
- [x] 4.3 Move `seg`, `infoHtml` and the flicker helpers to `src/shared/ui/`, and the GPU bench (bench controls gpu/model/dtype/batch/ctx/prompt/kv, `smi`/`smiCmd`/`smiMulti`/`amdSmi`, `setGpu`/`setModel`/`setDtype`/`setNum`/`afterAny`, and the shared `foundry` subcommands) to `src/shared/bench/`. Verify: parity green, including World 0's `NaN` `nvidia-smi` and the World 0 `foundry load` error. *Done note: shared code reaches the running game only through `src/shared/host.ts` (G, print, err, locked, exec), which the app shell fills in at start-up, so shared modules never import the app shell. Left for later on purpose: `afterAny` and the shared `foundry` subcommands are dispatch code and become pack lookups in 5.2; `smiCmd` still contains World 1's MIG commands, which move to the World 1 pack in 6.2.*

## 5. Pass 2: core and the pack contract

- [ ] 5.1 Write `src/core/types.ts` with `WorldPack`, `Level`, `Lab`, `GameState` (a union per world), `SimContext`, `CommandHandler`, `FoundryHandler`, `ControlRenderer` and `ManualSection`, as in design Decision 2. Verify: `tsc` passes.
- [ ] 5.2 Move the app shell into `src/core/` (terminal, `run`, level runner, goals, stars, progress, home, glossary, Compare, theme). Replace the world-number branches in `run`, `foundry`, `freshState`, `renderSim`, `renderCtrls`, `printHelp`, `renderManual`, `inspect` and the `loadLevel` special cases with lookups on the current pack, keeping the dispatch order of today's `run()` chain. For now, register all packs eagerly from `src/legacy/`. Verify: parity and visual green.
- [ ] 5.3 Write `src/core/manifest.ts` with every world's heading, blurb, levels (`id`, `title`, `concept`, `quiz`), lab, `SOON`, and the guard entries for world-only commands (design Decision 4). Make home, XP, the done count, "Up next", `refs()` and the v4 conversion read the manifest only. Verify: parity green; a Vitest test fails, naming the world and level, when a pack's levels differ from its manifest entry (missing, extra, renamed, reordered, quiz flag).

## 6. Pass 2: the five world packs

Each task: create `src/packs/<world>/` with `index.ts`, `levels.ts` (final order, no splices), `engine.ts`, `render.ts`, `commands.ts`, `help.ts`, moving that world's code out of `src/legacy/` and `src/core/`. Verify each with parity green, plus a Vitest check that the pack satisfies `WorldPack` and matches its manifest entry.

- [ ] 6.1 World 0 pack (`w0-model`): tokenizer, params, attention, heads, MoE, generation, KV; World 0 controls and click handlers (`data-moe`, `data-qh`, `data-att`, `data-genrow`); `tokenize` guard entry for other worlds. Verify as above, and the cross-world sweep shows "command not found" for `config` etc. in Worlds 1–4.
- [ ] 6.2 World 1 pack (`w1-gpu`): levels, `bench`/`summary1`, roofline, MIG, AMD chip, "Pick the GPU" (`WL`, `wlCheck`, `pickHtml`), guard entries for `foundry roofline` etc. Verify as above.
- [ ] 6.3 World 2 pack (`w2-software`): levels, `summary2`, `trace`, `profile`, `toggle`, `docker`, `driverInstall`, stack/timeline/container panels, `driverStart` hook. Verify as above.
- [ ] 6.4 World 3 pack (`w3-server`): levels, board render, `summary3`, `all_reduce_perf`, `ncclTable`, `foundry server/tp`, guard entries. Verify as above.
- [ ] 6.5 World 4 pack (`w4-cluster`): levels, cluster render, `summary4`, `w4serve`/`w4train`, `ibstat`, `ib_write_bw`, `iperf3`, `ssh`, `ray`, `vllm`, `foundry mode/nodes/net/gdr/layout`, guard entries. Verify as above.
- [ ] 6.6 Delete `src/legacy/`. Verify: `grep -r legacy src` finds nothing, and `npm run check` passes.

## 7. On-demand loading

- [ ] 7.1 Add `loadPack(world)` (cached promise, cleared on failure) and make `loadLevel` async with the "Loading World N…" message. Switch the manifest's `load` entries to `import()`. Verify: `npm run build` emits one chunk per pack; parity green.
- [ ] 7.2 Add the failure state: "Couldn't load World N. Check your connection." with a **Try again** button. Verify with a Playwright test that blocks one pack's chunk: the message shows, Home still works and stars are intact; unblocking and pressing Try again opens the level.
- [ ] 7.3 Add Playwright network tests: opening the home screen downloads no pack chunk; opening World 3, Level 1 downloads only World 3's chunk; opening World 3, Level 2 downloads nothing more; typing `ibstat` in a World 1 level downloads nothing and shows the recorded guard sentence.
- [ ] 7.4 Add a test-only pack (one level, one command, a `.xp` style) registered in a test manifest. Verify: it appears after World 4 on the home screen, its level can be won, and core code was not edited to add it.

## 8. Scoped styles

- [ ] 8.1 Split `src/legacy/styles.css` into `src/core/core.css` and each pack's `pack.css`. Prefix every pack selector with `#simCard[data-world="N"]`, set `data-world` when a level starts, and move any world-section rule that styles something outside `#simCard` into `core.css`. Verify: visual green in all modes and widths.
- [ ] 8.2 Add a Vitest CSS check that fails if any selector in a `pack.css` lacks its prefix, and a Playwright check that the test pack's `.xp` leaves the header XP pill's computed style unchanged. Verify: both pass; removing one prefix makes the CSS check fail and name the file and selector.

## 9. Hand-over

- [ ] 9.1 Update `CLAUDE.md`:
  - `src/` is now the source of truth, and `reference/` is frozen;
  - the new layout table (core, shared, packs, tests) replaces the parts table;
  - the "where code goes" rule;
  - how to add a world (pack, manifest entry, guard entries, `pack.css` prefix);
  - testing becomes `npm run check`, with parity and visual tests and `parity:update` for deliberate changes;
  - the known bugs kept for parity.

  Verify: no CLAUDE.md text tells people to edit `reference/source-parts/`.
- [ ] 9.2 Add a short `README.md` (what it is, `npm install`, `npm run dev`, `npm run check`), and mark the Vite/modules step as done in `docs/webapp-ideas.md`. Verify: following the README on a clean clone starts the game.
- [ ] 9.3 Final check: `npm run check` passes locally and in CI on GitHub, `PARITY_TARGET=reference npm run test:parity` still passes (so `reference.json` still describes the original game, and every change to it came from the reference), and the game can be played through on a phone-sized window in `npm run preview`. Verify: CI link green, plus a brief manual play note.

## Workflow follow-up

- Propose a small follow-up change to fix the known bugs listed in design.md (World 0 `foundry load`/`prompt`/`status`/`kv` error, World 0 `nvidia-smi` NaN, the inspect hint), each shown as a reviewed `reference.json` diff.
- Archive this change once reviewed, so `world-packs` becomes a main spec that `accounts-and-sync` builds on.
