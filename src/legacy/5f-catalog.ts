import { LABS, LEVELS } from "./5-levels.ts";
import type { Level, LevelDef } from "./types.ts";
/* ============ level catalog: runs once, after every level file has spliced its levels in ============ */
/* IDs are permanent topic slugs. Display numbers (n) and list position (idx) are worked out here, never stored. */
export const LEVEL_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A Map, not a plain object, so an ID like "constructor" can't hit Object.prototype.
export let LEVEL_BY_ID = new Map<string, Level>();
export function finaliseLevels() {
  const bad: string[] = [],
    seen = new Map<string, string>();
  const check = (x: LevelDef, where: string) => {
    if (typeof x.id !== "string" || !LEVEL_ID_RE.test(x.id))
      bad.push(`${where} "${x.title}" has a badly formed ID: ${JSON.stringify(x.id)}`);
    else if (seen.has(x.id)) bad.push(`Duplicate ID "${x.id}": "${seen.get(x.id)}" and "${x.title}"`);
    else seen.set(x.id, x.title);
  };
  LEVELS.forEach((l) => check(l, "Level"));
  Object.values(LABS).forEach((l) => check(l, "Lab"));
  // Fail loudly: a duplicate would silently share one set of saved stars between two levels.
  if (bad.length) throw new Error("Level catalog: " + bad.join("; "));
  const cnt: Record<number, number> = {};
  LEVEL_BY_ID = new Map<string, Level>();
  LEVELS.forEach((l, i) => {
    l.idx = i;
    cnt[l.world] = (cnt[l.world] || 0) + 1;
    l.n = cnt[l.world];
    LEVEL_BY_ID.set(l.id, l);
  });
}
finaliseLevels();
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
