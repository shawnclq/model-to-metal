// `foundry …` commands: the open level's world answers first; then the core's own subcommands; then, for a
// subcommand that belongs to another world, that world's fixed answer; otherwise "unknown command".
import { printHelp } from "./help.ts";
import { inspect } from "./inspect.ts";
import { guardFor } from "./manifest.ts";
import { packFor } from "./packs.ts";
import { G } from "./state.ts";
import { err } from "./terminal.ts";

export function foundry(t: string[]) {
  const S = G.S!,
    sub = (t[0] || "").toLowerCase();
  if (packFor(S.world).foundry(t)) return;
  if (sub === "inspect" || sub === "explain") return void inspect(t[1]);
  if (sub === "help" || sub === "") return printHelp();
  const guard = guardFor("foundry", sub, S.world);
  if (guard) return guard(t);
  err(`foundry: unknown command "${sub}". Type help.`);
}
