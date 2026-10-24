import { WL, wlCheck } from "./render.ts";
import type { Lab } from "../../core/types.ts";
import type { Level, LevelDef, Question, W1State } from "../../core/types.ts";
import { migAssign } from "./engine.ts";
import { ALL_GPUS, GPUS, NV_GPUS } from "../../shared/data/hardware.ts";
import { MODELS } from "../../shared/data/models.ts";
import { w1 } from "../../shared/engine/gpu.ts";
// World 1 · Inside one GPU: its thirteen levels and the GPU lab.
export const fits = (S: W1State) => w1(S).fits;
export const hiQ = (S: W1State) => S.dtype === "bf16" || S.dtype === "fp8";
const BASE = [
  {
    id: "gpu-anatomy",
    world: 1,
    title: "Meet the chip",
    concept: "SMs, Tensor Cores, HBM",
    layers: { on: [9], near: [] },
    panels: ["chip"],
    controls: ["gpu", "model", "dtype"],
    brief: `<p>A GPU is a package with two kinds of parts that matter for AI. In the middle is the <b>die</b>: silicon tiled with <b>Streaming Multiprocessors (SMs)</b>, each holding <b>Tensor Cores</b> that do matrix math. Around it sit stacks of <b>HBM</b>, the GPU's own memory, where the model lives.</p><p>The picture is a map of an H100 serving a small model. Tap a square in the die and a memory stack to see what they do. Run <code>nvidia-smi</code>, the first command every GPU operator types. Then compare with a Blackwell GPU.</p>`,
    setup(S) {
      S.model = "llama-8b";
      S.dtype = "bf16";
      S.batch = 1;
      S.ctx = 4096;
    },
    goals: [
      { t: "Run nvidia-smi", ok: (S) => !!S.flags.smi },
      { t: "Inspect an SM (tap a square in the die)", ok: (S) => S.inspected.includes("sm") },
      { t: "Inspect an HBM memory stack", ok: (S) => S.inspected.includes("hbm") },
      { t: "Switch to a Blackwell GPU (B200 or B300)", ok: (S) => S.gpu === "b200" || S.gpu === "b300" },
    ],
    hints: [
      "Type nvidia-smi in the terminal and press Run.",
      "Tap any small square inside the dark die, then any block beside it. Or type foundry inspect sm and foundry inspect hbm.",
      "Pick B200 in the GPU buttons, or type foundry gpu b200.",
    ],
    answer: () => "nvidia-smi && foundry inspect sm && foundry inspect hbm && foundry gpu b200",
    chips: ["nvidia-smi", "foundry inspect sm", "foundry inspect hbm", "foundry gpu b200", "foundry status"],
    debrief: `<p>You've met the three things every later level is about:</p><ul><li><b>Compute</b>: SMs and their Tensor Cores. H100 has 132 SMs. B200 has 148 across two dies joined by a fast link, and software still sees one GPU.</li><li><b>Memory capacity</b>: GB of HBM. Decides what fits.</li><li><b>Memory bandwidth</b>: TB/s between HBM and the SMs. Usually decides how fast tokens come out.</li></ul><p>Notice that <code>nvidia-smi</code> showed <b>GPU-Util 100%</b> while most SMs sat dark. GPU-Util only means "a kernel was running". {{lvl:memory-bandwidth}} shows why that matters.</p>`,
    links: {
      up: "Everything above, from the model to the app, ends up as work for these SMs and reads from this HBM.",
      down: "Below the chip: the server board, NVLink between GPUs, power and cooling (Worlds 3–4), and Kubernetes deciding who gets the GPU (World 5).",
    },
  },

  {
    id: "memory-fit",
    world: 1,
    title: "Will it fit?",
    concept: "Memory capacity & precision",
    layers: { on: [9], near: [6, 7] },
    panels: ["chip"],
    controls: ["gpu", "model", "dtype"],
    locks: { gpu: "Your team only has H100s.", model: "The product team chose Llama 3.1 70B." },
    brief: `<p>The product team wants <b>Llama 3.1 70B</b>. Your team has <b>H100s with 80 GB</b> each. The first load just failed.</p><p>A model's size in memory is <b>parameters × bytes per parameter</b>. The bytes depend on <b>precision</b>: BF16 uses 2 bytes, FP8 1 byte, INT4 half a byte. Storing a model in fewer bytes is called <b>quantisation</b>. It's smaller and faster, with some risk to answer quality.</p><p>Get 70B onto one H100 while keeping quality as high as possible.</p><div class="mathbox">70.6 B params × 2 bytes (BF16) = 141.2 GB
70.6 B params × 1 byte  (FP8)  =  70.6 GB
70.6 B params × 0.5     (INT4) =  35.3 GB
+ KV cache + ~3 GB runtime</div>`,
    setup(S) {
      S.gpu = "h100";
      S.model = "llama-70b";
      S.dtype = "bf16";
      S.batch = 1;
      S.ctx = 4096;
    },
    goals: [
      { t: "Llama 3.1 70B is loaded", ok: (S) => S.model === "llama-70b" },
      { t: "It fits in the H100's 80 GB", ok: (S) => S.gpu === "h100" && S.model === "llama-70b" && fits(S) },
      {
        t: "At the highest precision that fits (FP8)",
        ok: (S) => S.gpu === "h100" && S.model === "llama-70b" && S.dtype === "fp8" && fits(S),
      },
    ],
    hints: [
      "BF16 needs 2 bytes per parameter: 70.6 billion × 2 ≈ 141 GB. That's the red overflow in the memory bar.",
      "Halve the bytes per parameter with the Precision buttons, or foundry dtype …",
    ],
    answer: () => "foundry dtype fp8",
    chips: ["foundry status", "foundry dtype fp8", "foundry dtype int4", "nvidia-smi"],
    debrief: `<p>FP8 halves the weights to about 71 GB, which fits with a little room left for conversations. INT4 also fits, but with a bigger quality risk you'd need to test on your own tasks.</p><ul><li>BF16 needs ~141 GB. Even an H200 (141 GB) can't hold it plus a KV cache. A B200 can.</li><li>Hopper's Tensor Cores run FP8 math natively, and FP8 is usually very close to BF16 quality.</li><li>In real life: <code>vllm serve meta-llama/Llama-3.1-70B-Instruct --quantization fp8</code>.</li></ul>`,
    links: {
      up: "Model optimisation (layer 7) is where quantisation lives, and the model layer (6) decides parameter count. Both turn directly into GB on this chip.",
      down: "If no precision fits, you split the model across several GPUs connected by NVLink (World 3).",
    },
  },

  {
    id: "kv-cache-memory",
    world: 1,
    title: "Room to talk",
    concept: "KV cache",
    layers: { on: [9], near: [5, 6] },
    panels: ["chip"],
    controls: ["gpu", "model", "dtype", "batch", "ctx"],
    locks: {
      model: "The product team chose Llama 3.1 70B.",
      batch: "Product target: 16 people at once.",
      ctx: "Product target: 8,192-token conversations.",
    },
    brief: `<p>70B in FP8 fits on the H100. Now the product team wants <b>16 people chatting at once</b>, each with up to <b>8,192 tokens</b> of conversation.</p><p>For every token in every conversation, the model keeps a small memo of what it has already read, the <b>KV cache</b>. It lives in HBM next to the weights (yellow in the memory bar) and grows with users × conversation length.</p><p>Find the <b>cheapest GPU</b> that fits this at FP8 quality or better. Hourly rates are on the GPU buttons.</p><div class="mathbox">KV per token = 2 (keys, values) × 80 layers × 8 KV heads
               × 128 dims × 2 bytes = 0.33 MB
KV cache     = 16 users × 8,192 tokens × 0.33 MB = 42.9 GB</div>`,
    setup(S) {
      S.gpu = "h100";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.batch = 16;
      S.ctx = 8192;
    },
    goals: [
      { t: "16 users × 8,192 tokens fit in memory", ok: (S) => S.batch >= 16 && S.ctx >= 8192 && fits(S) },
      { t: "Precision is FP8 or BF16", ok: hiQ },
      { t: "GPU costs no more than $4.00/hr", ok: (S) => GPUS[S.gpu].price <= 4 && fits(S) && hiQ(S) },
    ],
    hints: [
      "The yellow part of the memory bar is the KV cache: about 43 GB, more than half an H100.",
      "Weights 71 + KV 43 + runtime 3 ≈ 117 GB. Which GPU under $4/hr has more memory than that?",
    ],
    answer: () => "foundry gpu h200",
    chips: ["foundry status", "foundry gpu h200", "foundry gpu b200", "foundry dtype int4"],
    debrief: `<p>The KV cache was 43 GB. The H200's extra 61 GB exists for exactly this: the same compute as an H100, with room for many more conversations.</p><ul><li>Llama 70B needs ~0.33 MB of KV cache per token. One 128k-token conversation alone needs ~43 GB.</li><li>Memory, more than compute, usually caps how many users one GPU can serve.</li><li>Inference engines like vLLM store the cache in small pages (PagedAttention) so less of it is wasted.</li></ul>`,
    links: {
      up: "The serving layer (5) decides how many conversations share a GPU and manages this cache. Product choices like maximum context length land here as GB.",
      down: "When the cache outgrows one GPU, it's split across GPUs, which becomes NVLink traffic (World 3).",
    },
  },

  {
    id: "memory-bandwidth",
    world: 1,
    title: "Fast chip, slow tokens",
    concept: "Memory bandwidth",
    layers: { on: [9], near: [5] },
    panels: ["chip", "roof"],
    controls: ["gpu", "model", "dtype"],
    locks: { model: "The product team chose Llama 3.1 70B." },
    brief: `<p>Users say the 70B assistant types slowly: about <b>37 tokens per second</b>. They want at least <b>50</b>. The H100 can do almost 2,000 trillion FP8 operations per second, so why is it slow?</p><p>Watch the two meters. To produce <b>one token</b>, the GPU must read <b>every weight</b> from HBM. With one user, it does very little math for each byte it reads, so the Tensor Cores mostly wait for memory.</p><p>Reach 50 tokens/s per user without going below FP8. Then open the <b>Roofline</b>, the chart engineers use to explain this.</p><div class="mathbox">time per token ≈ bytes read ÷ bandwidth
               = 71.9 GB ÷ (3.35 TB/s × 80%) = 26.8 ms
tokens/s       = 1 ÷ 26.8 ms ≈ 37</div>`,
    setup(S) {
      S.gpu = "h100";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.batch = 1;
      S.ctx = 4096;
    },
    goals: [
      {
        t: "Each user gets at least 50 tokens/s",
        ok: (S) => S.model === "llama-70b" && fits(S) && w1(S).perUser >= 50,
      },
      { t: "Precision is FP8 or BF16", ok: hiQ },
      { t: "Open the roofline (button above the chip, or foundry roofline)", ok: (S) => !!S.flags.roof },
    ],
    hints: [
      "Compare the meters: memory bandwidth is maxed, Tensor Cores are under 1% busy.",
      "Faster memory means faster tokens. Which GPU has more bandwidth but the same Hopper chip?",
    ],
    answer: () => "foundry gpu h200 && foundry roofline",
    chips: ["foundry status", "foundry bench", "foundry roofline", "foundry gpu h200", "nvidia-smi"],
    debrief: `<p>The H200 has <b>identical compute</b> to the H100 but 43% more bandwidth, and it produced tokens 43% faster. Generating tokens one at a time is <b>memory-bound</b>.</p><ul><li>Tokens/s per user ≈ bandwidth ÷ bytes read per token. That's why each new HBM generation matters so much for inference.</li><li>On the roofline your workload sits far left, on the sloped memory roof. The flat compute roof is out of reach with one user.</li><li><code>nvidia-smi</code> said GPU-Util 100% while the Tensor Cores were under 1% busy. Tools like NVIDIA DCGM report Tensor Core activity instead (World 5).</li></ul>`,
    links: {
      up: "Latency targets in the application (1) and model routing in the gateway (3) depend on this number. A 'fast' tier is often a high-bandwidth GPU or a smaller model.",
      down: "Quantisation (layer 7) helps here too: fewer bytes per weight means fewer bytes to read per token.",
    },
  },

  {
    id: "batching",
    world: 1,
    title: "Fill the factory",
    concept: "Batching & cost per token",
    layers: { on: [9], near: [5] },
    panels: ["chip", "roof"],
    controls: ["gpu", "model", "dtype", "batch", "ctx"],
    locks: {
      gpu: "Finance approved H200s.",
      model: "The product team chose Llama 3.1 70B.",
      dtype: "Quality review signed off on FP8.",
      ctx: "Product target: 2,048-token conversations.",
    },
    brief: `<p>The 70B assistant on an H200 is quick for one user, but finance noticed the bill: you pay for the GPU by the hour whether it serves one person or fifty.</p><p>Every step reads all the weights anyway, so serving <b>more users in the same step</b> adds very little memory traffic. That's <b>batching</b>.</p><p>Get the cost below <b>$1.00 per million tokens</b> while each user still sees at least <b>25 tokens/s</b>. Watch what stops you going further.</p><div class="mathbox">cost per 1M tokens = $ per hour ÷ (tokens/s × 3,600) × 1,000,000
1 user:  $3.50 ÷ (53 tok/s × 3,600) × 1M ≈ $18</div>`,
    setup(S) {
      S.gpu = "h200";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.batch = 1;
      S.ctx = 2048;
    },
    goals: [
      { t: "Cost at most $1.00 per 1M tokens", ok: (S) => fits(S) && w1(S).cost <= 1 },
      { t: "Each user still gets at least 25 tokens/s", ok: (S) => fits(S) && w1(S).perUser >= 25 },
      { t: "Everything fits in memory", ok: fits },
    ],
    hints: [
      "Raise the Users slider and watch cost, per-user speed and the memory bar.",
      "Somewhere between 24 and 96 users meets both targets.",
    ],
    answer: () => "foundry batch 32",
    chips: ["foundry status", "foundry batch 8", "foundry batch 32", "foundry batch 128", "foundry roofline"],
    debrief: `<p>One read of the weights now serves many users, so total throughput rose almost in step with batch size while each user slowed only a little. Cost per token fell by more than 20×.</p><ul><li>The ceiling was <b>KV cache memory</b>, not compute. Around 100 users at 2k context, the H200 runs out.</li><li>On the roofline the point moved right: more math for every byte read.</li><li>Real engines do this all the time (<b>continuous batching</b>): new requests join the running batch every step. That's the inference layer's main job.</li></ul>`,
    links: {
      up: "This is the economics behind 'maximise useful AI work per unit of compute'. The serving and gateway layers exist largely to keep batches full.",
      down: "Push batches large enough and you finally hit the compute roof. Then Tensor Core speed, FP8 and FP4 start to matter.",
    },
  },

  {
    id: "prefill-decode",
    world: 1,
    title: "Two speeds",
    concept: "Prefill vs decode",
    layers: { on: [9], near: [5, 4] },
    panels: ["chip", "roof"],
    controls: ["gpu", "model", "dtype", "prompt", "ctx"],
    locks: {
      model: "The product team chose Llama 3.1 70B.",
      prompt: "Contracts are ~16k tokens.",
      ctx: "Sized for the 16k-token contract.",
    },
    brief: `<p>A legal team pastes a <b>16,000-token contract</b> and asks a question. The answer streams fine, but the first word takes <b>2.5 seconds</b> to appear. They want <b>time to first token at most 1.5 s</b>.</p><p>Inference has two phases. <b>Prefill</b> reads the whole prompt in one pass: thousands of tokens share each weight read, so it's limited by <b>compute</b>. <b>Decode</b> then produces one token at a time, limited by <b>memory bandwidth</b>.</p><p>Try the H200 trick from {{lvl:memory-bandwidth}} first and see what happens.</p><div class="mathbox">prefill math ≈ 2 × params × prompt tokens  (+ attention)
             = 2 × 70.6 B × 16,384 = 2.3 PFLOP
time         ≈ 2.3 PFLOP ÷ (1,979 TFLOPS × 65%) ≈ 1.8 s  (+0.7 s attention)</div>`,
    setup(S) {
      S.gpu = "h100";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.batch = 1;
      S.ctx = 16384;
      S.prompt = 16384;
    },
    goals: [
      { t: "Time to first token at most 1.5 s", ok: (S) => fits(S) && S.prompt >= 16384 && w1(S).ttft <= 1.5 },
      { t: "Each user still gets at least 40 tokens/s", ok: (S) => fits(S) && w1(S).perUser >= 40 },
      { t: "Everything fits in memory", ok: fits },
    ],
    hints: [
      "Try H200: time to first token barely moves. Prefill is limited by math, not memory.",
      "You need more TFLOPS. H100 and H200 share the same compute; Blackwell roughly doubles it.",
    ],
    answer: () => "foundry gpu b200",
    chips: ["foundry status", "foundry gpu h200", "foundry gpu b200", "foundry dtype int4", "foundry roofline"],
    debrief: `<p>The H200 didn't help: it has the same Tensor Cores as the H100. Blackwell roughly doubles FP8 math and adds FP4, so prefill got about twice as fast.</p><ul><li>Prefill is compute-bound: TFLOPS matter. Decode is memory-bound: TB/s matter. Different GPUs win different phases.</li><li>INT4 on Hopper made prefill slower. The weights are stored in 4 bits, but the math still runs in 16-bit.</li><li>Large deployments now run the two phases on separate GPU pools (<b>disaggregated serving</b>).</li></ul>`,
    links: {
      up: "TTFT is the first thing users feel. RAG apps (layer 4) that stuff long retrieved context into prompts are prefill-heavy.",
      down: "Long prompts also stress the attention kernels. World 2 shows how FlashAttention keeps them from blowing up memory.",
    },
  },

  {
    id: "quiz-one-gpu",
    world: 1,
    title: "Checkpoint: one GPU",
    concept: "World 1 quiz",
    quiz: true,
    layers: { on: [9], near: [5, 6, 7] },
    questions: [
      {
        q: "An H200 generates tokens faster than an H100 for a single user, even though their compute is identical. Why?",
        o: [
          "It has more SMs",
          "It has higher memory bandwidth",
          "It uses a newer CUDA version",
          "It runs at a higher clock speed",
        ],
        a: 1,
        why: "Each token requires reading every weight from HBM. H200's HBM3e moves 4.8 TB/s against H100's 3.35 TB/s, and decode speed follows bandwidth.",
      },
      {
        q: "Roughly how much memory do the weights of a 70B-parameter model need in FP8?",
        o: ["35 GB", "70 GB", "140 GB", "280 GB"],
        a: 1,
        why: "FP8 uses one byte per parameter: 70 billion × 1 byte ≈ 70 GB. BF16 doubles it, INT4 halves it.",
      },
      {
        q: "Serving more users with longer conversations mostly consumes…",
        o: ["Tensor Core time", "KV cache memory in HBM", "NVLink bandwidth", "CPU memory"],
        a: 1,
        why: "Every token of every conversation keeps keys and values in HBM. It grows with users × context, and is usually what caps users per GPU.",
      },
      {
        q: "Raising the batch from 1 to 32 users on the same GPU mostly…",
        o: [
          "Makes each user 32× slower",
          "Raises total throughput and cuts cost per token, with a small slowdown per user",
          "Changes nothing, because the GPU was already at 100%",
          "Makes prompts process faster",
        ],
        a: 1,
        why: "One read of the weights now serves 32 users. Throughput rises almost 32×, the per-user slowdown is small, and cost per token falls.",
      },
      {
        q: "Time to first token for a long prompt is limited mainly by…",
        o: ["Memory bandwidth", "Compute (Tensor Core TFLOPS)", "Disk speed", "Network latency"],
        a: 1,
        why: "Prefill processes thousands of tokens per weight read, so it does lots of math per byte: compute-bound. That's why the H200 didn't help in {{lvl:prefill-decode}}.",
      },
      {
        q: "nvidia-smi shows GPU-Util 100%. What does that tell you?",
        o: [
          "The Tensor Cores are fully used",
          "A kernel was running throughout the sample period, not how much of the chip it used",
          "The GPU is overheating",
          "GPU memory is full",
        ],
        a: 1,
        why: "GPU-Util only measures time with any kernel running. A memory-bound decode loop shows 100% with Tensor Cores under 1% busy.",
      },
    ],
    debrief: `<p>That's one GPU, end to end: what fits (capacity), how fast tokens come (bandwidth), how fast prompts are read (compute), and how batching turns all three into cost per token.</p>`,
    links: {
      up: "The serving layer (5) builds on all four ideas: it batches, manages KV cache, and splits prefill from decode.",
      down: "World 2 goes one layer down in software: how a line of PyTorch becomes kernels on these SMs.",
    },
  },
] satisfies LevelDef<W1State>[] as LevelDef<W1State>[] as Level<W1State>[];
const NEW_W1 = [
  {
    id: "kv-quantisation",
    world: 1,
    title: "Long memories",
    concept: "KV-cache quantisation",
    layers: { on: [9], near: [5, 7] },
    panels: ["chip"],
    controls: ["gpu", "model", "dtype", "kv", "batch", "ctx"],
    locks: {
      gpu: "The H200s are already racked.",
      model: "The product team chose Llama 3.1 70B.",
      batch: "Product target: 8 people at once.",
      ctx: "Product target: 32k-token research sessions.",
    },
    brief: `<p>A research tool lets <b>8 analysts</b> each keep a <b>32,768-token</b> conversation going. On the H200 the KV cache alone needs 86 GB, so it doesn't fit next to the weights.</p><p>Weights aren't the only thing you can store in fewer bits. The <b>KV cache</b> can be kept in <b>FP8</b> instead of 16-bit, halving it. Accuracy usually holds up well, but it's a real trade-off worth testing on long documents.</p><p>Make it fit without dropping the weights below FP8.</p><div class="mathbox">KV cache = 8 users × 32,768 tokens × 0.33 MB = 85.9 GB  (16-bit)
         = 8 users × 32,768 tokens × 0.16 MB = 42.9 GB  (FP8)</div>`,
    setup(S) {
      S.gpu = "h200";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.batch = 8;
      S.ctx = 32768;
      S.kvdt = "bf16";
    },
    goals: [
      { t: "8 users × 32,768 tokens fit on the H200", ok: (S) => S.batch >= 8 && S.ctx >= 32768 && fits(S) },
      { t: "Weights stay at FP8 or BF16", ok: hiQ },
    ],
    hints: [
      "The yellow KV cache is bigger than the blue weights. Which of the two can you shrink without touching weight precision?",
      "Use the KV cache buttons, or foundry kv fp8.",
    ],
    answer: () => "foundry kv fp8",
    chips: ["foundry status", "foundry kv fp8", "foundry dtype int4"],
    debrief: `<p>FP8 KV cache halved the conversation memory, from 86 GB to 43 GB, so everything fits with room to spare. It also made each token a little faster: less KV to read per step.</p><ul><li>At long context the KV cache, not the weights, is the memory hog. Quantising it is now standard in vLLM and TensorRT-LLM (<code>--kv-cache-dtype fp8</code>).</li><li>Other tricks attack the same problem: grouped-query attention (fewer KV heads, already in Llama 3), sliding windows, and offloading old KV to CPU memory or SSD.</li><li>Quality risk is real but usually small; long-document benchmarks are where to check.</li></ul>`,
    links: {
      up: "Context length is a product decision (layer 1) that the serving layer (5) pays for in GB. KV quantisation is an optimisation (7) that changes the price.",
      down: "Less KV to read also means less memory bandwidth per token, which you met in {{lvl:memory-bandwidth}}.",
    },
  },

  {
    id: "moe-on-gpu",
    world: 1,
    title: "Many experts",
    concept: "Mixture of experts (MoE)",
    layers: { on: [9], near: [6] },
    panels: ["chip"],
    controls: ["gpu", "model", "dtype", "batch"],
    locks: { ctx: "Fixed at 4k for this test." },
    brief: `<p>Leadership wants a <b>frontier-scale model (200B+ parameters) on a single GPU</b>, answering at <b>60+ tokens/s</b> per user, at FP8 quality.</p><p>Llama 3.1 405B is <b>dense</b>: every token uses every weight. <b>Qwen3 235B-A22B</b> is a <b>mixture of experts</b>: each layer has 128 small "expert" networks and a router that sends each token to just 8 of them. All 235B parameters must sit in memory, but each token only reads and computes about <b>22B</b>.</p><p>({{lvl:moe-experts}} shows how the router picks experts.) Find a GPU and model that hit the target. Then try <b>32 users</b> and see what happens to MoE's speed advantage.</p><div class="mathbox">dense 405B, FP8: read 406 GB per token
MoE 235B-A22B:   read ~22 GB per token (8 of 128 experts)
32 users:        1 − (120/128)³² = 87% of experts get used every step</div>`,
    setup(S) {
      S.gpu = "h200";
      S.model = "llama-405b";
      S.dtype = "fp8";
      S.batch = 1;
      S.ctx = 4096;
    },
    goals: [
      { t: "A 200B+ model fits on one GPU at FP8 or BF16", ok: (S) => MODELS[S.model].P >= 200e9 && fits(S) && hiQ(S) },
      { t: "Try 32 or more users on the MoE model", ok: (S) => !!S.flags.moe32 },
      {
        t: "Each user gets at least 60 tokens/s",
        ok: (S) => MODELS[S.model].P >= 200e9 && fits(S) && hiQ(S) && w1(S).perUser >= 60,
      },
    ],
    hints: [
      "405B in FP8 is 406 GB: no single GPU holds it. Switch to the Qwen3 MoE model.",
      "235 GB at FP8 needs the B300's 288 GB. After trying 32 users, come back down to 8 or fewer.",
    ],
    answer: () => "foundry load qwen-235b && foundry gpu b300 && foundry batch 32 && foundry batch 4",
    chips: ["foundry status", "foundry load qwen-235b", "foundry gpu b300", "foundry batch 32", "foundry batch 4"],
    debrief: `<p>Memory sized like a 235B model, speed like a 22B one. That's why most frontier models (DeepSeek, Qwen, Llama 4, gpt-oss) are now MoE.</p><ul><li>The catch: with many users, different tokens pick different experts, so each step touches nearly all of them. At 32 users the GPU read ~200 GB per step and the speed advantage mostly vanished.</li><li>Big MoE deployments spread experts across many GPUs (<b>expert parallelism</b>), which needs fast GPU-to-GPU links: World 3.</li><li>Capacity planning changes: size memory for total parameters, size compute for active ones.</li></ul>`,
    links: {
      up: "Model choice (layer 6) now drives hardware choice: MoE favours lots of memory per GPU, or many GPUs with fast interconnect.",
      down: "Experts living on different GPUs means tokens hop between GPUs every layer: all-to-all traffic over NVLink.",
    },
  },

  {
    id: "perf-per-watt",
    world: 1,
    title: "Watts per token",
    concept: "Performance per watt",
    layers: { on: [9], near: [10] },
    panels: ["chip"],
    controls: ["gpu", "model", "dtype", "batch", "ctx"],
    locks: {
      model: "The product team chose Llama 3.1 70B.",
      batch: "Steady load: 64 users per GPU.",
      ctx: "2,048-token conversations.",
    },
    brief: `<p>Your data centre has a fixed power budget, and its racks are <b>air-cooled</b>: no GPU rated above <b>1,000 W</b>. Finance now tracks <b>tokens per kilowatt-hour</b>, because electricity and cooling capacity, not GPU count, are what run out first.</p><p>Each GPU's power draw depends on how hard it works (see the Power tile). Find the GPU that delivers at least <b>22 million tokens per kWh</b> within the air-cooling limit, at FP8 quality or better.</p><div class="mathbox">tokens per kWh = tokens/s × 3,600 ÷ (watts ÷ 1,000)
power estimate  ≈ rated power × (14% idle + share of bandwidth and math in use)</div>`,
    setup(S) {
      S.gpu = "h200";
      S.model = "llama-70b";
      S.dtype = "fp8";
      S.batch = 64;
      S.ctx = 2048;
    },
    goals: [
      { t: "At least 22 million tokens per kWh", ok: (S) => fits(S) && w1(S).tpk >= 22e6 },
      { t: "GPU rated at 1,000 W or less (air-cooled)", ok: (S) => GPUS[S.gpu].tdp <= 1000 },
      { t: "Precision FP8 or BF16", ok: hiQ },
    ],
    hints: [
      "Compare the Power tile and tokens per kWh across GPUs. The B300 is excluded: it's rated 1,400 W and needs liquid cooling.",
      "Blackwell's extra bandwidth does more work per watt than Hopper.",
    ],
    answer: () => "foundry gpu b200",
    chips: ["foundry status", "foundry gpu b200", "foundry gpu b300", "foundry dtype fp4"],
    debrief: `<p>The B200 produced ~20% more tokens per kWh than the H200 within the air-cooling limit. Each generation does more work per watt, and that, more than raw speed, is what lets a data centre grow inside its power budget.</p><ul><li>The B300 was <i>worse</i> per watt here: same memory bandwidth as the B200 but a higher power rating, on a workload limited by bandwidth. Its extra memory and FP4 math only pay off on workloads that use them.</li><li>FP4 on the B200 would reach ~36M tokens per kWh: quantisation is an energy lever too.</li><li>Above ~1,000 W per GPU, racks move to direct liquid cooling (B300, GB200 NVL72). That's a facilities decision, made years ahead.</li><li>Power figures here are rough estimates; measure real ones with DCGM.</li></ul>`,
    links: {
      up: "Cost per task in the application layer is increasingly an energy number.",
      down: "Infrastructure (layer 10) includes power distribution and cooling, often the slowest part of the stack to change.",
    },
  },

  {
    id: "gpu-sharing",
    world: 1,
    title: "Share the GPU",
    concept: "MIG & time-slicing",
    layers: { on: [9], near: [10] },
    panels: ["mig"],
    controls: ["mig"],
    brief: `<p>Five teams each need a small model, and you have <b>one H100</b>. Giving each team a whole GPU would waste most of it.</p><p>Two ways to share. <b>Time-slicing</b> lets everyone take turns on the whole GPU: easy, but one team can fill the memory or hog the SMs and hurt the others. <b>MIG (Multi-Instance GPU)</b> cuts the H100 into up to <b>7 isolated GPUs</b>, each with its own SMs, memory and bandwidth.</p><p>An H100 has <b>7 compute slices</b> and <b>8 memory slices</b> of 10 GB. Profiles are named by both, such as <code>1g.10gb</code> or <code>2g.20gb</code>. Turn on MIG mode, then pick a layout where every team gets its own instance that fits.</p>`,
    setup(S) {
      S.gpu = "h100";
      S.mig = { mode: false, inst: [], share: "none" };
    },
    goals: [
      { t: "MIG mode enabled", ok: (S) => S.mig.mode },
      {
        t: "Every team has its own MIG instance that fits",
        ok: (S) => S.mig.mode && S.mig.share === "mig" && migAssign(S).all,
      },
    ],
    hints: [
      "Enable MIG mode first: sudo nvidia-smi -i 0 -mig 1. Then look at each team's memory need.",
      "Two teams need ~15 GB (a 2g.20gb each); three need under 10 GB (a 1g.10gb each). 2 + 2 + 1 + 1 + 1 = 7 compute slices.",
    ],
    answer: () => "sudo nvidia-smi -i 0 -mig 1 && nvidia-smi mig -cgi 2g.20gb,2g.20gb,1g.10gb,1g.10gb,1g.10gb -C",
    chips: [
      "nvidia-smi",
      "sudo nvidia-smi -i 0 -mig 1",
      "nvidia-smi mig -lgip",
      "nvidia-smi mig -cgi 1g.10gb,1g.10gb -C",
      "foundry share timeslice",
    ],
    debrief: `<p>One H100 now behaves like five smaller GPUs. Each team has its own memory and SMs, so a runaway job in one can't crash or slow the others.</p><ul><li>The cost of MIG is rigidity: layouts follow fixed profiles, and changing them means draining the GPU. Pieces that don't match the profiles get stranded.</li><li>Time-slicing is more flexible but gives no isolation. Fine for dev notebooks, risky for production.</li><li>In Kubernetes, the GPU Operator can apply MIG layouts and each instance shows up as its own resource (World 5).</li></ul>`,
    links: {
      up: "Platform teams use MIG to give many small apps (layers 1–4) a guaranteed slice of GPU without buying a GPU each.",
      down: "MIG is enforced in hardware: the SMs, L2 cache and memory controllers are physically divided.",
    },
  },
] satisfies LevelDef<W1State>[] as LevelDef<W1State>[] as Level<W1State>[];
const W1Q_MORE = [
  {
    q: "Eight users with 32k-token conversations don't fit. Which change keeps weight quality but halves the conversation memory?",
    o: ["INT4 weights", "FP8 KV cache", "A bigger batch", "CUDA Graphs"],
    a: 1,
    why: "The KV cache, not the weights, dominates at long context. Storing it in FP8 halves it.",
  },
  {
    q: "A mixture-of-experts model with 235B total and 22B active parameters needs memory for…",
    o: ["22B parameters", "235B parameters", "Only the router", "Whichever experts the first user picks"],
    a: 1,
    why: "Every expert must be in memory because any token might pick it. Only the per-token reading and math shrink to ~22B.",
  },
  {
    q: "Why would a platform team use MIG instead of time-slicing?",
    o: [
      "It's faster for one big model",
      "Each team gets isolated memory and compute, so one team can't crash or starve another",
      "It needs no configuration",
      "It adds more memory",
    ],
    a: 1,
    why: "MIG divides the hardware itself. Time-slicing shares everything, so there's no protection between tenants.",
  },
] satisfies Question[];
const AMD_LV = {
  id: "amd-gpus",
  world: 1,
  title: "Team red",
  concept: "AMD Instinct & ROCm",
  layers: { on: [9], near: [8] },
  gpus: ALL_GPUS,
  panels: ["chip"],
  controls: ["gpu", "model", "dtype", "batch", "ctx"],
  locks: {
    model: "The product team chose Llama 3.1 70B.",
    dtype: "Quality review signed off on FP8.",
    batch: "32 analysts at once.",
    ctx: "8,192-token conversations.",
  },
  brief: `<p>The analytics team wants <b>Llama 3.1 70B</b> for <b>32 people</b> with <b>8k-token</b> conversations, on <b>one GPU</b>, and the budget is <b>$3 per GPU-hour</b>. That's 71 GB of weights plus 86 GB of KV cache: no Hopper GPU holds it, and Blackwell is over budget.</p><p>A cloud provider offers <b>AMD Instinct</b> GPUs. AMD builds its GPUs from <b>chiplets</b>: 8 small compute dies (XCDs) full of <b>Compute Units</b>, AMD's equivalent of SMs, surrounded by 8 HBM stacks. The software stack is <b>ROCm</b> instead of CUDA.</p><p>Find a GPU that fits within budget with at least 25 tokens/s per user. Then check it the AMD way: <code>nvidia-smi</code> won't work, <code>amd-smi</code> will.</p>`,
  setup(S) {
    S.gpu = "h200";
    S.model = "llama-70b";
    S.dtype = "fp8";
    S.batch = 32;
    S.ctx = 8192;
  },
  goals: [
    { t: "Everything fits on one GPU", ok: (S) => fits(S) },
    { t: "At least 25 tokens/s per user", ok: (S) => fits(S) && w1(S).perUser >= 25 },
    { t: "GPU costs no more than $3.00/hr", ok: (S) => GPUS[S.gpu].price <= 3 && fits(S) },
    { t: "Check the GPU with amd-smi", ok: (S) => !!S.flags.amdsmi },
  ],
  hints: [
    "You need about 160 GB on one GPU. Compare memory sizes and prices on the GPU buttons.",
    "MI300X has 192 GB at $2.20/hr. AMD's status tool is amd-smi.",
  ],
  answer: () => "foundry gpu mi300x && amd-smi",
  chips: ["foundry status", "foundry gpu mi300x", "foundry gpu mi325x", "amd-smi", "nvidia-smi"],
  debrief: `<p>The MI300X's 192 GB holds the model and all 32 conversations on one GPU, at a lower hourly price than an H200 that can't fit it.</p><ul><li>AMD's pitch has been <b>more memory per GPU</b> at a lower price. MI325X (256 GB) and MI355X (288 GB) continue that.</li><li>The real question is <b>software</b>. ROCm (HIP, hipBLASLt, RCCL, MIOpen) mirrors CUDA, and vLLM, SGLang and PyTorch support it, but kernel tuning and new-model support often land on CUDA first. This game assumes equally good software on both; in practice, benchmark your own model.</li><li>Operationally it's a different toolbox: <code>amd-smi</code> instead of <code>nvidia-smi</code>, ROCm container images, the AMD GPU Operator on Kubernetes.</li></ul>`,
  links: {
    up: "Engines like vLLM hide most vendor differences from the application, if your model and features are supported on ROCm.",
    down: "World 2's whole software path has an AMD twin: HIP for CUDA, hipBLASLt for cuBLAS, RCCL for NCCL, the amdgpu driver for NVIDIA's.",
  },
} satisfies LevelDef<W1State> as LevelDef<W1State> as Level<W1State>;
const PICK_LV = {
  id: "gpu-choice",
  world: 1,
  title: "Pick the GPU",
  concept: "Matching chip to workload",
  layers: { on: [9], near: [5, 6] },
  gpus: ALL_GPUS,
  panels: ["pick", "chip"],
  controls: ["workload", "gpu"],
  brief: `<p>Three teams, three workloads, seven GPUs. For each workload, find a GPU that meets every requirement, then lock it in with <code>foundry pick</code>.</p><p>There's no single best GPU. Each workload has a different <b>bottleneck</b>: memory capacity, bandwidth, compute or budget. The trick is to spot which, then read the matching line of the spec sheet. The <b>Compare GPUs</b> button at the top has every spec side by side.</p><p>Prices are this game's illustrative ones; with your real quotes the answers can change.</p>`,
  setup(S) {
    S.wl = "chat";
    S.picks = {};
    Object.assign(S, WL.chat.set);
    S.gpu = "h100";
  },
  goals: [
    {
      t: "Busy chatbot: pick a GPU that passes",
      ok: (S) => !!S.picks!.chat && wlCheck(S, "chat", S.picks!.chat).ok,
    },
    { t: "Contract Q&A: pick a GPU that passes", ok: (S) => !!S.picks!.doc && wlCheck(S, "doc", S.picks!.doc).ok },
    { t: "Frontier MoE: pick a GPU that passes", ok: (S) => !!S.picks!.moe && wlCheck(S, "moe", S.picks!.moe).ok },
  ],
  hints: [
    "Chatbot: 64 users of KV cache needs ~160 GB, and cost per token matters. Contract Q&A: first-token time is prefill, so compute. MoE: 235 GB must fit.",
    "Passing picks include: chatbot MI300X or B200, contract Q&A B200 or MI355X, MoE MI325X, MI355X or B300.",
  ],
  answer: () =>
    "foundry workload chat && foundry gpu mi300x && foundry pick && foundry workload doc && foundry gpu b200 && foundry pick && foundry workload moe && foundry gpu mi355x && foundry pick",
  chips: ["foundry workload chat", "foundry workload doc", "foundry workload moe", "foundry pick", "foundry status"],
  debrief: `<p>Each workload eliminated different GPUs for a different reason, which is the whole point:</p><ul><li><b>Busy chatbot</b> was memory-capacity and cost bound: Hopper ran out of room, and the priciest chips didn't pay for themselves.</li><li><b>Contract Q&A</b> was compute bound: only the newest generations read 16k tokens fast enough.</li><li><b>Frontier MoE</b> was capacity bound: only 256 GB+ GPUs could hold it on one chip.</li></ul><p>In real procurement, add software maturity, availability, interconnect for multi-GPU models, and power and cooling to the table, and test with your own model.</p>`,
  links: {
    up: "Gateways can route each workload to a different GPU pool: chat to one fleet, long documents to another.",
    down: "Across GPUs, the interconnect becomes the next spec that matters: World 3.",
  },
} satisfies LevelDef<W1State> as LevelDef<W1State> as Level<W1State>;
const W1Q_AMD = [
  {
    q: "The single biggest change from H100 to H200 is…",
    o: ["Twice the compute", "More and faster memory on the same chip", "FP4 support", "Two dies"],
    a: 1,
    why: "H200 is the same Hopper chip with 141 GB of HBM3e at 4.8 TB/s instead of 80 GB at 3.35 TB/s.",
  },
  {
    q: "Why did MI300X fit the 32-user, 8k-context 70B workload when an H200 couldn't?",
    o: [
      "It has faster Tensor Cores",
      "It has 192 GB of memory vs 141 GB",
      "It uses FP4",
      "ROCm compresses the KV cache",
    ],
    a: 1,
    why: "Weights plus KV cache needed ~160 GB. Capacity decides what fits.",
  },
  {
    q: "Before moving a production model to AMD GPUs, what should you check first?",
    o: [
      "Whether nvidia-smi works",
      "That your model, inference engine and kernels are supported and fast on ROCm",
      "That the GPUs are red",
      "Nothing: CUDA code runs unchanged",
    ],
    a: 1,
    why: "Specs set the ceiling; software decides how close you get. ROCm support for your exact model and engine version is the real risk.",
  },
] satisfies Question[];

