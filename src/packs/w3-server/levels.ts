import type { Lab, Level, LevelDef, W3State } from "../../core/types.ts";
import { SERVERS } from "../../shared/data/hardware.ts";
import { w3 } from "../../shared/engine/server.ts";
// World 3 · Many GPUs, one server: its five levels and the server lab.
const W3L = [
  {
    id: "hgx-board",
    world: 3,
    title: "Meet the HGX board",
    concept: "NVLink, NVSwitch & NCCL",
    layers: { on: [9], near: [8] },
    panels: ["board"],
    controls: ["srv", "model", "dtype", "tp"],
    brief: `<p>A typical AI server is an <b>HGX board</b>: 8 GPUs, each wired by 18 <b>NVLink</b> links to 4 <b>NVSwitch</b> chips. Any GPU can reach any other at 900 GB/s, about 14× faster than PCIe.</p><p>Right now the server runs <b>8 separate copies</b> of 70B, one per GPU (8 replicas, tensor-parallel size 1), so the GPUs never talk to each other.</p><p>Look at how the GPUs are connected with <code>nvidia-smi topo -m</code>. Tap an NVSwitch. Then measure GPU-to-GPU speed with NCCL's own benchmark, <code>all_reduce_perf</code>.</p>`,
    setup(S) {
      S.srv = "hgx";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.tp = 1;
      S.batch = 4;
    },
    goals: [
      { t: "Show the GPU topology (nvidia-smi topo -m)", ok: (S) => !!S.flags.topo },
      { t: "Inspect an NVSwitch chip", ok: (S) => S.inspected.includes("nvswitch") },
      { t: "Run the NCCL all-reduce benchmark", ok: (S) => !!S.flags.nccl },
    ],
    hints: [
      "Type nvidia-smi topo -m. NV18 means 18 NVLinks between that pair of GPUs.",
      "Tap one of the small chips in the middle of the board. Then type all_reduce_perf -b 8 -e 8G -g 8.",
    ],
    answer: () => "nvidia-smi topo -m && foundry inspect nvswitch && all_reduce_perf -b 8 -e 8G -f 16 -g 8",
    chips: ["nvidia-smi topo -m", "all_reduce_perf -b 8 -e 8G -f 16 -g 8", "foundry inspect nvswitch", "nvidia-smi"],
    debrief: `<p>You've seen the two speeds inside a server: tiny messages are limited by <b>latency</b> (microseconds per hop), big ones by <b>bandwidth</b> (the busbw column approaching ~450 GB/s each way).</p><ul><li><b>NCCL</b> is the library every framework uses for GPU-to-GPU communication. <code>all_reduce_perf</code> from nccl-tests is the standard health check for a new server or cluster.</li><li><b>All-reduce</b>: every GPU contributes a tensor and every GPU ends up with the sum. Tensor parallelism does one after every layer.</li><li>"NV18" in the topology means every pair of GPUs has a full NVLink path. On a PCIe server you'd see PIX, NODE or SYS instead: slower paths through switches and CPUs.</li><li>Other boards differ mainly in this fabric. HGX B200 doubles NVLink to 1.8 TB/s per GPU. AMD's 8 × MI300X board wires GPUs in a direct mesh with no switch. NVIDIA's GB200 NVL72 stretches one NVLink domain across 72 GPUs in a rack. Try them in the Server lab.</li></ul>`,
    links: {
      up: "Inference engines use NCCL under the hood whenever a model spans GPUs; you rarely call it directly.",
      down: "NVLink is the scale-up network. Between servers you need a scale-out network: World 4.",
    },
  },

  {
    id: "tensor-parallel",
    world: 3,
    title: "Too big for one",
    concept: "Tensor parallelism",
    layers: { on: [9], near: [5, 8] },
    panels: ["board"],
    controls: ["srv", "model", "dtype", "tp", "batch"],
    locks: { model: "The team wants Llama 3.1 405B.", dtype: "Quality review requires FP8." },
    brief: `<p>Next up: <b>Llama 3.1 405B</b> in FP8, about <b>406 GB</b>. No single GPU comes close, but the server has 640 GB in total.</p><p><b>Tensor parallelism (TP)</b> splits every layer's weight matrices across GPUs. Each GPU holds a slice and computes its part of every token; after each layer the GPUs combine partial results with an all-reduce over NVLink.</p><p>Choose a TP size so 405B fits on the server.</p><div class="mathbox">weights per GPU = 406 GB ÷ TP size
TP 4 → 101 GB (> 80 GB)    TP 8 → 51 GB</div>`,
    setup(S) {
      S.srv = "hgx";
      S.model = "llama-405b";
      S.dtype = "fp8";
      S.tp = 1;
      S.batch = 16;
    },
    goals: [
      { t: "Llama 3.1 405B fits in every GPU's memory", ok: (S) => S.model === "llama-405b" && w3(S).fits },
      { t: "Precision FP8", ok: (S) => S.dtype === "fp8" },
    ],
    hints: [
      "Each GPU holds 1/TP of the weights plus its share of the KV cache. Watch the per-GPU memory bars.",
      "TP 4 still needs 101 GB per GPU. Go to TP 8.",
    ],
    answer: () => "foundry tp 8",
    chips: ["foundry status", "foundry tp 4", "foundry tp 8", "nvidia-smi"],
    debrief: `<p>With TP 8 the server acts as one big GPU with 640 GB: every GPU holds 1/8 of each layer, and they combine results 252 times per token (2 all-reduces × 126 layers).</p><ul><li>Look at the communication share: around 17–20% of each token's time goes to NVLink traffic. That's the price of splitting.</li><li>The same flag in real life: <code>vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --quantization fp8</code>.</li><li>TP 8 also made each token faster: each GPU reads only 1/8 of the weights.</li></ul>`,
    links: {
      up: "To the serving layer this is one 'model endpoint' backed by 8 GPUs.",
      down: "Every all-reduce is NCCL over NVLink. Next level: what happens without NVLink.",
    },
  },

  {
    id: "nvlink-vs-pcie",
    world: 3,
    title: "The slow road",
    concept: "NVLink vs PCIe",
    layers: { on: [9], near: [8] },
    panels: ["board"],
    controls: ["srv", "model", "dtype", "tp", "batch", "prompt"],
    locks: {
      model: "The team wants Llama 3.1 405B.",
      dtype: "Quality review requires FP8.",
      tp: "405B needs all 8 GPUs.",
      prompt: "Typical prompt: 8k tokens.",
    },
    brief: `<p>Procurement found a cheaper box: the <b>same 8 H100s</b> in a <b>PCIe server</b>, with no NVLink. On paper it has identical GPUs at 20% less per hour.</p><p>Run 405B with TP 8 and look at what happens to time to first token and token speed. Every layer's all-reduce now crawls through PCIe switches and the CPUs.</p><p>The product needs <b>first token in at most 1.5 s</b> for an 8k prompt and <b>at least 35 tokens/s</b> per user.</p>`,
    setup(S) {
      S.srv = "pcie";
      S.model = "llama-405b";
      S.dtype = "fp8";
      S.tp = 8;
      S.batch = 16;
      S.prompt = 8192;
    },
    goals: [
      { t: "Time to first token at most 1.5 s", ok: (S) => w3(S).fits && w3(S).ttft <= 1.5 },
      { t: "Each user gets at least 35 tokens/s", ok: (S) => w3(S).fits && w3(S).perUser >= 35 },
    ],
    hints: [
      "Compare the communication share on the two servers.",
      "Prefill all-reduces move hundreds of MB per layer: PCIe can't keep up. Switch to the HGX server.",
    ],
    answer: () => "foundry server hgx",
    chips: ["foundry status", "foundry server hgx", "all_reduce_perf -b 8 -e 8G -f 16 -g 8", "nvidia-smi topo -m"],
    debrief: `<p>Same GPUs, very different server. On PCIe, communication took ~40% of every token and first-token time nearly quadrupled, because prefill pushes hundreds of megabytes through an all-reduce after every layer.</p><ul><li>The cheaper box isn't cheaper per token: it costs more per million tokens because it does less work per hour.</li><li>PCIe servers are fine for running many independent small replicas (TP 1), where GPUs never talk.</li><li>When you compare GPU offers, ask about the interconnect, not just the GPU model.</li></ul>`,
    links: {
      up: "Latency SLOs (layers 1 and 3) quietly depend on this hardware detail.",
      down: "NVLink stops at the edge of the server (or the rack, for GB200 NVL72). Beyond that it's InfiniBand or Ethernet: World 4.",
    },
  },

  {
    id: "tp-vs-replicas",
    world: 3,
    title: "Shards or replicas?",
    concept: "TP size vs replicas",
    layers: { on: [9], near: [5] },
    panels: ["board"],
    controls: ["srv", "model", "dtype", "tp", "batch"],
    locks: {
      model: "The product team chose Llama 3.1 70B.",
      dtype: "Quality review signed off on FP8.",
      srv: "You have one HGX server.",
    },
    brief: `<p>Back to <b>Llama 3.1 70B</b> on one HGX server. You can run <b>8 replicas</b> (TP 1), <b>4 × TP 2</b>, <b>2 × TP 4</b> or <b>1 × TP 8</b>. The batch slider sets users per replica.</p><p>Fewer, bigger shards pay more NVLink traffic but leave far more memory for KV cache, so each replica can batch more users. More replicas avoid communication but each one is cramped.</p><p>Hit <b>at least 8,000 tokens/s</b> for the whole server while every user still gets <b>at least 60 tokens/s</b>.</p>`,
    setup(S) {
      S.srv = "hgx";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.tp = 1;
      S.batch = 4;
      S.ctx = 4096;
    },
    goals: [
      { t: "Server throughput at least 8,000 tokens/s", ok: (S) => w3(S).fits && w3(S).total >= 8000 },
      { t: "Each user gets at least 60 tokens/s", ok: (S) => w3(S).fits && w3(S).perUser >= 60 },
      { t: "Everything fits", ok: (S) => w3(S).fits },
    ],
    hints: [
      "TP 1 can't batch: 71 GB of weights leaves ~6 GB per GPU for KV cache. Try each TP size and raise the batch until memory or per-user speed runs out.",
      "TP 4 runs out just short of both targets (about 7,600 tokens/s at 59 tok/s per user). TP 8 with a very large batch gets further.",
    ],
    answer: () => "foundry tp 8 && foundry batch 128",
    chips: ["foundry status", "foundry tp 2", "foundry tp 4", "foundry tp 8", "foundry batch 128"],
    debrief: `<p>Here TP 8 won: it spends ~25% of each step on NVLink, but holding only 9 GB of weights per GPU leaves room for a 128-user batch.</p><ul><li>The answer depends on the interconnect. On the PCIe server (try it in the Server lab), communication eats two-thirds of every TP 8 step and smaller TP groups win.</li><li>It also depends on the model and target. A model that fits comfortably on one GPU with room for KV cache is usually best served as many small replicas.</li><li>Production teams sweep these settings per model and per GPU type, often with the inference engine's benchmark tools.</li></ul>`,
    links: {
      up: "The gateway (layer 3) can route traffic across replicas; the serving layer (5) decides TP size per replica.",
      down: "Across servers the same trade-off appears with a much slower network: World 4.",
    },
  },

  {
    id: "quiz-one-server",
    world: 3,
    title: "Checkpoint: one server",
    concept: "World 3 quiz",
    quiz: true,
    layers: { on: [9], near: [8, 5] },
    questions: [
      {
        q: "What does 'NV18' between two GPUs in nvidia-smi topo -m mean?",
        o: [
          "They share 18 GB of memory",
          "They're connected by 18 NVLink links",
          "They're 18 hops apart",
          "They run CUDA 18",
        ],
        a: 1,
        why: "On HGX H100, each GPU has 18 NVLink 4 links into NVSwitch, so every pair shows NV18.",
      },
      {
        q: "Why does tensor parallelism need fast GPU-to-GPU links?",
        o: [
          "It copies the whole model to each GPU",
          "GPUs combine partial results with an all-reduce after every layer",
          "It only runs on one GPU at a time",
          "It needs to read from disk",
        ],
        a: 1,
        why: "Each GPU computes part of every layer, so results must be summed across GPUs twice per layer, for every token.",
      },
      {
        q: "Same 8 H100s, NVLink server versus PCIe server, running 405B with TP 8. The PCIe server…",
        o: [
          "Is faster because it's simpler",
          "Is about the same",
          "Is much slower, especially for long prompts, because all-reduces crawl over PCIe",
          "Can't run TP at all",
        ],
        a: 2,
        why: "Prefill all-reduces move hundreds of MB per layer. PCIe at ~40 GB/s can't keep up with NVLink at ~450 GB/s each way.",
      },
      {
        q: "8 replicas of a 70B model (TP 1) on 8 × H100 struggle mainly because…",
        o: [
          "The GPUs talk too much",
          "Each GPU has little memory left for KV cache, so batches stay tiny",
          "TP 1 is not supported",
          "Prefill is too slow",
        ],
        a: 1,
        why: "71 GB of weights on an 80 GB GPU leaves ~6 GB for conversations. Larger TP frees memory for batching.",
      },
      {
        q: "What is NCCL?",
        o: [
          "A GPU model",
          "NVIDIA's library for GPU-to-GPU communication (all-reduce and friends)",
          "A container runtime",
          "A network cable",
        ],
        a: 1,
        why: "NCCL implements collectives over NVLink, PCIe and the network. nccl-tests' all_reduce_perf benchmarks it.",
      },
    ],
    debrief: `<p>Inside one server: NVLink makes 8 GPUs act like one big one, tensor parallelism splits models across them, and NCCL does the talking. The interconnect decides how well that works.</p>`,
    links: { up: "Serving engines turn this into one endpoint per replica.", down: "World 4 goes beyond one server." },
  },
] satisfies LevelDef<W3State>[] as LevelDef<W3State>[] as Level<W3State>[];

