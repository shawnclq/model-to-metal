// Style parity: every visible element's computed style must match the reference after every step of the parity
// script (spec: looks the same). Screenshots cover a few screens; this covers every panel and state the script
// reaches, which is what proves moving style rules into world packs (and prefixing them) changed nothing.
//
// The reference and the build play side by side and meet after each step. On the first difference both pages are
// still on that step, so the failure names the element and the properties that differ.
import { test, expect, type Page } from "@playwright/test";
import { openTarget, type Target } from "../targets.ts";
import { playScript, prepare } from "../parity/record.ts";
import { SCRIPT } from "../parity/script.ts";

const target = (process.env.VISUAL_TARGET ?? "build") as Target;

// The properties that decide how something looks. Reading all ~500 after each of ~800 steps is too slow.
const PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "float",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "color",
  "background-color",
  "background-image",
  "opacity",
  "visibility",
  "box-shadow",
  "outline-style",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "white-space",
  "overflow-x",
  "overflow-y",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "align-items",
  "justify-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column-start",
  "grid-column-end",
  "transform",
  "cursor",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "content",
];

/** Each visible element by its place in the page, with its looks as one string. */
function snapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate((PROPS) => {
    const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "TITLE"]); // the reference sits in <body>, head tags too
    const out: Record<string, string> = {};
    const walk = (el: Element, path: string) => {
      const seen: Record<string, number> = {}; // numbered among same-tag siblings
      for (const c of el.children) {
        if (SKIP.has(c.tagName)) continue;
        const p = `${path} > ${c.tagName.toLowerCase()}${c.id ? "#" + c.id : ""}${c.getAttribute("class") ? "." + c.getAttribute("class")!.trim().replace(/\s+/g, ".") : ""}:${(seen[c.tagName] = (seen[c.tagName] ?? -1) + 1)}`;
        const cs = getComputedStyle(c);
        if (cs.display === "none") continue; // hidden parts can't be seen, and the subtree is skipped too
        out[p] = PROPS.map((k) => cs.getPropertyValue(k)).join("|");
        walk(c, p);
      }
    };
    walk(document.body, "body");
    return out;
  }, PROPS);
}

/** Where two snapshots differ: the first few elements, with each differing property. */
function differences(a: Record<string, string>, b: Record<string, string>): string[] {
  const out: string[] = [];
  for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[p] === b[p]) continue;
    if (!(p in a) || !(p in b)) out.push(`${p}: shown only in ${p in a ? "the reference" : target}`);
    else {
      const [x, y] = [a[p].split("|"), b[p].split("|")];
      out.push(`${p}: ` + PROPS.flatMap((k, i) => (x[i] === y[i] ? [] : [`${k} ${x[i]} → ${y[i]}`])).join("; "));
    }
    if (out.length === 5) break;
  }
  return out;
}

test(`styles: ${target} computes the same styles as the reference at every step`, async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const open = async (side: Target) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await prepare(page);
    await openTarget(page, side);
    return page;
  };
  const [ref, tgt] = [await open("reference"), await open(target)];

  // Meet after every step: whichever side arrives second compares, then releases the other.
  let waiting: { snap: Record<string, string>; go: (e?: Error) => void } | null = null;
  let steps = 0;
  const meet = (page: Page) => async (scene: string, step: string) => {
    const snap = await snapshot(page);
    if (!waiting) {
      await new Promise<void>((res, rej) => (waiting = { snap, go: (e) => (e ? rej(e) : res()) }));
      return;
    }
    const other = waiting as { snap: Record<string, string>; go: (e?: Error) => void };
    waiting = null;
    steps++;
    const [a, b] = page === ref ? [snap, other.snap] : [other.snap, snap];
    const diff = differences(a, b);
    const e = diff.length ? new Error(`Styles differ after "${scene} | ${step}":\n  ${diff.join("\n  ")}`) : undefined;
    other.go(e);
    if (e) throw e;
  };
  await Promise.all([playScript(ref, SCRIPT, meet(ref)), playScript(tgt, SCRIPT, meet(tgt))]);
  expect(steps).toBe(SCRIPT.reduce((n, s) => n + s.steps.length, 0));
});
