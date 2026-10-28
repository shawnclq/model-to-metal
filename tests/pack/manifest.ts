// The test manifest: the real list of worlds plus the test pack, added at start-up before the game boots.
// This is the "one entry in the list of worlds" a new world needs; the core itself is untouched.
import { MANIFEST } from "../../src/core/manifest.ts";

MANIFEST.push({
  world: 5,
  load: () => import("./w5-test/index.ts"),
  heading: "World 5 · Test pack",
  blurb: "Only in tests: proves a world can be added by a pack.",
  levels: [{ id: "test-ping", title: "Ping the test pack", concept: "A world added by a pack" }],
});
