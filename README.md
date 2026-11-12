# Model to Metal

A game that teaches the GenAI infrastructure stack, from inside the model down to GPU clusters. Each level has a goal, a live simulation and a fake terminal. You type commands such as `foundry gpu h200` and watch the numbers change.

It is written for a product manager learning this material: plain language, one idea at a time, and every number on screen comes from a real formula.

## Run it

You need Node 20 or newer.

```sh
npm install
npm run dev
```

Open the address Vite prints (normally http://localhost:5173) and pick a level.

## Check it

```sh
npx playwright install chromium   # once
npm run check
```

`npm run check` type-checks, runs the unit tests, builds, then plays the whole game in a browser and compares it with the recorded play-through in `tests/parity/reference.json`, plus screenshots and loading tests. CI runs the same command on every push.

## Where things are

- `src/core/` is the app shell, `src/shared/` is code every world uses, and `src/packs/` has one folder per world, loaded when you open a level in it.
- `reference/` is the original single-file version. It is frozen and only used to record what the game should show.
- `CLAUDE.md` explains the layout, how to add a world, and the testing rules. `openspec/` holds the change proposals.
