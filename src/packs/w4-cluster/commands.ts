import { w4train } from "./engine.ts";
import { rayGPUs } from "./render.ts";
import { state } from "./state.ts";
import { foundryKv, foundryPrompt } from "../../shared/bench/foundry.ts";
import { f0, f1, f2, fmtT } from "../../shared/data/format.ts";
import { NETS } from "../../shared/data/hardware.ts";
import { DTYPES, MODELS } from "../../shared/data/models.ts";
import { w4serve } from "../../shared/engine/cluster.ts";
import { host } from "../../shared/host.ts";
// World 4's commands: the network, Ray, vLLM, ssh between nodes, and its foundry subcommands.
export function summary4() {
  const S = state();
  if (S.mode === "train") {
    const T = w4train(S);
    host.print(
      `→ ${S.nodes} node${S.nodes > 1 ? "s" : ""} · step ${fmtT(T.step)} (network ${fmtT(T.inter)}) · scaling efficiency ${f1(T.eff * 100)}% · ${f0(T.tput)} tokens/s`,
      T.eff >= 0.95 ? "ok" : "",
    );
    return;
  }
  if (S.mode === "serve") {
    if (!S.job) {
      host.print("No model running. Start Ray, then vllm serve.", "dim");
      return;
    }
    const R = w4serve(S);
    if (!R.fits) {
      host.err(`CUDA out of memory: each GPU needs ${f1(R.usedPer)} GB`);
      return;
    }
    host.print(
      `→ TP ${R.tp} × PP ${R.pp} · ${f1(R.usedPer)} GB per GPU · ${f1(R.perUser)} tok/s per user · TTFT ${fmtT(R.ttft)} · talking ${f0(R.commShare * 100)}%`,
      "ok",
    );
    return;
  }
  host.print(`→ ${S.nodes} nodes on ${NETS[S.net].name} (${NETS[S.net].s} per node)`, "dim");
}
export function ibstat() {
  const S = state();
  S.flags.ibstat = true;
  const n = NETS[S.net];
  if (!n.rdma) {
    host.print("ibstat: no RDMA devices found. This server has one 100 GbE NIC (eth0) running plain TCP.");
    return;
  }
  for (let k = 0; k < 2; k++)
    host.print(
      `CA 'mlx5_${k}'\n\tCA type: MT4129 (ConnectX-7)\n\tPort 1:\n\t\tState: Active\n\t\tPhysical state: LinkUp\n\t\tRate: 400\n\t\tLink layer: ${S.net === "ib" ? "InfiniBand" : "Ethernet"}`,
    );
  host.print(`… mlx5_2 to mlx5_7 identical: 8 ports Active at 400 Gb/s on ${S.host} (one per GPU).`, "dim");
}
export function ibbw(args: string[]) {
  const S = state();
  const tgt = args.find((x) => /^node-\d$/.test(x));
  if (!tgt) {
    host.err("Usage here: ib_write_bw node-2   (run from node-1 against another server)");
    return;
  }
  if (tgt === S.host) {
    host.err("Pick another server than the one you're on.");
    return;
  }
  if (parseInt(tgt.slice(5)) > S.nodes) {
    host.err(`ib_write_bw: couldn't connect to ${tgt}: no such host in this ${S.nodes}-node cluster.`);
    return;
  }
  const n = NETS[S.net];
  if (!n.rdma) {
    host.err("ib_write_bw: no RDMA device. Try iperf3 for plain TCP.");
    return;
  }
  const gb = S.net === "ib" ? 392.6 : 368.4;
  S.flags.ibbw = true;
  host.print(
    `---------------------------------------------------------------------------------------\n                    RDMA_Write BW Test · ${S.host} → ${tgt} · mlx5_0 · ${S.net === "ib" ? "InfiniBand" : "RoCE v2"}\n #bytes     #iterations    BW peak[Gb/sec]    BW average[Gb/sec]   MsgRate[Mpps]\n 65536      5000           ${f1(gb + 1.1)}              ${f1(gb)}                 ${f2((gb * 1e9) / 8 / 65536 / 1e6)}\n---------------------------------------------------------------------------------------`,
  );
  host.print(
    `(≈ ${f1(gb / 8)} GB/s on one NIC. Eight NICs per server ≈ ${f0(gb)} GB/s total; NVLink gives one GPU 450 GB/s each way.)`,
    "dim",
  );
}
export function iperf(args: string[]) {
  const S = state();
  const n = NETS[S.net];
  const gbps = n.key === "eth" ? 71.4 : n.key === "roce" ? 96.0 : 58.0;
  host.print(
    `[ ID] Interval       Transfer     Bitrate\n[  5] 0.00-10.00 sec  ${f1((gbps * 10) / 8)} GBytes  ${f1(gbps)} Gbits/sec   (TCP, one stream, through the CPU)`,
  );
  if (n.rdma) host.print("(TCP can't use RDMA: ib_write_bw shows what the fabric really does.)", "dim");
}
export function sshCmd(args: string[]) {
  const S = state();
  const h = args[0];
  if (!/^node-\d$/.test(h || "") || parseInt(h.slice(5)) > S.nodes) {
    host.err(
      `ssh: Could not resolve hostname ${h || ""}. Hosts: ${[...Array(S.nodes)].map((_, i) => "node-" + (i + 1)).join(", ")}`,
    );
    return;
  }
  S.host = h;
  host.print(`Welcome to ${h} (Ubuntu 22.04, 8 × H100)`, "dim");
}
export function rayCmd(args: string[]) {
  const S = state();
  const sub = args[0],
    rest = args.join(" ");
  if (sub === "start") {
    if (/--head/.test(rest)) {
      if (S.ray.head && S.ray.head !== S.host) {
        host.err(
          `This cluster already has a head on ${S.ray.head}. Join it with ray start --address=${S.ray.head}:6379`,
        );
        return;
      }
      S.ray.head = S.host;
      host.print(
        `Local node IP: 10.0.0.${S.host.slice(5)}\n--------------------\nRay runtime started.\n--------------------\nTo add another node to this Ray cluster, run\n  ray start --address='${S.host}:6379'\nDashboard: http://${S.host}:8265`,
        "ok",
      );
      return;
    }
    const m = rest.match(/--address[= ]'?([\w.-]+):(\d+)'?/);
    if (!m) {
      host.err("ray start --head   or   ray start --address=HEAD:6379");
      return;
    }
    if (!S.ray.head) {
      host.err(
        `ConnectionError: could not reach a Ray head at ${m[1]}:${m[2]}. Start the head first (ray start --head on node-1).`,
      );
      return;
    }
    if (m[1] !== S.ray.head && m[1] !== "10.0.0." + S.ray.head.slice(5)) {
      host.err(`ConnectionError: no Ray head at ${m[1]}:${m[2]}. The head is ${S.ray.head}.`);
      return;
    }
    if (S.host === S.ray.head) {
      host.err("This node is the head. ssh to another node first.");
      return;
    }
    if (!S.ray.workers.includes(S.host)) S.ray.workers.push(S.host);
    host.print(
      `Local node IP: 10.0.0.${S.host.slice(5)}\n--------------------\nRay runtime started.\nThis node joined the cluster at ${m[1]}:${m[2]} with 8 GPUs.`,
      "ok",
    );
    return;
  }
  if (sub === "status") {
    if (!S.ray.head) {
      host.err("ConnectionError: Ray is not running. Start it with ray start --head.");
      return;
    }
    const nodes = 1 + S.ray.workers.length,
      g = nodes * 8;
    host.print(
      `======== Autoscaler status ========\nActive:\n ${nodes} node(s): ${[S.ray.head, ...S.ray.workers].join(", ")}\nResources\n---------------------------------------------------------------\nUsage:\n ${S.job ? S.job.tp * S.job.pp : 0}.0/${g}.0 GPU\n 0.0/${nodes * 224}.0 CPU\n 0B/${nodes * 2}.00TiB memory`,
    );
    if (g >= 16) S.flags.raystatus16 = true;
    return;
  }
  if (sub === "stop") {
    if (S.ray.head === S.host) {
      S.ray = { head: null, workers: [] };
      S.job = null;
      host.print("Stopped all Ray processes. The cluster is gone.", "dim");
    } else {
      S.ray.workers = S.ray.workers.filter((w) => w !== S.host);
      host.print(`Stopped Ray on ${S.host}.`, "dim");
    }
    return;
  }
  host.err("ray start | ray status | ray stop");
}
export function vllmCmd(args: string[]) {
  const S = state();
  if (args[0] !== "serve") {
    host.err("vllm serve MODEL --tensor-parallel-size N --pipeline-parallel-size M --distributed-executor-backend ray");
    return;
  }
  if (S.mode !== "serve") {
    host.err("This cluster is running training. foundry mode serve first.");
    return;
  }
  const name = (args[1] || "").toLowerCase();
  let model = null;
  if (/405b/.test(name)) model = "llama-405b";
  else if (/70b/.test(name)) model = "llama-70b";
  if (!model) {
    host.err("Model not found here. Try meta-llama/Llama-3.1-405B-Instruct");
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
  if (host.G.level!.locks && host.G.level!.locks.model && model !== S.model) {
    host.err("Locked in this level: " + host.G.level!.locks.model);
    return;
  }
  const n = tp * pp;
  if (n > 8 && S.host !== (S.ray.head || "node-1")) {
    host.err(`Run vllm serve on the Ray head node (${S.ray.head || "node-1"}). You're on ${S.host}.`);
    return;
  }
  if (n > 8 && !S.ray.head) {
    host.err(
      `ValueError: tensor_parallel_size × pipeline_parallel_size = ${n} GPUs, but this machine has 8. Start a Ray cluster across the nodes first.`,
    );
    return;
  }
  const avail = S.ray.head ? rayGPUs(S) : 8;
  if (n > avail) {
    host.err(
      `ValueError: the current placement group needs ${n} GPUs, but the Ray cluster has ${avail}. Did all nodes join?`,
    );
    return;
  }
  if (n > 8 && !/--distributed-executor-backend[= ]ray/.test(args.join(" ")))
    host.print("INFO: more GPUs than one node has: using the Ray backend.", "dim");
  const old = { model: S.model, dtype: S.dtype, tp: S.tp, pp: S.pp, job: S.job };
  S.model = model;
  S.dtype = q === "fp8" ? "fp8" : "bf16";
  S.tp = tp;
  S.pp = pp;
  const R = w4serve(S);
  if (!R.fits) {
    host.err(
      `torch.OutOfMemoryError: each of ${n} GPUs needs ${f1(R.usedPer)} GB for ${MODELS[model].name} ${DTYPES[S.dtype].name}; H100 has 80 GB.`,
    );
    Object.assign(S, old);
    return;
  }
  S.job = { tp, pp };
  host.print(
    `INFO: Loading ${MODELS[model].name} (${DTYPES[S.dtype].name}) · TP ${tp} × PP ${pp} over ${n} GPUs${pp > 1 ? ` · layers split into ${pp} stages` : ""}`,
    "dim",
  );
  host.print(`INFO: Uvicorn running on http://${S.host}:8000 · model ready`, "ok");
  summary4();
}

/** Terminal commands World 4 runs (all_reduce_perf is World 3's tool; here it points at the network test). */
export function commands(v: string, t: string[]): boolean {
  const S = state();
  if (v === "vllm") {
    vllmCmd(t.slice(1));
    return true;
  }
  if (v === "all_reduce_perf" || v === "./all_reduce_perf" || v === "./build/all_reduce_perf") {
    host.err("Across nodes this runs under mpirun; here, use ib_write_bw to test the network.");
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
    if (S.host !== "node-1") {
      host.print(`logout · back on node-1`, "dim");
      S.host = "node-1";
    } else host.print("(you're on the main machine)", "dim");
    return true;
  }
  if (v === "hostname") {
    host.print(S.host);
    return true;
  }
  if (v === "ray") {
    rayCmd(t.slice(1));
    return true;
  }
  return false;
}

/** foundry subcommands in World 4. Returns true if handled (the rest: guards and core). */
export function foundry(t: string[]): boolean {
  const S = state(),
    L = host.G.level!,
    sub = (t[0] || "").toLowerCase(),
    a = (t[1] || "").toLowerCase(),
    C = L.controls || [];
  if (sub === "kv") {
    foundryKv(S, a, summary4);
    return true;
  }
  if (sub === "prompt") {
    foundryPrompt(S, t[1], summary4);
    return true;
  }

  if (sub === "status" || sub === "bench") {
    summary4();
    return true;
  }
  if (["load", "dtype", "batch", "users", "gpu"].includes(sub)) {
    host.err(
      sub === "gpu"
        ? "This cluster is all H100s."
        : "The model runs through vLLM here: relaunch with vllm serve … (or foundry layout TPxPP).",
    );
    return true;
  }
  if (sub === "mode") {
    if (!C.includes("mode4")) {
      host.err("Locked in this level.");
      return true;
    }
    if (a !== "serve" && a !== "train") {
      host.err("foundry mode serve | train");
      return true;
    }
    S.mode = a;
    if (a === "serve" && S.nodes < 2) S.nodes = 2;
    host.print(`Workload: ${a === "train" ? "data-parallel training of Llama 3.1 8B" : "multi-node serving"}`, "dim");
    summary4();
    return true;
  }
  if (sub === "nodes") {
    const n = parseInt(a);
    if (![1, 2, 4].includes(n)) {
      host.err("foundry nodes 1 | 2 | 4");
      return true;
    }
    if (!C.includes("nodes")) {
      host.err("Locked in this level: the cluster size is fixed.");
      return true;
    }
    if (S.mode === "serve" && n < 2) {
      host.err("Serving 405B BF16 needs at least 2 nodes.");
      return true;
    }
    S.nodes = n;
    if (S.ray.head) S.ray.workers = ["node-2", "node-3", "node-4"].slice(0, n - 1);
    host.print(`${n} node${n > 1 ? "s" : ""} (${n * 8} GPUs)`, "dim");
    summary4();
    return true;
  }
  if (sub === "net") {
    if (!NETS[a]) {
      host.err("foundry net ib | roce | eth");
      return true;
    }
    if (!C.includes("net")) {
      host.err("Locked in this level.");
      return true;
    }
    S.net = a;
    host.print(`Network: ${NETS[a].d}`, "dim");
    summary4();
    return true;
  }
  if (sub === "gdr") {
    if (!C.includes("gdr")) {
      host.err("Locked in this level.");
      return true;
    }
    S.gdr = /^(on|true|1|yes)$/.test(a);
    host.print(
      `GPUDirect RDMA ${S.gdr ? "on: NICs read GPU memory directly" : "off: data is staged through CPU memory"}`,
      "dim",
    );
    if (S.gdr && !NETS[S.net].rdma) host.print("(No effect on plain TCP Ethernet: it has no RDMA.)", "dim");
    summary4();
    return true;
  }
  if (sub === "layout") {
    const m = a.match(/^(\d+)x(\d+)$/);
    if (!m) {
      host.err("foundry layout TPxPP, e.g. foundry layout 8x2");
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
  return false;
}
