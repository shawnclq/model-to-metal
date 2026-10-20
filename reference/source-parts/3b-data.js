<script>
"use strict";
/* ---- mixture-of-experts model (Qwen3-235B-A22B config: 94 layers, 64 Q / 4 KV heads, 128 experts, 8 per token) ---- */
MODELS["qwen-235b"]={key:"qwen-235b",name:"Qwen3 235B-A22B",P:235e9,L:94,h:4096,inter:12288,heads:64,kvh:4,hd:128,vocab:151936,
  moe:{E:128,k:8,expTotal:227e9,nonExp:8e9,active:22.2e9}};
MODEL_ALIAS["qwen"]="qwen-235b";MODEL_ALIAS["qwen3"]="qwen-235b";MODEL_ALIAS["qwen3-235b"]="qwen-235b";MODEL_ALIAS["moe"]="qwen-235b";
const activeP=m=>m.moe?m.moe.active:m.P;
const KVDT={bf16:{name:"16-bit",f:1},fp8:{name:"FP8",f:.5}};

/* ---- MIG on H100 80GB: 7 compute slices, 8 memory slices ---- */
const MIGP={"1g.10gb":{c:1,m:1,gb:10,id:19},"1g.20gb":{c:1,m:2,gb:20,id:15},"2g.20gb":{c:2,m:2,gb:20,id:14},"3g.40gb":{c:3,m:4,gb:40,id:9},"4g.40gb":{c:4,m:4,gb:40,id:5},"7g.80gb":{c:7,m:8,gb:80,id:0}};
const MIG_ID={};Object.entries(MIGP).forEach(([k,v])=>MIG_ID[v.id]=k);
const MIG_PRESETS=[
 {l:"7 × 1g.10gb",v:"1g.10gb,1g.10gb,1g.10gb,1g.10gb,1g.10gb,1g.10gb,1g.10gb"},
 {l:"3 × 2g.20gb + 1g",v:"2g.20gb,2g.20gb,2g.20gb,1g.10gb"},
 {l:"2 × 2g.20gb + 3 × 1g",v:"2g.20gb,2g.20gb,1g.10gb,1g.10gb,1g.10gb"},
 {l:"2 × 3g.40gb",v:"3g.40gb,3g.40gb"},
 {l:"1 × 7g.80gb",v:"7g.80gb"}];
const TENANTS=[
 {n:"code-helper",need:16,d:"Llama 3.1 8B FP8 + KV for 12 devs"},
 {n:"support-bot",need:14,d:"Llama 3.1 8B FP8 + KV for 8 chats"},
 {n:"intent-router",need:7,d:"Llama 3.2 1B BF16, high traffic"},
 {n:"reranker",need:4,d:"cross-encoder, ~0.6B params"},
 {n:"embedder",need:3,d:"embedding model, ~0.3B params"}];
const TCOL=["var(--sea)","var(--signal)","var(--ok)","#8E6AC8","#C0603A","#2E9C9C","#B5487A","#6F7F2A"];

/* ---- World 3: one HGX server ---- */
const SERVERS={
 hgx:{key:"hgx",name:"HGX H100 · NVLink",short:"HGX (NVLink)",bw:450e9,lat:8e-6,price:20,note:"18 NVLink 4 links per GPU into 4 NVSwitch chips: 900 GB/s per GPU (450 each way)"},
 pcie:{key:"pcie",name:"PCIe server · 8 × H100",short:"PCIe server",bw:40e9,lat:25e-6,price:16,note:"GPUs talk through PCIe Gen5 switches and the CPUs: ~64 GB/s peak each way, ~40 GB/s in practice"}};
const TP_STEPS=[1,2,4,8];

/* ---- World 4: many servers ---- */
const NETS={
 ib:{key:"ib",name:"InfiniBand NDR",s:"8 × 400 Gb/s",perGPU:50e9,eff:.9,lat:5e-6,rdma:true,d:"InfiniBand NDR, one 400 Gb/s ConnectX-7 NIC per GPU ('rails'), RDMA"},
 roce:{key:"roce",name:"Ethernet RoCE",s:"8 × 400 Gb/s",perGPU:50e9,eff:.8,lat:8e-6,rdma:true,d:"400 GbE with RDMA over Converged Ethernet (RoCE v2), one NIC per GPU"},
 eth:{key:"eth",name:"Ethernet 100G",s:"1 × 100 Gb/s",perGPU:12.5e9/8,eff:.7,lat:40e-6,rdma:false,d:"one 100 GbE NIC per server shared by all 8 GPUs, plain TCP, no RDMA"}};

