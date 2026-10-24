/* ============ level catalog: permanent IDs, display numbers, level references ============ */
/* IDs are permanent topic slugs. Display numbers (n) and list position (idx) are worked out here from the
   manifest, never stored. Everything here works before any world's pack is loaded. */
import { MANIFEST, type LevelInfo } from "./manifest.ts";

/** A level as the catalog knows it: manifest facts plus its position and number within its world. */
export interface CatalogEntry extends LevelInfo {
  world: number;
  idx: number; // position in the whole game, 0-based
  n: number; // number within its world, 1-based
}

export const LEVEL_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export let CATALOG: CatalogEntry[] = [];
// A Map, not a plain object, so an ID like "constructor" can't hit Object.prototype.
export let LEVEL_BY_ID = new Map<string, CatalogEntry>();

export function finaliseLevels() {
  const bad: string[] = [],
    seen = new Map<string, string>();
  const check = (x: { id: string; title: string }, where: string) => {
    if (typeof x.id !== "string" || !LEVEL_ID_RE.test(x.id))
      bad.push(`${where} "${x.title}" has a badly formed ID: ${JSON.stringify(x.id)}`);
    else if (seen.has(x.id)) bad.push(`Duplicate ID "${x.id}": "${seen.get(x.id)}" and "${x.title}"`);
    else seen.set(x.id, x.title);
  };
  MANIFEST.forEach((W) => W.levels.forEach((l) => check(l, "Level")));
  MANIFEST.forEach((W) => W.lab && check(W.lab, "Lab"));
  // Fail loudly: a duplicate would silently share one set of saved stars between two levels.
  if (bad.length) throw new Error("Level catalog: " + bad.join("; "));
  const all: CatalogEntry[] = [];
  MANIFEST.forEach((W) => W.levels.forEach((l, i) => all.push({ ...l, world: W.world, idx: all.length, n: i + 1 })));
  CATALOG = all;
  LEVEL_BY_ID = new Map(all.map((e) => [e.id, e]));
}

/** How a world's levels differ from its manifest entry: missing, extra, renamed, reordered or a wrong quiz flag. */
export function levelMismatches(
  world: number,
  levels: { id: string; title: string; concept: string; quiz?: boolean }[],
): string[] {
  const W = MANIFEST.find((m) => m.world === world);
  if (!W) return [`World ${world} is not in the manifest`];
  const out: string[] = [];
  const want = W.levels.map((l) => l.id),
    got = levels.map((l) => l.id);
  for (const id of want)
    if (!got.includes(id)) out.push(`World ${world}: level "${id}" is in the manifest but not in the pack`);
  for (const id of got)
    if (!want.includes(id)) out.push(`World ${world}: level "${id}" is in the pack but not in the manifest`);
  if (!out.length && want.join() !== got.join())
    out.push(`World ${world}: levels are in a different order (${got.join(", ")})`);
  for (const l of levels) {
    const m = W.levels.find((x) => x.id === l.id);
    if (!m) continue;
    if (m.title !== l.title)
      out.push(`World ${world}: level "${l.id}" is titled "${l.title}" but "${m.title}" in the manifest`);
    if (m.concept !== l.concept)
      out.push(`World ${world}: level "${l.id}" has concept "${l.concept}" but "${m.concept}" in the manifest`);
    if (!!m.quiz !== !!l.quiz)
      out.push(`World ${world}: level "${l.id}" ${l.quiz ? "is" : "is not"} a quiz, unlike the manifest`);
  }
  return out;
}

/** Give a world's full levels their position and number; fail loudly if they don't match the manifest. */
export function attachLevels(
  world: number,
  levels: { id: string; title: string; concept: string; quiz?: boolean; idx?: number; n?: number }[],
) {
  const problems = levelMismatches(world, levels);
  if (problems.length) throw new Error("Level catalog: " + problems.join("; "));
  for (const l of levels) {
    const e = LEVEL_BY_ID.get(l.id)!;
    l.idx = e.idx;
    l.n = e.n;
  }
}

/* Level text points at other levels as {{lvl:<id>}}. Rendered at display time so it always shows the current numbers. */
export const LVL_REF_RE = /\{\{lvl:([^}]*)\}\}/g;
export function refs(s: string): string;
export function refs(s: string | undefined): string | undefined;
export function refs(s: string | undefined) {
  if (typeof s !== "string") return s;
  // An unknown ID degrades to plain words rather than a crash; the test suite catches it before release.
  return s.replace(LVL_REF_RE, (m, id: string) => {
    const l = LEVEL_BY_ID.get(id);
    return l ? `World ${l.world}, Level ${l.n}` : "another level";
  });
}
