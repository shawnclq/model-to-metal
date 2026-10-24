// The list of worlds: everything the home screen, XP, "Up next" and level references need, for every world,
// without loading any world's pack. Each pack's levels must match its entry here exactly (checked when the
// pack is registered, and by tests). To add a world: add its pack, then one entry here.
import { GUARDS as GUARDS_W0 } from "../packs/w0-model/guards.ts";
import { GUARDS as GUARDS_W1 } from "../packs/w1-gpu/guards.ts";
import { GUARDS as GUARDS_W2 } from "../packs/w2-software/guards.ts";
import { GUARDS as GUARDS_W3 } from "../packs/w3-server/guards.ts";
import { GUARDS as GUARDS_W4 } from "../packs/w4-cluster/guards.ts";

/** What the core knows about a level before its world's pack is loaded. */
export interface LevelInfo {
  id: string;
  title: string;
  concept: string;
  quiz?: true;
}

/** What another world says when one of this world's commands is typed there. t: the command's words. */
export type Guard = (t: string[]) => void;

export interface WorldInfo {
  world: number;
  /**
   * This world's guard answers, so the core can reply without loading the world: terminal verbs and
   * `foundry` subcommands that only this world understands.
   */
  guards?: { commands?: Record<string, Guard>; foundry?: Record<string, Guard> };
  heading: string;
  blurb: string;
  levels: LevelInfo[];
  lab?: { id: string; title: string };
}

