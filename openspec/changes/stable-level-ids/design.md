# Design

## Context

See proposal.md for why. Today's state, from reading `reference/source-parts/`:

- **Numbers are handed out by position, four times over.** `5-levels.js` hard-codes `id:1`…`id:12`. Then `5b`, `5c`, `5d` and `5e` each splice levels in and re-run `LEVELS.forEach((l,i)=>{l.id=i+1})`. `5d` and `5e` also work out `l.n` (number within the world).
- **The save** (`7-app.js` line 4) is `gf-progress-v4` = `{xp, done:{"<number>": stars}}`. `win()` adds XP by the step in stars (`round((new−old)/3 × 100 or 150)`), so XP is a running total.
- **Numbers are used as pointers.** `getLevel` does `Number(id)`. "Next" is `id + 1`. Home buttons carry `data-level="<number>"`.
- **Cross-references are hand-patched.** After each splice, code finds a level by title and string-replaces text, for example `"level 11"` → `"level "+drv.id` in `5b`, then again with a regex in `5d`, and `"(Level 5)"` → `"(Level 7)"` in `5e`. Other references ("World 1, Level 4", "level 6", "Level 4 shows why…") are plain text that nobody updates.
- **Title lookups** are used as stable handles in several places: the patch code above, `driverStart` in `5b`, the `trace` error in `7-app.js`, and the Compare panel's `lv("Room to talk")` links in `6c-render.js`.
- `reference/build.sh` rebuilds the parts into a file identical to `model-to-metal.html` (checked: `cmp` reports no difference). So all edits go into the parts, then a rebuild.
- `store` (`3-data.js`) already wraps `localStorage` in try/catch, so blocked storage is safe today.

## Goals / Non-Goals

**Goals:**
- One place that says each level's permanent ID, written next to the level itself.
- Remove every "renumber" loop and every hand-patch of level text.
- A save format that `accounts-and-sync` can store as one row per level without change.

**Non-Goals:**
- Changing level order, titles or teaching content. Text changes only where a hand-written level number becomes a rendered reference.
- Linking to a level from the URL (deep links). IDs make this easy later, but it is not part of this change.
- Saving lab state.

## Decisions

### 1. IDs are topic slugs written on each level

Each level gets `id:"<slug>"` in its definition. Numeric `id` goes away. `n` (number in world) and a new `idx` (position in the full list) are worked out once, after the last splice.

*Why not `w0-moe` style (as CLAUDE.md once suggested)?* A world prefix breaks the moment a level moves world, which is exactly the case we're protecting against. The proposal already picked topic names.

*Why not a generated ID (random or hash)?* Unreadable in saves, tests and text references. Hand-written slugs are fine for 40 items.

Proposed IDs. **These are permanent once shipped, so the owner should check them before implementation starts.**

| v4 # | World · Level | Title | ID |
|---|---|---|---|
| 1 | 0 · 1 | Words into tokens | `tokens` |
| 2 | 0 · 2 | What's in 8 billion parameters | `parameters` |
| 3 | 0 · 3 | A team of experts | `moe-experts` |
| 4 | 0 · 4 | Who is "it"? | `attention` |
| 5 | 0 · 5 | Many heads, shared notes | `attention-heads` |
| 6 | 0 · 6 | One word at a time | `generation` |
| 7 | 0 · 7 | Notes to self | `kv-cache-basics` |
| 8 | 0 · 8 | Checkpoint: inside the model | `quiz-inside-model` |
| 9 | 1 · 1 | Meet the chip | `gpu-anatomy` |
| 10 | 1 · 2 | Will it fit? | `memory-fit` |
| 11 | 1 · 3 | Room to talk | `kv-cache-memory` |
| 12 | 1 · 4 | Fast chip, slow tokens | `memory-bandwidth` |
| 13 | 1 · 5 | Fill the factory | `batching` |
| 14 | 1 · 6 | Two speeds | `prefill-decode` |
| 15 | 1 · 7 | Long memories | `kv-quantisation` |
| 16 | 1 · 8 | Many experts | `moe-on-gpu` |
| 17 | 1 · 9 | Watts per token | `perf-per-watt` |
| 18 | 1 · 10 | Share the GPU | `gpu-sharing` |
| 19 | 1 · 11 | Team red | `amd-gpus` |
| 20 | 1 · 12 | Pick the GPU | `gpu-choice` |
| 21 | 1 · 13 | Checkpoint: one GPU | `quiz-one-gpu` |
| 22 | 2 · 1 | Follow one matmul | `software-path` |
| 23 | 2 · 2 | Waiting on the CPU | `launch-overhead` |
| 24 | 2 · 3 | The 32k prompt | `kernel-fusion` |
| 25 | 2 · 4 | Driver says no | `driver-stack` |
| 26 | 2 · 5 | Checkpoint: the software path | `quiz-software-path` |
| 27 | 3 · 1 | Meet the HGX board | `hgx-board` |
| 28 | 3 · 2 | Too big for one | `tensor-parallel` |
| 29 | 3 · 3 | The slow road | `nvlink-vs-pcie` |
| 30 | 3 · 4 | Shards or replicas? | `tp-vs-replicas` |
| 31 | 3 · 5 | Checkpoint: one server | `quiz-one-server` |
| 32 | 4 · 1 | Meet the fabric | `fabric` |
| 33 | 4 · 2 | Two boxes, one model | `multi-node` |
| 34 | 4 · 3 | Split the right way | `pipeline-parallel` |
| 35 | 4 · 4 | Train across racks | `data-parallel` |
| 36 | 4 · 5 | Checkpoint: the cluster | `quiz-cluster` |

