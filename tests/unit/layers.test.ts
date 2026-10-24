// The layering the design depends on (design.md, Decisions 1–3):
// - shared code never loads the core or a pack (it reaches the running game through src/shared/host.ts);
// - a pack never loads the core (types only) or another pack;
// - the core loads packs only from the manifest (guard answers) and start-up.
// Breaking these would let a pack's code end up in the always-loaded bundle, or change the order modules run in.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = normalize(join(dirname(new URL(import.meta.url).pathname), "../../src"));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const imports = files(SRC).flatMap((f) => {
  const from = relative(SRC, f);
  return [...readFileSync(f, "utf8").matchAll(/^import (type )?[^;]*? from "(\.[^"]+)";/gm)].map((m) => ({
    from,
    to: relative(SRC, normalize(join(dirname(f), m[2]))),
    typeOnly: !!m[1],
  }));
});
const top = (p: string) => p.split("/")[0];

describe("layers", () => {
  it("shared code never loads the core or a pack", () => {
    const bad = imports.filter((i) => top(i.from) === "shared" && ["core", "packs"].includes(top(i.to)) && !i.typeOnly);
    expect(bad).toEqual([]);
  });
  it("a pack loads only shared code, its own files, and core types", () => {
    const bad = imports.filter(
      (i) =>
        top(i.from) === "packs" &&
        ((top(i.to) === "core" && !i.typeOnly) ||
          (top(i.to) === "packs" && i.to.split("/")[1] !== i.from.split("/")[1])),
    );
    expect(bad).toEqual([]);
  });
  it("the core loads packs only from the manifest and start-up", () => {
    const bad = imports.filter(
      (i) => top(i.from) === "core" && top(i.to) === "packs" && !["core/boot.ts", "core/manifest.ts"].includes(i.from),
    );
    expect(bad).toEqual([]);
  });
  it("the manifest loads only each pack's guard answers", () => {
    const bad = imports.filter(
      (i) => i.from === "core/manifest.ts" && top(i.to) === "packs" && !i.to.endsWith("/guards.ts"),
    );
    expect(bad).toEqual([]);
  });
});
