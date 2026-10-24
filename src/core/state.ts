// The app's global state (the open level and its sim state) and the terminal's lines.
import type { AppState, OutLine } from "./types.ts";
export const G: AppState = {
  mode: "home",
  level: null,
  S: null,
  hints: 0,
  won: false,
  hist: [],
  hi: 0,
  strip: null,
  wt: undefined,
};
export const OUT: OutLine[] = [];
