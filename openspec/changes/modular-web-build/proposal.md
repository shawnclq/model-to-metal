# Proposal

## Why

The game is one 2,700-line HTML file, with every function and constant in one shared global scope and hidden links between files. That's fine for a prototype, but not for a web app that will add sign-in, sync, and paid content, and will keep growing by adding worlds (Kubernetes, serving, and more) along the same model-to-metal path. Adding a world today means editing code all over the file.

## What Changes

- Move to a Vite + TypeScript project. The game must **play exactly the same**: same levels, text, numbers, and look.
- Split the code into a **core** plus **world packs**:
  - The core holds the terminal, level runner, goals and stars, progress, home screen, theme and Compare modal. It rarely changes.
  - Each world pack holds its own levels, math, sim panels and terminal commands. Adding a world means adding a pack, without editing the core.
  - Shared reference data (GPUs, models, number formats, glossary) lives in one place that any pack can use.
- Each world is its own code bundle, **loaded on demand** when the player opens that world. The home screen only needs a small list of every level's ID, title and world, so it shows all worlds and stars without loading any of them. Later, paid worlds can then be sent from the server only to subscribers, without a rewrite. (This change only prepares for that. It doesn't build paywalls.)
- Levels stay as code (their goal checks and setup are small functions), not rewritten as pure data. This keeps the port close to today's behaviour.
- The build is a normal static website. No single-file version is produced; `reference/` keeps the old single file.
- Component CSS is scoped, so class names in one pack can't break another. An example of the problem: the MoE grid's `.xp` class once broke the header XP pill.
- Port the jsdom playthrough test and the Playwright screenshots, and make them pass against the new build before anything else changes.
- The single file in `reference/` stays as the reference for behaviour until this change is done.

## Capabilities

### New Capabilities
- `world-packs`: what a world pack must provide (levels, panels, controls, commands, help text) and how the core finds and loads packs, in world order, as one model-to-metal path.

### Modified Capabilities
- None. Gameplay behaviour is unchanged; `level-catalog` and `player-progress` (from `stable-level-ids`) carry over as they are.

## Impact

- New project files (`package.json`, Vite config, `src/`). `reference/` is kept, not deleted.
- Tests move into the new project and run before every commit.
- Depends on `stable-level-ids` being done first.
- Out of scope: sign-in, sync, payments, new content, and UI frameworks. Plain TypeScript modules with the existing string-template rendering are enough; adding a UI framework would need the owner's approval.