Labs: `lab1` → `gpu-lab`, `lab2` → `kernel-lab`, `lab3` → `server-lab`, `lab4` → `cluster-lab`. The `LABS` object stays keyed by world number (`LABS[1]`) because the home screen finds "the lab for this world". The lab's `id` field holds the slug. Labs are never saved, so renaming them needs no conversion.

Checkpoints are named after the area they test, not "world 3 quiz", for the same reason as above.

### 2. One finalise step after all splices

A single `finaliseLevels()` runs once, after `5e-levels.js`, in a new small part (`5f-catalog.js`, added to `build.sh`). It:

1. checks every ID is present, well formed (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) and unique across levels and labs, and throws a clear error if not;
2. sets `idx` and `n` on every level;
3. builds `LEVEL_BY_ID` (a lookup from ID to level).

All the `forEach((l,i)=>{l.id=i+1})` and `cnt[...]` loops in `5b`–`5e` are deleted. The existing splices stay, but find their anchor level by ID instead of by title.

*Why a new part rather than putting it at the end of `5e`?* `5e` is "the MoE and heads levels". A separate part makes "levels are final from here on" obvious, and is the piece that becomes the catalog module in `modular-web-build`.

*Why throw at load instead of only in tests?* A duplicate ID would silently mix two levels' stars. Failing loudly is cheaper than a quiet data bug. The test suite will see the throw as a page error.

### 3. Cross-references use a `{{lvl:id}}` token

Level text writes `{{lvl:kv-cache-basics}}`. A `refs(html)` function replaces each token with "World 0, Level 7" (from `LEVEL_BY_ID`). An unknown ID becomes "another level". `refs()` is applied where text is rendered: brief, debrief, quiz `why`, hints, `links.up/down`, and terminal messages that name a level.

Every hand-written level number in level text is replaced by a token, and all `.replace(...)` patch code is deleted. Where the old text said a short "level 4" within the same world, the rendered text becomes the full "World 1, Level 4". This matches the writing-style rule and is the only intended text change.

The Compare panel's `lv()` helper and the `trace` error change from title lookup to ID lookup. Code that marks a level by title (`driverStart`) moves onto the level definition as a property.

*Why render at display time rather than once at load?* Both work today. Display time is simpler to reason about and still works when world packs load later in `modular-web-build`. The cost (a regex over a few KB of text) is negligible.

*Alternatives:* a function call in template strings (`${ref("x")}`) runs when the file loads, before later levels are spliced in, so numbers would be wrong. That's the bug class we are removing.

### 4. New save key and shape

```
key:   m2m-progress-v1
value: {"v":1,"stars":{"moe-experts":2,"prefill-decode":3}}
```

- `stars` only. No XP field (spec: XP is worked out from stars).
- Unknown IDs are kept as they are (spec). This also means a level removed and later restored gets its stars back, and a save written by a newer version isn't trimmed by an older one.
- New name, not `gf-progress-v5`: the product is Model to Metal now, and a fresh name makes the new format's start obvious. The `v` field inside the value handles future format changes, so the key itself should not need bumping again.