Object.assign(INFO,{
 nvswitch:{t:"NVSwitch",d:"A switch chip on the HGX board. Every GPU has 18 NVLink links spread across 4 NVSwitch chips, so any GPU can talk to any other at full speed: 900 GB/s per GPU, about 14× PCIe Gen5.",tip:"nvidia-smi topo -m shows 'NV18' between every pair of GPUs: 18 NVLinks."},
 nvlink:{t:"NVLink",d:"NVIDIA's direct GPU-to-GPU connection. It carries the all-reduce traffic that tensor parallelism needs after every layer. The moving dashes speed up with traffic.",tip:"H100: NVLink 4, 900 GB/s per GPU. B200: NVLink 5, 1.8 TB/s."},
 pcie:{t:"PCIe path",d:"Without NVLink, GPUs exchange data through PCIe switches and sometimes the CPUs. It works, but it is roughly 10–20× slower, and every hop adds latency.",tip:"Fine for running independent replicas; painful for tensor parallelism."},
 gpu8:{t:"One GPU on the board",d:"Each square is a full H100 (80 GB). The fill shows its memory. Same colour means the GPUs share one copy of the model (one tensor-parallel group, also called one replica).",tip:"8 GPUs ÷ TP size = number of replicas."},
 nic:{t:"NIC (network card)",d:"A ConnectX-7 network card. GPU servers for AI have one 400 Gb/s NIC per GPU, so each GPU gets its own lane to other servers. Each lane is called a rail.",tip:"With GPUDirect RDMA, the NIC reads GPU memory directly, without copying through the CPU."},
 leaf:{t:"Leaf switch",d:"The first network switch each server plugs into. In a 'rail-optimised' design, GPU 1 of every server connects to the same leaf, GPU 2 to the next, and so on, so most traffic needs only one hop.",tip:"Leaves connect upward to spine switches."},
 spine:{t:"Spine switch",d:"Connects leaf switches together so any server can reach any other. Leaves plus spines form a 'fat tree' with full bandwidth between any two points.",tip:"Thousands of GPUs means multiple tiers of these."},
 node:{t:"Node (server)",d:"One GPU server: 8 GPUs joined by NVLink inside the box, plus 8 NICs to reach the rest of the cluster. Inside the box is fast; between boxes is about 18× slower per GPU.",tip:"NVLink 450 GB/s each way per GPU vs 50 GB/s per InfiniBand NDR NIC."},
 rayhead:{t:"Ray head node",d:"Ray turns a set of machines into one pool of CPUs and GPUs. The head node runs the cluster's control services (GCS) and the dashboard; workers join it with ray start --address. Programs then ask Ray for resources, for example 16 GPUs, and Ray places the work.",tip:"KubeRay runs the same thing on Kubernetes (World 5)."},
 mig:{t:"MIG instance",d:"Multi-Instance GPU splits one H100 into up to 7 isolated GPUs. Each instance has its own SMs (compute slices), its own memory and its own memory bandwidth, so one team can't slow down or crash another.",tip:"Profiles are named by compute slices and memory: 1g.10gb, 2g.20gb, 3g.40gb…"}
});
GLOSS.push(
 ["KV-cache quantisation","FP8 KV","Storing the KV cache in 8 bits instead of 16. Doubles how much context fits, small accuracy risk."],
 ["Mixture of experts","MoE","Each token uses only a few 'expert' sub-networks. All experts must be in memory, but each token reads and computes only the active ones."],
 ["Active parameters","MoE","Parameters actually used per token. Qwen3 235B-A22B has 235B total, 22B active."],
 ["Performance per watt","tokens per kWh","Work done per unit of energy. Power and cooling, not GPU count, often limit data centres."],
 ["MIG","Multi-Instance GPU","Hardware partitioning of one GPU into isolated slices with their own compute and memory."],
 ["Time-slicing","GPU sharing","Taking turns on the whole GPU. Simple, but no memory isolation or guaranteed share."],
 ["NVLink / NVSwitch","scale-up","Direct GPU-to-GPU links inside a server (900 GB/s per H100) and the switch chips that connect them all."],
 ["Tensor parallelism","TP","Splitting every layer's matrices across GPUs. Needs an all-reduce after each layer, so it wants NVLink."],
 ["Pipeline parallelism","PP","Splitting the model by layers into stages on different GPUs or servers. Only passes activations between stages."],
 ["Data parallelism","DP / replicas","Full copies of the model each handling different requests (inference) or different data (training)."],
 ["NCCL","collectives","NVIDIA's library for GPU-to-GPU communication: all-reduce, all-gather, etc., over NVLink and the network."],
 ["All-reduce","collective","Every GPU contributes a tensor and every GPU gets the sum. TP does it every layer; training does it for gradients."],
 ["InfiniBand","scale-out network","Low-latency, RDMA-native network for GPU clusters. NDR = 400 Gb/s per port."],
 ["RoCE","RDMA over Ethernet","RDMA on Ethernet switches. Close to InfiniBand when the network is tuned for it."],
 ["RDMA","remote DMA","One machine's NIC writes straight into another machine's memory, without the CPUs copying data."],
 ["GPUDirect RDMA","NVIDIA","The NIC reads and writes GPU memory directly, skipping a copy through CPU memory."],
 ["Rail","network design","The lane from GPU n in every server to the same leaf switch. Keeps most traffic to one switch hop."],
 ["Ray","distributed compute","Python framework that pools many machines' CPUs and GPUs. vLLM uses it to run one model across servers."],
 ["Scaling efficiency","training","How close N servers get to N× the speed of one. Network time is the usual thief."]
);
STACK_COVER[9]=["W1, W3","here"];STACK_COVER[10]=["W4 · W2 previews · W5 later","here"];STACK_COVER[5]=["W1, W3, W4 preview","part"];STACK_COVER[8]=["W2, W3 (NCCL)","here"];
</script>
