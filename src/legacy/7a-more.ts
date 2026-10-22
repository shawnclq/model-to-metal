import { setNum } from "../shared/bench/setters.ts";
import { amdSmi } from "../shared/bench/smi.ts";
import { MIGP, MIG_ID, NETS, TP_STEPS } from "./3b-data.ts";
import { migAssign, migCheck, ncclTable, w4serve, w4train } from "./4b-engine.ts";
import { rayGPUs } from "./6b-render.ts";
import { WL, wlCheck } from "./6c-render.ts";
import { late } from "./late.ts";
import type { GameState, ManualSection } from "./types.ts";
import { f0, f1, f2, fmtMoney, fmtT, lpad, pad } from "../shared/data/format.ts";
import { DRIVERS, GPUS, SERVERS } from "../shared/data/hardware.ts";
import { DTYPES, KVDT, MODELS, MODEL_ALIAS } from "../shared/data/models.ts";
import { w1 } from "../shared/engine/gpu.ts";
import { w3 } from "../shared/engine/server.ts";
/* ============ summaries ============ */
export function summary3() {
  const M = w3(late.G.S!);
  if (!M.fits) {
    late.err(
      `CUDA out of memory: each GPU needs ${f1(M.usedPer)} GB (weights ${f1(M.wPer)} + KV ${f1(M.kvPer)} + 3), H100 has 80 GB`,
    );
    return;
  }
  late.print(
    `→ ${M.rep} × TP ${M.tp} · ${f1(M.usedPer)} GB per GPU · ${f1(M.perUser)} tok/s per user · server ${f0(M.total)} tok/s · TTFT ${fmtT(M.ttft)} · talking ${f0(M.commShare * 100)}% · ${fmtMoney(M.cost)} per 1M tokens`,
    "ok",
  );
}
export function summary4() {
  const S = late.G.S!;
  if (S.mode === "train") {
    const T = w4train(S);
    late.print(
      `→ ${S.nodes} node${S.nodes > 1 ? "s" : ""} · step ${fmtT(T.step)} (network ${fmtT(T.inter)}) · scaling efficiency ${f1(T.eff * 100)}% · ${f0(T.tput)} tokens/s`,
      T.eff >= 0.95 ? "ok" : "",
    );
    return;
  }
  if (S.mode === "serve") {
    if (!S.job) {
      late.print("No model running. Start Ray, then vllm serve.", "dim");
      return;
    }
    const R = w4serve(S);
    if (!R.fits) {
      late.err(`CUDA out of memory: each GPU needs ${f1(R.usedPer)} GB`);
      return;
    }
    late.print(
      `→ TP ${R.tp} × PP ${R.pp} · ${f1(R.usedPer)} GB per GPU · ${f1(R.perUser)} tok/s per user · TTFT ${fmtT(R.ttft)} · talking ${f0(R.commShare * 100)}%`,
      "ok",
    );
    return;
  }
  late.print(`→ ${S.nodes} nodes on ${NETS[S.net].name} (${NETS[S.net].s} per node)`, "dim");
}
export function afterAny() {
  const w = late.G.S!.world;
  w === 1 ? late.summary1() : w === 2 ? late.summary2() : w === 3 ? summary3() : summary4();
}

