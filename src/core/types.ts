// The core's types: each world's sim state, and the contract every world pack fills in.

/** Fields every world's state has. */
interface BaseState {
  gpu: string;
  model: string;
  flags: Record<string, boolean>; // goal flags: things the player has done ("ran nvidia-smi")
  inspected: string[]; // inspectable parts the player has tapped
  info: string | null; // the part shown in the inspect box
}

/** World 0 · Inside the model: tokens, weights, attention, generation, MoE, heads. */
export interface W0State extends BaseState {
  world: 0;
  calcModel: string;
  text: string;
  att: { i: number; head: number };
  gen: { k: number; cache: boolean; sel: number | null };
  moe: { tok: number; batch: number; seen: number[] };
  hd: { design: string; q: number };
}

/** World 1 · Inside one GPU: the bench, MIG partitions, "Pick the GPU". */
export interface W1State extends BaseState {
  world: 1;
  dtype: string;
  kvdt: string;
  batch: number;
  ctx: number;
  prompt: number;
  showRoof: boolean;
  mig: { mode: boolean; inst: string[]; share: string }; // inst: MIG profile names, e.g. "3g.40gb"
  wl?: string; // "Pick the GPU": the workload being matched
  picks?: Record<string, string>; // "Pick the GPU": workload → chosen GPU
}

/** World 2 · The software path: kernels, launches, fusion, containers, drivers. */
export interface W2State extends BaseState {
  world: 2;
  dtype: string;
  batch: number;
  ctx: number;
  prompt: number;
  mode: string; // "decode" | "prefill"
  graphs: boolean;
  fuse: boolean;
  flash: boolean;
  driver: number;
  lastRun: { image: string; gpus: boolean; ok: boolean; why?: string } | null;
  traceAt: number;
}

/** World 3 · Many GPUs, one server: tensor parallelism on an 8-GPU board. */
export interface W3State extends BaseState {
  world: 3;
  srv: string;
  dtype: string;
  kvdt: string;
  tp: number;
  batch: number;
  ctx: number;
  prompt: number;
}

/** World 4 · Many servers: the network, Ray, multi-node serving and training. */
export interface W4State extends BaseState {
  world: 4;
  mode: string; // "fabric" | "serve" | "train"
  nodes: number;
  net: string;
  gdr: boolean;
  dtype: string;
  kvdt: string;
  tp: number;
  pp: number;
  batch: number;
  ctx: number;
  prompt: number;
  ray: { head: string | null; workers: string[] };
  host: string;
  job: { tp: number; pp: number } | null;
}

/** The open level's sim state: one of the worlds' states, told apart by `world`. */
export type GameState = W0State | W1State | W2State | W3State | W4State;

/** Draws one control in the controls bar ("" when it shouldn't show right now). */
export type ControlRenderer = (C: string[], lk: Record<string, string>) => string;

/**
 * What a world pack provides. The core never branches on the world number: it asks the open level's pack.
 * Every hook runs while one of this world's levels or its lab is open.
 */
export interface WorldPack {
  world: number;
  /** This world's levels, in order (must match its manifest entry). */
  levels: Level[];
  /** This world's free-play lab, if it has one. */
  lab?: Lab;
  /** A fresh sim state for one of this world's levels (the level's setup() then adjusts it). */
  freshState(): GameState;
  /** Sets the sim title and caption before the controls are drawn (worlds whose panel doesn't set its own). */
  simHeader?(L: Playable): void;
  /** Draws this world's sim panel. */
  renderSim(): void;
  /** The terminal prompt, e.g. "node-2$" in World 4. Default "$". */
  promptLabel?(): string;
  /** Every control name this world can show, in the order they appear (shared bench controls included). */
  controlOrder: string[];
  /** This world's own controls; names not here are the shared bench controls. */
  controls: Record<string, ControlRenderer>;
  /** Terminal commands beyond nvidia-smi / foundry / clear / help / hint. Returns true if it handled `v`. */
  commands(v: string, t: string[]): boolean;
  /** `foundry …` subcommands for this world. Returns true if it handled the subcommand. */
  foundry(t: string[]): boolean;
  /** After any bench change: print the one-line status for the new setup. */
  afterChange(): void;
  /** The `help` text. */
  help(): string;
  /** The Command list panel. */
  manual(): ManualSection[];
  /** Inspectable parts on screen in this world. */
  inspectable: string[];
  /** Suggestions shown when the player inspects something unknown. */
  inspectHint: string;
  /** Redraw the sim after the player taps a part (worlds whose panel highlights what was tapped). */
  redrawOnTap?: boolean;
  /** nvidia-smi subcommands only this world understands (e.g. MIG), passed on by the shared nvidia-smi. */
  smi?(args: string[]): void;
  /** Clicks on this world's own panel shortcuts (e.g. tapping a token). Returns true if it handled the click. */
  onClick?(target: Element): boolean;
  /** Extra note after inspecting a part (e.g. "this GPU has one die"). */
  onInspect?(k: string): void;
  /** Runs as a level opens, before the "Level N: …" line (e.g. a scripted failure to start from). */
  beforeIntro?(L: Playable): void;
  /** Runs as a level opens, after the "Level N: …" line (e.g. "this model doesn't fit"). */
  afterIntro?(L: Playable): void;
}

/* ============ levels, the app state, saves ============ */

export interface Goal<St = GameState> {
  t: string;
  ok(S: St): boolean;
}

export interface Question {
  q: string;
  o: string[];
  a: number;
  why: string;
}

/** A level or lab as written in the level files. */
/** St: the world's state type, which setup(), goals and answer() receive. */
export interface LevelDef<St = GameState> {
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
  setup?(S: St): void;
  goals?: Goal<St>[]; // quiz levels have none
  hints?: string[]; // quiz levels and labs have none
  answer?(S: St): string;
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
export interface Level<St = GameState> extends LevelDef<St> {
  idx: number;
  n: number;
}

/** A lab: a free-play sandbox. It has no position in the level list and never earns stars. */
export interface Lab<St = GameState> extends LevelDef<St> {
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
