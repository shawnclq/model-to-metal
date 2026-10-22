/* world 2: container images and drivers */
export const IMAGES: Record<string, { cuda: string; major: number; minDrv: number; torch: string; size: string }> = {
  "llm:cuda13.0": { cuda: "13.0", major: 13, minDrv: 580, torch: "2.9.0", size: "9.8GB" },
  "llm:cuda12.4": { cuda: "12.4", major: 12, minDrv: 525, torch: "2.6.0", size: "8.9GB" },
};

export const STACK2: {
  id: string;
  i: string;
  name: string;
  tag: string;
  lyr: string;
  code: string;
  boundary?: boolean;
}[] = [
  {
    id: "code",
    i: "1",
    name: "Your model code",
    tag: "Python",
    lyr: "layer 6 · model",
    code: "y = x @ W            # one linear layer of the MLP",
  },
  {
    id: "torch",
    i: "2",
    name: "PyTorch",
    tag: "framework",
    lyr: "layer 8 · runtime",
    code: "torch.matmul → aten::mm → dispatch: CUDA, BF16",
  },
  {
    id: "lib",
    i: "3",
    name: "Kernel libraries",
    tag: "cuBLAS · CUTLASS · FlashAttention · Triton",
    lyr: "layer 8 · runtime",
    code: "cublasLtMatmul → picks a GEMM kernel tuned for sm90, BF16, this shape",
  },
  {
    id: "runtime",
    i: "4",
    name: "CUDA runtime",
    tag: "inside the container",
    lyr: "layer 8 · runtime",
    code: "cudaLaunchKernel(kernel, grid = 132 blocks, block = 384 threads)",
  },
  {
    id: "driver",
    i: "5",
    name: "NVIDIA driver",
    tag: "on the host",
    lyr: "layer 8/10 · host",
    code: "driver 580 queues the launch on the GPU's command stream",
    boundary: true,
  },
  {
    id: "gpu",
    i: "6",
    name: "GPU hardware",
    tag: "SMs · Tensor Cores · HBM",
    lyr: "layer 9 · GPU",
    code: "132 SMs run the blocks; Tensor Cores multiply 64×N tiles; W streams in from HBM",
  },
];
