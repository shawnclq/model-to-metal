/* The ten layers of the GenAI stack, from the app down to the infrastructure. */
import type { Layer } from "./types.ts";
export const LAYERS: Layer[] = [
  {
    n: 1,
    s: "App",
    name: "Application",
    d: "Chatbots, copilots, agents: the product the user touches. Measured by task completion, latency and cost per task.",
  },
  {
    n: 2,
    s: "Orchestration",
    name: "AI application / orchestration",
    d: "Agents, tools, memory, RAG and workflows wrapped around model calls (LangGraph, Agents SDK, MCP).",
  },
  {
    n: 3,
    s: "Gateway",
    name: "AI gateway / control plane",
    d: "Routing, auth, quotas, caching and cost tracking across a portfolio of models (LiteLLM, Portkey, Kong).",
  },
  {
    n: 4,
    s: "Data/RAG",
    name: "Data / RAG",
    d: "Vector databases, embeddings, retrieval and reranking that feed the model your organisation's knowledge.",
  },
  {
    n: 5,
    s: "Serving",
    name: "Model serving / inference",
    d: "Turns requests into efficient GPU work: batching, KV-cache management, scheduling (vLLM, SGLang, TensorRT-LLM).",
  },
  {
    n: 6,
    s: "Model",
    name: "Model",
    d: "Architecture + weights + tokenizer. Parameter count sets how many GB the model needs.",
  },
  {
    n: 7,
    s: "Optimisation",
    name: "Model optimisation",
    d: "Quantisation, LoRA, distillation, fused kernels: making the same model smaller, faster and cheaper.",
  },
  {
    n: 8,
    s: "Runtime",
    name: "Runtime / GPU software",
    d: "PyTorch, CUDA, cuBLAS, cuDNN, NCCL, Triton, CUTLASS, FlashInfer: turning model operations into GPU kernels.",
  },
  {
    n: 9,
    s: "GPU",
    name: "GPU / accelerator",
    d: "The physical chip: SMs and Tensor Cores for math, HBM for memory capacity and bandwidth, NVLink to other GPUs.",
  },
  {
    n: 10,
    s: "Infra",
    name: "Infrastructure",
    d: "Kubernetes, Slurm, containers, the NVIDIA GPU Operator, storage and networking: provisioning and operating it all.",
  },
];
// Which worlds cover each stack layer (home screen map). Numeric keys, so they list in layer order.
export const STACK_COVER: Record<number, [string, string]> = {
  5: ["W1, W3, W4 preview", "part"],
  6: ["W0, W1", "here"],
  7: ["W1, W2", "part"],
  8: ["W2, W3 (NCCL)", "here"],
  9: ["W1, W3", "here"],
  10: ["W4 · W2 previews · W5 later", "here"],
};
