# Web app ideas (prototype notes, not an agreed plan)

These notes came from the prototyping conversation, before OpenSpec was adopted. Use them as input when writing OpenSpec proposals. Nothing here is decided.

## Original outline

Turn the single HTML file into a proper web app **without changing how the game plays**:

1. A Vite + TypeScript project with the code split into modules, and level content as data.
2. **Stable level IDs** (see "Known problems" below), so adding a level never resets anyone's progress.
3. Sign-in and progress saved across devices (planned: Supabase Auth + Postgres), local-first with background sync, and anonymous play that merges into an account on sign-up.
4. Later: event logging (hints, wrong answers, drop-off), an "ask why" AI tutor through a server-side proxy to the Claude API (the API key must never reach the browser), and cohorts.

The simulation stays **entirely client-side**. It's arithmetic, not real GPU work, so it needs no server. The backend only stores identity, progress and events.

Suggested first session:

1. Read this file, then skim `reference/model-to-metal.html`, or the parts in `reference/source-parts/`, which are the same code before concatenation.
2. Set up the project and split the code into modules, keeping behaviour identical.
3. Port the headless playthrough test (`reference/tests/test2.js`) and make it pass against the new build before changing anything else.
4. Introduce stable level IDs and migrate the progress format.
5. Only then add auth and sync.

Ask the owner before choosing frameworks beyond Vite + TypeScript. Plain TypeScript modules with the existing string-template rendering are a fine first step. A UI framework is optional and not required.

