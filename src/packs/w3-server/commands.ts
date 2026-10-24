import type { Playable } from "../../core/types.ts";
import { TP_STEPS } from "./data.ts";
import { ncclTable } from "./engine.ts";
import { state } from "./state.ts";
import { foundryKv } from "../../shared/bench/foundry.ts";
import { setNum } from "../../shared/bench/setters.ts";
import { f0, f1, f2, fmtMoney, fmtT, lpad } from "../../shared/data/format.ts";
import { GPUS, SERVERS } from "../../shared/data/hardware.ts";
import { DTYPES, MODELS, MODEL_ALIAS } from "../../shared/data/models.ts";
import { w3 } from "../../shared/engine/server.ts";
import { host } from "../../shared/host.ts";
// World 3's commands: the status line, the NCCL benchmark, and its foundry subcommands.
export function summary3() {
  const M = w3(state());
  if (!M.fits) {
    host.err(
      `CUDA out of memory: each GPU needs ${f1(M.usedPer)} GB (weights ${f1(M.wPer)} + KV ${f1(M.kvPer)} + 3), H100 has 80 GB`,
    );
    return;
  }
  host.print(
    `→ ${M.rep} × TP ${M.tp} · ${f1(M.usedPer)} GB per GPU · ${f1(M.perUser)} tok/s per user · server ${f0(M.total)} tok/s · TTFT ${fmtT(M.ttft)} · talking ${f0(M.commShare * 100)}% · ${fmtMoney(M.cost)} per 1M tokens`,
    "ok",
  );
}
export function ncclTest(args: string[]) {
  const S = state();
  S.flags.nccl = true;
  const srv = SERVERS[S.srv],
    amd = GPUS[srv.gpu!].vendor === "amd";
  host.print(
    `# ${amd ? "rccl-tests (RCCL = the AMD version of NCCL)" : "nccl-tests"} all_reduce_perf · 8 × ${GPUS[srv.gpu!].name} · ${srv.name}`,
    "dim",
  );
  host.print("#     size     time(us)   algbw(GB/s)   busbw(GB/s)");
  ncclTable(srv, 8).forEach((r) => {
    const sz =
      r.b >= 1 << 30
        ? r.b / (1 << 30) + "G"
        : r.b >= 1 << 20
          ? r.b / (1 << 20) + "M"
          : r.b >= 1024
            ? r.b / 1024 + "K"
            : r.b + "";
    host.print("  " + lpad(sz, 9) + lpad(f1(r.t * 1e6), 13) + lpad(f2(r.alg), 14) + lpad(f2(r.bus), 14));
  });
  const big = ncclTable(srv, 8).pop()!;
  host.print(
    `# Avg bus bandwidth at 8G: ${f1(big.bus)} GB/s. Small messages are latency-bound (~${f0(srv.lat * 1e6)} µs).`,
    "dim",
  );
}

/** Terminal commands only World 3 runs. */
export function commands(v: string, t: string[]): boolean {
  if (v === "all_reduce_perf" || v === "./all_reduce_perf" || v === "./build/all_reduce_perf") {
    ncclTest(t.slice(1));
    return true;
  }
  return false;
}

/** foundry subcommands in World 3. Returns true if handled (the rest: guards and core). */
export function foundry(t: string[]): boolean {
  const S = state(),
    L = host.G.level!,
    sub = (t[0] || "").toLowerCase(),
    a = (t[1] || "").toLowerCase(),
    C = L.controls || [];
  if (sub === "kv") {
    foundryKv(S, a, summary3);
    return true;
  }

  if (sub === "server") {
    const ok = L.srvs || ["hgx", "pcie"];
    if (!SERVERS[a] || !ok.includes(a)) {
      host.err("foundry server " + ok.join(" | "));
      return true;
    }
    if (a !== S.srv && host.locked("srv")) return true;
    S.srv = a;
    host.print(`Server: ${SERVERS[a].name} · ${SERVERS[a].note} · $${SERVERS[a].price}/hr`, "dim");
    summary3();
    return true;
  }
  if (sub === "tp") {
    const n = parseInt(a);
    if (!TP_STEPS.includes(n)) {
      host.err("foundry tp 1 | 2 | 4 | 8");
      return true;
    }
    if (n !== S.tp && host.locked("tp")) return true;
    S.tp = n;
    host.print(`Tensor parallel size ${n}: ${8 / n} replica${n < 8 ? "s" : ""} of ${MODELS[S.model].name}`, "dim");
    summary3();
    return true;
  }
  if (sub === "load") {
    let v = MODEL_ALIAS[a] || a;
    if (!MODELS[v] || v === "llama-1b") {
      host.err("Options: llama-8b, llama-70b, llama-405b, qwen-235b");
      return true;
    }
    if (v !== S.model && host.locked("model")) return true;
    S.model = v;
    host.print(`Loaded ${MODELS[v].name}`, "dim");
    summary3();
    return true;
  }
  if (sub === "dtype") {
    const gg = GPUS[SERVERS[S.srv].gpu!];
    if (!DTYPES[a] || (a === "fp4" && !gg.fp4)) {
      host.err(`${gg.name} supports bf16, fp8, int4 here${gg.fp4 ? ", fp4" : " (no FP4)"}.`);
      return true;
    }
    if (a !== S.dtype && host.locked("dtype")) return true;
    S.dtype = a;
    summary3();
    return true;
  }
  if (sub === "batch" || sub === "users") {
    if (setNum(S, "batch", a, 1, 1024, "Users per replica")) summary3();
    return true;
  }
  if (sub === "context" || sub === "ctx") {
    if (setNum(S, "ctx", a, 512, 262144, "Context")) summary3();
    return true;
  }
  if (sub === "prompt") {
    if (setNum(S, "prompt", a, 128, 262144, "Prompt")) summary3();
    return true;
  }
  if (sub === "status" || sub === "bench") {
    summary3();
    return true;
  }
  return false;
}

/** Level start: say so when the default setup doesn't fit (not on the checkpoint quiz). */
export function afterIntro(L: Playable) {
  if (!L.quiz) {
    if (!w3(state()).fits) summary3();
  }
}
