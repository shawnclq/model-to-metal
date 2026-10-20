<script>
"use strict";
/* ============ utilities ============ */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const nf=(n,d=0)=>Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const f0=n=>nf(Math.round(n));
const f1=n=>nf(n,1);
const f2=n=>nf(n,2);
function fmtT(sec){if(!isFinite(sec))return"—";if(sec<1e-3)return f1(sec*1e6)+" µs";if(sec<1)return f1(sec*1e3)+" ms";return f2(sec)+" s"}
function fmtMoney(x){if(!isFinite(x))return"—";if(x>=100)return"$"+f0(x);if(x>=10)return"$"+f1(x);return"$"+f2(x)}
function parseNum(v){v=String(v||"").trim().toLowerCase().replace(/,/g,"");const m=v.match(/^(\d*\.?\d+)(k)?$/);if(!m)return NaN;return Math.round(parseFloat(m[1])*(m[2]?1024:1))}
function pad(s,n){s=String(s);return s.length>=n?s:s+" ".repeat(n-s.length)}
function lpad(s,n){s=String(s);return s.length>=n?s:" ".repeat(n-s.length)+s}
function kfmt(n){return n>=1024&&n%1024===0?(n/1024)+"k":f0(n)}

/* ============ hardware & models ============ */
const GPUS={
 h100:{key:"h100",name:"H100 SXM",smi:"NVIDIA H100 80GB HBM3",arch:"Hopper",mem:80,bw:3.35,bf16:989,fp8:1979,fp4:0,tdp:700,price:2.5,dies:1,sms:132,smPhys:144,stacks:6,active:5,stackGB:16,hbm:"HBM3",smiMiB:81559},
 h200:{key:"h200",name:"H200 SXM",smi:"NVIDIA H200",arch:"Hopper",mem:141,bw:4.8,bf16:989,fp8:1979,fp4:0,tdp:700,price:3.5,dies:1,sms:132,smPhys:144,stacks:6,active:6,stackGB:24,hbm:"HBM3e",smiMiB:143771},
 b200:{key:"b200",name:"B200",smi:"NVIDIA B200",arch:"Blackwell",mem:180,bw:8,bf16:2250,fp8:4500,fp4:9000,tdp:1000,price:5.5,dies:2,sms:148,smPhys:160,stacks:8,active:8,stackGB:24,hbm:"HBM3e",smiMiB:183359},
 b300:{key:"b300",name:"B300",smi:"NVIDIA B300",arch:"Blackwell Ultra",mem:288,bw:8,bf16:2250,fp8:4500,fp4:15000,tdp:1400,price:7,dies:2,sms:160,smPhys:160,stacks:8,active:8,stackGB:36,hbm:"HBM3e",smiMiB:275040}
};
const GPU_ORDER=["h100","h200","b200","b300"];
const MODELS={
 "llama-1b":{key:"llama-1b",name:"Llama 3.2 1B",P:1.24e9,L:16,h:2048,inter:8192,heads:32,kvh:8,hd:64,vocab:128256,tied:true},
 "llama-8b":{key:"llama-8b",name:"Llama 3.1 8B",P:8.03e9,L:32,h:4096,inter:14336,heads:32,kvh:8,hd:128,vocab:128256},
 "llama-70b":{key:"llama-70b",name:"Llama 3.1 70B",P:70.6e9,L:80,h:8192,inter:28672,heads:64,kvh:8,hd:128,vocab:128256},
 "llama-405b":{key:"llama-405b",name:"Llama 3.1 405B",P:405.8e9,L:126,h:16384,inter:53248,heads:128,kvh:8,hd:128,vocab:128256}
};
const MODEL_ALIAS={"1b":"llama-1b","8b":"llama-8b","70b":"llama-70b","405b":"llama-405b","llama-3.2-1b":"llama-1b","llama-3.1-8b":"llama-8b","llama-3.1-70b":"llama-70b","llama-3.1-405b":"llama-405b"};
const kvTok=m=>2*m.L*m.kvh*m.hd*2; /* bytes per token, K and V, 16-bit */
const DTYPES={
 bf16:{key:"bf16",name:"BF16",bytes:2,q:"Reference quality",tier:3},
 fp8:{key:"fp8",name:"FP8",bytes:1,q:"Near-reference quality",tier:3},
 int4:{key:"int4",name:"INT4",bytes:0.5,q:"Some quality loss: test on your task",tier:2,weightOnly:true},
 fp4:{key:"fp4",name:"FP4",bytes:0.5,q:"Some quality loss: needs calibration (NVFP4)",tier:2,blackwell:true}
};
const DT_ORDER=["bf16","fp8","int4","fp4"];
const BATCH_STEPS=[1,2,4,8,16,24,32,48,64,96,128,192,256];
const CTX_STEPS=[2048,4096,8192,16384,32768,131072];
const PROMPT_STEPS=[512,2048,8192,16384,32768];
const RESERVE=3, MEM_EFF=.8, DEC_EFF=.6, PRE_EFF=.65, ATT_EFF=.5;

