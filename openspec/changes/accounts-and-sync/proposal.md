# Proposal

## Why

Model to Metal will be a public web app. Progress today lives in one browser only, so it's lost if a player switches device or clears storage. Players need optional accounts so progress follows them. That account layer is also the base for later work: subscriptions (Worlds 0 and 1 free, later worlds plus extras paid), an AI tutor, and maybe groups.

## What Changes

- **Play without an account stays the default.** Anyone can open the game and play straight away, as today.
- Optional **sign-in with Google**, using Supabase Auth. A player who started anonymously keeps their progress when they sign in.
- **Local-first sync:**
  - Every save goes to the browser first. The game never waits on the network and still works offline.
  - When the player is signed in, saves are sent to the cloud in the background.
- **Merge rule:** progress only goes up, so merging two saves keeps the higher star count for each level. XP is calculated from the merged stars, so it can't be counted twice.
- A Supabase Postgres table stores one row per player per level (`user_id`, `level_id`, `stars`). Database row rules make sure players can only read and write their own rows.
- Deploy the static site to Vercel from GitHub, with a preview link for each change.

## Capabilities

### New Capabilities
- `player-accounts`: anonymous play, Google sign-in, sign-out, and keeping anonymous progress when signing in.
- `progress-sync`: local-first saving, background upload, the keep-the-higher-stars merge rule, and behaviour when offline or signed out.

### Modified Capabilities
- `player-progress` (created by `stable-level-ids`): saves can now also live in the cloud, and the merge rule applies when two copies exist.

## Impact

- New dependency: the Supabase JS client. New Supabase project with Google sign-in set up (a Google Cloud OAuth client).
- New Vercel project; the repo must be on GitHub.
- A privacy note is needed, because the app now stores account data.
- Depends on `stable-level-ids` and `modular-web-build`.
- Out of scope, kept for later proposals: payments and subscriptions, sending paid worlds from the server, the AI tutor and its usage caps, analytics events, and groups.
