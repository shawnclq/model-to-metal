import type { Lab, Level, LevelDef, W2State } from "../../core/types.ts";
import { w2decode, w2prefill } from "../../shared/engine/kernels.ts";
// World 2 · The software path: its five levels and the kernel lab.
export const LEVELS: Level<W2State>[] = [
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
] satisfies LevelDef<W2State>[] as LevelDef<W2State>[] as Level<W2State>[];
export const LAB = {
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
} satisfies LevelDef<W2State> as LevelDef<W2State> as Lab<W2State>;
