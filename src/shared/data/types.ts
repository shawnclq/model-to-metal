// Shapes of the shared reference data: GPU spec sheets, model configs, precisions, servers, inspect entries.

export type Vendor = "nvidia" | "amd";

/** One GPU's spec sheet. NVIDIA-only and AMD-only fields are optional. */
export interface Gpu {
  key: string;
  name: string;
  smi: string;
  arch: string;
  mem: number; // GB
  bw: number; // TB/s
  bf16: number; // TFLOPS
  fp8: number;
  fp4: number;
  tdp: number; // W
  price: number; // $/hour, illustrative
  stacks: number;
  active: number;
  stackGB: number;
  hbm: string;
  smiMiB: number;
  vendor?: Vendor;
  link?: string;
  // NVIDIA
  dies?: number;
  sms?: number;
  smPhys?: number;
  // AMD
  xcds?: number;
  cus?: number;
  cuPerXcd?: number;
  cuPhys?: number;
}

export interface MoeConfig {
  E: number; // experts per layer
  k: number; // experts used per token
  expTotal: number;
  nonExp: number;
  active: number;
}

export interface Model {
  key: string;
  name: string;
  P: number; // parameters
  L: number; // layers
  h: number; // hidden size
  inter: number; // MLP size
  heads: number;
  kvh: number;
  hd: number;
  vocab: number;
  tied?: boolean;
  moe?: MoeConfig;
}

export interface Dtype {
  key: string;
  name: string;
  bytes: number;
  q: string;
  tier: number;
  weightOnly?: boolean;
  blackwell?: boolean;
}

export interface Layer {
  n: number;
  s: string;
  name: string;
  d: string;
}

export interface InfoEntry {
  t: string;
  d: string;
  tip: string;
}

export type GlossEntry = [term: string, kind: string, definition: string];

/** An 8-GPU server: its GPU-to-GPU fabric (bandwidth each way, latency) and price. */
export interface Server {
  key: string;
  name: string;
  short: string;
  bw: number;
  lat: number;
  price: number;
  note: string;
  gpu?: string;
  mesh?: boolean;
}
