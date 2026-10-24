// The pass/fail checks from reference/tests/test2.js, run against the ported modules (task 3.5).
// Specs: level-catalog, player-progress. The full playthrough itself is covered by the parity test.
//
// Each boot() is a fresh "page load": a new jsdom page holding index.html, and a fresh copy of the game modules,
// so saving and reloading can be tested exactly like a player reloading the page.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const INDEX = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const NEW = "m2m-progress-v1";
const V4 = "gf-progress-v4";

type App = typeof import("../../src/core/levels.ts") &
  typeof import("../../src/core/state.ts") &
  typeof import("../../src/core/terminal.ts") &
  typeof import("../../src/core/home.ts") &
  typeof import("../../src/core/progress.ts");
type Catalog = typeof import("../../src/core/catalog.ts");
type Manifest = typeof import("../../src/core/manifest.ts");
interface Page {
  dom: JSDOM;
  app: App;
  catalog: Catalog;
  manifest: Manifest;
  $: (s: string) => HTMLElement;
  storage: () => Record<string, string | null>;
}

const GLOBALS = ["window", "document", "localStorage", "HTMLElement", "Element"] as const;
const saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
// The game starts timers (the chip flicker, animations). On a fake clock they never fire after a test has
// finished and its page is gone; on the real clock a late tick can fail the run on a slow machine (CI).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const k of GLOBALS) {
    const d = saved[k];
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
});

/** Load the game into a fresh page. `seed` runs first, e.g. to put a save in localStorage or block storage. */
async function boot(seed?: Record<string, string>, opts: { blockStorage?: boolean } = {}): Promise<Page> {
  const dom = new JSDOM(INDEX, { url: "https://m2m.test/", pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addListener() {},
    removeListener() {},
  })) as unknown as typeof w.matchMedia;
  for (const [k, v] of Object.entries(seed ?? {})) w.localStorage.setItem(k, v);
  const define = (k: string, get: () => unknown) => Object.defineProperty(globalThis, k, { configurable: true, get });
  define("window", () => w);
  define("document", () => w.document);
  define("HTMLElement", () => w.HTMLElement);
  define("Element", () => w.Element);
  define("localStorage", () => {
    if (opts.blockStorage) throw new w.DOMException("The operation is insecure.", "SecurityError");
    return w.localStorage;
  });
  vi.resetModules(); // a fresh copy of every module, like a page reload
  await import("../../src/main.ts");
  // The game's functions now live in several core modules; gather the ones these checks use.
  const app = {
    ...(await import("../../src/core/levels.ts")),
    ...(await import("../../src/core/state.ts")),
    ...(await import("../../src/core/terminal.ts")),
    ...(await import("../../src/core/home.ts")),
    ...(await import("../../src/core/progress.ts")),
  } as App;
  const catalog = await import("../../src/core/catalog.ts");
  const manifest = await import("../../src/core/manifest.ts");
  const storage = () => ({ [NEW]: w.localStorage.getItem(NEW), [V4]: w.localStorage.getItem(V4) });
  return { dom, app, catalog, manifest, $: (s) => w.document.querySelector<HTMLElement>(s)!, storage };
}

const xp = (p: Page) => Number(p.$("#xpNum").textContent);
const savedStars = (p: Page) => JSON.parse(p.storage()[NEW] ?? "null");
/** Stars the home screen shows on one level: lit ★ minus greyed-out ones. */
const shown = (p: Page, id: string) => {
  const b = p.$(`#piers [data-level="${id}"]`)?.querySelector<HTMLElement>(".stars");
  if (!b) return -1;
  const off = [...b.querySelectorAll(".off")].reduce((t, x) => t + (x.textContent ?? "").length, 0);
  return (b.textContent ?? "").length - off;
};