// The single file's later steps, in its order: the four lesson levels offer the two H100 servers only.
const [board, tooBig, slowRoad, shards, quiz] = W3L;
for (const l of [board, tooBig, slowRoad, shards]) l.srvs = ["hgx", "pcie"];
export const LEVELS: Level<W3State>[] = [board, tooBig, slowRoad, shards, quiz];
export const LAB = {
  id: "server-lab",
  world: 3,
  title: "Server lab",
  concept: "Free play",
  lab: true,
  layers: { on: [9], near: [5, 8] },
  panels: ["board"],
  controls: ["srv", "model", "dtype", "tp", "batch", "ctx", "prompt"],
  brief: `<p>One 8-GPU server, every knob unlocked. Try the MoE model with TP 8, compare HGX with PCIe at each TP size, or find the cheapest layout for 405B.</p>`,
  setup(S) {
    S.srv = "hgx";
    S.model = "llama-70b";
    S.dtype = "fp8";
    S.tp = 4;
    S.batch = 32;
  },
  goals: [],
  hints: [],
  chips: [
    "foundry status",
    "nvidia-smi topo -m",
    "all_reduce_perf -b 8 -e 8G -f 16 -g 8",
    "foundry server pcie",
    "foundry load qwen-235b",
  ],
} satisfies LevelDef<W3State> as LevelDef<W3State> as Lab<W3State>;
LAB.srvs = Object.keys(SERVERS);
LAB.brief = `<p>8-GPU servers, every knob unlocked: HGX H100, a PCIe H100 box, HGX B200 with NVLink 5, and AMD's 8 × MI300X mesh. Compare the same model and TP size across all four.</p>`;
LAB.chips = [
  "foundry status",
  "foundry server hgxb200",
  "foundry server mi300x",
  "nvidia-smi topo -m",
  "all_reduce_perf -b 8 -e 8G -f 16 -g 8",
];
