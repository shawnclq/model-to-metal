// Screen-only recorder: plays the parity script on a page and writes down what a player would see.
// It reads the DOM (text, goal ticks, terminal lines, a fingerprint of the sim area's markup) and nothing else,
// so the reference and the new build are measured the same way.
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Scene, Step } from "./script.ts";

// Fake time that the page sees. Timers (the 900 ms win delay, the trace animation) are fast-forwarded,
// never waited for in real time, so a run is quick and exactly repeatable.
const SETTLE_MS = 10_000;

export interface Snapshot {
  view?: string;
  header?: string;
  home?: string;
  mission?: string;
  goals?: [string, boolean][];
  hints?: string;
  quiz?: string;
  sim?: string;
  simHtml?: string; // sha1 of the sim card's markup: catches changes that don't alter text (classes, SVG geometry)
  chips?: string;
  prompt?: string;
  modal?: string;
  compare?: string;
  out?: [string, string][]; // terminal lines added by this step: [text, css class]
}
export interface Entry extends Snapshot {
  step: string;
}
export type Recording = Record<string, Entry[]>;

/** Pin everything that isn't game logic: the flicker animation's randomness and the clock. Call before opening. */
export async function prepare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

async function read(page: Page) {
  const raw = await page.evaluate(() => {
    const $ = (s: string) => document.querySelector<HTMLElement>(s);
    const shown = (s: string) => {
      const el = $(s);
      // getClientRects, not offsetParent: offsetParent is always null for position:fixed (the modals).
      return !!el && !el.hidden && el.getClientRects().length > 0;
    };
    return {
      view: shown("#game") ? "game" : "home",
      header: $(".top")?.textContent ?? "",
      home: shown("#home") ? ($("#home")?.textContent ?? "") : "",
      mission: shown("#game") ? ($("#mission")?.textContent ?? "") : "",
      goals: [...document.querySelectorAll<HTMLElement>("#mGoals li")].map(
        (li) => [li.textContent ?? "", li.classList.contains("ok")] as [string, boolean],
      ),
      hints: $("#mHints")?.textContent ?? "",
      quiz: shown("#quiz") ? ($("#quiz")?.textContent ?? "") : "",
      sim: shown("#simCard") ? ($("#simCard")?.textContent ?? "") : "",
      simHtml: shown("#simCard") ? ($("#simCard")?.innerHTML ?? "") : "",
      chips: $("#chips")?.textContent ?? "",
      prompt: $("#cmdForm label")?.textContent ?? "",
      modal: shown("#modal") ? ($("#modal")?.textContent ?? "") : "",
      compare: shown("#cmpModal") ? ($("#cmpModal")?.textContent ?? "") : "",
      out: [...document.querySelectorAll<HTMLElement>("#out > div")].map(
        (d) => [d.textContent ?? "", d.className] as [string, string],
      ),
    };
  });
  return {
    ...raw,
    header: norm(raw.header),
    home: norm(raw.home),
    mission: norm(raw.mission),
    goals: raw.goals.map(([t, ok]) => [norm(t), ok] as [string, boolean]),
    hints: norm(raw.hints),
    quiz: norm(raw.quiz),
    sim: norm(raw.sim),
    simHtml: raw.simHtml ? createHash("sha1").update(norm(raw.simHtml)).digest("hex") : "",
    chips: norm(raw.chips),
    prompt: norm(raw.prompt),
    modal: norm(raw.modal),
    compare: norm(raw.compare),
  };
}

// Real-time polling from Node: the page's own timers are fake, so waits must not rely on them.
async function until(page: Page, test: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 200; i++) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// Like a player: a win modal or the Compare panel left open is dismissed before navigating away.
async function dismissModals(page: Page) {
  if (await page.locator("#modal").isVisible()) await page.click("#dStay");
  if (await page.locator("#cmpModal").isVisible()) await page.click("#cmpClose");
}