/* ============ extra foundry subcommands ============ */
export function foundryMore(t: string[]) {
  const S = late.G.S!,
    L = late.G.level!,
    sub = (t[0] || "").toLowerCase(),
    a = (t[1] || "").toLowerCase(),
    C = L.controls || [];
  const W = S.world;
  if (sub === "kv") {
    if (W === 2) {
      late.err("The kernel lab doesn't model KV precision.");
      return true;
    }
    if (!KVDT[a]) {
      late.err("foundry kv bf16 | fp8");
      return true;
    }
    if (a !== (S.kvdt || "bf16") && late.locked("kvdt")) return true;
    S.kvdt = a;
    late.print(`KV cache stored in ${KVDT[a].name}`, "dim");
    afterAny();
    return true;
  }
  if (W === 1 && sub === "workload") {
    if (!(L.controls || []).includes("workload")) {
      late.err("Workloads are in the 'Pick the GPU' level.");
      return true;
    }
    if (!WL[a]) {
      late.err("foundry workload chat | doc | moe");
      return true;
    }
    S.wl = a;
    Object.assign(S, WL[a].set);
    late.print(`Workload: ${WL[a].t} · ${WL[a].d}`, "dim");
    late.summary1();
    return true;
  }
  if (W === 1 && sub === "pick") {
    if (!(L.controls || []).includes("workload")) {
      late.err("foundry pick is for the 'Pick the GPU' level.");
      return true;
    }
    const c = wlCheck(S, S.wl);
    if (!c.ok) {
      late.err(
        `${GPUS[S.gpu].name} doesn't pass ${WL[S.wl].t}: ${c.res
          .filter((r) => !r[1])
          .map((r) => r[0])
          .join("; ")}`,
      );
      return true;
    }
    S.picks[S.wl] = S.gpu;
    late.print(`Picked ${GPUS[S.gpu].name} for ${WL[S.wl].t}. ${WL[S.wl].why}`, "ok");
    return true;
  }
  if (sub === "share") {
    if (!L.panels!.includes("mig")) {
      late.err("GPU sharing is in the 'Share the GPU' level.");
      return true;
    }
    if (a === "timeslice" || a === "time-slicing") {
      S.mig.share = "timeslice";
      S.mig.inst = [];
      late.print(
        "Time-slicing on: all 5 teams share the whole GPU in turns. No memory limits, no guaranteed share.",
        "dim",
      );
    } else if (a === "none") {
      S.mig.share = "none";
      S.mig.inst = [];
      late.print("Sharing off.", "dim");
    } else late.err("foundry share timeslice | none");
    return true;
  }
  if (W === 3) {
    if (sub === "server") {
      const ok = L.srvs || ["hgx", "pcie"];
      if (!SERVERS[a] || !ok.includes(a)) {
        late.err("foundry server " + ok.join(" | "));
        return true;
      }
      if (a !== S.srv && late.locked("srv")) return true;
      S.srv = a;
      late.print(`Server: ${SERVERS[a].name} · ${SERVERS[a].note} · $${SERVERS[a].price}/hr`, "dim");
      summary3();
      return true;
    }
    if (sub === "tp") {
      const n = parseInt(a);
      if (!TP_STEPS.includes(n)) {
        late.err("foundry tp 1 | 2 | 4 | 8");
        return true;
      }
      if (n !== S.tp && late.locked("tp")) return true;
      S.tp = n;
      late.print(`Tensor parallel size ${n}: ${8 / n} replica${n < 8 ? "s" : ""} of ${MODELS[S.model].name}`, "dim");
      summary3();
      return true;
    }
    if (sub === "load") {
      let v = MODEL_ALIAS[a] || a;
      if (!MODELS[v] || v === "llama-1b") {
        late.err("Options: llama-8b, llama-70b, llama-405b, qwen-235b");
        return true;
      }
      if (v !== S.model && late.locked("model")) return true;
      S.model = v;
      late.print(`Loaded ${MODELS[v].name}`, "dim");
      summary3();
      return true;
    }
    if (sub === "dtype") {
      const gg = GPUS[SERVERS[S.srv].gpu!];
      if (!DTYPES[a] || (a === "fp4" && !gg.fp4)) {
        late.err(`${gg.name} supports bf16, fp8, int4 here${gg.fp4 ? ", fp4" : " (no FP4)"}.`);
        return true;
      }
      if (a !== S.dtype && late.locked("dtype")) return true;
      S.dtype = a;
      summary3();
      return true;
    }
    if (sub === "batch" || sub === "users") {
      if (setNum("batch", a, 1, 1024, "Users per replica")) summary3();
      return true;
    }
    if (sub === "context" || sub === "ctx") {
      if (setNum("ctx", a, 512, 262144, "Context")) summary3();
      return true;
    }
    if (sub === "prompt") {
      if (setNum("prompt", a, 128, 262144, "Prompt")) summary3();
      return true;
    }
    if (sub === "status" || sub === "bench") {
      summary3();
      return true;
    }
  }
  if (W === 4) {
    if (sub === "status" || sub === "bench") {
      summary4();
      return true;
    }
    if (["load", "dtype", "batch", "users", "gpu"].includes(sub)) {
      late.err(
        sub === "gpu"
          ? "This cluster is all H100s."
          : "The model runs through vLLM here: relaunch with vllm serve … (or foundry layout TPxPP).",
      );
      return true;
    }
    if (sub === "mode") {
      if (!C.includes("mode4")) {
        late.err("Locked in this level.");
        return true;
      }
      if (a !== "serve" && a !== "train") {
        late.err("foundry mode serve | train");
        return true;
      }
      S.mode = a;
      if (a === "serve" && S.nodes < 2) S.nodes = 2;
      late.print(`Workload: ${a === "train" ? "data-parallel training of Llama 3.1 8B" : "multi-node serving"}`, "dim");
      summary4();
      return true;
    }
    if (sub === "nodes") {
      const n = parseInt(a);
      if (![1, 2, 4].includes(n)) {
        late.err("foundry nodes 1 | 2 | 4");
        return true;
      }
      if (!C.includes("nodes")) {
        late.err("Locked in this level: the cluster size is fixed.");
        return true;
      }
      if (S.mode === "serve" && n < 2) {
        late.err("Serving 405B BF16 needs at least 2 nodes.");
        return true;
      }
      S.nodes = n;
      if (S.ray.head) S.ray.workers = ["node-2", "node-3", "node-4"].slice(0, n - 1);
      late.print(`${n} node${n > 1 ? "s" : ""} (${n * 8} GPUs)`, "dim");
      summary4();
      return true;
    }
    if (sub === "net") {
      if (!NETS[a]) {
        late.err("foundry net ib | roce | eth");
        return true;
      }
      if (!C.includes("net")) {
        late.err("Locked in this level.");
        return true;
      }
      S.net = a;
      late.print(`Network: ${NETS[a].d}`, "dim");
      summary4();
      return true;
    }
    if (sub === "gdr") {
      if (!C.includes("gdr")) {
        late.err("Locked in this level.");
        return true;
      }
      S.gdr = /^(on|true|1|yes)$/.test(a);
      late.print(
        `GPUDirect RDMA ${S.gdr ? "on: NICs read GPU memory directly" : "off: data is staged through CPU memory"}`,
        "dim",
      );
      if (S.gdr && !NETS[S.net].rdma) late.print("(No effect on plain TCP Ethernet: it has no RDMA.)", "dim");
      summary4();
      return true;
    }
    if (sub === "layout") {
      const m = a.match(/^(\d+)x(\d+)$/);
      if (!m) {
        late.err("foundry layout TPxPP, e.g. foundry layout 8x2");
        return true;
      }
      vllmCmd([
        "serve",
        MODELS[S.model].key,
        "--tensor-parallel-size",
        m[1],
        "--pipeline-parallel-size",
        m[2],
        "--distributed-executor-backend",
        "ray",
      ]);
      return true;
    }
  }
  return false;
}
export function ncclTest(args: string[]) {
  const S = late.G.S!;
  if (S.world !== 3) {
    late.err(
      S.world === 4
        ? "Across nodes this runs under mpirun; here, use ib_write_bw to test the network."
        : "all_reduce_perf needs several GPUs: World 3.",
    );
    return;
  }
  S.flags.nccl = true;
  const srv = SERVERS[S.srv],
    amd = GPUS[srv.gpu!].vendor === "amd";
  late.print(
    `# ${amd ? "rccl-tests (RCCL = the AMD version of NCCL)" : "nccl-tests"} all_reduce_perf · 8 × ${GPUS[srv.gpu!].name} · ${srv.name}`,
    "dim",
  );
  late.print("#     size     time(us)   algbw(GB/s)   busbw(GB/s)");
  ncclTable(srv, 8).forEach((r) => {
    const sz =
      r.b >= 1 << 30
        ? r.b / (1 << 30) + "G"
        : r.b >= 1 << 20
          ? r.b / (1 << 20) + "M"
          : r.b >= 1024
            ? r.b / 1024 + "K"
            : r.b + "";
    late.print("  " + lpad(sz, 9) + lpad(f1(r.t * 1e6), 13) + lpad(f2(r.alg), 14) + lpad(f2(r.bus), 14));
  });
  const big = ncclTable(srv, 8).pop()!;
  late.print(
    `# Avg bus bandwidth at 8G: ${f1(big.bus)} GB/s. Small messages are latency-bound (~${f0(srv.lat * 1e6)} µs).`,
    "dim",
  );
}