describe("level catalog", () => {
  it("every level and lab ID is a kebab-case slug, and IDs are unique", async () => {
    const p = await boot();
    const ids = p.manifest.MANIFEST.flatMap((W) => [...W.levels.map((l) => l.id), ...(W.lab ? [W.lab.id] : [])]);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("display numbers restart at 1 in each world, and idx is the list position", async () => {
    const p = await boot();
    for (const W of p.manifest.MANIFEST)
      p.catalog.CATALOG.filter((l) => l.world === W.world).forEach((l, i) => expect(l.n).toBe(i + 1));
    p.catalog.CATALOG.forEach((l, i) => expect(l.idx).toBe(i));
    // the full level objects carry the same numbers
    p.app
      .allLevels()
      .forEach((l) =>
        expect([l.idx, l.n]).toEqual([p.catalog.LEVEL_BY_ID.get(l.id)!.idx, p.catalog.LEVEL_BY_ID.get(l.id)!.n]),
      );
  });
  it("a duplicate ID stops loading with a clear error", async () => {
    const p = await boot();
    p.manifest.MANIFEST[1].levels.push({ ...p.manifest.MANIFEST[1].levels[4], id: "tokens" });
    expect(() => p.catalog.finaliseLevels()).toThrow(/Duplicate ID "tokens"/);
  });
  it("a badly formed ID stops loading with a clear error", async () => {
    const p = await boot();
    p.manifest.MANIFEST[1].levels[4].id = "Fill The Factory";
    expect(() => p.catalog.finaliseLevels()).toThrow(/badly formed ID: "Fill The Factory"/);
  });
});

describe("level references", () => {
  it("renders a known reference as World X, Level N and an unknown one as plain words", async () => {
    const p = await boot();
    expect(p.catalog.refs("see {{lvl:moe-experts}}.")).toBe("see World 0, Level 3.");
    expect(p.catalog.refs("see {{lvl:no-such-level}}.")).toBe("see another level.");
  });
  it("every {{lvl:...}} reference in level text names a real level", async () => {
    const p = await boot();
    const bad: string[] = [];
    const walk = (v: unknown, id: string): void => {
      if (typeof v === "string")
        for (const m of v.matchAll(p.catalog.LVL_REF_RE))
          if (!p.catalog.LEVEL_BY_ID.has(m[1])) bad.push(`${id} → ${m[1]}`);
      if (Array.isArray(v)) v.forEach((x) => walk(x, id));
      else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, id));
    };
    [...p.app.allLevels(), ...p.app.allLabs()].forEach((l) => walk(l, l.id));
    expect(bad).toEqual([]);
  });
  it("no raw {{lvl: token reaches the page, in any level, hint, quiz or debrief", async () => {
    const p = await boot();
    const left: string[] = [];
    for (const L of p.app.allLevels()) {
      p.app.loadLevel(L.id);
      if (!L.quiz) while (!p.$("#hintBtn").hidden) p.app.showHint();
      p.app.win(3);
      if (L.quiz) {
        L.questions!.forEach((q, i) => p.app.G.quizState!.picked[i].push(q.a));
        p.app.renderQuiz();
      }
      if (p.dom.window.document.body.innerHTML.includes("{{lvl:")) left.push(L.id);
    }
    p.app.loadLevel("gpu-anatomy");
    p.app.run("help");
    if (p.app.OUT.some((o) => o.t.includes("{{lvl:"))) left.push("help text");
    expect(left).toEqual([]);
  });
  it("the attention debrief points at the KV-cache level by its current number", async () => {
    const p = await boot();
    p.app.loadLevel("attention");
    p.app.win(3);
    expect(p.$("#dBody").textContent).toContain("(World 0, Level 7)");
  });
  it("the trace error names the level by its current number", async () => {
    const p = await boot();
    p.app.loadLevel("launch-overhead");
    p.app.run("foundry trace");
    expect(p.app.OUT[p.app.OUT.length - 1].t).toContain("World 2, Level 1 and the kernel lab");
  });
});

