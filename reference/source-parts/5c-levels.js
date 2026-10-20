<script>
"use strict";
const AMD_LV={id:"amd-gpus",world:1,title:"Team red",concept:"AMD Instinct & ROCm",layers:{on:[9],near:[8]},gpus:ALL_GPUS,
  panels:["chip"],controls:["gpu","model","dtype","batch","ctx"],locks:{model:"The product team chose Llama 3.1 70B.",dtype:"Quality review signed off on FP8.",batch:"32 analysts at once.",ctx:"8,192-token conversations."},
  brief:`<p>The analytics team wants <b>Llama 3.1 70B</b> for <b>32 people</b> with <b>8k-token</b> conversations, on <b>one GPU</b>, and the budget is <b>$3 per GPU-hour</b>. That's 71 GB of weights plus 86 GB of KV cache: no Hopper GPU holds it, and Blackwell is over budget.</p><p>A cloud provider offers <b>AMD Instinct</b> GPUs. AMD builds its GPUs from <b>chiplets</b>: 8 small compute dies (XCDs) full of <b>Compute Units</b>, AMD's equivalent of SMs, surrounded by 8 HBM stacks. The software stack is <b>ROCm</b> instead of CUDA.</p><p>Find a GPU that fits within budget with at least 25 tokens/s per user. Then check it the AMD way: <code>nvidia-smi</code> won't work, <code>amd-smi</code> will.</p>`,
  setup(S){S.gpu="h200";S.model="llama-70b";S.dtype="fp8";S.batch=32;S.ctx=8192},
  goals:[{t:"Everything fits on one GPU",ok:S=>fits(S)},{t:"At least 25 tokens/s per user",ok:S=>fits(S)&&w1(S).perUser>=25},{t:"GPU costs no more than $3.00/hr",ok:S=>GPUS[S.gpu].price<=3&&fits(S)},{t:"Check the GPU with amd-smi",ok:S=>!!S.flags.amdsmi}],
  hints:["You need about 160 GB on one GPU. Compare memory sizes and prices on the GPU buttons.","MI300X has 192 GB at $2.20/hr. AMD's status tool is amd-smi."],
  answer:()=>"foundry gpu mi300x && amd-smi",chips:["foundry status","foundry gpu mi300x","foundry gpu mi325x","amd-smi","nvidia-smi"],
  debrief:`<p>The MI300X's 192 GB holds the model and all 32 conversations on one GPU, at a lower hourly price than an H200 that can't fit it.</p><ul><li>AMD's pitch has been <b>more memory per GPU</b> at a lower price. MI325X (256 GB) and MI355X (288 GB) continue that.</li><li>The real question is <b>software</b>. ROCm (HIP, hipBLASLt, RCCL, MIOpen) mirrors CUDA, and vLLM, SGLang and PyTorch support it, but kernel tuning and new-model support often land on CUDA first. This game assumes equally good software on both; in practice, benchmark your own model.</li><li>Operationally it's a different toolbox: <code>amd-smi</code> instead of <code>nvidia-smi</code>, ROCm container images, the AMD GPU Operator on Kubernetes.</li></ul>`,
  links:{up:"Engines like vLLM hide most vendor differences from the application, if your model and features are supported on ROCm.",down:"World 2's whole software path has an AMD twin: HIP for CUDA, hipBLASLt for cuBLAS, RCCL for NCCL, the amdgpu driver for NVIDIA's."}};
