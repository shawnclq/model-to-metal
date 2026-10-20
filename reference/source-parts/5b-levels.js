<script>
"use strict";
/* ---------- new World 1 levels (inserted before the World 1 quiz) ---------- */
const NEW_W1=[
 {world:1,title:"Long memories",concept:"KV-cache quantisation",layers:{on:[9],near:[5,7]},
  panels:["chip"],controls:["gpu","model","dtype","kv","batch","ctx"],locks:{gpu:"The H200s are already racked.",model:"The product team chose Llama 3.1 70B.",batch:"Product target: 8 people at once.",ctx:"Product target: 32k-token research sessions."},
  brief:`<p>A research tool lets <b>8 analysts</b> each keep a <b>32,768-token</b> conversation going. On the H200 the KV cache alone needs 86 GB, so it doesn't fit next to the weights.</p><p>Weights aren't the only thing you can store in fewer bits. The <b>KV cache</b> can be kept in <b>FP8</b> instead of 16-bit, halving it. Accuracy usually holds up well, but it's a real trade-off worth testing on long documents.</p><p>Make it fit without dropping the weights below FP8.</p><div class="mathbox">KV cache = 8 users × 32,768 tokens × 0.33 MB = 85.9 GB  (16-bit)
         = 8 users × 32,768 tokens × 0.16 MB = 42.9 GB  (FP8)</div>`,
  setup(S){S.gpu="h200";S.model="llama-70b";S.dtype="fp8";S.batch=8;S.ctx=32768;S.kvdt="bf16"},
  goals:[{t:"8 users × 32,768 tokens fit on the H200",ok:S=>S.batch>=8&&S.ctx>=32768&&fits(S)},{t:"Weights stay at FP8 or BF16",ok:hiQ}],
  hints:["The yellow KV cache is bigger than the blue weights. Which of the two can you shrink without touching weight precision?","Use the KV cache buttons, or foundry kv fp8."],
  answer:()=>"foundry kv fp8",chips:["foundry status","foundry kv fp8","foundry dtype int4"],
  debrief:`<p>FP8 KV cache halved the conversation memory, from 86 GB to 43 GB, so everything fits with room to spare. It also made each token a little faster: less KV to read per step.</p><ul><li>At long context the KV cache, not the weights, is the memory hog. Quantising it is now standard in vLLM and TensorRT-LLM (<code>--kv-cache-dtype fp8</code>).</li><li>Other tricks attack the same problem: grouped-query attention (fewer KV heads, already in Llama 3), sliding windows, and offloading old KV to CPU memory or SSD.</li><li>Quality risk is real but usually small; long-document benchmarks are where to check.</li></ul>`,
  links:{up:"Context length is a product decision (layer 1) that the serving layer (5) pays for in GB. KV quantisation is an optimisation (7) that changes the price.",down:"Less KV to read also means less memory bandwidth per token, which you met in level 4."}},

 {world:1,title:"Many experts",concept:"Mixture of experts (MoE)",layers:{on:[9],near:[6]},
  panels:["chip"],controls:["gpu","model","dtype","batch"],locks:{ctx:"Fixed at 4k for this test."},
  brief:`<p>Leadership wants a <b>frontier-scale model (200B+ parameters) on a single GPU</b>, answering at <b>60+ tokens/s</b> per user, at FP8 quality.</p><p>Llama 3.1 405B is <b>dense</b>: every token uses every weight. <b>Qwen3 235B-A22B</b> is a <b>mixture of experts</b>: each layer has 128 small "expert" networks and a router that sends each token to just 8 of them. All 235B parameters must sit in memory, but each token only reads and computes about <b>22B</b>.</p><p>Find a GPU and model that hit the target. Then try <b>32 users</b> and see what happens to MoE's speed advantage.</p><div class="mathbox">dense 405B, FP8: read 406 GB per token
MoE 235B-A22B:   read ~22 GB per token (8 of 128 experts)
32 users:        1 − (120/128)³² = 87% of experts get used every step</div>`,
  setup(S){S.gpu="h200";S.model="llama-405b";S.dtype="fp8";S.batch=1;S.ctx=4096},
  goals:[{t:"A 200B+ model fits on one GPU at FP8 or BF16",ok:S=>MODELS[S.model].P>=200e9&&fits(S)&&hiQ(S)},{t:"Try 32 or more users on the MoE model",ok:S=>!!S.flags.moe32},{t:"Each user gets at least 60 tokens/s",ok:S=>MODELS[S.model].P>=200e9&&fits(S)&&hiQ(S)&&w1(S).perUser>=60}],
  hints:["405B in FP8 is 406 GB: no single GPU holds it. Switch to the Qwen3 MoE model.","235 GB at FP8 needs the B300's 288 GB. After trying 32 users, come back down to 8 or fewer."],
  answer:()=>"foundry load qwen-235b && foundry gpu b300 && foundry batch 32 && foundry batch 4",chips:["foundry status","foundry load qwen-235b","foundry gpu b300","foundry batch 32","foundry batch 4"],
  debrief:`<p>Memory sized like a 235B model, speed like a 22B one. That's why most frontier models (DeepSeek, Qwen, Llama 4, gpt-oss) are now MoE.</p><ul><li>The catch: with many users, different tokens pick different experts, so each step touches nearly all of them. At 32 users the GPU read ~200 GB per step and the speed advantage mostly vanished.</li><li>Big MoE deployments spread experts across many GPUs (<b>expert parallelism</b>), which needs fast GPU-to-GPU links: World 3.</li><li>Capacity planning changes: size memory for total parameters, size compute for active ones.</li></ul>`,
  links:{up:"Model choice (layer 6) now drives hardware choice: MoE favours lots of memory per GPU, or many GPUs with fast interconnect.",down:"Experts living on different GPUs means tokens hop between GPUs every layer: all-to-all traffic over NVLink."}},

 {world:1,title:"Watts per token",concept:"Performance per watt",layers:{on:[9],near:[10]},
  panels:["chip"],controls:["gpu","model","dtype","batch","ctx"],locks:{model:"The product team chose Llama 3.1 70B.",batch:"Steady load: 64 users per GPU.",ctx:"2,048-token conversations."},
  brief:`<p>Your data centre has a fixed power budget, and its racks are <b>air-cooled</b>: no GPU rated above <b>1,000 W</b>. Finance now tracks <b>tokens per kilowatt-hour</b>, because electricity and cooling capacity, not GPU count, are what run out first.</p><p>Each GPU's power draw depends on how hard it works (see the Power tile). Find the GPU that delivers at least <b>22 million tokens per kWh</b> within the air-cooling limit, at FP8 quality or better.</p><div class="mathbox">tokens per kWh = tokens/s × 3,600 ÷ (watts ÷ 1,000)
power estimate  ≈ rated power × (14% idle + share of bandwidth and math in use)</div>`,
  setup(S){S.gpu="h200";S.model="llama-70b";S.dtype="fp8";S.batch=64;S.ctx=2048},
  goals:[{t:"At least 22 million tokens per kWh",ok:S=>fits(S)&&w1(S).tpk>=22e6},{t:"GPU rated at 1,000 W or less (air-cooled)",ok:S=>GPUS[S.gpu].tdp<=1000},{t:"Precision FP8 or BF16",ok:hiQ}],
  hints:["Compare the Power tile and tokens per kWh across GPUs. The B300 is excluded: it's rated 1,400 W and needs liquid cooling.","Blackwell's extra bandwidth does more work per watt than Hopper."],
  answer:()=>"foundry gpu b200",chips:["foundry status","foundry gpu b200","foundry gpu b300","foundry dtype fp4"],
  debrief:`<p>The B200 produced ~20% more tokens per kWh than the H200 within the air-cooling limit. Each generation does more work per watt, and that, more than raw speed, is what lets a data centre grow inside its power budget.</p><ul><li>The B300 was <i>worse</i> per watt here: same memory bandwidth as the B200 but a higher power rating, on a workload limited by bandwidth. Its extra memory and FP4 math only pay off on workloads that use them.</li><li>FP4 on the B200 would reach ~36M tokens per kWh: quantisation is an energy lever too.</li><li>Above ~1,000 W per GPU, racks move to direct liquid cooling (B300, GB200 NVL72). That's a facilities decision, made years ahead.</li><li>Power figures here are rough estimates; measure real ones with DCGM.</li></ul>`,
  links:{up:"Cost per task in the application layer is increasingly an energy number.",down:"Infrastructure (layer 10) includes power distribution and cooling, often the slowest part of the stack to change."}},

 {world:1,title:"Share the GPU",concept:"MIG & time-slicing",layers:{on:[9],near:[10]},
  panels:["mig"],controls:["mig"],
  brief:`<p>Five teams each need a small model, and you have <b>one H100</b>. Giving each team a whole GPU would waste most of it.</p><p>Two ways to share. <b>Time-slicing</b> lets everyone take turns on the whole GPU: easy, but one team can fill the memory or hog the SMs and hurt the others. <b>MIG (Multi-Instance GPU)</b> cuts the H100 into up to <b>7 isolated GPUs</b>, each with its own SMs, memory and bandwidth.</p><p>An H100 has <b>7 compute slices</b> and <b>8 memory slices</b> of 10 GB. Profiles are named by both, such as <code>1g.10gb</code> or <code>2g.20gb</code>. Turn on MIG mode, then pick a layout where every team gets its own instance that fits.</p>`,
  setup(S){S.gpu="h100";S.mig={mode:false,inst:[],share:"none"}},
  goals:[{t:"MIG mode enabled",ok:S=>S.mig.mode},{t:"Every team has its own MIG instance that fits",ok:S=>S.mig.mode&&S.mig.share==="mig"&&migAssign(S).all}],
  hints:["Enable MIG mode first: sudo nvidia-smi -i 0 -mig 1. Then look at each team's memory need.","Two teams need ~15 GB (a 2g.20gb each); three need under 10 GB (a 1g.10gb each). 2 + 2 + 1 + 1 + 1 = 7 compute slices."],
  answer:()=>"sudo nvidia-smi -i 0 -mig 1 && nvidia-smi mig -cgi 2g.20gb,2g.20gb,1g.10gb,1g.10gb,1g.10gb -C",chips:["nvidia-smi","sudo nvidia-smi -i 0 -mig 1","nvidia-smi mig -lgip","nvidia-smi mig -cgi 1g.10gb,1g.10gb -C","foundry share timeslice"],
  debrief:`<p>One H100 now behaves like five smaller GPUs. Each team has its own memory and SMs, so a runaway job in one can't crash or slow the others.</p><ul><li>The cost of MIG is rigidity: layouts follow fixed profiles, and changing them means draining the GPU. Pieces that don't match the profiles get stranded.</li><li>Time-slicing is more flexible but gives no isolation. Fine for dev notebooks, risky for production.</li><li>In Kubernetes, the GPU Operator can apply MIG layouts and each instance shows up as its own resource (World 5).</li></ul>`,
  links:{up:"Platform teams use MIG to give many small apps (layers 1–4) a guaranteed slice of GPU without buying a GPU each.",down:"MIG is enforced in hardware: the SMs, L2 cache and memory controllers are physically divided."}}
];
const W1Q_MORE=[
 {q:"Eight users with 32k-token conversations don't fit. Which change keeps weight quality but halves the conversation memory?",o:["INT4 weights","FP8 KV cache","A bigger batch","CUDA Graphs"],a:1,why:"The KV cache, not the weights, dominates at long context. Storing it in FP8 halves it."},
 {q:"A mixture-of-experts model with 235B total and 22B active parameters needs memory for…",o:["22B parameters","235B parameters","Only the router","Whichever experts the first user picks"],a:1,why:"Every expert must be in memory because any token might pick it. Only the per-token reading and math shrink to ~22B."},
 {q:"Why would a platform team use MIG instead of time-slicing?",o:["It's faster for one big model","Each team gets isolated memory and compute, so one team can't crash or starve another","It needs no configuration","It adds more memory"],a:1,why:"MIG divides the hardware itself. Time-slicing shares everything, so there's no protection between tenants."}
];
/* ---------- World 3: one 8-GPU server ---------- */
const W3L=[
 {world:3,title:"Meet the HGX board",concept:"NVLink, NVSwitch & NCCL",layers:{on:[9],near:[8]},
  panels:["board"],controls:["srv","model","dtype","tp"],
  brief:`<p>A typical AI server is an <b>HGX board</b>: 8 GPUs, each wired by 18 <b>NVLink</b> links to 4 <b>NVSwitch</b> chips. Any GPU can reach any other at 900 GB/s, about 14× faster than PCIe.</p><p>Right now the server runs <b>8 separate copies</b> of 70B, one per GPU (8 replicas, tensor-parallel size 1), so the GPUs never talk to each other.</p><p>Look at how the GPUs are connected with <code>nvidia-smi topo -m</code>. Tap an NVSwitch. Then measure GPU-to-GPU speed with NCCL's own benchmark, <code>all_reduce_perf</code>.</p>`,
  setup(S){S.srv="hgx";S.model="llama-70b";S.dtype="fp8";S.tp=1;S.batch=4},
  goals:[{t:"Show the GPU topology (nvidia-smi topo -m)",ok:S=>!!S.flags.topo},{t:"Inspect an NVSwitch chip",ok:S=>S.inspected.includes("nvswitch")},{t:"Run the NCCL all-reduce benchmark",ok:S=>!!S.flags.nccl}],
  hints:["Type nvidia-smi topo -m. NV18 means 18 NVLinks between that pair of GPUs.","Tap one of the small chips in the middle of the board. Then type all_reduce_perf -b 8 -e 8G -g 8."],
  answer:()=>"nvidia-smi topo -m && foundry inspect nvswitch && all_reduce_perf -b 8 -e 8G -f 16 -g 8",chips:["nvidia-smi topo -m","all_reduce_perf -b 8 -e 8G -f 16 -g 8","foundry inspect nvswitch","nvidia-smi"],
  debrief:`<p>You've seen the two speeds inside a server: tiny messages are limited by <b>latency</b> (microseconds per hop), big ones by <b>bandwidth</b> (the busbw column approaching ~450 GB/s each way).</p><ul><li><b>NCCL</b> is the library every framework uses for GPU-to-GPU communication. <code>all_reduce_perf</code> from nccl-tests is the standard health check for a new server or cluster.</li><li><b>All-reduce</b>: every GPU contributes a tensor and every GPU ends up with the sum. Tensor parallelism does one after every layer.</li><li>"NV18" in the topology means every pair of GPUs has a full NVLink path. On a PCIe server you'd see PIX, NODE or SYS instead: slower paths through switches and CPUs.</li></ul>`,
  links:{up:"Inference engines use NCCL under the hood whenever a model spans GPUs; you rarely call it directly.",down:"NVLink is the scale-up network. Between servers you need a scale-out network: World 4."}},

 {world:3,title:"Too big for one",concept:"Tensor parallelism",layers:{on:[9],near:[5,8]},
  panels:["board"],controls:["srv","model","dtype","tp","batch"],locks:{model:"The team wants Llama 3.1 405B.",dtype:"Quality review requires FP8."},
  brief:`<p>Next up: <b>Llama 3.1 405B</b> in FP8, about <b>406 GB</b>. No single GPU comes close, but the server has 640 GB in total.</p><p><b>Tensor parallelism (TP)</b> splits every layer's weight matrices across GPUs. Each GPU holds a slice and computes its part of every token; after each layer the GPUs combine partial results with an all-reduce over NVLink.</p><p>Choose a TP size so 405B fits on the server.</p><div class="mathbox">weights per GPU = 406 GB ÷ TP size
TP 4 → 101 GB (> 80 GB)    TP 8 → 51 GB</div>`,
  setup(S){S.srv="hgx";S.model="llama-405b";S.dtype="fp8";S.tp=1;S.batch=16},
  goals:[{t:"Llama 3.1 405B fits in every GPU's memory",ok:S=>S.model==="llama-405b"&&w3(S).fits},{t:"Precision FP8",ok:S=>S.dtype==="fp8"}],
  hints:["Each GPU holds 1/TP of the weights plus its share of the KV cache. Watch the per-GPU memory bars.","TP 4 still needs 101 GB per GPU. Go to TP 8."],
  answer:()=>"foundry tp 8",chips:["foundry status","foundry tp 4","foundry tp 8","nvidia-smi"],
  debrief:`<p>With TP 8 the server acts as one big GPU with 640 GB: every GPU holds 1/8 of each layer, and they combine results 252 times per token (2 all-reduces × 126 layers).</p><ul><li>Look at the communication share: around 17–20% of each token's time goes to NVLink traffic. That's the price of splitting.</li><li>The same flag in real life: <code>vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --quantization fp8</code>.</li><li>TP 8 also made each token faster: each GPU reads only 1/8 of the weights.</li></ul>`,
  links:{up:"To the serving layer this is one 'model endpoint' backed by 8 GPUs.",down:"Every all-reduce is NCCL over NVLink. Next level: what happens without NVLink."}},

 {world:3,title:"The slow road",concept:"NVLink vs PCIe",layers:{on:[9],near:[8]},
  panels:["board"],controls:["srv","model","dtype","tp","batch","prompt"],locks:{model:"The team wants Llama 3.1 405B.",dtype:"Quality review requires FP8.",tp:"405B needs all 8 GPUs.",prompt:"Typical prompt: 8k tokens."},
  brief:`<p>Procurement found a cheaper box: the <b>same 8 H100s</b> in a <b>PCIe server</b>, with no NVLink. On paper it has identical GPUs at 20% less per hour.</p><p>Run 405B with TP 8 and look at what happens to time to first token and token speed. Every layer's all-reduce now crawls through PCIe switches and the CPUs.</p><p>The product needs <b>first token in at most 1.5 s</b> for an 8k prompt and <b>at least 35 tokens/s</b> per user.</p>`,
  setup(S){S.srv="pcie";S.model="llama-405b";S.dtype="fp8";S.tp=8;S.batch=16;S.prompt=8192},
  goals:[{t:"Time to first token at most 1.5 s",ok:S=>w3(S).fits&&w3(S).ttft<=1.5},{t:"Each user gets at least 35 tokens/s",ok:S=>w3(S).fits&&w3(S).perUser>=35}],
  hints:["Compare the communication share on the two servers.","Prefill all-reduces move hundreds of MB per layer: PCIe can't keep up. Switch to the HGX server."],
  answer:()=>"foundry server hgx",chips:["foundry status","foundry server hgx","all_reduce_perf -b 8 -e 8G -f 16 -g 8","nvidia-smi topo -m"],
  debrief:`<p>Same GPUs, very different server. On PCIe, communication took ~40% of every token and first-token time nearly quadrupled, because prefill pushes hundreds of megabytes through an all-reduce after every layer.</p><ul><li>The cheaper box isn't cheaper per token: it costs more per million tokens because it does less work per hour.</li><li>PCIe servers are fine for running many independent small replicas (TP 1), where GPUs never talk.</li><li>When you compare GPU offers, ask about the interconnect, not just the GPU model.</li></ul>`,
  links:{up:"Latency SLOs (layers 1 and 3) quietly depend on this hardware detail.",down:"NVLink stops at the edge of the server (or the rack, for GB200 NVL72). Beyond that it's InfiniBand or Ethernet: World 4."}},

 {world:3,title:"Shards or replicas?",concept:"TP size vs replicas",layers:{on:[9],near:[5]},
  panels:["board"],controls:["srv","model","dtype","tp","batch"],locks:{model:"The product team chose Llama 3.1 70B.",dtype:"Quality review signed off on FP8.",srv:"You have one HGX server."},
  brief:`<p>Back to <b>Llama 3.1 70B</b> on one HGX server. You can run <b>8 replicas</b> (TP 1), <b>4 × TP 2</b>, <b>2 × TP 4</b> or <b>1 × TP 8</b>. The batch slider sets users per replica.</p><p>Fewer, bigger shards pay more NVLink traffic but leave far more memory for KV cache, so each replica can batch more users. More replicas avoid communication but each one is cramped.</p><p>Hit <b>at least 8,000 tokens/s</b> for the whole server while every user still gets <b>at least 60 tokens/s</b>.</p>`,
  setup(S){S.srv="hgx";S.model="llama-70b";S.dtype="fp8";S.tp=1;S.batch=4;S.ctx=4096},
  goals:[{t:"Server throughput at least 8,000 tokens/s",ok:S=>w3(S).fits&&w3(S).total>=8000},{t:"Each user gets at least 60 tokens/s",ok:S=>w3(S).fits&&w3(S).perUser>=60},{t:"Everything fits",ok:S=>w3(S).fits}],
  hints:["TP 1 can't batch: 71 GB of weights leaves ~6 GB per GPU for KV cache. Try each TP size and raise the batch until memory or per-user speed runs out.","TP 4 runs out just short of both targets (about 7,600 tokens/s at 59 tok/s per user). TP 8 with a very large batch gets further."],
  answer:()=>"foundry tp 8 && foundry batch 128",chips:["foundry status","foundry tp 2","foundry tp 4","foundry tp 8","foundry batch 128"],
  debrief:`<p>Here TP 8 won: it spends ~25% of each step on NVLink, but holding only 9 GB of weights per GPU leaves room for a 128-user batch.</p><ul><li>The answer depends on the interconnect. On the PCIe server (try it in the Server lab), communication eats two-thirds of every TP 8 step and smaller TP groups win.</li><li>It also depends on the model and target. A model that fits comfortably on one GPU with room for KV cache is usually best served as many small replicas.</li><li>Production teams sweep these settings per model and per GPU type, often with the inference engine's benchmark tools.</li></ul>`,
  links:{up:"The gateway (layer 3) can route traffic across replicas; the serving layer (5) decides TP size per replica.",down:"Across servers the same trade-off appears with a much slower network: World 4."}},

 {world:3,title:"Checkpoint: one server",concept:"World 3 quiz",quiz:true,layers:{on:[9],near:[8,5]},
  questions:[
   {q:"What does 'NV18' between two GPUs in nvidia-smi topo -m mean?",o:["They share 18 GB of memory","They're connected by 18 NVLink links","They're 18 hops apart","They run CUDA 18"],a:1,why:"On HGX H100, each GPU has 18 NVLink 4 links into NVSwitch, so every pair shows NV18."},
   {q:"Why does tensor parallelism need fast GPU-to-GPU links?",o:["It copies the whole model to each GPU","GPUs combine partial results with an all-reduce after every layer","It only runs on one GPU at a time","It needs to read from disk"],a:1,why:"Each GPU computes part of every layer, so results must be summed across GPUs twice per layer, for every token."},
   {q:"Same 8 H100s, NVLink server versus PCIe server, running 405B with TP 8. The PCIe server…",o:["Is faster because it's simpler","Is about the same","Is much slower, especially for long prompts, because all-reduces crawl over PCIe","Can't run TP at all"],a:2,why:"Prefill all-reduces move hundreds of MB per layer. PCIe at ~40 GB/s can't keep up with NVLink at ~450 GB/s each way."},
   {q:"8 replicas of a 70B model (TP 1) on 8 × H100 struggle mainly because…",o:["The GPUs talk too much","Each GPU has little memory left for KV cache, so batches stay tiny","TP 1 is not supported","Prefill is too slow"],a:1,why:"71 GB of weights on an 80 GB GPU leaves ~6 GB for conversations. Larger TP frees memory for batching."},
   {q:"What is NCCL?",o:["A GPU model","NVIDIA's library for GPU-to-GPU communication (all-reduce and friends)","A container runtime","A network cable"],a:1,why:"NCCL implements collectives over NVLink, PCIe and the network. nccl-tests' all_reduce_perf benchmarks it."}
  ],
  debrief:`<p>Inside one server: NVLink makes 8 GPUs act like one big one, tensor parallelism splits models across them, and NCCL does the talking. The interconnect decides how well that works.</p>`,
  links:{up:"Serving engines turn this into one endpoint per replica.",down:"World 4 goes beyond one server."}}
];
/* ---------- World 4: many servers ---------- */
const W4L=[
 {world:4,title:"Meet the fabric",concept:"InfiniBand, RDMA & rails",layers:{on:[10],near:[9]},
  panels:["cluster"],controls:["net"],
  brief:`<p>Inside a server, GPUs use NVLink. Between servers, each GPU gets its own network card: a <b>400 Gb/s NIC per GPU</b>, eight per server. Each NIC is a <b>rail</b>: GPU 1 of every server plugs into the same <b>leaf switch</b>, GPU 2 into the next, and leaves connect through <b>spine switches</b>.</p><p>Most AI clusters run <b>InfiniBand</b> or RDMA-capable Ethernet (<b>RoCE</b>). <b>RDMA</b> lets one machine's NIC write straight into another machine's memory without the CPUs copying data.</p><p>You're logged into <code>node-1</code>. Check the NICs with <code>ibstat</code>, measure the link to <code>node-2</code> with <code>ib_write_bw</code>, and tap a NIC and a leaf switch in the diagram.</p>`,
  setup(S){S.mode="fabric";S.nodes=2;S.net="ib"},
  goals:[{t:"Check NIC status (ibstat)",ok:S=>!!S.flags.ibstat},{t:"Measure bandwidth to node-2 (ib_write_bw node-2)",ok:S=>!!S.flags.ibbw},{t:"Inspect a NIC",ok:S=>S.inspected.includes("nic")},{t:"Inspect a leaf switch",ok:S=>S.inspected.includes("leaf")}],
  hints:["Type ibstat. Each mlx5 device is one NIC; look for State: Active and Rate: 400.","Type ib_write_bw node-2. Then tap one of the small dots under a server (a NIC) and the leaf switch bar."],
  answer:()=>"ibstat && ib_write_bw node-2 && foundry inspect nic && foundry inspect leaf",chips:["ibstat","ib_write_bw node-2","foundry inspect nic","foundry inspect leaf","foundry inspect spine"],
  debrief:`<p>One NIC gave ~390 Gb/s, close to its 400 Gb/s line rate. Eight of them give each server about <b>400 GB/s</b> to the rest of the cluster.</p><ul><li>That sounds like a lot, but per GPU it's 50 GB/s against NVLink's 450 GB/s. Crossing a server boundary is ~9× slower per GPU, and adds microseconds of latency per hop.</li><li>That gap is the single most important fact for multi-node design: keep the chattiest traffic inside the server.</li><li>Rail-optimised wiring means GPU n in one server usually reaches GPU n in another through a single switch.</li></ul>`,
  links:{up:"Training clusters and multi-node inference both live or die by this network.",down:"Physically: optical cables, transceivers and switches, often a major share of cluster cost and power."}},

 {world:4,title:"Two boxes, one model",concept:"Ray clusters & multi-node",layers:{on:[10],near:[5,8]},
  panels:["cluster"],controls:[],
  brief:`<p>The team wants <b>Llama 3.1 405B in BF16</b>, no quantisation: <b>812 GB</b>. One HGX H100 server has 640 GB, so it takes <b>two servers</b>.</p><p>Something has to make two machines act as one pool of GPUs. <b>Ray</b> does that: start a <b>head node</b>, have the other machine <b>join</b> it, and Ray sees 16 GPUs. vLLM then uses Ray to place one model across them.</p><p>You're on <code>node-1</code>. Start Ray, <code>ssh node-2</code> and join it to the cluster, check <code>ray status</code>, then launch the model across 16 GPUs from the head node.</p><div class="mathbox">node-1$ ray start --head --port=6379
node-2$ ray start --address=node-1:6379
node-1$ vllm serve meta-llama/Llama-3.1-405B-Instruct \\
          --tensor-parallel-size 8 --pipeline-parallel-size 2 \\
          --distributed-executor-backend ray</div>`,
  setup(S){S.mode="serve";S.nodes=2;S.net="ib";S.model="llama-405b";S.dtype="bf16";S.job=null;S.tp=8;S.pp=2;S.batch=8;S.prompt=8192},
  goals:[{t:"Start the Ray head on node-1",ok:S=>S.ray.head==="node-1"},{t:"node-2 joins the cluster",ok:S=>S.ray.workers.includes("node-2")},{t:"ray status shows 16 GPUs",ok:S=>!!S.flags.raystatus16},{t:"405B BF16 is serving across 16 GPUs",ok:S=>!!(S.job&&S.job.tp*S.job.pp===16)}],
  hints:["On node-1: ray start --head. Then ssh node-2 and run ray start --address=node-1:6379.","Back on node-1 (type exit), run ray status, then the vllm serve command from the brief."],
  answer:()=>"ray start --head --port=6379 && ssh node-2 && ray start --address=node-1:6379 && exit && ray status && vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",
  chips:["ray start --head --port=6379","ssh node-2","ray start --address=node-1:6379","exit","ray status","vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray"],
  debrief:`<p>Two servers, one model. Ray pooled 16 GPUs, and vLLM used <b>tensor parallelism inside each server</b> (TP 8 over NVLink) and <b>pipeline parallelism across servers</b> (PP 2: layers 1–63 on node-1, 64–126 on node-2).</p><ul><li>Ray is a general distributed-computing framework: the same cluster can run training (Ray Train), batch inference (Ray Data) and serving (Ray Serve).</li><li>The head node is a single point of control; production setups add monitoring and restart policies.</li><li>On Kubernetes, <b>KubeRay</b> creates Ray clusters as Kubernetes objects (World 5). Slurm is the HPC alternative, common for training.</li></ul>`,
  links:{up:"To the gateway this is still one endpoint, just a 16-GPU one.",down:"Pipeline stages hand activations to each other over InfiniBand, once per stage per step. Next level: why that split matters."}},

 {world:4,title:"Split the right way",concept:"TP inside, PP across",layers:{on:[10],near:[5,8]},
  panels:["cluster"],controls:["layout"],
  brief:`<p>A teammate launched 405B as <b>TP 16</b>: one tensor-parallel group spanning both servers. It runs, but first tokens are slow.</p><p>With TP 16, the all-reduce after <b>every layer</b> must cross InfiniBand, ~9× slower per GPU than NVLink. <b>Pipeline parallelism</b> instead passes activations between servers only <b>once per stage</b>.</p><p>Relaunch with a layout that gets <b>first token in at most 2 s</b> (8k prompt) and keeps <b>at least 20 tokens/s</b> per user.</p>`,
  setup(S){S.mode="serve";S.nodes=2;S.net="ib";S.model="llama-405b";S.dtype="bf16";S.ray={head:"node-1",workers:["node-2"]};S.tp=16;S.pp=1;S.job={tp:16,pp:1};S.batch=8;S.prompt=8192},
  goals:[{t:"Time to first token at most 2.0 s",ok:S=>!!S.job&&w4serve(S).fits&&w4serve(S).ttft<=2},{t:"Each user gets at least 20 tokens/s",ok:S=>!!S.job&&w4serve(S).fits&&w4serve(S).perUser>=20}],
  hints:["Compare the layouts: TP16×PP1, TP8×PP2, TP4×PP4. Watch where the network lanes light up.","Keep tensor parallelism inside a server (TP 8) and use pipeline parallelism across servers (PP 2)."],
  answer:()=>"vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",chips:["foundry status","foundry layout 8x2","foundry layout 4x4","foundry layout 16x1"],
  debrief:`<p>The rule of thumb: <b>TP size = GPUs per server, PP size = number of servers</b>. Chatty traffic stays on NVLink; only one hand-off per stage crosses the network.</p><ul><li>TP 16 actually had slightly faster decode (each GPU read less), but its prefill all-reduces crossed InfiniBand 252 times and doubled first-token time.</li><li>TP 4 × PP 4 kept traffic local but made every token walk through 4 stages in turn: slow decode.</li><li>Pipeline parallelism shines for throughput: different requests can occupy different stages at once.</li></ul>`,
  links:{up:"Layout is a serving-layer (5) setting, but choosing it well needs to know the network (10).",down:"Even PP's hand-offs need RDMA to be quick. Next: a workload where the network carries much more."}},

 {world:4,title:"Train across racks",concept:"Data parallel training",layers:{on:[10],near:[8]},
  panels:["cluster"],controls:["nodes","net","gdr"],
  brief:`<p>Training is the network's hardest test. In <b>data-parallel training</b>, every GPU processes different data, then all GPUs <b>all-reduce their gradients</b>, every step: 16 GB for an 8B model.</p><p>The research team is fine-tuning Llama 3.1 8B on <b>4 servers</b> (32 GPUs), but the cluster was built on plain 100G Ethernet. 4 servers run barely faster than 2.</p><p>Get <b>scaling efficiency to at least 95%</b> on 4 nodes: 4 servers should do ≥95% of 4× the work of one. Choose the network, and decide whether to use <b>GPUDirect RDMA</b>, which lets NICs read GPU memory directly instead of copying through the CPU.</p>`,
  setup(S){S.mode="train";S.nodes=4;S.net="eth";S.gdr=false},
  goals:[{t:"Training on 4 nodes",ok:S=>S.nodes===4},{t:"Scaling efficiency at least 95%",ok:S=>S.nodes===4&&w4train(S).eff>=.95}],
  hints:["One 100G NIC shared by 8 GPUs is ~32× less bandwidth per GPU than one 400G NIC each. Switch to InfiniBand or RoCE.","Then turn GPUDirect RDMA on: without it, every gradient is copied through CPU memory."],
  answer:()=>"foundry net ib && foundry gdr on",chips:["foundry status","foundry net ib","foundry net roce","foundry gdr on","foundry nodes 2"],
  debrief:`<p>With a 400G RDMA fabric and GPUDirect, the gradient all-reduce shrank from ~2.8 s to ~70 ms per step, and 4 servers now deliver ~96% of the ideal.</p><ul><li>RoCE got within a whisker of InfiniBand here. On a well-tuned network the gap is small; InfiniBand's advantage is that it's lossless and low-latency out of the box.</li><li>Without GPUDirect RDMA, data takes a detour through CPU memory: efficiency dropped below 91%.</li><li>At thousands of GPUs these small percentages are millions of dollars, which is why the network can be 15–20% of a cluster's cost.</li></ul>`,
  links:{up:"Training clusters feed the model layer (6): faster training means more experiments and better models.",down:"Next up the stack: Kubernetes and Slurm decide which jobs get which nodes (World 5)."}},

 {world:4,title:"Checkpoint: the cluster",concept:"World 4 quiz",quiz:true,layers:{on:[10],near:[5,8,9]},
  questions:[
   {q:"Per GPU, how does an InfiniBand NDR link compare with NVLink on H100?",o:["About the same","~50 GB/s vs ~450 GB/s each way: roughly 9× slower","InfiniBand is faster","InfiniBand only connects storage"],a:1,why:"Each GPU's 400 Gb/s NIC carries 50 GB/s. NVLink 4 carries 450 GB/s each way. That gap shapes every multi-node design."},
   {q:"What does RDMA let a NIC do?",o:["Compress data","Write directly into another machine's memory without the CPUs copying it","Run CUDA kernels","Encrypt the model"],a:1,why:"RDMA cuts out CPU copies and kernel overhead, giving low latency and high throughput. GPUDirect RDMA extends it to GPU memory."},
   {q:"You need 16 GPUs across 2 servers for one model. The usual layout is…",o:["TP 16 across both servers","TP 8 inside each server, PP 2 across servers","PP 16","Two independent replicas"],a:1,why:"Tensor parallelism all-reduces every layer, so it belongs on NVLink. Pipeline stages only hand off activations once per stage."},
   {q:"What does ray start --address=node-1:6379 do on node-2?",o:["Starts a new head node","Joins node-2's CPUs and GPUs to the Ray cluster headed by node-1","Downloads the model","Opens port 6379 to the internet"],a:1,why:"Workers join the head node's cluster. Ray then schedules work across all joined resources."},
   {q:"Data-parallel training scaling efficiency drops from 96% to 40% when you move from 400G RDMA to one 100G Ethernet NIC per server. Why?",o:["The GPUs got slower","The gradient all-reduce every step now takes longer than the compute","Ray isn't installed","The model got bigger"],a:1,why:"Every step must all-reduce 16 GB of gradients across servers. With ~32× less bandwidth per GPU, the network dominates the step."}
  ],
  debrief:`<p>Beyond one server: NICs and rails, RDMA, InfiniBand vs RoCE, Ray to pool machines, and the golden rule of putting chatty traffic on NVLink.</p>`,
  links:{up:"Next: World 5, Kubernetes, decides who gets these GPUs.",down:"You've now covered the physical bottom of the stack."}}
];
/* ---------- splice into the level list and renumber ---------- */
(function(){const qi=LEVELS.findIndex(l=>l.quiz&&l.world===1);LEVELS.splice(qi,0,...NEW_W1);LEVELS[qi+NEW_W1.length].questions.push(...W1Q_MORE);
  LEVELS.push(...W3L,...W4L);LEVELS.forEach((l,i)=>{l.id=i+1});
  const drv=LEVELS.find(l=>l.title==="Driver says no");drv.driverStart=true;
  const tr=LEVELS.find(l=>l.title==="Follow one matmul");tr.debrief=tr.debrief.replace("level 11","level "+drv.id);
  LEVELS.find(l=>l.title==="Checkpoint: one GPU").brief=`<p>Nine questions on what you just did. Pick an answer; wrong picks show why, and you can try again. Fewer mistakes, more stars.</p>`;
})();
WORLDS.push({w:3,h:"World 3 · Many GPUs, one server",p:"NVLink, NVSwitch, NCCL and tensor parallelism on an 8-GPU HGX board."},{w:4,h:"World 4 · Many servers",p:"InfiniBand, RDMA, Ray clusters, multi-node serving and training."});
SOON.splice(0,SOON.length,
 {n:"W5",t:"Kubernetes makes GPUs consumable",c:"GPU Operator, device plugin, scheduling, MIG in K8s, KubeRay, DCGM"},
 {n:"★",t:"Finale: 8 × H100 ≠ a service",c:"Assemble the path from GPU to API endpoint"});
