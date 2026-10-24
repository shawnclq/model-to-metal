import { guardFor } from "./manifest.ts";
import { packFor } from "./packs.ts";
import { amdSmi } from "../shared/bench/smi.ts";
import { foundry } from "./foundry.ts";
import { printHelp } from "./help.ts";
import { checkGoals, showHint } from "./levels.ts";
import { allPacks } from "./packs.ts";
import { renderSim } from "./sim.ts";
import { G, OUT } from "./state.ts";
import { smiCmd } from "../shared/bench/smi.ts";
import { $ } from "../shared/data/format.ts";
/* ============ terminal ============ */
export function print(text: unknown, cls?: string) {
  String(text)
    .split("\n")
    .forEach((l) => OUT.push({ t: l, c: cls || "" }));
  if (OUT.length > 700) OUT.splice(0, OUT.length - 700);
}
export function err(t: unknown) {
  print(t, "err");
}
export function flushOut() {
  const el = $("#out");
  el.textContent = "";
  const frag = document.createDocumentFragment();
  OUT.forEach((o) => {
    const s = document.createElement("div");
    s.textContent = o.t || " ";
    if (o.c) s.className = o.c;
    frag.appendChild(s);
  });
  el.appendChild(frag);
  el.scrollTop = el.scrollHeight;
}
export function locked(key: string) {
  const lk: Record<string, string> = (G.level && G.level!.locks) || {};
  if (lk[key]) {
    err(`Locked in this level: ${lk[key]}`);
    return true;
  }
  return false;
}
export function needWorld(w: number) {
  if (G.S!.world !== w) {
    err(`That command belongs to World ${w}. Type help for the commands here.`);
    return false;
  }
  return true;
}
export function run(line: string) {
  const S = G.S!;
  line = line.trim();
  if (!line || !S) return;
  G.hist.push(line);
  if (G.hist.length > 60) G.hist.shift();
  G.hi = G.hist.length;
  print("$ " + line, "cmd");
  const pack = packFor(S.world);
  line.split(/\s*&&\s*/).forEach((part) => {
    const t = part.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return;
    let v = t[0].toLowerCase();
    try {
      if (v === "sudo") {
        t.shift();
        v = (t[0] || "").toLowerCase();
      }
      if (v === "nvidia-smi" || v === "nvidia_smi" || v === "smi") smiCmd(t.slice(1));
      else if (v === "amd-smi" || v === "rocm-smi") amdSmi(v, t.slice(1));
      else if (v === "foundry" || v === "f") foundry(t.slice(1));
      else if (v === "clear") OUT.length = 0;
      else if (v === "help") printHelp();
      else if (v === "hint") {
        if (G.level!.answer) {
          showHint();
          print("(hint shown in the mission panel)", "dim");
        } else print("No hints here.", "dim");
      } else if (pack.commands(v, t)) {
        // the open world's own command
      } else if (guardFor("commands", v, S.world)) {
        guardFor("commands", v, S.world)!(t); // another world's command: its fixed answer
      } else if (v === "mpirun" || v === "torchrun")
        err(`${v}: launched for you here. In World 4, foundry mode train runs the job; foundry status shows it.`);
      else if (v === "kubectl") err("kubectl: Kubernetes arrives in World 5. Kube Harbor covers it today.");
      else err(`bash: ${v}: command not found. Type help.`);
    } catch (e) {
      err("error: " + ((e as Error).message || e));
    }
  });
  flushOut();
  renderSim();
  checkGoals();
}
export function exec(cmd: string) {
  run(cmd);
}
export function insert(txt: string) {
  const i = $<HTMLInputElement>("#cmd");
  i.value = txt;
  try {
    i.focus();
    i.setSelectionRange(txt.length, txt.length);
  } catch (e) {}
}
