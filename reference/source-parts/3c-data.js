<script>
"use strict";
/* ---- AMD Instinct (peak dense figures from AMD data sheets) ---- */
Object.assign(GPUS,{
 mi300x:{key:"mi300x",vendor:"amd",name:"MI300X",smi:"AMD Instinct MI300X",arch:"CDNA 3",mem:192,bw:5.3,bf16:1307,fp8:2615,fp4:0,tdp:750,price:2.2,xcds:8,cus:304,cuPerXcd:38,cuPhys:40,stacks:8,active:8,stackGB:24,hbm:"HBM3",smiMiB:196592,link:"Infinity Fabric mesh · 7 × 128 GB/s"},
 mi325x:{key:"mi325x",vendor:"amd",name:"MI325X",smi:"AMD Instinct MI325X",arch:"CDNA 3",mem:256,bw:6,bf16:1307,fp8:2615,fp4:0,tdp:1000,price:2.8,xcds:8,cus:304,cuPerXcd:38,cuPhys:40,stacks:8,active:8,stackGB:32,hbm:"HBM3e",smiMiB:262128,link:"Infinity Fabric mesh · 7 × 128 GB/s"},
 mi355x:{key:"mi355x",vendor:"amd",name:"MI355X",smi:"AMD Instinct MI355X",arch:"CDNA 4",mem:288,bw:8,bf16:2516,fp8:5033,fp4:10066,tdp:1400,price:5,xcds:8,cus:256,cuPerXcd:32,cuPhys:36,stacks:8,active:8,stackGB:36,hbm:"HBM3e",smiMiB:294896,link:"Infinity Fabric mesh · 7 × 153.6 GB/s"}
});
Object.assign(GPUS.h100,{vendor:"nvidia",link:"NVLink 4 · 900 GB/s"});Object.assign(GPUS.h200,{vendor:"nvidia",link:"NVLink 4 · 900 GB/s"});
Object.assign(GPUS.b200,{vendor:"nvidia",link:"NVLink 5 · 1.8 TB/s"});Object.assign(GPUS.b300,{vendor:"nvidia",link:"NVLink 5 · 1.8 TB/s"});
GPU_ORDER.push("mi300x","mi325x","mi355x");
const NV_GPUS=["h100","h200","b200","b300"],ALL_GPUS=GPU_ORDER.slice();

/* ---- World 3 servers: one board per vendor/generation ---- */
SERVERS.hgx.gpu="h100";SERVERS.pcie.gpu="h100";
Object.assign(SERVERS,{
 hgxb200:{key:"hgxb200",gpu:"b200",name:"HGX B200 · NVLink 5",short:"HGX B200",bw:900e9,lat:7e-6,price:44,note:"NVLink 5: 1.8 TB/s per GPU (900 GB/s each way), twice H100",mesh:false},
 mi300x:{key:"mi300x",gpu:"mi300x",name:"MI300X platform · Infinity Fabric",short:"8 × MI300X",bw:380e9,lat:10e-6,price:17.6,note:"each GPU has a direct link to each of the other 7 (a full mesh, no switch): 7 × 64 GB/s each way",mesh:true}
});
SERVERS.hgx.mesh=false;SERVERS.pcie.mesh=false;

Object.assign(INFO,{
 cu:{t:"Compute Unit (CU)",d:"AMD's equivalent of an SM. Each CU has 4 Matrix Cores (AMD's Tensor Cores) plus vector units. MI300X has 304 CUs spread over 8 compute chiplets.",tip:"AMD builds GPUs from chiplets: 8 compute dies (XCDs) stacked on 4 I/O dies, which also hold 256 MB of Infinity Cache."},
 xcd:{t:"XCD (compute chiplet)",d:"One of 8 small compute dies on an AMD Instinct GPU. Chiplets are cheaper to make than one giant die, at the cost of more chip-to-chip traffic inside the package.",tip:"NVIDIA's Blackwell went to two dies; AMD went to eight."},
 ifmesh:{t:"Infinity Fabric mesh",d:"AMD's 8-GPU boards wire every GPU directly to every other GPU, with no switch chip. Total bandwidth per GPU is similar to NVLink 4, but any single pair only gets one link (1/7 of it). All-reduces spread across all links work well; traffic between just two GPUs doesn't.",tip:"NVIDIA's NVSwitch gives every pair the full bandwidth."}
});
GLOSS.push(
 ["ROCm","AMD software","AMD's equivalent of CUDA: compiler, runtime, libraries (rocBLAS, hipBLASLt, MIOpen) and RCCL for communication."],
 ["HIP","AMD","C++ GPU programming interface that mirrors CUDA closely, so most CUDA code ports with mechanical changes."],
 ["Compute Unit","AMD","AMD's building block, like an SM. Contains Matrix Cores, AMD's Tensor Cores."],
 ["Infinity Fabric","AMD interconnect","AMD's chip-to-chip and GPU-to-GPU links; the AMD counterpart to NVLink."],
 ["amd-smi","tool","AMD's GPU status tool, the counterpart to nvidia-smi (older: rocm-smi)."],
 ["GB200 NVL72","rack-scale","72 Blackwell GPUs in one liquid-cooled rack, all on one NVLink domain: the scale-up network grows from 8 GPUs to 72."],
 ["TPU","Google","Google's own AI accelerator. Rented only through Google Cloud; programmed via JAX/XLA or PyTorch/XLA."],
 ["Trainium / Inferentia","AWS","Amazon's own AI chips, rented only on AWS and programmed through the Neuron SDK."]
);
</script>
