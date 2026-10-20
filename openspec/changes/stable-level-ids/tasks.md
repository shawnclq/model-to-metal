# Tasks

All code edits go in `reference/source-parts/`. After each group, run `sh reference/build.sh`, copy `model-to-metal.rebuilt.html` over `reference/model-to-metal.html`, and run `node reference/tests/test2.js reference/model-to-metal.html`. Canvas `getContext` errors in the output are expected.

## 0. Before starting

- [x] 0.1 Owner reviews and approves the ID table in design.md (Decision 1). Verify: owner says the names are final, or the table is edited first.

## 1. Permanent IDs and the catalog step

- [x] 1.1 Add `id:"<slug>"` to every level in `5-levels.js`, `5b-levels.js`, `5c-levels.js`, `5d-levels.js`, `5e-levels.js` using the design table, replacing the numeric `id:1`…`id:12` in `5-levels.js`. Give the four labs their slug `id`s and key `LABS` by world number. Verify: grep shows no `id:[0-9]` left in level files.
- [x] 1.2 Change the splices in `5b`, `5c`, `5e` to find their anchor level by ID, not title, and delete every `forEach((l,i)=>{l.id=i+1})` and per-world `cnt` loop. Move `driverStart` onto the `driver-stack` level definition. Verify: grep for `l.id=i+1` and `cnt\[` in level files returns nothing.
- [x] 1.3 Create `5f-catalog.js` with `finaliseLevels()` (check IDs present, well formed and unique across levels and labs; set `idx` and `n`; build `LEVEL_BY_ID`), call it once, and add the file to `build.sh` after `5e-levels.js`. Verify: rebuilt page loads in the test with no new page errors.
- [x] 1.4 Add test checks to `test2.js`: every level and lab ID matches the slug pattern; IDs are unique; `n` restarts at 1 in each world; a page with a duplicate ID injected throws a clear error. Verify: checks pass on the real file and the duplicate case fails as expected.

## 2. Navigation by ID

- [x] 2.1 In `7-app.js`, make `getLevel` look up by `LEVEL_BY_ID` or lab ID (no `Number()`), make the home buttons' `data-level` carry the slug, make "Up next" the first level in list order with no stars, and make "Next" (`win()` and `#dNext`) use `LEVELS[L.idx+1]`. Verify: clicking a level on the home screen opens it, in the test.
- [x] 2.2 Change the Compare panel `lv()` helper in `6c-render.js` and the `trace` error in `7-app.js` from title lookup to ID lookup. Verify: test checks the Compare panel's level links show "W1·L3"-style labels and their `data-level` values are real IDs.
- [x] 2.3 Update `test2.js` to iterate `LEVELS` and call `loadLevel(l.id)` (and `loadLevel("<lab-slug>")` for labs) instead of numbers, and add checks: after winning the last World 0 level, "Next" offers the first World 1 level; after winning the last level, "Next" is hidden. Verify: full playthrough passes with every level won.

## 3. Cross-references

- [x] 3.1 Add `refs(html)` that turns `{{lvl:<id>}}` into "World X, Level N" (unknown ID → "another level"), and apply it where brief, debrief, quiz question and `why`, hints, `links` and level-naming terminal messages are rendered. Verify: test renders a string with a known and an unknown token and checks both outputs.
- [x] 3.2 Replace every hand-written level number in level text with a `{{lvl:<id>}}` token, and delete the text-patching `.replace(...)` code in `5b`, `5d`, `5e`. Find candidates with `grep -nE "[Ll]evels? [0-9]" reference/source-parts/5*-levels.js` and review each by hand (skip World and layer numbers). Verify: grep finds no level-number references left, and no `.replace(` calls on `brief`/`debrief` remain.
- [x] 3.3 Add test checks: every `{{lvl:...}}` token in all level text names a real ID (report level and ID otherwise); after visiting every level and opening each debrief, no `{{lvl:` appears in the page. Verify: checks pass, and a temporary typo in one token makes the test fail with that ID named.

## 4. Save format, XP and conversion

- [x] 4.1 Replace the progress code in `7-app.js`: load `m2m-progress-v1` as `{v:1, stars:{}}`, work out XP (`stars × 50`, `stars × 75` for quizzes, current IDs only) and the done count from `stars`, make `win()` only raise stars, and make reset write `{v:1, stars:{}}`. Keep unknown IDs in the save. Verify: test wins a level, reloads the page, and sees the same stars and XP.
- [x] 4.2 Add the frozen `V4_IDS` table (36 IDs in v4 order) and the one-time conversion from `gf-progress-v4` (skip numbers outside 1–36 and stars not 1–3; never touch the v4 key; skip if the new key already exists). Verify: test seeds `{"xp":0,"done":{"3":2,"14":3,"99":3,"5":7}}` under `gf-progress-v4` before scripts run (jsdom `beforeParse`), and checks `moe-experts`=2, `prefill-decode`=3, nothing else, and the v4 value unchanged.
- [x] 4.3 Add test checks for the rest of the `player-progress` spec: `V4_IDS[i] === LEVELS[i].id` for all 36 today; XP for the spec's mixed example is 350; 1★→2★→3★ replays give 150 XP; a worse replay keeps the higher stars; an unknown ID in the save is kept but not counted; corrupt JSON under the new key starts at 0 XP; reset then reload shows 0 XP even with a v4 save present. Verify: all pass.
- [x] 4.4 Add the "inserting a level keeps everyone's stars" test: seed stars on several IDs, splice a dummy level into `LEVELS` near the start, re-run `finaliseLevels()` and re-render home, and check each seeded level still shows its stars and the dummy shows none. Verify: passes.

## 5. Docs and final checks

- [x] 5.1 Update `CLAUDE.md`: level shape (`id` is a permanent slug, `idx`/`n` are worked out), the new `5f-catalog.js` part, the save key `m2m-progress-v1` (and that `gf-progress-v4` is read once for conversion), the `{{lvl:id}}` reference rule, and mark "Level IDs are positional" as fixed. Verify: no remaining CLAUDE.md text says IDs are positional or that the key is `gf-progress-v4`.
- [x] 5.2 Run the Playwright screenshots (`reference/tests/screenshot.mjs`) in light and dark at 1280 px and 390 px. Verify: the home screen, a level, and a win modal look the same as before, apart from cross-references now reading "World X, Level N", and `scrollWidth <= innerWidth` at 390 px.
- [x] 5.3 Manual upgrade check in a real browser: play a few levels on the current `main` build, then open the new build. Verify: the same stars show on the same levels, and XP equals stars × 50 (× 75 for quizzes) added up.

## Workflow follow-up

- Archive the change once the owner has reviewed it, so `level-catalog` and `player-progress` become main specs that `modular-web-build` and `accounts-and-sync` build on.