const PICK_LV={id:"gpu-choice",world:1,title:"Pick the GPU",concept:"Matching chip to workload",layers:{on:[9],near:[5,6]},gpus:ALL_GPUS,
  panels:["pick","chip"],controls:["workload","gpu"],
  brief:`<p>Three teams, three workloads, seven GPUs. For each workload, find a GPU that meets every requirement, then lock it in with <code>foundry pick</code>.</p><p>There's no single best GPU. Each workload has a different <b>bottleneck</b>: memory capacity, bandwidth, compute or budget. The trick is to spot which, then read the matching line of the spec sheet. The <b>Compare GPUs</b> button at the top has every spec side by side.</p><p>Prices are this game's illustrative ones; with your real quotes the answers can change.</p>`,
  setup(S){S.wl="chat";S.picks={};Object.assign(S,WL.chat.set);S.gpu="h100"},
  goals:[{t:"Busy chatbot: pick a GPU that passes",ok:S=>!!S.picks.chat&&wlCheck(S,"chat",S.picks.chat).ok},{t:"Contract Q&A: pick a GPU that passes",ok:S=>!!S.picks.doc&&wlCheck(S,"doc",S.picks.doc).ok},{t:"Frontier MoE: pick a GPU that passes",ok:S=>!!S.picks.moe&&wlCheck(S,"moe",S.picks.moe).ok}],
  hints:["Chatbot: 64 users of KV cache needs ~160 GB, and cost per token matters. Contract Q&A: first-token time is prefill, so compute. MoE: 235 GB must fit.","Passing picks include: chatbot MI300X or B200, contract Q&A B200 or MI355X, MoE MI325X, MI355X or B300."],
  answer:()=>"foundry workload chat && foundry gpu mi300x && foundry pick && foundry workload doc && foundry gpu b200 && foundry pick && foundry workload moe && foundry gpu mi355x && foundry pick",
  chips:["foundry workload chat","foundry workload doc","foundry workload moe","foundry pick","foundry status"],
  debrief:`<p>Each workload eliminated different GPUs for a different reason, which is the whole point:</p><ul><li><b>Busy chatbot</b> was memory-capacity and cost bound: Hopper ran out of room, and the priciest chips didn't pay for themselves.</li><li><b>Contract Q&A</b> was compute bound: only the newest generations read 16k tokens fast enough.</li><li><b>Frontier MoE</b> was capacity bound: only 256 GB+ GPUs could hold it on one chip.</li></ul><p>In real procurement, add software maturity, availability, interconnect for multi-GPU models, and power and cooling to the table, and test with your own model.</p>`,
  links:{up:"Gateways can route each workload to a different GPU pool: chat to one fleet, long documents to another.",down:"Across GPUs, the interconnect becomes the next spec that matters: World 3."}};
const W1Q_AMD=[
 {q:"The single biggest change from H100 to H200 is…",o:["Twice the compute","More and faster memory on the same chip","FP4 support","Two dies"],a:1,why:"H200 is the same Hopper chip with 141 GB of HBM3e at 4.8 TB/s instead of 80 GB at 3.35 TB/s."},
 {q:"Why did MI300X fit the 32-user, 8k-context 70B workload when an H200 couldn't?",o:["It has faster Tensor Cores","It has 192 GB of memory vs 141 GB","It uses FP4","ROCm compresses the KV cache"],a:1,why:"Weights plus KV cache needed ~160 GB. Capacity decides what fits."},
 {q:"Before moving a production model to AMD GPUs, what should you check first?",o:["Whether nvidia-smi works","That your model, inference engine and kernels are supported and fast on ROCm","That the GPUs are red","Nothing: CUDA code runs unchanged"],a:1,why:"Specs set the ceiling; software decides how close you get. ROCm support for your exact model and engine version is the real risk."}
];
(function(){
  const qi=LEVELS.indexOf(findLevel("quiz-one-gpu"));LEVELS.splice(qi,0,AMD_LV,PICK_LV);LEVELS[qi+2].questions.push(...W1Q_AMD);
  findLevel("quiz-one-gpu").brief=`<p>Twelve questions on World 1. Pick an answer; wrong picks show why, and you can try again. Fewer mistakes, more stars.</p>`;
  ["gpu-anatomy","memory-fit","kv-cache-memory","memory-bandwidth","batching","prefill-decode","kv-quantisation","moe-on-gpu","perf-per-watt"].forEach(id=>{findLevel(id).gpus=NV_GPUS});
  ["hgx-board","tensor-parallel","nvlink-vs-pcie","tp-vs-replicas"].forEach(id=>{findLevel(id).srvs=["hgx","pcie"]});
  LABS[1].gpus=ALL_GPUS;LABS[3].srvs=Object.keys(SERVERS);
  LABS[3].brief=`<p>8-GPU servers, every knob unlocked: HGX H100, a PCIe H100 box, HGX B200 with NVLink 5, and AMD's 8 × MI300X mesh. Compare the same model and TP size across all four.</p>`;
  LABS[3].chips=["foundry status","foundry server hgxb200","foundry server mi300x","nvidia-smi topo -m","all_reduce_perf -b 8 -e 8G -f 16 -g 8"];
})();
</script>