// The single file built World 1 in steps; these are those steps, in the same order (they also fix key order).
const [chip, fit, room, fast, fill, twoSpeeds, quiz] = BASE;
const [longMemories, manyExperts, watts, shareGpu] = NEW_W1;
quiz.questions!.push(...W1Q_MORE);
quiz.brief = `<p>Nine questions on what you just did. Pick an answer; wrong picks show why, and you can try again. Fewer mistakes, more stars.</p>`;
quiz.questions!.push(...W1Q_AMD);
quiz.brief = `<p>Twelve questions on World 1. Pick an answer; wrong picks show why, and you can try again. Fewer mistakes, more stars.</p>`;
// Levels before "Team red" offer only NVIDIA GPUs.
for (const l of [chip, fit, room, fast, fill, twoSpeeds, longMemories, manyExperts, watts]) l.gpus = NV_GPUS;

export const LEVELS: Level<W1State>[] = [
  chip,
  fit,
  room,
  fast,
  fill,
  twoSpeeds,
  longMemories,
  manyExperts,
  watts,
  shareGpu,
  AMD_LV,
  PICK_LV,
  quiz,
];
export const LAB = {
  id: "gpu-lab",
  world: 1,
  title: "GPU lab",
  concept: "Free play",
  lab: true,
  layers: { on: [9], near: [5, 6, 7] },
  panels: ["chip", "roof"],
  controls: ["gpu", "model", "dtype", "batch", "ctx", "prompt"],
  brief: `<p>Every knob unlocked. Try a 405B model on a B300, push batches until the roofline flattens, or compare FP4 on Blackwell with INT4 on Hopper.</p><p>Things to try:</p><ul><li>Find the batch size where an H100 becomes compute-bound.</li><li>How many 128k-token conversations fit on a B300?</li><li>Which GPU gives the lowest cost per token for 70B?</li></ul>`,
  setup(S) {
    S.gpu = "h200";
    S.model = "llama-70b";
    S.dtype = "fp8";
    S.batch = 16;
    S.ctx = 4096;
  },
  goals: [],
  hints: [],
  chips: [
    "foundry status",
    "foundry bench",
    "foundry roofline",
    "nvidia-smi",
    "foundry load llama-405b",
    "foundry gpu b300",
  ],
} satisfies LevelDef<W1State> as LevelDef<W1State> as Lab<W1State>;
LAB.gpus = ALL_GPUS;
