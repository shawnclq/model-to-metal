import type { GameState, Lab, Level, LevelDef, Question, SoonEntry, World } from "./types.ts";
import { GPUS } from "../shared/data/hardware.ts";
import { w1 } from "../shared/engine/gpu.ts";
import { w2decode, w2prefill } from "../shared/engine/kernels.ts";
export const fits = (S: GameState) => w1(S).fits;
export const hiQ = (S: GameState) => S.dtype === "bf16" || S.dtype === "fp8";
export const LEVELS = [
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

  {
    id: "software-path",
    world: 2,
    title: "Follow one matmul",
    concept: "The software path",
    layers: { on: [8], near: [6, 9] },
    panels: ["stack"],
    controls: [],
    brief: `<p>Model code says something simple: <code>y = x @ W</code>. The GPU only understands <b>kernels</b>, small programs launched across its SMs. Several layers of software turn one into the other.</p><p>Run <code>foundry trace matmul</code> to follow one matrix multiply from Python down to the Tensor Cores. Then open the <b>kernel libraries</b> and <b>NVIDIA driver</b> rows to see who owns what.</p>`,
    setup(S) {
      S.model = "llama-8b";
    },
    goals: [
      { t: "Trace a matmul (foundry trace matmul)", ok: (S) => !!S.flags.trace },
      { t: "Inspect the kernel libraries layer", ok: (S) => S.inspected.includes("lib") },
      { t: "Inspect the NVIDIA driver layer", ok: (S) => S.inspected.includes("driver") },
    ],
    hints: [
      "Type foundry trace matmul.",
      "Tap the 'Kernel libraries' and 'NVIDIA driver' rows, or type foundry inspect libraries.",
    ],
    answer: () => "foundry trace matmul && foundry inspect libraries && foundry inspect driver",
    chips: ["foundry trace matmul", "foundry inspect libraries", "foundry inspect driver", "nvidia-smi"],
    debrief: `<p>One line of Python went through five layers of software before it touched silicon:</p><ul><li><b>PyTorch</b> decides <i>what</i> to compute and routes it to the CUDA backend.</li><li><b>Kernel libraries</b> (cuBLAS, CUTLASS, FlashAttention, Triton-generated code) hold the hand-tuned kernels. Most of the performance lives here.</li><li>The <b>CUDA runtime</b> ships inside your container. The <b>driver</b> lives on the host. That split causes the classic failure in {{lvl:driver-stack}}.</li></ul>`,
    links: {
      up: "Inference engines (vLLM, SGLang, TensorRT-LLM) sit on top of this path. They differ mostly in which kernels they use and how they schedule them.",
      down: "At the bottom, each kernel becomes thread blocks on SMs reading HBM: World 1's chip.",
    },
  },

  {
    id: "launch-overhead",
    world: 2,
    title: "Waiting on the CPU",
    concept: "Launch overhead & CUDA Graphs",
    layers: { on: [8], near: [5, 7] },
    panels: ["timeline"],
    controls: ["model2", "graphs", "fuse"],
    brief: `<p>A small model, <b>Llama 3.2 1B</b>, runs on an H100 for one user. It should be blazing fast, but the GPU sits idle most of the time.</p><p>The CPU <b>launches every kernel</b>. In plain PyTorch each launch costs about 18 µs of Python and driver work, but many of this model's kernels finish in under 5 µs. The GPU finishes, then waits for the next launch. See the hatched gaps on the timeline.</p><p>Look at Llama 3.1 8B once to compare. Then, on the 1B model, get the GPU <b>at least 85% busy</b> and a token every <b>1.8 ms or less</b>.</p>`,
    setup(S) {
      S.model = "llama-1b";
      S.mode = "decode";
      S.ctx = 2048;
    },
    goals: [
      { t: "Look at Llama 3.1 8B once to compare", ok: (S) => !!S.flags.saw8b },
      {
        t: "Llama 3.2 1B with the GPU at least 85% busy",
        ok: (S) => S.model === "llama-1b" && w2decode(S).busy >= 0.85,
      },
      { t: "Llama 3.2 1B at 1.8 ms or less per token", ok: (S) => S.model === "llama-1b" && w2decode(S).step <= 1800 },
    ],
    hints: [
      "Switch the model to 8B and back. Bigger kernels hide the launch cost; small ones expose it.",
      "There's a toggle that records all the launches once and replays them with a single call.",
    ],
    answer: () => "foundry load llama-8b && foundry load llama-1b && foundry graphs on",
    chips: ["foundry profile", "foundry load llama-8b", "foundry fuse on", "foundry graphs on", "nvidia-smi"],
    debrief: `<p><b>CUDA Graphs</b> record the whole sequence of kernels once, then replay it with one launch. The CPU stops being the bottleneck and the gaps disappear.</p><ul><li>Launch overhead matters most for small models and small batches, where kernels are tiny. The 8B model's bigger kernels hid much of it.</li><li>Kernel fusion helped a little on its own: fewer, bigger kernels means fewer launches.</li><li>In practice vLLM captures CUDA Graphs for decode by default, and <code>torch.compile(mode="reduce-overhead")</code> uses them too.</li></ul>`,
    links: {
      up: "Model benchmarks hide this, but users feel it as latency. Inference engines handle it so application teams don't have to.",
      down: "This is one case where nvidia-smi's GPU-Util is honest: it shows the gaps as a low number.",
    },
  },

  {
    id: "kernel-fusion",
    world: 2,
    title: "The 32k prompt",
    concept: "Fusion & FlashAttention",
    layers: { on: [8], near: [7, 9] },
    panels: ["memory", "timeline"],
    controls: ["fuse", "flash", "graphs"],
    locks: { model: "The document reader runs Llama 3.1 8B." },
    brief: `<p>Llama 3.1 8B on an H100 is asked to read a <b>32,768-token</b> document. It crashes out of memory, even though the model is only 16 GB.</p><p>Plain attention compares every token with every other token and <b>writes the whole score matrix to HBM</b>. <b>FlashAttention</b> is a fused kernel that works through the matrix in small tiles held in each SM's on-chip memory, so the full matrix never exists.</p><p>Make the prompt run with time to first token at most <b>2 s</b>, then profile it to see where the time goes.</p><div class="mathbox">score matrix, one layer = 32 heads × 32,768 × 32,768 × 2 bytes
                        = 68.7 GB (64 GiB)
free HBM                = 80 − 16.1 (weights) − 4.3 (KV) − 3 = 56.6 GB</div>`,
    setup(S) {
      S.model = "llama-8b";
      S.mode = "prefill";
      S.prompt = 32768;
      S.ctx = 32768;
    },
    goals: [
      {
        t: "The 32k prompt runs without running out of memory",
        ok: (S) => S.mode === "prefill" && S.prompt >= 32768 && !w2prefill(S).oom,
      },
      {
        t: "Time to first token at most 2.0 s",
        ok: (S) => S.mode === "prefill" && S.prompt >= 32768 && !w2prefill(S).oom && w2prefill(S).ttft <= 2,
      },
      { t: "Profile the run (foundry profile)", ok: (S) => !!S.flags.profiledOk },
    ],
    hints: [
      "Plain attention needs a 64 GiB scratch matrix per layer. Which toggle avoids building it at all?",
      "Turn on FlashAttention, then run foundry profile.",
    ],
    answer: () => "foundry flash on && foundry profile",
    chips: ["foundry profile", "foundry flash on", "foundry fuse on", "foundry graphs on"],
    debrief: `<p>FlashAttention turned an impossible 64 GiB allocation into nothing by keeping the work on-chip.</p><ul><li>This is <b>kernel fusion</b> at its most dramatic: several steps combined so intermediate results stay in fast on-chip memory instead of round-tripping through HBM.</li><li>Fusing the small ops (norms, activations) saved only tens of milliseconds here. Fusion pays off when the fused ops are memory-bound and numerous.</li><li>CUDA Graphs changed nothing: each kernel here runs for milliseconds, so launch cost is irrelevant.</li></ul>`,
    links: {
      up: "Long-context RAG and document Q&A (layers 1 and 4) are affordable because of kernels like this.",
      down: "The win comes from World 1's memory hierarchy: a little very fast SRAM on each SM, a lot of slower HBM beside the die.",
    },
  },

  {
    id: "driver-stack",
    world: 2,
    title: "Driver says no",
    driverStart: true,
    concept: "Driver, CUDA & containers",
    layers: { on: [8], near: [10] },
    panels: ["container"],
    controls: [],
    brief: `<p>A teammate shipped a new serving image built on <b>CUDA 13.0</b>. On your GPU server it starts, then PyTorch reports the driver is too old.</p><p>Two pieces must agree. The <b>NVIDIA driver</b> is installed on the <b>host</b>. The <b>CUDA runtime</b> and libraries ship <b>inside the container image</b>. The <b>NVIDIA Container Toolkit</b> connects them when you start a container with <code>--gpus all</code>. Each driver supports CUDA up to a certain version, and <code>nvidia-smi</code> shows which.</p><p>Get a container running that can use the GPU. There's more than one fix.</p>`,
    setup(S) {
      S.driver = 535;
      S.lastRun = { image: "llm:cuda13.0", gpus: true, ok: false, why: "driver" };
    },
    goals: [
      { t: "Check which CUDA version the driver supports (nvidia-smi)", ok: (S) => !!S.flags.smi },
      {
        t: "A container with GPU access reports CUDA available",
        ok: (S) => !!(S.lastRun && S.lastRun.ok && S.lastRun.gpus),
      },
    ],
    hints: [
      "Run nvidia-smi and read 'CUDA Version' in the top-right corner.",
      "Either run an image built for CUDA 12.x (docker images lists them), or install driver 580 on the host.",
    ],
    answer: () => "nvidia-smi && docker run --gpus all llm:cuda12.4",
    chips: [
      "nvidia-smi",
      "docker images",
      "docker run --gpus all llm:cuda13.0",
      "docker run --gpus all llm:cuda12.4",
      "sudo apt install nvidia-driver-580",
    ],
    debrief: `<p>Either fix works, with different costs:</p><ul><li><b>Use an older image</b> (CUDA 12.4): no host change. It works because a driver supports newer minor versions within the same major release (a 12.2 driver runs a 12.4 runtime).</li><li><b>Upgrade the host driver</b> to 580: unlocks CUDA 13 for everyone, but means stopping workloads and rebooting the machine. On a cluster that's a rolling operation, which the NVIDIA GPU Operator automates (World 5).</li><li>Without <code>--gpus all</code> the container can't see the GPU at all, whatever the versions.</li></ul>`,
    links: {
      up: "Every image your platform offers (PyTorch, vLLM, NIM) bakes in a CUDA version. Platform teams publish a driver/CUDA support matrix for this reason.",
      down: "The driver is the last piece of software: it hands work to the GPU hardware itself.",
    },
  },

  {
    id: "quiz-software-path",
    world: 2,
    title: "Checkpoint: the software path",
    concept: "World 2 quiz",
    quiz: true,
    layers: { on: [8], near: [7, 10] },
    questions: [
      {
        q: "You call x @ W in PyTorch on a GPU. What usually provides the actual matrix-multiply kernel?",
        o: ["The Python interpreter", "cuBLAS / CUTLASS-based kernel libraries", "The NVIDIA driver", "NCCL"],
        a: 1,
        why: "PyTorch routes the call to the CUDA backend, which calls cuBLAS (often CUTLASS-derived kernels) to pick a tuned GEMM. The driver only launches it.",
      },
      {
        q: "CUDA Graphs help most when…",
        o: [
          "Kernels are tiny and the CPU can't launch them fast enough",
          "The model doesn't fit in memory",
          "Prompts are very long",
          "Training across many nodes",
        ],
        a: 0,
        why: "Graphs replace hundreds of separate launches with one replay. That matters when each kernel finishes faster than the CPU can launch the next.",
      },
      {
        q: "FlashAttention made the 32k prompt possible because it…",
        o: [
          "Uses FP4 precision",
          "Computes attention in tiles held on-chip instead of writing the full score matrix to HBM",
          "Skips attention for long prompts",
          "Spreads the work across more GPUs",
        ],
        a: 1,
        why: "The full score matrix was 64 GiB per layer. FlashAttention never materialises it: tiles stay in each SM's shared memory.",
      },
      {
        q: "An image built for CUDA 13.0 fails on a host with driver 535 (CUDA 12.2). What are the sensible fixes?",
        o: [
          "Reinstall PyTorch inside the container",
          "Upgrade the host driver, or use an image built for CUDA 12.x",
          "Add more GPUs",
          "Turn on CUDA Graphs",
        ],
        a: 1,
        why: "The driver sets the highest CUDA version available. Either raise it (host change, reboot) or ship a runtime the current driver supports.",
      },
      {
        q: "Where does the NVIDIA driver live?",
        o: [
          "Inside the container image",
          "On the host, passed into containers by the NVIDIA Container Toolkit",
          "Inside PyTorch",
          "In the model weights",
        ],
        a: 1,
        why: "The kernel-mode driver is part of the host. The toolkit mounts its user-space libraries and device files into containers started with --gpus.",
      },
      {
        q: "Kernel fusion speeds things up mainly by…",
        o: [
          "Raising the GPU clock",
          "Reducing kernel launches and round trips through HBM",
          "Compressing the weights",
          "Moving work to the CPU",
        ],
        a: 1,
        why: "Fused kernels keep intermediate results in registers or shared memory and need fewer launches.",
      },
    ],
    debrief: `<p>You've followed the path from Python to silicon and seen the three classic software wins: tuned libraries, fewer launches (CUDA Graphs), and fewer HBM round trips (fusion, FlashAttention). Plus the classic failure: a driver that's older than the container expects.</p>`,
    links: {
      up: "Next up the stack: inference engines package all of this so app teams just call an API.",
      down: "Next across the stack: World 3 connects eight of these GPUs with NVLink.",
    },
  },
] satisfies LevelDef[] as LevelDef[] as Level[];
/* Find a level by its permanent ID while the list is being assembled. Throws on a typo so a bad ID fails at load, not silently. */
export function findLevel(id: string) {
  const l = LEVELS.find((x) => x.id === id);
  if (!l) throw new Error("Unknown level ID: " + id);
  return l;
}
export const LABS: Record<number, Lab> = {
  1: {
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
  },
  2: {
    id: "kernel-lab",
    world: 2,
    title: "Kernel lab",
    concept: "Free play",
    lab: true,
    layers: { on: [8], near: [7, 9] },
    panels: ["stack", "memory", "timeline"],
    controls: ["model2", "mode", "prompt2", "graphs", "fuse", "flash"],
    brief: `<p>Every software toggle unlocked on an H100. Switch between decode (one token at a time) and prefill (reading a whole prompt), and see which optimisations matter where.</p><p>Things to try:</p><ul><li>Does CUDA Graphs help prefill?</li><li>At what prompt length does plain attention stop fitting?</li><li>How much does fusion save on the 1B model versus the 8B?</li></ul>`,
    setup(S) {
      S.model = "llama-1b";
      S.mode = "decode";
    },
    goals: [],
    hints: [],
    chips: ["foundry profile", "foundry trace matmul", "foundry mode prefill", "foundry graphs on", "nvidia-smi"],
  },
};
export const WORLDS: World[] = [
  { w: 1, h: "World 1 · Inside one GPU", p: "Capacity, bandwidth, compute and cost on a single chip." },
  {
    w: 2,
    h: "World 2 · The software path",
    p: "From a line of PyTorch to kernels on the SMs, and what goes wrong in between.",
  },
];
export const SOON: SoonEntry[] = [
  { n: "W3", t: "Many GPUs, one server", c: "NVLink & NVSwitch, tensor parallelism, NCCL all-reduce" },
  { n: "W4", t: "Racks and fabric", c: "InfiniBand / RDMA, pipeline parallelism, power and density" },
  { n: "W5", t: "Kubernetes makes GPUs consumable", c: "GPU Operator, device plugin, scheduling, MIG, DCGM" },
  { n: "★", t: "Finale: 8 × H100 ≠ a service", c: "Assemble the path from GPU to API endpoint" },
];