/* the ten layers from the GenAI stack doc */
const LAYERS=[
 {n:1,s:"App",name:"Application",d:"Chatbots, copilots, agents: the product the user touches. Measured by task completion, latency and cost per task."},
 {n:2,s:"Orchestration",name:"AI application / orchestration",d:"Agents, tools, memory, RAG and workflows wrapped around model calls (LangGraph, Agents SDK, MCP)."},
 {n:3,s:"Gateway",name:"AI gateway / control plane",d:"Routing, auth, quotas, caching and cost tracking across a portfolio of models (LiteLLM, Portkey, Kong)."},
 {n:4,s:"Data/RAG",name:"Data / RAG",d:"Vector databases, embeddings, retrieval and reranking that feed the model your organisation's knowledge."},
 {n:5,s:"Serving",name:"Model serving / inference",d:"Turns requests into efficient GPU work: batching, KV-cache management, scheduling (vLLM, SGLang, TensorRT-LLM)."},
 {n:6,s:"Model",name:"Model",d:"Architecture + weights + tokenizer. Parameter count sets how many GB the model needs."},
 {n:7,s:"Optimisation",name:"Model optimisation",d:"Quantisation, LoRA, distillation, fused kernels: making the same model smaller, faster and cheaper."},
 {n:8,s:"Runtime",name:"Runtime / GPU software",d:"PyTorch, CUDA, cuBLAS, cuDNN, NCCL, Triton, CUTLASS, FlashInfer: turning model operations into GPU kernels."},
 {n:9,s:"GPU",name:"GPU / accelerator",d:"The physical chip: SMs and Tensor Cores for math, HBM for memory capacity and bandwidth, NVLink to other GPUs."},
 {n:10,s:"Infra",name:"Infrastructure",d:"Kubernetes, Slurm, containers, the NVIDIA GPU Operator, storage and networking: provisioning and operating it all."}
];
const STACK_COVER={9:["W1","here"],8:["W2","here"],7:["W1, W2","part"],6:["W1","part"],5:["W1 previews","part"],10:["W2 previews · W3–5","part"]};