`progress` becomes `{v:1, stars:{}}` in memory. `xp()` and `doneCount()` are worked out from `stars` against `LEVEL_BY_ID` whenever the header updates.

*XP values.* XP is `stars × 50` for a normal level and `stars × 75` for a checkpoint quiz (150 and 225 for 3★).

*Why new values?* Today a normal level is worth 100 for 3★, so one star is 33.33 XP. The old running total rounded each improvement, so a player who went 1★ → 2★ → 3★ got 33 + 33 + 33 = 99, while a first-try 3★ got 100. Working XP out from stars with the old values would fix that but quietly shift some players by 1. Whole numbers per star remove rounding altogether. 75 for quizzes keeps today's 1.5× ratio between a quiz and a normal level.

*Alternatives:* keep 100/150 and accept ±1 drift (rejected: needs rounding forever); 50 per star everywhere (rejected: quizzes lose their bonus).

*Cost:* every player's XP number goes up (for example, 3★ on 10 normal levels goes from 1,000 to 1,500). Checked: nothing reads XP except the header display, so no unlocks or thresholds change.

### 5. One-time conversion from v4

On load:

1. If `m2m-progress-v1` exists and is the right shape → use it. Done.
2. Else if `gf-progress-v4` exists → convert with a **frozen** table `V4_IDS` (the 36 IDs in v4 order, from the table above) written out as a literal. For each `done[k]`: keep it if `k` is 1–36 and the stars are 1, 2 or 3. Write the new save.
3. Else → start empty.

The v4 save is never written or deleted.

*Why a frozen literal and not "the current list in v4 order"?* The current list will change. The conversion must keep meaning what v4 meant forever, so it can't depend on today's positions. A test checks that, right now, `V4_IDS[i]` matches `LEVELS[i].id` for every level, which proves the table was copied correctly. That test is expected to be removed or adjusted the first time a level is inserted.

*Why not delete the v4 save?* Rolling back to the old file would then find no progress. Leaving it costs a few hundred bytes.

*Reset:* writes `{"v":1,"stars":{}}`. Because the new key now exists, step 1 wins on reload, so v4 progress can't come back (spec: Reset clears progress for good).

### 6. Navigation by position

- `getLevel(id)`: `LEVEL_BY_ID[id]` or a lab with that ID. No `Number()`.
- "Next" and "Up next": `LEVELS[L.idx + 1]` and the first level with no stars, by list order.
- `data-level` attributes hold the slug.
- `loadLevel` accepts only IDs. The test is updated to iterate `LEVELS` and call `loadLevel(l.id)`.

## Risks / Trade-offs

- [A slug is chosen badly and can't be changed later] → The owner reviews the table above before apply. Slugs are invisible to players, so a slightly odd name costs nothing but neatness.
- [A hand-written level number is missed and stays wrong] → Tasks include a grep for `[Ll]evels? \d` across level text, and the test checks there are no leftover `{{lvl:` tokens in rendered output. Remaining numeric matches must be reviewed by hand (some are World numbers or layer numbers, not level refs).
- [`V4_IDS` copied wrong, so a player's stars land on the wrong level] → The test that compares `V4_IDS` to today's list, plus a conversion test with a known v4 save.
- [Players see their XP jump after the upgrade and wonder why] → Accepted. XP is only a score, and the jump is the same 1.5× for everyone, so the order between players doesn't change.
- [Two tabs open during the upgrade] → Both convert the same v4 save to the same result. Harmless.
- [`modular-web-build` and `accounts-and-sync` depend on these names] → Their proposals already name `level-catalog` and `player-progress`. The save shape `{v, stars:{id:n}}` maps directly to their planned `(user_id, level_id, stars)` row.

## Migration Plan

1. Ship the rebuilt `reference/model-to-metal.html`. Players' first load converts their v4 save automatically.
2. **Rollback:** put back the previous file. It reads `gf-progress-v4`, which was never touched, so players see their progress as of the upgrade. Stars earned after the upgrade are lost on rollback (they live only in `m2m-progress-v1`). Accepted for a prototype.
3. Update CLAUDE.md: the progress key, the "Level IDs are positional" known problem (now fixed), the level shape (`id` is a slug), and how to write cross-references.
