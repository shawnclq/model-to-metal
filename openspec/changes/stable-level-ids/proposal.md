# Proposal

## Why

Saved progress is keyed by a level's position in the list. Adding or moving a level shifts every number after it, so old saves point at the wrong levels. Each time, the save key was bumped (now `gf-progress-v4`), which wiped everyone's progress. This has to be fixed before progress is stored in a cloud database (see `accounts-and-sync`), where changing what IDs mean would be much harder.

## What Changes

- Every level and lab gets a permanent ID named after **what it teaches** (for example `moe-experts`), not its world or position. A level's ID never changes, even if it moves to another world.
- "World X, Level N" numbers stay, but are only for display. They are worked out from the level's position when the game loads.
- Progress is saved by permanent ID under a new save key.
- **BREAKING (save format):** a one-time conversion reads any existing `gf-progress-v4` save, maps each old number to its permanent ID, and writes the new format. No player loses progress.
- XP is **calculated from stars** instead of stored as a running total. Players see the same XP as today. This prepares for merging saves from two devices without counting XP twice.
- Text that points at another level ("see level 11") refers to it by ID and is turned into "World X, Level N" when shown. This replaces the hand-patched text in the level files.

## Capabilities

### New Capabilities
- `level-catalog`: how levels are identified (permanent topic IDs), how display numbers are worked out from position, and how levels refer to each other.
- `player-progress`: what a save contains (stars per level ID), how XP is calculated from stars, and how older save formats are converted.

### Modified Capabilities
- None (no specs exist yet).

## Impact

- `reference/model-to-metal.html` and its parts in `reference/source-parts/`: level definitions (`5-levels.js` to `5e-levels.js`), progress code in `7-app.js`, and level cross-references.
- `reference/tests/test2.js`: add checks that a v4 save converts correctly and that inserting a level doesn't change other levels' saved stars.
- Done on today's single file, so current players benefit straight away. The ID list and the save conversion carry over unchanged into `modular-web-build`.
- Out of scope: cloud saves, sign-in, and splitting the code into modules.