/* inspectable things */
const INFO={
 sm:{t:"Streaming Multiprocessor (SM)",d:"The GPU's basic building block. Each SM has 4 Tensor Cores for matrix math, general-purpose CUDA cores, registers and up to 228 KB of fast on-chip memory. A kernel runs as thousands of thread blocks spread across every SM. Lit squares show how much matrix math is happening right now.",tip:"H100 dies have 144 SMs but only 132 are switched on: disabling a few lets chips with small defects still be sold. Greyed squares are those."},
 hbm:{t:"HBM stack (High Bandwidth Memory)",d:"Stacks of DRAM chips mounted on the same package as the GPU die and wired to it with thousands of connections. Model weights and the KV cache live here. Two numbers matter: capacity (what fits) and bandwidth (how fast the SMs can read it). The fill level shows how full memory is.",tip:"H100 has six stack sites but only five carry memory; the sixth is a spacer. H200 fills all six with HBM3e."},
 bw:{t:"Memory bandwidth",d:"How many bytes per second can flow between HBM and the SMs. Producing one token means reading every weight once, so bandwidth usually sets how fast tokens come out. The moving dashes speed up as more bandwidth is used.",tip:"H100 3.35 TB/s · H200 4.8 TB/s · B200 and B300 8 TB/s."},
 link:{t:"Die-to-die link",d:"Blackwell GPUs are two dies joined by a ~10 TB/s link (NV-HBI). It is fast enough that software sees one GPU. Building two smaller dies is easier than one giant one.",tip:"This is not NVLink. NVLink connects separate GPUs; World 3 covers it."},
 code:{t:"Your model code",d:"Python written against a framework. It describes what to compute (multiply these tensors, apply this activation) and says nothing about SMs or memory addresses.",tip:"Layer 6 (model) meets layer 8 (runtime) here."},
 torch:{t:"PyTorch",d:"The framework turns each operation into a call on its C++ core (ATen). A dispatcher looks at the tensors (on GPU, BF16) and routes the call to the CUDA implementation. In plain 'eager' mode this happens one operation at a time, from Python.",tip:"torch.compile can capture many operations at once and generate fused kernels."},
 lib:{t:"Kernel libraries",d:"Where the speed lives. cuBLAS and cuBLASLt pick a hand-tuned matrix-multiply kernel for this GPU, precision and shape. cuDNN covers other deep-learning primitives, CUTLASS provides templates for writing new ones, FlashAttention and FlashInfer provide attention kernels, and Triton generates kernels from Python-like code.",tip:"These libraries ship inside your container image, versioned with CUDA."},
 runtime:{t:"CUDA runtime",d:"The API your software calls to move memory and launch kernels (cudaLaunchKernel). Each launch says which kernel to run and how many thread blocks. It also supports CUDA Graphs: record a sequence of launches once, replay it with one call.",tip:"Part of the CUDA toolkit, bundled into the container image."},
 driver:{t:"NVIDIA driver",d:"Software installed on the host operating system, not in the container. It owns the GPU: it schedules work onto the hardware, manages GPU memory, and reports status to nvidia-smi. Each driver version supports CUDA up to a certain version.",tip:"In Kubernetes the NVIDIA GPU Operator usually installs and upgrades it (World 5)."},
 gpu:{t:"GPU hardware",d:"The kernel finally runs: thread blocks are spread across the 132 SMs, Tensor Cores multiply small tiles of the matrices, and data streams in from HBM. This is World 1's chip.",tip:"Layer 9."}
};

