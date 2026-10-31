# Web app ideas (prototype notes, not an agreed plan)

These notes came from the prototyping conversation, before OpenSpec was adopted. Use them as input when writing OpenSpec proposals. Nothing here is decided.

## Original outline

Turn the single HTML file into a proper web app **without changing how the game plays**:

1. ~~A Vite + TypeScript project with the code split into modules, and level content as data.~~ **Done** by the `modular-web-build` change: `src/` is a Vite + TypeScript app split into a core, a shared layer and one pack per world. Levels stayed as small code objects rather than pure data, so the port kept today's behaviour (the parity test proves it).
2. ~~**Stable level IDs**~~ **Done** by the `stable-level-ids` change, so adding a level never resets anyone's progress.
3. Sign-in and progress saved across devices (planned: Supabase Auth + Postgres), local-first with background sync, and anonymous play that merges into an account on sign-up.
4. Later: event logging (hints, wrong answers, drop-off), an "ask why" AI tutor through a server-side proxy to the Claude API (the API key must never reach the browser), and cohorts.

The simulation stays **entirely client-side**. It's arithmetic, not real GPU work, so it needs no server. The backend only stores identity, progress and events.

Suggested first session:

1. Read this file, then skim `reference/model-to-metal.html`, or the parts in `reference/source-parts/`, which are the same code before concatenation. *(Now: read `CLAUDE.md` and `src/` instead; `reference/` is frozen.)*
2. ~~Set up the project and split the code into modules, keeping behaviour identical.~~ Done (`modular-web-build`).
3. ~~Port the headless playthrough test (`reference/tests/test2.js`) and make it pass against the new build before changing anything else.~~ Done: it became the recorded parity test and the Vitest checks (`npm run check`).
4. ~~Introduce stable level IDs and migrate the progress format.~~ Done (`stable-level-ids`).
5. Only then add auth and sync. *(Next: the `accounts-and-sync` change.)*

Ask the owner before choosing frameworks beyond Vite + TypeScript. Plain TypeScript modules with the existing string-template rendering are a fine first step. A UI framework is optional and not required.

