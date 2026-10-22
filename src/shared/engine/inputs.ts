// What each shared model reads from the game state. Any world's state that has these fields can be passed in,
// so shared maths never depends on a particular world's full state.

/** One GPU serving one model (World 1's bench; also used for "Pick the GPU" and nvidia-smi). */
export interface GpuSetup {
  gpu: string;
  model: string;
  dtype: string;
  kvdt?: string;
  batch: number;
  ctx: number;
  prompt: number;
}

/** Kernels of one model on an H100 (World 2; World 0's nvidia-smi also reads it). */
export interface KernelSetup {
  model: string;
  ctx: number;
  prompt: number;
  mode: string;
  graphs: boolean;
  fuse: boolean;
  flash: boolean;
}

/** One 8-GPU server split into tensor-parallel groups (World 3). */
export interface ServerSetup {
  srv: string;
  model: string;
  dtype: string;
  kvdt?: string;
  tp: number;
  batch: number;
  ctx: number;
  prompt: number;
}