const GLOSS=[
 ["SM","Streaming Multiprocessor","The GPU's repeated building block. Kernels run as thread blocks spread across all SMs."],
 ["Tensor Core","matrix unit","Hardware inside each SM that multiplies small matrix tiles very fast. Where almost all AI math happens."],
 ["HBM","High Bandwidth Memory","The GPU's own memory, stacked beside the die. Holds weights and KV cache."],
 ["Memory capacity","GB","How much fits: weights + KV cache + runtime overhead."],
 ["Memory bandwidth","TB/s","How fast data moves from HBM to the SMs. Usually sets tokens per second."],
 ["TFLOPS","compute","Trillions of math operations per second. Peak depends on precision: FP8 is about 2× BF16, FP4 about 2× FP8."],
 ["Precision","BF16 · FP8 · INT4 · FP4","Bytes used to store each number. Fewer bytes: smaller and faster, with some quality risk."],
 ["Quantisation","optimisation","Converting a model to lower precision to save memory and time."],
 ["Weight-only quantisation","INT4 on Hopper","Weights stored in 4 bits but unpacked to 16-bit for the math. Saves memory, not compute."],
 ["KV cache","per conversation","Saved keys and values for every token already read, so the model doesn't redo work. Grows with users × context."],
 ["Prefill","phase 1","Processing the whole prompt at once. Compute-bound. Sets time to first token."],
 ["Decode","phase 2","Generating one token at a time. Memory-bound. Sets tokens per second."],
 ["TTFT","time to first token","How long the user waits before the answer starts."],
 ["Batching","throughput","Serving many users in the same step so one read of the weights does more work."],
 ["Arithmetic intensity","FLOPs per byte","How much math a workload does for each byte it reads. Low means memory-bound."],
 ["Roofline","chart","Plot of achievable speed against arithmetic intensity: a sloped memory roof meets a flat compute roof at the ridge."],
 ["Kernel","GPU program","One function launched onto the GPU, such as a matrix multiply. A token needs hundreds."],
 ["CUDA","platform","NVIDIA's software platform for GPU computing: language, runtime, libraries and driver interface."],
 ["Driver","host software","Installed on the machine, owns the GPU, and sets the highest CUDA version you can use."],
 ["cuBLAS / CUTLASS","libraries","NVIDIA's tuned matrix-multiply kernels and the templates for building new ones."],
 ["Triton","kernel language","Python-like language for writing GPU kernels; torch.compile uses it to generate fused kernels."],
 ["CUDA Graphs","launch","Record a sequence of kernel launches once, replay it with one call. Removes CPU launch overhead."],
 ["Kernel fusion","optimisation","Combining several operations into one kernel so intermediate results stay on-chip."],
 ["FlashAttention","attention kernel","Computes attention in on-chip tiles so the huge score matrix never goes to HBM."],
 ["Container Toolkit","NVIDIA","Lets containers see the host's GPUs and driver when started with --gpus."],
 ["nvidia-smi","tool","Command-line status for NVIDIA GPUs. Its GPU-Util only means 'a kernel was running', not how busy the chip is."]
];

/* world 2: container images and drivers */
const IMAGES={"llm:cuda13.0":{cuda:"13.0",major:13,minDrv:580,torch:"2.9.0",size:"9.8GB"},"llm:cuda12.4":{cuda:"12.4",major:12,minDrv:525,torch:"2.6.0",size:"8.9GB"}};
const DRIVERS={535:{full:"535.183.01",cuda:"12.2"},550:{full:"550.163.01",cuda:"12.4"},570:{full:"570.172.08",cuda:"12.8"},580:{full:"580.95.05",cuda:"13.0"}};

const STACK2=[
 {id:"code",i:"1",name:"Your model code",tag:"Python",lyr:"layer 6 · model",code:"y = x @ W            # one linear layer of the MLP"},
 {id:"torch",i:"2",name:"PyTorch",tag:"framework",lyr:"layer 8 · runtime",code:"torch.matmul → aten::mm → dispatch: CUDA, BF16"},
 {id:"lib",i:"3",name:"Kernel libraries",tag:"cuBLAS · CUTLASS · FlashAttention · Triton",lyr:"layer 8 · runtime",code:"cublasLtMatmul → picks a GEMM kernel tuned for sm90, BF16, this shape"},
 {id:"runtime",i:"4",name:"CUDA runtime",tag:"inside the container",lyr:"layer 8 · runtime",code:"cudaLaunchKernel(kernel, grid = 132 blocks, block = 384 threads)"},
 {id:"driver",i:"5",name:"NVIDIA driver",tag:"on the host",lyr:"layer 8/10 · host",code:"driver 580 queues the launch on the GPU's command stream",boundary:true},
 {id:"gpu",i:"6",name:"GPU hardware",tag:"SMs · Tensor Cores · HBM",lyr:"layer 9 · GPU",code:"132 SMs run the blocks; Tensor Cores multiply 64×N tiles; W streams in from HBM"}
];
</script>