describe("navigation", () => {
  it("clicking a level on the home screen opens it; lab buttons carry lab IDs", async () => {
    const p = await boot();
    p.app.show("home");
    p.$('#piers [data-level="moe-on-gpu"]').click();
    expect(p.app.G.level?.id).toBe("moe-on-gpu");
    expect([...p.dom.window.document.querySelectorAll<HTMLElement>("#piers .lab")].map((b) => b.dataset.level)).toEqual(
      ["gpu-lab", "kernel-lab", "server-lab", "cluster-lab"],
    );
  });
  it("Next follows list order across worlds, and is hidden after the last level", async () => {
    const p = await boot();
    p.app.loadLevel("quiz-inside-model");
    p.app.win(3);
    expect(p.$("#dNext").hidden).toBe(false);
    expect(p.$("#dNext").textContent).toBe("Next: Meet the chip");
    p.$("#dNext").click();
    expect(p.app.G.level?.id).toBe("gpu-anatomy");
    p.app.loadLevel(p.app.allLevels()[p.app.allLevels().length - 1].id);
    p.app.win(3);
    expect(p.$("#dNext").hidden).toBe(true);
  });
  it("Compare panel links use real IDs and current numbers", async () => {
    const p = await boot();
    (await import("../../src/core/compare.ts")).renderCompare();
    const links = [...p.dom.window.document.querySelectorAll<HTMLElement>("#cmpBody .lvlink")];
    expect(links.length).toBe(6);
    for (const b of links) {
      const l = p.catalog.LEVEL_BY_ID.get(b.dataset.level!);
      expect(l && `W${l.world}·L${l.n}`).toBe(b.textContent);
    }
  });
});

describe("saved progress", () => {
  it("winning saves stars by level ID, and stars and XP survive a reload", async () => {
    let p = await boot();
    p.app.loadLevel("moe-experts");
    p.app.win(2);
    expect(savedStars(p)).toEqual({ v: 1, stars: { "moe-experts": 2 } });
    p = await boot({ [NEW]: p.storage()[NEW]! });
    p.app.show("home");
    expect(shown(p, "moe-experts")).toBe(2);
    expect(xp(p)).toBe(100);
  });
  it("a v4 save converts by the frozen table, shows on the right levels, and is left unchanged", async () => {
    const v4 = '{"xp":0,"done":{"3":2,"14":3,"99":3,"5":7}}';
    const p = await boot({ [V4]: v4 });
    p.app.show("home");
    expect(savedStars(p).stars).toEqual({ "moe-experts": 2, "prefill-decode": 3 });
    expect([shown(p, "moe-experts"), shown(p, "prefill-decode"), shown(p, "attention-heads")]).toEqual([2, 3, 0]);
    expect(p.storage()[V4]).toBe(v4);
  });
  it("conversion is skipped when a new save exists", async () => {
    const p = await boot({ [NEW]: '{"v":1,"stars":{"tokens":1}}', [V4]: '{"xp":300,"done":{"3":3}}' });
    expect(savedStars(p).stars).toEqual({ tokens: 1 });
  });
  it("V4_IDS matches today's level order", async () => {
    const p = await boot();
    expect(p.app.V4_IDS).toEqual(p.catalog.CATALOG.map((l) => l.id));
  });
  it("XP is 50 a star, 75 a star on quizzes (spec example: 350)", async () => {
    const p = await boot({ [NEW]: '{"v":1,"stars":{"gpu-anatomy":3,"memory-fit":1,"quiz-one-gpu":2}}' });
    expect(xp(p)).toBe(350);
  });
  it("1★ then 2★ then 3★ gives 150 XP; a worse replay keeps the higher stars", async () => {
    const p = await boot();
    p.app.loadLevel("batching");
    p.app.win(1);
    p.app.win(2);
    p.app.win(3);
    expect(xp(p)).toBe(150);
    p.app.win(1);
    expect(savedStars(p).stars.batching).toBe(3);
    expect(xp(p)).toBe(150);
  });
  it("an unknown ID is not counted but is kept in the save", async () => {
    const p = await boot({ [NEW]: '{"v":1,"stars":{"retired-level":3,"tokens":3}}' });
    p.app.show("home");
    expect(xp(p)).toBe(150);
    expect(p.$("#doneNum").textContent).toBe("1");
    p.app.loadLevel("parameters");
    p.app.win(3);
    expect(savedStars(p).stars["retired-level"]).toBe(3);
  });
  it("a corrupt save starts at 0 XP", async () => {
    const p = await boot({ [NEW]: "not json{" });
    expect(xp(p)).toBe(0);
  });
  it("blocked storage: the game still loads and levels can be won", async () => {
    const p = await boot(undefined, { blockStorage: true });
    p.app.loadLevel("batching");
    p.app.win(3);
    expect(p.app.G.won).toBe(true);
    expect(xp(p)).toBe(150);
  });
  it("reset then reload stays at 0 XP, even with a v4 save present", async () => {
    let p = await boot({ [V4]: '{"xp":300,"done":{"1":3,"2":3}}' });
    p.app.show("home");
    p.$("#resetAll").click();
    p.$("#resetYes").click();
    const s = p.storage();
    p = await boot({ [NEW]: s[NEW]!, [V4]: s[V4]! });
    expect(xp(p)).toBe(0);
  });
  it("inserting a level keeps everyone's stars and shifts display numbers only", async () => {
    const p = await boot({ [NEW]: '{"v":1,"stars":{"tokens":3,"gpu-anatomy":2,"quiz-cluster":1}}' });
    p.manifest.MANIFEST[0].levels.splice(1, 0, { id: "dummy-level", title: "Dummy", concept: "test" });
    p.catalog.finaliseLevels();
    p.app.show("home");
    expect([shown(p, "tokens"), shown(p, "gpu-anatomy"), shown(p, "quiz-cluster"), shown(p, "dummy-level")]).toEqual([
      3, 2, 1, 0,
    ]);
    expect(p.catalog.LEVEL_BY_ID.get("parameters")!.n).toBe(3);
  });
});

