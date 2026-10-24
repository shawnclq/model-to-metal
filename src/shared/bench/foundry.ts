// `foundry` subcommands the bench shares across worlds: load a model, set the prompt, set the KV-cache precision.
// Each world passes its own `after` (print the status line for the new setup).
import { host } from "../host.ts";
import { KVDT } from "../data/models.ts";
import { setDtype, setModel, setNum, type NumState } from "./setters.ts";

/** foundry load MODEL [--dtype D | --quantization D] */
export function foundryLoad(t: string[], after: () => void) {
  const a = t[1];
  let dt: string | null = null;
  for (let i = 2; i < t.length; i++) {
    if (t[i].startsWith("--dtype") || t[i].startsWith("--quantization")) {
      dt = t[i].includes("=") ? t[i].split("=")[1] : t[i + 1];
    }
  }
  if (setModel(a)) {
    if (dt && !setDtype(dt)) return;
    after();
  }
}

/** foundry prompt N */
export function foundryPrompt(S: NumState, a: string | undefined, after: () => void) {
  if (setNum(S, "prompt", a, 128, 262144, "Prompt")) after();
}

/** foundry kv bf16|fp8 (a: already lower-cased) */
export function foundryKv(S: { kvdt: string }, a: string, after: () => void) {
  if (!KVDT[a]) {
    host.err("foundry kv bf16 | fp8");
    return;
  }
  if (a !== (S.kvdt || "bf16") && host.locked("kvdt")) return;
  S.kvdt = a;
  host.print(`KV cache stored in ${KVDT[a].name}`, "dim");
  after();
}