/* ============ World 4 commands ============ */
export function ibstat() {
  const S = late.G.S!;
  if (S.world !== 4) {
    late.err("ibstat: no InfiniBand devices on this bench (World 4).");
    return;
  }
  S.flags.ibstat = true;
  const n = NETS[S.net];
  if (!n.rdma) {
    late.print("ibstat: no RDMA devices found. This server has one 100 GbE NIC (eth0) running plain TCP.");
    return;
  }
  for (let k = 0; k < 2; k++)
    late.print(
      `CA 'mlx5_${k}'\n\tCA type: MT4129 (ConnectX-7)\n\tPort 1:\n\t\tState: Active\n\t\tPhysical state: LinkUp\n\t\tRate: 400\n\t\tLink layer: ${S.net === "ib" ? "InfiniBand" : "Ethernet"}`,
    );
  late.print(`… mlx5_2 to mlx5_7 identical: 8 ports Active at 400 Gb/s on ${S.host} (one per GPU).`, "dim");
}
export function ibbw(args: string[]) {
  const S = late.G.S!;
  if (S.world !== 4) {
    late.err("ib_write_bw: the network is World 4.");
    return;
  }
  const tgt = args.find((x) => /^node-\d$/.test(x));
  if (!tgt) {
    late.err("Usage here: ib_write_bw node-2   (run from node-1 against another server)");
    return;
  }
  if (tgt === S.host) {
    late.err("Pick another server than the one you're on.");
    return;
  }
  if (parseInt(tgt.slice(5)) > S.nodes) {
    late.err(`ib_write_bw: couldn't connect to ${tgt}: no such host in this ${S.nodes}-node cluster.`);
    return;
  }
  const n = NETS[S.net];
  if (!n.rdma) {
    late.err("ib_write_bw: no RDMA device. Try iperf3 for plain TCP.");
    return;
  }
  const gb = S.net === "ib" ? 392.6 : 368.4;
  S.flags.ibbw = true;
  late.print(
    `---------------------------------------------------------------------------------------\n                    RDMA_Write BW Test · ${S.host} → ${tgt} · mlx5_0 · ${S.net === "ib" ? "InfiniBand" : "RoCE v2"}\n #bytes     #iterations    BW peak[Gb/sec]    BW average[Gb/sec]   MsgRate[Mpps]\n 65536      5000           ${f1(gb + 1.1)}              ${f1(gb)}                 ${f2((gb * 1e9) / 8 / 65536 / 1e6)}\n---------------------------------------------------------------------------------------`,
  );
  late.print(
    `(≈ ${f1(gb / 8)} GB/s on one NIC. Eight NICs per server ≈ ${f0(gb)} GB/s total; NVLink gives one GPU 450 GB/s each way.)`,
    "dim",
  );
}
export function iperf(args: string[]) {
  const S = late.G.S!;
  if (S.world !== 4) {
    late.err("iperf3: the network is World 4.");
    return;
  }
  const n = NETS[S.net];
  const gbps = n.key === "eth" ? 71.4 : n.key === "roce" ? 96.0 : 58.0;
  late.print(
    `[ ID] Interval       Transfer     Bitrate\n[  5] 0.00-10.00 sec  ${f1((gbps * 10) / 8)} GBytes  ${f1(gbps)} Gbits/sec   (TCP, one stream, through the CPU)`,
  );
  if (n.rdma) late.print("(TCP can't use RDMA: ib_write_bw shows what the fabric really does.)", "dim");
}
export function sshCmd(args: string[]) {
  const S = late.G.S!;
  if (S.world !== 4) {
    late.err("ssh: there's only one machine here. Multi-node is World 4.");
    return;
  }
  const h = args[0];
  if (!/^node-\d$/.test(h || "") || parseInt(h.slice(5)) > S.nodes) {
    late.err(
      `ssh: Could not resolve hostname ${h || ""}. Hosts: ${[...Array(S.nodes)].map((_, i) => "node-" + (i + 1)).join(", ")}`,
    );
    return;
  }
  S.host = h;
  late.print(`Welcome to ${h} (Ubuntu 22.04, 8 × H100)`, "dim");
}
export function rayCmd(args: string[]) {
  const S = late.G.S!;
  if (S.world !== 4) {
    late.err("ray: Ray clusters are in World 4.");
    return;
  }
  const sub = args[0],
    rest = args.join(" ");
  if (sub === "start") {
    if (/--head/.test(rest)) {
      if (S.ray.head && S.ray.head !== S.host) {
        late.err(
          `This cluster already has a head on ${S.ray.head}. Join it with ray start --address=${S.ray.head}:6379`,
        );
        return;
      }
      S.ray.head = S.host;
      late.print(
        `Local node IP: 10.0.0.${S.host.slice(5)}\n--------------------\nRay runtime started.\n--------------------\nTo add another node to this Ray cluster, run\n  ray start --address='${S.host}:6379'\nDashboard: http://${S.host}:8265`,
        "ok",
      );
      return;
    }
    const m = rest.match(/--address[= ]'?([\w.-]+):(\d+)'?/);
    if (!m) {
      late.err("ray start --head   or   ray start --address=HEAD:6379");
      return;
    }
    if (!S.ray.head) {
      late.err(
        `ConnectionError: could not reach a Ray head at ${m[1]}:${m[2]}. Start the head first (ray start --head on node-1).`,
      );
      return;
    }
    if (m[1] !== S.ray.head && m[1] !== "10.0.0." + S.ray.head.slice(5)) {
      late.err(`ConnectionError: no Ray head at ${m[1]}:${m[2]}. The head is ${S.ray.head}.`);
      return;
    }
    if (S.host === S.ray.head) {
      late.err("This node is the head. ssh to another node first.");
      return;
    }
    if (!S.ray.workers.includes(S.host)) S.ray.workers.push(S.host);
    late.print(
      `Local node IP: 10.0.0.${S.host.slice(5)}\n--------------------\nRay runtime started.\nThis node joined the cluster at ${m[1]}:${m[2]} with 8 GPUs.`,
      "ok",
    );
    return;
  }
  if (sub === "status") {
    if (!S.ray.head) {
      late.err("ConnectionError: Ray is not running. Start it with ray start --head.");
      return;
    }
    const nodes = 1 + S.ray.workers.length,
      g = nodes * 8;
    late.print(
      `======== Autoscaler status ========\nActive:\n ${nodes} node(s): ${[S.ray.head, ...S.ray.workers].join(", ")}\nResources\n---------------------------------------------------------------\nUsage:\n ${S.job ? S.job.tp * S.job.pp : 0}.0/${g}.0 GPU\n 0.0/${nodes * 224}.0 CPU\n 0B/${nodes * 2}.00TiB memory`,
    );
    if (g >= 16) S.flags.raystatus16 = true;
    return;
  }
  if (sub === "stop") {
    if (S.ray.head === S.host) {
      S.ray = { head: null, workers: [] };
      S.job = null;
      late.print("Stopped all Ray processes. The cluster is gone.", "dim");
    } else {
      S.ray.workers = S.ray.workers.filter((w) => w !== S.host);
      late.print(`Stopped Ray on ${S.host}.`, "dim");
    }
    return;
  }
  late.err("ray start | ray status | ray stop");
}
export function vllmCmd(args: string[]) {
  const S = late.G.S!;
  if (S.world !== 4) {
    late.err("vllm is the next layer up (serving). Here, foundry load MODEL --dtype fp8 does the same job.");
    return;
  }
  if (args[0] !== "serve") {
    late.err("vllm serve MODEL --tensor-parallel-size N --pipeline-parallel-size M --distributed-executor-backend ray");
    return;
  }
  if (S.mode !== "serve") {
    late.err("This cluster is running training. foundry mode serve first.");
    return;
  }
  const name = (args[1] || "").toLowerCase();
  let model = null;
  if (/405b/.test(name)) model = "llama-405b";
  else if (/70b/.test(name)) model = "llama-70b";
  if (!model) {
    late.err("Model not found here. Try meta-llama/Llama-3.1-405B-Instruct");
    return;
  }
  const opt = (k: string) => {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === k) return args[i + 1];
      if (args[i].startsWith(k + "=")) return args[i].split("=")[1];
    }
    return null;
  };
  const tp = parseInt(opt("--tensor-parallel-size") || opt("-tp") || "1"),
    pp = parseInt(opt("--pipeline-parallel-size") || opt("-pp") || "1"),
    q = opt("--quantization");
  if (late.G.level!.locks && late.G.level!.locks.model && model !== S.model) {
    late.err("Locked in this level: " + late.G.level!.locks.model);
    return;
  }
  const n = tp * pp;
  if (n > 8 && S.host !== (S.ray.head || "node-1")) {
    late.err(`Run vllm serve on the Ray head node (${S.ray.head || "node-1"}). You're on ${S.host}.`);
    return;
  }
  if (n > 8 && !S.ray.head) {
    late.err(
      `ValueError: tensor_parallel_size × pipeline_parallel_size = ${n} GPUs, but this machine has 8. Start a Ray cluster across the nodes first.`,
    );
    return;
  }
  const avail = S.ray.head ? rayGPUs(S) : 8;
  if (n > avail) {
    late.err(
      `ValueError: the current placement group needs ${n} GPUs, but the Ray cluster has ${avail}. Did all nodes join?`,
    );
    return;
  }
  if (n > 8 && !/--distributed-executor-backend[= ]ray/.test(args.join(" ")))
    late.print("INFO: more GPUs than one node has: using the Ray backend.", "dim");
  const old = { model: S.model, dtype: S.dtype, tp: S.tp, pp: S.pp, job: S.job };
  S.model = model;
  S.dtype = q === "fp8" ? "fp8" : "bf16";
  S.tp = tp;
  S.pp = pp;
  const R = w4serve(S);
  if (!R.fits) {
    late.err(
      `torch.OutOfMemoryError: each of ${n} GPUs needs ${f1(R.usedPer)} GB for ${MODELS[model].name} ${DTYPES[S.dtype].name}; H100 has 80 GB.`,
    );
    Object.assign(S, old);
    return;
  }
  S.job = { tp, pp };
  late.print(
    `INFO: Loading ${MODELS[model].name} (${DTYPES[S.dtype].name}) · TP ${tp} × PP ${pp} over ${n} GPUs${pp > 1 ? ` · layers split into ${pp} stages` : ""}`,
    "dim",
  );
  late.print(`INFO: Uvicorn running on http://${S.host}:8000 · model ready`, "ok");
  summary4();
}
export function runMore(v: string, t: string[]) {
  if (v === "all_reduce_perf" || v === "./all_reduce_perf" || v === "./build/all_reduce_perf") {
    ncclTest(t.slice(1));
    return true;
  }
  if (v === "ibstat") {
    ibstat();
    return true;
  }
  if (v === "ib_write_bw") {
    ibbw(t.slice(1));
    return true;
  }
  if (v === "iperf3") {
    iperf(t.slice(1));
    return true;
  }
  if (v === "ssh") {
    sshCmd(t.slice(1));
    return true;
  }
  if (v === "exit" || v === "logout") {
    if (late.G.S!.world === 4 && late.G.S!.host !== "node-1") {
      late.print(`logout · back on node-1`, "dim");
      late.G.S!.host = "node-1";
    } else late.print("(you're on the main machine)", "dim");
    return true;
  }
  if (v === "hostname") {
    late.print(late.G.S!.world === 4 ? late.G.S!.host : "gpu-node-01");
    return true;
  }
  if (v === "ray") {
    rayCmd(t.slice(1));
    return true;
  }
  if (v === "amd-smi" || v === "rocm-smi") {
    amdSmi(v, t.slice(1));
    return true;
  }
  return false;
}
export const WORLD_INSPECT: Record<number, string[]> = {
  1: ["sm", "hbm", "bw", "link", "mig", "cu", "xcd"],
  2: ["code", "torch", "lib", "runtime", "driver", "gpu"],
  3: ["nvswitch", "nvlink", "pcie", "gpu8", "ifmesh"],
  4: ["nic", "leaf", "spine", "node", "rayhead"],
};
export function helpMore(w: number) {
  if (w === 3)
    return `SERVER COMMANDS (World 3, one 8-GPU server)
  nvidia-smi | nvidia-smi topo -m        GPUs and how they're connected
  all_reduce_perf -b 8 -e 8G -f 16 -g 8  NCCL benchmark (nccl-tests)
  foundry status                         memory, speed, cost for the layout
  foundry server hgx|pcie                NVLink board or PCIe server
  foundry tp 1|2|4|8                     tensor parallel size (8 ÷ TP = replicas)
  foundry load llama-70b|llama-405b|qwen-235b    foundry dtype bf16|fp8|int4
  foundry batch N  (users per replica)   foundry context N   foundry prompt N   foundry kv fp8
  foundry inspect nvswitch|nvlink|pcie
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
  return `CLUSTER COMMANDS (World 4, you're on ${late.G.S!.host})
  ibstat                                 NIC status (InfiniBand / RoCE)
  ib_write_bw node-2                     RDMA bandwidth test to another server
  iperf3 -c node-2                       plain TCP test
  ssh node-2 | exit | hostname           move between servers
  ray start --head --port=6379           start a Ray cluster here
  ray start --address=node-1:6379        join this server to the cluster
  ray status | ray stop
  vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray
  foundry layout 8x2                     shortcut: relaunch with TP 8 × PP 2
  foundry status | foundry mode serve|train | foundry nodes 1|2|4
  foundry net ib|roce|eth | foundry gdr on|off
  foundry inspect nic|leaf|spine|node|ray
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
}
export function manualMore(w: number): ManualSection[] {
  if (w === 3)
    return [
      [
        "Look",
        [
          ["nvidia-smi topo -m", "how GPUs connect"],
          ["all_reduce_perf -b 8 -e 8G -f 16 -g 8", "NCCL benchmark"],
          ["foundry status", ""],
        ],
      ],
      [
        "Layout",
        [
          ["foundry tp 1", "8 replicas"],
          ["foundry tp 2", ""],
          ["foundry tp 4", ""],
          ["foundry tp 8", "one big model"],
          ["foundry batch 64", "users per replica"],
        ],
      ],
      [
        "Hardware",
        [
          ["foundry server hgx", "NVLink"],
          ["foundry server pcie", "no NVLink"],
        ],
      ],
      [
        "Model",
        [
          ["foundry load llama-405b", ""],
          ["foundry load qwen-235b", "MoE"],
          ["foundry kv fp8", ""],
        ],
      ],
    ];
  return [
    [
      "Network",
      [
        ["ibstat", ""],
        ["ib_write_bw node-2", ""],
        ["iperf3 -c node-2", "TCP"],
      ],
    ],
    [
      "Ray",
      [
        ["ray start --head --port=6379", "on node-1"],
        ["ssh node-2", ""],
        ["ray start --address=node-1:6379", "on a worker"],
        ["exit", ""],
        ["ray status", ""],
      ],
    ],
    [
      "Serve",
      [
        [
          "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",
          "",
        ],
        ["foundry layout 8x2", ""],
        ["foundry status", ""],
      ],
    ],
    [
      "Train",
      [
        ["foundry net ib", ""],
        ["foundry gdr on", ""],
        ["foundry nodes 4", ""],
      ],
    ],
  ];
}
