// The layering the design depends on (design.md, Decisions 1–3):
// - shared code never loads the core or a pack (it reaches the running game through src/shared/host.ts);
// - a pack never loads the core (types only) or another pack;
// - the core loads packs only from the manifest: guard answers up front, the rest on demand (import()).
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
  const src = readFileSync(f, "utf8");
  const to = (spec: string) => relative(SRC, normalize(join(dirname(f), spec)));
  return [
    ...[...src.matchAll(/^import (type )?[^;]*? from "(\.[^"]+)";/gm)].map((m) => ({
      from,
      to: to(m[2]),
      typeOnly: !!m[1],
      dynamic: false,
    })),
    ...[...src.matchAll(/\bimport\("(\.[^"]+)"\)/g)].map((m) => ({
      from,
      to: to(m[1]),
      typeOnly: false,
      dynamic: true,
    })),
  ];
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
  it("the core loads packs only from the manifest", () => {
    const bad = imports.filter((i) => top(i.from) === "core" && top(i.to) === "packs" && i.from !== "core/manifest.ts");
    expect(bad).toEqual([]);
  });
  it("the manifest loads each pack's guard answers up front, and the rest of the pack only on demand", () => {
    const packImports = imports.filter((i) => i.from === "core/manifest.ts" && top(i.to) === "packs");
    const bad = packImports.filter((i) => (i.dynamic ? !i.to.endsWith("/index.ts") : !i.to.endsWith("/guards.ts")));
    expect(bad).toEqual([]);
    expect(packImports.filter((i) => i.dynamic)).toHaveLength(readdirSync(join(SRC, "packs")).length);
  });
  it("nothing outside the manifest loads a pack on demand", () => {
    expect(imports.filter((i) => i.dynamic && i.from !== "core/manifest.ts")).toEqual([]);
  });
  it("the core and shared code know nothing of the test-only world (it is added from tests/pack)", () => {
    const bad = files(SRC).filter((f) => /w5-test|test-ping|tests\/pack/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