async function act(page: Page, s: Step) {
  if (s.do === "home" || s.do === "open" || s.do === "compare") await dismissModals(page);
  switch (s.do) {
    case "home":
      await page.click("#homeBtn");
      break;
    case "open": {
      await page.click("#homeBtn");
      await page.locator(`#piers [data-level="${s.id}"]`).first().click();
      // A level is open once the mission panel names it. (The new build may show a loading message first.)
      await until(
        page,
        () =>
          page.evaluate(
            () =>
              !document.querySelector<HTMLElement>("#game")!.hidden &&
              !!document.querySelector("#mTitle")!.textContent &&
              !/^Loading/.test(document.querySelector("#mEyebrow")!.textContent ?? ""),
          ),
        `level ${s.id} to open`,
      );
      break;
    }
    case "cmd":
      // Quiz levels hide the terminal; a player can't type there, so neither does the script.
      if (!(await page.locator("#cmd").isVisible())) break;
      await page.fill("#cmd", s.text);
      await page.press("#cmd", "Enter");
      break;
    case "pick":
      await page.click(`#quiz [data-q="${s.q}"][data-o="${s.o}"]`);
      break;
    case "hints":
      for (let i = 0; i < 10 && (await page.locator("#hintBtn").isVisible()); i++) await page.click("#hintBtn");
      break;
    case "closeModal":
      if (await page.locator("#modal").isVisible()) await page.click("#dStay");
      break;
    case "compare":
      await page.click("[data-compare]");
      break;
  }
  await page.clock.runFor(SETTLE_MS);
}

const label = (s: Step) =>
  s.do === "cmd" ? `$ ${s.text}` : s.do === "open" ? `open ${s.id}` : s.do === "pick" ? `pick q${s.q} o${s.o}` : s.do;

/** Play every scene in order on one page; record only what changed after each step. */
/** Plays the script and records the screen after every step. `onStep` runs after each step, before modals close. */
export async function playScript(
  page: Page,
  scenes: Scene[],
  onStep?: (scene: string, step: string) => Promise<void>,
): Promise<Recording> {
  const rec: Recording = {};
  let prev: Awaited<ReturnType<typeof read>> | null = null;
  for (const scene of scenes) {
    const entries: Entry[] = [];
    let first = true;
    for (const step of scene.steps) {
      const t0 = Date.now();
      await act(page, step);
      if (process.env.PARITY_DEBUG) console.log(`${scene.name} | ${label(step)} | ${Date.now() - t0} ms`);
      const now = await read(page);
      await onStep?.(scene.name, label(step));
      if (step.do === "compare") await page.click("#cmpClose");
      const e: Entry = { step: label(step) };
      for (const k of Object.keys(now) as (keyof typeof now)[]) {
        if (k === "out") continue;
        if (first || !prev || JSON.stringify(now[k]) !== JSON.stringify(prev[k]))
          (e as unknown as Record<string, unknown>)[k] = now[k];
      }
      // Terminal: just the lines this step added ("clear" empties it, which shows as a shorter list).
      const before = prev?.out ?? [];
      const added = now.out.length >= before.length ? now.out.slice(before.length) : now.out;
      if (added.length || now.out.length < before.length) e.out = added;
      entries.push(e);
      prev = now;
      first = false;
    }
    rec[scene.name] = entries;
  }
  return rec;
}

/** First difference between two recordings, as a readable path, or null when identical. */
export function firstDifference(want: Recording, got: Recording): string | null {
  const scenes = new Set([...Object.keys(want), ...Object.keys(got)]);
  for (const name of scenes) {
    const a = want[name] ?? [];
    const b = got[name] ?? [];
    if (!want[name] || !got[name])
      return `scene "${name}" is ${want[name] ? "missing from the new recording" : "not in reference.json"}`;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x: Record<string, unknown> = { ...a[i] };
      const y: Record<string, unknown> = { ...b[i] };
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const xs = JSON.stringify(x[k]);
        const ys = JSON.stringify(y[k]);
        if (xs !== ys) {
          return `scene "${name}", step ${i + 1} (${x.step ?? y.step}), field "${k}":\n  expected: ${xs?.slice(0, 600)}\n  actual:   ${ys?.slice(0, 600)}`;
        }
      }
    }
  }
  return null;
}
