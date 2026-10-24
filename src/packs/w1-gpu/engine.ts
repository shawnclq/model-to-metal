import type { W1State } from "../../core/types.ts";
import { MIGP, TENANTS } from "./data.ts";
// World 1's maths beyond the shared single-GPU model: fitting MIG instances and teams onto one H100.
export function migCheck(list: string[]) {
  let c = 0,
    m = 0;
  for (const p of list) {
    const x = MIGP[p];
    if (!x) return { ok: false, why: `unknown profile "${p}"` };
    c += x.c;
    m += x.m;
  }
  if (c > 7) return { ok: false, why: `needs ${c} compute slices; an H100 has 7` };
  if (m > 8) return { ok: false, why: `needs ${m} memory slices (${m * 10} GB); an H100 has 8 (80 GB)` };
  return { ok: true, c, m };
}
export function migAssign(S: W1State) {
  const inst = S.mig.inst.map((p, i) => ({ p, i, gb: MIGP[p].gb * 0.97, used: null as string | null }));
  const res = TENANTS.map((t) => ({ t, inst: null as (typeof inst)[number] | null }));
  [...res]
    .sort((a, b) => b.t.need - a.t.need)
    .forEach((r) => {
      const c = inst.filter((x) => !x.used && x.gb >= r.t.need).sort((a, b) => a.gb - b.gb)[0];
      if (c) {
        c.used = r.t.n;
        r.inst = c;
      }
    });
  return { res, inst, all: res.every((r) => r.inst) };
}
