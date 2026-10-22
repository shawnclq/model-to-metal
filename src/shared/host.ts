// What shared code needs from the running game: the app state and the terminal.
// Shared code must never import the app shell (that would change the order modules load in),
// so the app shell fills this in at start-up instead.
import type { AppState } from "../legacy/types.ts";

export interface Host {
  /** The app's global state: the open level and its sim state. */
  G: AppState;
  /** Add a line to the terminal (cls: "", "dim", "ok", "err", "cmd"). */
  print(text: unknown, cls?: string): void;
  /** Add an error line to the terminal. */
  err(text: unknown): void;
  /** True (and explains why) if the open level locks this setting. */
  locked(key: string): boolean;
  /** Run a command line as if the player typed it. */
  exec(cmd: string): void;
}

export const host = {} as Host;