Object.assign(LABS,{
 lab3:{id:"lab3",world:3,title:"Server lab",concept:"Free play",lab:true,layers:{on:[9],near:[5,8]},panels:["board"],controls:["srv","model","dtype","tp","batch","ctx","prompt"],
  brief:`<p>One 8-GPU server, every knob unlocked. Try the MoE model with TP 8, compare HGX with PCIe at each TP size, or find the cheapest layout for 405B.</p>`,
  setup(S){S.srv="hgx";S.model="llama-70b";S.dtype="fp8";S.tp=4;S.batch=32},goals:[],hints:[],chips:["foundry status","nvidia-smi topo -m","all_reduce_perf -b 8 -e 8G -f 16 -g 8","foundry server pcie","foundry load qwen-235b"]},
 lab4:{id:"lab4",world:4,title:"Cluster lab",concept:"Free play",lab:true,layers:{on:[10],near:[5,8,9]},panels:["cluster"],controls:["mode4","nodes","net","gdr","layout"],
  brief:`<p>A small cluster, every knob unlocked, with Ray already running across all nodes. Switch between multi-node serving and data-parallel training, change the network, and see what breaks.</p>`,
  setup(S){S.mode="serve";S.nodes=2;S.net="ib";S.model="llama-405b";S.dtype="bf16";S.ray={head:"node-1",workers:["node-2","node-3","node-4"]};S.tp=8;S.pp=2;S.job={tp:8,pp:2};S.batch=8;S.prompt=8192},goals:[],hints:[],chips:["foundry status","ray status","ibstat","foundry mode train","foundry net roce"]}
});
</script>
