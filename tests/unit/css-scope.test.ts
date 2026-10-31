// Pack styles stay inside the pack (spec: world-packs). Every rule in a world's pack.css must start with
// #simCard[data-world="N"], so it can only reach that world's sim panel, never the header, mission panel or another
// world. @keyframes and @font-face are rejected: their names are page-wide, so a prefix can't contain them.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;

/** Every pack stylesheet, with its world number (from the folder name, e.g. w3-server → 3). */
const SHEETS = [
  ...readdirSync(join(ROOT, "src/packs")).map((d) => join("src/packs", d, "pack.css")),
  "tests/pack/w5-test/pack.css",
]
  .filter((f) => existsSync(join(ROOT, f)))
  .map((f) => ({ file: f, world: Number(/\/w(\d+)-/.exec(f)![1]) }));

/** What's wrong with one stylesheet: each unscoped selector or page-wide at-rule, by file and line. */
function scopeProblems(file: string, css: string, world: number): string[] {
  const prefix = `#simCard[data-world="${world}"]`;
  const problems: string[] = [];
  const root = postcss.parse(css, { from: file });
  root.walkAtRules((a) => {
    if (["keyframes", "font-face", "import"].includes(a.name))
      problems.push(`${file}:${a.source?.start?.line}: @${a.name} is page-wide; put it in core.css`);
  });
  root.walkRules((r) => {
    for (const s of r.selectors)
      if (!s.startsWith(prefix + " "))
        problems.push(`${file}:${r.source?.start?.line}: "${s}" doesn't start with ${prefix}`);
  });
  return problems;
}

describe("pack styles are scoped to their world's sim panel", () => {
  it("there are pack stylesheets to check", () => {
    expect(SHEETS.map((s) => s.file)).toContain("tests/pack/w5-test/pack.css");
    expect(SHEETS.length).toBeGreaterThan(1);
  });
  for (const { file, world } of SHEETS)
    it(file, () => expect(scopeProblems(file, readFileSync(join(ROOT, file), "utf8"), world)).toEqual([]));

  it("names the file and selector when a prefix is missing, wrong, or a page-wide rule sneaks in", () => {
    const css = `#simCard[data-world="1"] .ok { color: red }\n.xp { color: red }\n#simCard[data-world="2"] .x, #simCard[data-world="1"] .y { color: red }\n@keyframes spin { to { transform: rotate(1turn) } }`;
    expect(scopeProblems("src/packs/w1-gpu/pack.css", css, 1)).toEqual([
      "src/packs/w1-gpu/pack.css:4: @keyframes is page-wide; put it in core.css",
      'src/packs/w1-gpu/pack.css:2: ".xp" doesn\'t start with #simCard[data-world="1"]',
      'src/packs/w1-gpu/pack.css:3: "#simCard[data-world="2"] .x" doesn\'t start with #simCard[data-world="1"]',
      'src/packs/w1-gpu/pack.css:4: "to" doesn\'t start with #simCard[data-world="1"]',
    ]);
  });
});
