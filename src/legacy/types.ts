// Types for the pass-1 port. They describe the data and state exactly as the single-file game builds them.
// Data types (GPUs, models, …) live in src/shared/data/types.ts and are re-exported here.
// Pass 2 moves the rest to src/core and splits GameState into one type per world (task 5.1).
export type {
  Vendor,
  Gpu,
  MoeConfig,
  Model,
  Dtype,
  Layer,
  InfoEntry,
  GlossEntry,
  Server,
} from "../shared/data/types.ts";

export interface Net {
  key: string;
  name: string;
  s: string;
  perGPU: number;
  eff: number;
  lat: number;
  rdma: boolean;
  d: string;
}

export interface MigProfile {
  c: number;
  m: number;
  gb: number;
  id: number;
}

/**
 * Game state. In the single file each world builds a different object (see freshState).
 * PASS-1 APPROXIMATION: this one type lists every field any world uses, all as present, because each function
 * only ever runs in a world whose state has the fields it reads. Task 5.1 replaces it with one type per world.
 */
export interface GameState {
  world: number;
  gpu: string;
  model: string;
  flags: Record<string, boolean>;
  inspected: string[];
  info: string | null;
  // Worlds 1–4
  dtype: string;
  kvdt: string;
  batch: number;
  ctx: number;
  prompt: number;
  showRoof: boolean;
  mig: { mode: boolean; inst: string[]; share: string }; // inst: MIG profile names, e.g. "3g.40gb"
  wl: string;
  picks: Record<string, string>;
  // World 2
  mode: string;
  graphs: boolean;
  fuse: boolean;
  flash: boolean;
  driver: number;
  lastRun: { image: string; gpus: boolean; ok: boolean; why?: string } | null;
  traceAt: number;
  // World 3
  srv: string;
  tp: number;
  // World 4
  nodes: number;
  net: string;
  gdr: boolean;
  pp: number;
  ray: { head: string | null; workers: string[] };
  host: string;
  job: { tp: number; pp: number } | null;
  // World 0
  calcModel: string;
  text: string;
  att: { i: number; head: number };
  gen: { k: number; cache: boolean; sel: number | null };
  moe: { tok: number; batch: number; seen: number[] };
  hd: { design: string; q: number };
}

export interface Goal {
  t: string;
  ok: (S: GameState) => boolean;
}

export interface Question {
  q: string;
  o: string[];
  a: number;
  why: string;
}

/** A level or lab as written in the level files. */
export interface LevelDef {
  id: string;
  world: number;
  title: string;
  concept: string;
  layers: { on: number[]; near: number[] };
  panels?: string[];
  controls?: string[];
  brief?: string;
  debrief?: string;
  links?: { up: string; down: string };
  setup?: (S: GameState) => void;
  goals?: Goal[]; // quiz levels have none
  hints?: string[]; // quiz levels and labs have none
  answer?: (S: GameState) => string;
  chips?: string[];
  locks?: Record<string, string>;
  gpus?: string[];
  srvs?: string[];
  quiz?: boolean;
  questions?: Question[];
  lab?: boolean;
  driverStart?: boolean;
}

/**
 * A level after finaliseLevels(): position in the list and number within its world are filled in.
 * Level files write `{...} satisfies LevelDef as LevelDef as Level`: checked as a definition, then treated as a
 * finished level, because finaliseLevels() fills in idx and n before anything reads them.
 */
export interface Level extends LevelDef {
  idx: number;
  n: number;
}

export interface World {
  w: number;
  h: string;
  p: string;
}

export interface SoonEntry {
  n: string;
  t: string;
  c: string;
}

/** A lab: a free-play sandbox. It has no position in the level list and never earns stars. */
export interface Lab extends LevelDef {
  lab: true;
}

/** What can be open in the game: a level or a lab. `L.lab` tells them apart. */
export type Playable = Level | Lab;

/** The app's global state, `G` in 7-app. */
export interface AppState {
  mode: string; // "home" or "game"
  level: Playable | null; // null on the home screen before any level is opened
  S: GameState | null; // the open level's sim state; null before any level is opened
  hints: number;
  won: boolean;
  hist: string[];
  hi: number;
  strip: number | null;
  wt: ReturnType<typeof setTimeout> | undefined; // pending win timer; only ever passed to clearTimeout
  tt?: ReturnType<typeof setTimeout>; // pending trace-animation timer
  quizState?: { picked: number[][]; mistakes: number };
}

/** Saved progress (key m2m-progress-v1). stars values are checked with validStars() before use. */
export interface Progress {
  v: 1;
  stars: Record<string, unknown>;
}

/** One terminal line: its text and css class ("", "cmd", "dim", "ok", "err"). */
export interface OutLine {
  t: string;
  c: string;
}

/** One section of the command list: a heading and its [command, short note] rows. */
export type ManualSection = [heading: string, rows: [cmd: string, note: string][]];
