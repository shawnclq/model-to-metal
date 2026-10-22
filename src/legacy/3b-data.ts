import type { MigProfile, Model, Net, Server } from "./types.ts";

/* ---- MIG on H100 80GB: 7 compute slices, 8 memory slices ---- */
export const MIGP: Record<string, MigProfile> = {
  "1g.10gb": { c: 1, m: 1, gb: 10, id: 19 },
  "1g.20gb": { c: 1, m: 2, gb: 20, id: 15 },
  "2g.20gb": { c: 2, m: 2, gb: 20, id: 14 },
  "3g.40gb": { c: 3, m: 4, gb: 40, id: 9 },
  "4g.40gb": { c: 4, m: 4, gb: 40, id: 5 },
  "7g.80gb": { c: 7, m: 8, gb: 80, id: 0 },
};
// GPU-instance profile ID ("9") → profile name ("3g.40gb").
export const MIG_ID: Record<string, string> = {};
Object.entries(MIGP).forEach(([k, v]) => (MIG_ID[v.id] = k));
export const MIG_PRESETS: { l: string; v: string }[] = [
  { l: "7 × 1g.10gb", v: "1g.10gb,1g.10gb,1g.10gb,1g.10gb,1g.10gb,1g.10gb,1g.10gb" },
  { l: "3 × 2g.20gb + 1g", v: "2g.20gb,2g.20gb,2g.20gb,1g.10gb" },
  { l: "2 × 2g.20gb + 3 × 1g", v: "2g.20gb,2g.20gb,1g.10gb,1g.10gb,1g.10gb" },
  { l: "2 × 3g.40gb", v: "3g.40gb,3g.40gb" },
  { l: "1 × 7g.80gb", v: "7g.80gb" },
];
export const TENANTS: { n: string; need: number; d: string }[] = [
  { n: "code-helper", need: 16, d: "Llama 3.1 8B FP8 + KV for 12 devs" },
  { n: "support-bot", need: 14, d: "Llama 3.1 8B FP8 + KV for 8 chats" },
  { n: "intent-router", need: 7, d: "Llama 3.2 1B BF16, high traffic" },
  { n: "reranker", need: 4, d: "cross-encoder, ~0.6B params" },
  { n: "embedder", need: 3, d: "embedding model, ~0.3B params" },
];
export const TP_STEPS = [1, 2, 4, 8];

/* ---- World 4: many servers ---- */
export const NETS: Record<string, Net> = {
  ib: {
    key: "ib",
    name: "InfiniBand NDR",
    s: "8 × 400 Gb/s",
    perGPU: 50e9,
    eff: 0.9,
    lat: 5e-6,
    rdma: true,
    d: "InfiniBand NDR, one 400 Gb/s ConnectX-7 NIC per GPU ('rails'), RDMA",
  },
  roce: {
    key: "roce",
    name: "Ethernet RoCE",
    s: "8 × 400 Gb/s",
    perGPU: 50e9,
    eff: 0.8,
    lat: 8e-6,
    rdma: true,
    d: "400 GbE with RDMA over Converged Ethernet (RoCE v2), one NIC per GPU",
  },
  eth: {
    key: "eth",
    name: "Ethernet 100G",
    s: "1 × 100 Gb/s",
    perGPU: 12.5e9 / 8,
    eff: 0.7,
    lat: 40e-6,
    rdma: false,
    d: "one 100 GbE NIC per server shared by all 8 GPUs, plain TCP, no RDMA",
  },
};
