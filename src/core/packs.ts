// The world packs the game is made of, by world number. The core asks the open level's pack for anything
// world-specific: its starting state, sim panel, controls, commands, help and inspectable parts.
import type { WorldPack } from "./types.ts";

const PACKS = new Map<number, WorldPack>();

export function registerPack(p: WorldPack) {
  PACKS.set(p.world, p);
}

/** Every registered pack, in world order. */
export function allPacks(): WorldPack[] {
  return [...PACKS.values()].sort((a, b) => a.world - b.world);
}

export function packFor(world: number): WorldPack {
  const p = PACKS.get(world);
  if (!p) throw new Error(`No pack for World ${world}`);
  return p;
}
