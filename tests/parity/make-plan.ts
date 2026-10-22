// Reads, once, what the parity script needs to know about each level from the reference build:
// its chips, its answer() command line, and the shape of its quiz. Output: tests/parity/plan.json.
// Run with: node tests/parity/make-plan.ts
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const html = readFileSync(new URL("../../reference/model-to-metal.html", import.meta.url), "utf8");
const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://reference.test/",
  virtualConsole: new VirtualConsole(), // canvas "not implemented" noise is irrelevant here
});
await new Promise((r) => setTimeout(r, 300));
const plan = dom.window.eval(`(() => {
  const one = (L) => { loadLevel(L.id); return {
    id: L.id, world: L.world, lab: !!L.lab, quiz: !!L.quiz,
    chips: L.chips || [],
    answer: L.answer ? L.answer(G.S).split(/\\s*&&\\s*/) : [],
    hints: (L.hints || []).length,
    questions: L.quiz ? L.questions.map(q => ({ options: q.o.length, right: q.a })) : [],
  }; };
  return { levels: LEVELS.map(one), labs: Object.values(LABS).map(one) };
})()`) as { levels: unknown[]; labs: unknown[] };
writeFileSync(new URL("./plan.json", import.meta.url), JSON.stringify(plan, null, 1) + "\n");
console.log(`plan.json: ${plan.levels.length} levels, ${plan.labs.length} labs`);
dom.window.close();