describe("manifest", () => {
  it("every world's levels match its manifest entry", async () => {
    const p = await boot();
    for (const W of p.manifest.MANIFEST)
      expect(
        p.catalog.levelMismatches(
          W.world,
          p.app.allLevels().filter((l) => l.world === W.world),
        ),
      ).toEqual([]);
  });
  it("a mismatch is named by world and level: missing, extra, renamed, reordered, quiz flag", async () => {
    const p = await boot();
    const w1 = () =>
      p.app
        .allLevels()
        .filter((l) => l.world === 1)
        .map((l) => ({ ...l }));
    const missing = w1().filter((l) => l.id !== "batching");
    expect(p.catalog.levelMismatches(1, missing)).toEqual([
      'World 1: level "batching" is in the manifest but not in the pack',
    ]);
    const extra = [...w1(), { id: "extra-level", title: "Extra", concept: "x" }];
    expect(p.catalog.levelMismatches(1, extra)).toEqual([
      'World 1: level "extra-level" is in the pack but not in the manifest',
    ]);
    const renamed = w1();
    renamed[0].title = "Meet the GPU";
    expect(p.catalog.levelMismatches(1, renamed)).toEqual([
      'World 1: level "gpu-anatomy" is titled "Meet the GPU" but "Meet the chip" in the manifest',
    ]);
    const reordered = w1();
    [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
    expect(p.catalog.levelMismatches(1, reordered)[0]).toMatch(/^World 1: levels are in a different order/);
    const quiz = w1();
    quiz[0].quiz = true;
    expect(p.catalog.levelMismatches(1, quiz)).toEqual(['World 1: level "gpu-anatomy" is a quiz, unlike the manifest']);
  });
  it("loading stops with a clear error when a world's levels don't match", async () => {
    const p = await boot();
    expect(() =>
      p.catalog.attachLevels(
        1,
        p.app
          .allLevels()
          .filter((l) => l.world === 1)
          .slice(1),
      ),
    ).toThrow(/World 1: level "gpu-anatomy" is in the manifest but not in the pack/);
  });
});
