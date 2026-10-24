import type { Lab, Level, LevelDef, W4State } from "../../core/types.ts";
import { w4train } from "./engine.ts";
import { w4serve } from "../../shared/engine/cluster.ts";
// World 4 · Many servers: its five levels and the cluster lab.
export const LEVELS = [
  {
    id: "fabric",
    world: 4,
    title: "Meet the fabric",
    concept: "InfiniBand, RDMA & rails",
    layers: { on: [10], near: [9] },
    panels: ["cluster"],
    controls: ["net"],
    brief: `<p>Inside a server, GPUs use NVLink. Between servers, each GPU gets its own network card: a <b>400 Gb/s NIC per GPU</b>, eight per server. Each NIC is a <b>rail</b>: GPU 1 of every server plugs into the same <b>leaf switch</b>, GPU 2 into the next, and leaves connect through <b>spine switches</b>.</p><p>Most AI clusters run <b>InfiniBand</b> or RDMA-capable Ethernet (<b>RoCE</b>). <b>RDMA</b> lets one machine's NIC write straight into another machine's memory without the CPUs copying data.</p><p>You're logged into <code>node-1</code>. Check the NICs with <code>ibstat</code>, measure the link to <code>node-2</code> with <code>ib_write_bw</code>, and tap a NIC and a leaf switch in the diagram.</p>`,
    setup(S) {
      S.mode = "fabric";
      S.nodes = 2;
      S.net = "ib";
    },
    goals: [
      { t: "Check NIC status (ibstat)", ok: (S) => !!S.flags.ibstat },
      { t: "Measure bandwidth to node-2 (ib_write_bw node-2)", ok: (S) => !!S.flags.ibbw },
      { t: "Inspect a NIC", ok: (S) => S.inspected.includes("nic") },
      { t: "Inspect a leaf switch", ok: (S) => S.inspected.includes("leaf") },
    ],
    hints: [
      "Type ibstat. Each mlx5 device is one NIC; look for State: Active and Rate: 400.",
      "Type ib_write_bw node-2. Then tap one of the small dots under a server (a NIC) and the leaf switch bar.",
    ],
    answer: () => "ibstat && ib_write_bw node-2 && foundry inspect nic && foundry inspect leaf",
    chips: ["ibstat", "ib_write_bw node-2", "foundry inspect nic", "foundry inspect leaf", "foundry inspect spine"],
    debrief: `<p>One NIC gave ~390 Gb/s, close to its 400 Gb/s line rate. Eight of them give each server about <b>400 GB/s</b> to the rest of the cluster.</p><ul><li>That sounds like a lot, but per GPU it's 50 GB/s against NVLink's 450 GB/s. Crossing a server boundary is ~9× slower per GPU, and adds microseconds of latency per hop.</li><li>That gap is the single most important fact for multi-node design: keep the chattiest traffic inside the server.</li><li>Rail-optimised wiring means GPU n in one server usually reaches GPU n in another through a single switch.</li></ul>`,
    links: {
      up: "Training clusters and multi-node inference both live or die by this network.",
      down: "Physically: optical cables, transceivers and switches, often a major share of cluster cost and power.",
    },
  },

  {
    id: "multi-node",
    world: 4,
    title: "Two boxes, one model",
    concept: "Ray clusters & multi-node",
    layers: { on: [10], near: [5, 8] },
    panels: ["cluster"],
    controls: [],
    brief: `<p>The team wants <b>Llama 3.1 405B in BF16</b>, no quantisation: <b>812 GB</b>. One HGX H100 server has 640 GB, so it takes <b>two servers</b>.</p><p>Something has to make two machines act as one pool of GPUs. <b>Ray</b> does that: start a <b>head node</b>, have the other machine <b>join</b> it, and Ray sees 16 GPUs. vLLM then uses Ray to place one model across them.</p><p>You're on <code>node-1</code>. Start Ray, <code>ssh node-2</code> and join it to the cluster, check <code>ray status</code>, then launch the model across 16 GPUs from the head node.</p><div class="mathbox">node-1$ ray start --head --port=6379
node-2$ ray start --address=node-1:6379
node-1$ vllm serve meta-llama/Llama-3.1-405B-Instruct \\
          --tensor-parallel-size 8 --pipeline-parallel-size 2 \\
          --distributed-executor-backend ray</div>`,
    setup(S) {
      S.mode = "serve";
      S.nodes = 2;
      S.net = "ib";
      S.model = "llama-405b";
      S.dtype = "bf16";
      S.job = null;
      S.tp = 8;
      S.pp = 2;
      S.batch = 8;
      S.prompt = 8192;
    },
    goals: [
      { t: "Start the Ray head on node-1", ok: (S) => S.ray.head === "node-1" },
      { t: "node-2 joins the cluster", ok: (S) => S.ray.workers.includes("node-2") },
      { t: "ray status shows 16 GPUs", ok: (S) => !!S.flags.raystatus16 },
      { t: "405B BF16 is serving across 16 GPUs", ok: (S) => !!(S.job && S.job.tp * S.job.pp === 16) },
    ],
    hints: [
      "On node-1: ray start --head. Then ssh node-2 and run ray start --address=node-1:6379.",
      "Back on node-1 (type exit), run ray status, then the vllm serve command from the brief.",
    ],
    answer: () =>
      "ray start --head --port=6379 && ssh node-2 && ray start --address=node-1:6379 && exit && ray status && vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",
    chips: [
      "ray start --head --port=6379",
      "ssh node-2",
      "ray start --address=node-1:6379",
      "exit",
      "ray status",
      "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",
    ],
    debrief: `<p>Two servers, one model. Ray pooled 16 GPUs, and vLLM used <b>tensor parallelism inside each server</b> (TP 8 over NVLink) and <b>pipeline parallelism across servers</b> (PP 2: layers 1–63 on node-1, 64–126 on node-2).</p><ul><li>Ray is a general distributed-computing framework: the same cluster can run training (Ray Train), batch inference (Ray Data) and serving (Ray Serve).</li><li>The head node is a single point of control; production setups add monitoring and restart policies.</li><li>On Kubernetes, <b>KubeRay</b> creates Ray clusters as Kubernetes objects (World 5). Slurm is the HPC alternative, common for training.</li></ul>`,
    links: {
      up: "To the gateway this is still one endpoint, just a 16-GPU one.",
      down: "Pipeline stages hand activations to each other over InfiniBand, once per stage per step. Next level: why that split matters.",
    },
  },

  {
    id: "pipeline-parallel",
    world: 4,
    title: "Split the right way",
    concept: "TP inside, PP across",
    layers: { on: [10], near: [5, 8] },
    panels: ["cluster"],
    controls: ["layout"],
    brief: `<p>A teammate launched 405B as <b>TP 16</b>: one tensor-parallel group spanning both servers. It runs, but first tokens are slow.</p><p>With TP 16, the all-reduce after <b>every layer</b> must cross InfiniBand, ~9× slower per GPU than NVLink. <b>Pipeline parallelism</b> instead passes activations between servers only <b>once per stage</b>.</p><p>Relaunch with a layout that gets <b>first token in at most 2 s</b> (8k prompt) and keeps <b>at least 20 tokens/s</b> per user.</p>`,
    setup(S) {
      S.mode = "serve";
      S.nodes = 2;
      S.net = "ib";
      S.model = "llama-405b";
      S.dtype = "bf16";
      S.ray = { head: "node-1", workers: ["node-2"] };
      S.tp = 16;
      S.pp = 1;
      S.job = { tp: 16, pp: 1 };
      S.batch = 8;
      S.prompt = 8192;
    },
    goals: [
      { t: "Time to first token at most 2.0 s", ok: (S) => !!S.job && w4serve(S).fits && w4serve(S).ttft <= 2 },
      { t: "Each user gets at least 20 tokens/s", ok: (S) => !!S.job && w4serve(S).fits && w4serve(S).perUser >= 20 },
    ],
    hints: [
      "Compare the layouts: TP16×PP1, TP8×PP2, TP4×PP4. Watch where the network lanes light up.",
      "Keep tensor parallelism inside a server (TP 8) and use pipeline parallelism across servers (PP 2).",
    ],
    answer: () =>
      "vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",
    chips: ["foundry status", "foundry layout 8x2", "foundry layout 4x4", "foundry layout 16x1"],
    debrief: `<p>The rule of thumb: <b>TP size = GPUs per server, PP size = number of servers</b>. Chatty traffic stays on NVLink; only one hand-off per stage crosses the network.</p><ul><li>TP 16 actually had slightly faster decode (each GPU read less), but its prefill all-reduces crossed InfiniBand 252 times and doubled first-token time.</li><li>TP 4 × PP 4 kept traffic local but made every token walk through 4 stages in turn: slow decode.</li><li>Pipeline parallelism shines for throughput: different requests can occupy different stages at once.</li></ul>`,
    links: {
      up: "Layout is a serving-layer (5) setting, but choosing it well needs to know the network (10).",
      down: "Even PP's hand-offs need RDMA to be quick. Next: a workload where the network carries much more.",
    },
  },

  {
    id: "data-parallel",
    world: 4,
    title: "Train across racks",
    concept: "Data parallel training",
    layers: { on: [10], near: [8] },
    panels: ["cluster"],
    controls: ["nodes", "net", "gdr"],
    brief: `<p>Training is the network's hardest test. In <b>data-parallel training</b>, every GPU processes different data, then all GPUs <b>all-reduce their gradients</b>, every step: 16 GB for an 8B model.</p><p>The research team is fine-tuning Llama 3.1 8B on <b>4 servers</b> (32 GPUs), but the cluster was built on plain 100G Ethernet. 4 servers run barely faster than 2.</p><p>Get <b>scaling efficiency to at least 95%</b> on 4 nodes: 4 servers should do ≥95% of 4× the work of one. Choose the network, and decide whether to use <b>GPUDirect RDMA</b>, which lets NICs read GPU memory directly instead of copying through the CPU.</p>`,
    setup(S) {
      S.mode = "train";
      S.nodes = 4;
      S.net = "eth";
      S.gdr = false;
    },
    goals: [
      { t: "Training on 4 nodes", ok: (S) => S.nodes === 4 },
      { t: "Scaling efficiency at least 95%", ok: (S) => S.nodes === 4 && w4train(S).eff >= 0.95 },
    ],
    hints: [
      "One 100G NIC shared by 8 GPUs is ~32× less bandwidth per GPU than one 400G NIC each. Switch to InfiniBand or RoCE.",
      "Then turn GPUDirect RDMA on: without it, every gradient is copied through CPU memory.",
    ],
    answer: () => "foundry net ib && foundry gdr on",
    chips: ["foundry status", "foundry net ib", "foundry net roce", "foundry gdr on", "foundry nodes 2"],
    debrief: `<p>With a 400G RDMA fabric and GPUDirect, the gradient all-reduce shrank from ~2.8 s to ~70 ms per step, and 4 servers now deliver ~96% of the ideal.</p><ul><li>RoCE got within a whisker of InfiniBand here. On a well-tuned network the gap is small; InfiniBand's advantage is that it's lossless and low-latency out of the box.</li><li>Without GPUDirect RDMA, data takes a detour through CPU memory: efficiency dropped below 91%.</li><li>At thousands of GPUs these small percentages are millions of dollars, which is why the network can be 15–20% of a cluster's cost.</li></ul>`,
    links: {
      up: "Training clusters feed the model layer (6): faster training means more experiments and better models.",
      down: "Next up the stack: Kubernetes and Slurm decide which jobs get which nodes (World 5).",
    },
  },

  {
    id: "quiz-cluster",
    world: 4,
    title: "Checkpoint: the cluster",
    concept: "World 4 quiz",
    quiz: true,
    layers: { on: [10], near: [5, 8, 9] },
    questions: [
      {
        q: "Per GPU, how does an InfiniBand NDR link compare with NVLink on H100?",
        o: [
          "About the same",
          "~50 GB/s vs ~450 GB/s each way: roughly 9× slower",
          "InfiniBand is faster",
          "InfiniBand only connects storage",
        ],
        a: 1,
        why: "Each GPU's 400 Gb/s NIC carries 50 GB/s. NVLink 4 carries 450 GB/s each way. That gap shapes every multi-node design.",
      },
      {
        q: "What does RDMA let a NIC do?",
        o: [
          "Compress data",
          "Write directly into another machine's memory without the CPUs copying it",
          "Run CUDA kernels",
          "Encrypt the model",
        ],
        a: 1,
        why: "RDMA cuts out CPU copies and kernel overhead, giving low latency and high throughput. GPUDirect RDMA extends it to GPU memory.",
      },
      {
        q: "You need 16 GPUs across 2 servers for one model. The usual layout is…",
        o: [
          "TP 16 across both servers",
          "TP 8 inside each server, PP 2 across servers",
          "PP 16",
          "Two independent replicas",
        ],
        a: 1,
        why: "Tensor parallelism all-reduces every layer, so it belongs on NVLink. Pipeline stages only hand off activations once per stage.",
      },
      {
        q: "What does ray start --address=node-1:6379 do on node-2?",
        o: [
          "Starts a new head node",
          "Joins node-2's CPUs and GPUs to the Ray cluster headed by node-1",
          "Downloads the model",
          "Opens port 6379 to the internet",
        ],
        a: 1,
        why: "Workers join the head node's cluster. Ray then schedules work across all joined resources.",
      },
      {
        q: "Data-parallel training scaling efficiency drops from 96% to 40% when you move from 400G RDMA to one 100G Ethernet NIC per server. Why?",
        o: [
          "The GPUs got slower",
          "The gradient all-reduce every step now takes longer than the compute",
          "Ray isn't installed",
          "The model got bigger",
        ],
        a: 1,
        why: "Every step must all-reduce 16 GB of gradients across servers. With ~32× less bandwidth per GPU, the network dominates the step.",
      },
    ],
    debrief: `<p>Beyond one server: NICs and rails, RDMA, InfiniBand vs RoCE, Ray to pool machines, and the golden rule of putting chatty traffic on NVLink.</p>`,
    links: {
      up: "Next: World 5, Kubernetes, decides who gets these GPUs.",
      down: "You've now covered the physical bottom of the stack.",
    },
  },
] satisfies LevelDef<W4State>[] as LevelDef<W4State>[] as Level<W4State>[];
export const LAB = {
  id: "cluster-lab",
  world: 4,
  title: "Cluster lab",
  concept: "Free play",
  lab: true,
  layers: { on: [10], near: [5, 8, 9] },
  panels: ["cluster"],
  controls: ["mode4", "nodes", "net", "gdr", "layout"],
  brief: `<p>A small cluster, every knob unlocked, with Ray already running across all nodes. Switch between multi-node serving and data-parallel training, change the network, and see what breaks.</p>`,
  setup(S) {
    S.mode = "serve";
    S.nodes = 2;
    S.net = "ib";
    S.model = "llama-405b";
    S.dtype = "bf16";
    S.ray = { head: "node-1", workers: ["node-2", "node-3", "node-4"] };
    S.tp = 8;
    S.pp = 2;
    S.job = { tp: 8, pp: 2 };
    S.batch = 8;
    S.prompt = 8192;
  },
  goals: [],
  hints: [],
  chips: ["foundry status", "ray status", "ibstat", "foundry mode train", "foundry net roce"],
} satisfies LevelDef<W4State> as LevelDef<W4State> as Lab<W4State>;
