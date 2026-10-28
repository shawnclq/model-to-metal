// The world packs the game is made of, by world number. The core asks the open level's pack for anything
// world-specific: its starting state, sim panel, controls, commands, help and inspectable parts.
// Packs are downloaded on demand: loadPack(world) fetches one the first time a level of that world opens.
import { attachLevels } from "./catalog.ts";
import { MANIFEST } from "./manifest.ts";
import type { WorldPack } from "./types.ts";

const PACKS = new Map<number, WorldPack>();
// One promise per world, so a pack downloads at most once even if two levels are opened while it's on its way.
const LOADING = new Map<number, Promise<WorldPack>>();

export function registerPack(p: WorldPack) {
  // Its levels get their numbers from the manifest, and must match it (a mismatch stops here, loudly).
  attachLevels(p.world, p.levels);
  PACKS.set(p.world, p);
}

/** Download (once) and register a world's pack. A failed download is forgotten, so trying again really retries. */
export function loadPack(world: number): Promise<WorldPack> {
  let p = LOADING.get(world);
  if (!p) {
    const W = MANIFEST.find((x) => x.world === world);
    if (!W) return Promise.reject(new Error(`No World ${world} in the manifest`));
    p = W.load().then((m) => {
      registerPack(m.PACK);
      return m.PACK;
    });
    LOADING.set(world, p);
    p.catch(() => LOADING.delete(world));
  }
  return p;
}

/** The pack for a world, if it has been downloaded already. */
export function loadedPack(world: number): WorldPack | undefined {
  return PACKS.get(world);
}

/** Every downloaded pack, in world order. */
export function allPacks(): WorldPack[] {
  return [...PACKS.values()].sort((a, b) => a.world - b.world);
}

/** The pack for a world whose level is open (so it has been downloaded). */
export function packFor(world: number): WorldPack {
  const p = PACKS.get(world);
  if (!p) throw new Error(`No pack for World ${world}`);
  return p;
}