export const MANIFEST: WorldInfo[] = [
  {
    world: 0,
    guards: GUARDS_W0,
    heading: "World 0 · Inside the model",
    blurb:
      "Tokens, weights, attention, one-word-at-a-time generation and the KV cache. Start here if those words are new.",
    levels: [
      {
        id: "tokens",
        title: "Words into tokens",
        concept: "Tokens",
      },
      {
        id: "parameters",
        title: "What's in 8 billion parameters",
        concept: "Weights & layers",
      },
      {
        id: "moe-experts",
        title: "A team of experts",
        concept: "Mixture of experts (MoE)",
      },
      {
        id: "attention",
        title: 'Who is "it"?',
        concept: "Attention: queries, keys, values",
      },
      {
        id: "attention-heads",
        title: "Many heads, shared notes",
        concept: "Attention heads & KV heads",
      },
      {
        id: "generation",
        title: "One word at a time",
        concept: "Generating text: prefill & decode",
      },
      {
        id: "kv-cache-basics",
        title: "Notes to self",
        concept: "The KV cache",
      },
      {
        id: "quiz-inside-model",
        title: "Checkpoint: inside the model",
        concept: "World 0 quiz",
        quiz: true,
      },
    ],
  },
  {
    world: 1,
    guards: GUARDS_W1,
    heading: "World 1 · Inside one GPU",
    blurb: "Capacity, bandwidth, compute and cost on a single chip.",
    levels: [
      {
        id: "gpu-anatomy",
        title: "Meet the chip",
        concept: "SMs, Tensor Cores, HBM",
      },
      {
        id: "memory-fit",
        title: "Will it fit?",
        concept: "Memory capacity & precision",
      },
      {
        id: "kv-cache-memory",
        title: "Room to talk",
        concept: "KV cache",
      },
      {
        id: "memory-bandwidth",
        title: "Fast chip, slow tokens",
        concept: "Memory bandwidth",
      },
      {
        id: "batching",
        title: "Fill the factory",
        concept: "Batching & cost per token",
      },
      {
        id: "prefill-decode",
        title: "Two speeds",
        concept: "Prefill vs decode",
      },
      {
        id: "kv-quantisation",
        title: "Long memories",
        concept: "KV-cache quantisation",
      },
      {
        id: "moe-on-gpu",
        title: "Many experts",
        concept: "Mixture of experts (MoE)",
      },
      {
        id: "perf-per-watt",
        title: "Watts per token",
        concept: "Performance per watt",
      },
      {
        id: "gpu-sharing",
        title: "Share the GPU",
        concept: "MIG & time-slicing",
      },
      {
        id: "amd-gpus",
        title: "Team red",
        concept: "AMD Instinct & ROCm",
      },
      {
        id: "gpu-choice",
        title: "Pick the GPU",
        concept: "Matching chip to workload",
      },
      {
        id: "quiz-one-gpu",
        title: "Checkpoint: one GPU",
        concept: "World 1 quiz",
        quiz: true,
      },
    ],
    lab: {
      id: "gpu-lab",
      title: "GPU lab",
    },
  },
  {
    world: 2,
    guards: GUARDS_W2,
    heading: "World 2 · The software path",
    blurb: "From a line of PyTorch to kernels on the SMs, and what goes wrong in between.",
    levels: [
      {
        id: "software-path",
        title: "Follow one matmul",
        concept: "The software path",
      },
      {
        id: "launch-overhead",
        title: "Waiting on the CPU",
        concept: "Launch overhead & CUDA Graphs",
      },
      {
        id: "kernel-fusion",
        title: "The 32k prompt",
        concept: "Fusion & FlashAttention",
      },
      {
        id: "driver-stack",
        title: "Driver says no",
        concept: "Driver, CUDA & containers",
      },
      {
        id: "quiz-software-path",
        title: "Checkpoint: the software path",
        concept: "World 2 quiz",
        quiz: true,
      },
    ],
    lab: {
      id: "kernel-lab",
      title: "Kernel lab",
    },
  },
  {
    world: 3,
    guards: GUARDS_W3,
    heading: "World 3 · Many GPUs, one server",
    blurb: "NVLink, NVSwitch, NCCL and tensor parallelism on an 8-GPU HGX board.",
    levels: [
      {
        id: "hgx-board",
        title: "Meet the HGX board",
        concept: "NVLink, NVSwitch & NCCL",
      },
      {
        id: "tensor-parallel",
        title: "Too big for one",
        concept: "Tensor parallelism",
      },
      {
        id: "nvlink-vs-pcie",
        title: "The slow road",
        concept: "NVLink vs PCIe",
      },
      {
        id: "tp-vs-replicas",
        title: "Shards or replicas?",
        concept: "TP size vs replicas",
      },
      {
        id: "quiz-one-server",
        title: "Checkpoint: one server",
        concept: "World 3 quiz",
        quiz: true,
      },
    ],
    lab: {
      id: "server-lab",
      title: "Server lab",
    },
  },
  {
    world: 4,
    guards: GUARDS_W4,
    heading: "World 4 · Many servers",
    blurb: "InfiniBand, RDMA, Ray clusters, multi-node serving and training.",
    levels: [
      {
        id: "fabric",
        title: "Meet the fabric",
        concept: "InfiniBand, RDMA & rails",
      },
      {
        id: "multi-node",
        title: "Two boxes, one model",
        concept: "Ray clusters & multi-node",
      },
      {
        id: "pipeline-parallel",
        title: "Split the right way",
        concept: "TP inside, PP across",
      },
      {
        id: "data-parallel",
        title: "Train across racks",
        concept: "Data parallel training",
      },
      {
        id: "quiz-cluster",
        title: "Checkpoint: the cluster",
        concept: "World 4 quiz",
        quiz: true,
      },
    ],
    lab: {
      id: "cluster-lab",
      title: "Cluster lab",
    },
  },
];

/** "Coming soon" cards at the end of the home screen. */
export const SOON: { n: string; t: string; c: string }[] = [
  {
    n: "W5",
    t: "Kubernetes makes GPUs consumable",
    c: "GPU Operator, device plugin, scheduling, MIG in K8s, KubeRay, DCGM",
  },
  {
    n: "★",
    t: "Finale: 8 × H100 ≠ a service",
    c: "Assemble the path from GPU to API endpoint",
  },
];

/** The guard answer for a verb or foundry subcommand that belongs to a world other than `current`, if any. */
export function guardFor(kind: "commands" | "foundry", key: string, current: number): Guard | undefined {
  for (const W of MANIFEST) if (W.world !== current && W.guards?.[kind]?.[key]) return W.guards[kind]![key];
  return undefined;
}
