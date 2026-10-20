<script>
"use strict";
/* ============ summaries ============ */
function summary3(){const M=w3(G.S);if(!M.fits){err(`CUDA out of memory: each GPU needs ${f1(M.usedPer)} GB (weights ${f1(M.wPer)} + KV ${f1(M.kvPer)} + 3), H100 has 80 GB`);return}
  print(`→ ${M.rep} × TP ${M.tp} · ${f1(M.usedPer)} GB per GPU · ${f1(M.perUser)} tok/s per user · server ${f0(M.total)} tok/s · TTFT ${fmtT(M.ttft)} · talking ${f0(M.commShare*100)}% · ${fmtMoney(M.cost)} per 1M tokens`,"ok")}
function summary4(){const S=G.S;
  if(S.mode==="train"){const T=w4train(S);print(`→ ${S.nodes} node${S.nodes>1?"s":""} · step ${fmtT(T.step)} (network ${fmtT(T.inter)}) · scaling efficiency ${f1(T.eff*100)}% · ${f0(T.tput)} tokens/s`,T.eff>=.95?"ok":"");return}
  if(S.mode==="serve"){if(!S.job){print("No model running. Start Ray, then vllm serve.","dim");return}const R=w4serve(S);
    if(!R.fits){err(`CUDA out of memory: each GPU needs ${f1(R.usedPer)} GB`);return}
    print(`→ TP ${R.tp} × PP ${R.pp} · ${f1(R.usedPer)} GB per GPU · ${f1(R.perUser)} tok/s per user · TTFT ${fmtT(R.ttft)} · talking ${f0(R.commShare*100)}%`,"ok");return}
  print(`→ ${S.nodes} nodes on ${NETS[S.net].name} (${NETS[S.net].s} per node)`,"dim")}
function afterAny(){const w=G.S.world;w===1?summary1():w===2?summary2():w===3?summary3():summary4()}

/* ============ extra foundry subcommands ============ */
function foundryMore(t){const S=G.S,L=G.level,sub=(t[0]||"").toLowerCase(),a=(t[1]||"").toLowerCase(),C=L.controls||[];
  const W=S.world;
  if(sub==="kv"){if(W===2){err("The kernel lab doesn't model KV precision.");return true}if(!KVDT[a]){err("foundry kv bf16 | fp8");return true}if(a!==(S.kvdt||"bf16")&&locked("kvdt"))return true;S.kvdt=a;print(`KV cache stored in ${KVDT[a].name}`,"dim");afterAny();return true}
  if(W===1&&sub==="workload"){if(!(L.controls||[]).includes("workload")){err("Workloads are in the 'Pick the GPU' level.");return true}if(!WL[a]){err("foundry workload chat | doc | moe");return true}S.wl=a;Object.assign(S,WL[a].set);print(`Workload: ${WL[a].t} · ${WL[a].d}`,"dim");summary1();return true}
  if(W===1&&sub==="pick"){if(!(L.controls||[]).includes("workload")){err("foundry pick is for the 'Pick the GPU' level.");return true}const c=wlCheck(S,S.wl);
    if(!c.ok){err(`${GPUS[S.gpu].name} doesn't pass ${WL[S.wl].t}: ${c.res.filter(r=>!r[1]).map(r=>r[0]).join("; ")}`);return true}
    S.picks[S.wl]=S.gpu;print(`Picked ${GPUS[S.gpu].name} for ${WL[S.wl].t}. ${WL[S.wl].why}`,"ok");return true}
  if(sub==="share"){if(!L.panels.includes("mig")){err("GPU sharing is in the 'Share the GPU' level.");return true}
    if(a==="timeslice"||a==="time-slicing"){S.mig.share="timeslice";S.mig.inst=[];print("Time-slicing on: all 5 teams share the whole GPU in turns. No memory limits, no guaranteed share.","dim")}
    else if(a==="none"){S.mig.share="none";S.mig.inst=[];print("Sharing off.","dim")}else err("foundry share timeslice | none");return true}
  if(W===3){
    if(sub==="server"){const ok=L.srvs||["hgx","pcie"];if(!SERVERS[a]||!ok.includes(a)){err("foundry server "+ok.join(" | "));return true}if(a!==S.srv&&locked("srv"))return true;S.srv=a;print(`Server: ${SERVERS[a].name} · ${SERVERS[a].note} · $${SERVERS[a].price}/hr`,"dim");summary3();return true}
    if(sub==="tp"){const n=parseInt(a);if(!TP_STEPS.includes(n)){err("foundry tp 1 | 2 | 4 | 8");return true}if(n!==S.tp&&locked("tp"))return true;S.tp=n;print(`Tensor parallel size ${n}: ${8/n} replica${n<8?"s":""} of ${MODELS[S.model].name}`,"dim");summary3();return true}
    if(sub==="load"){let v=MODEL_ALIAS[a]||a;if(!MODELS[v]||v==="llama-1b"){err("Options: llama-8b, llama-70b, llama-405b, qwen-235b");return true}if(v!==S.model&&locked("model"))return true;S.model=v;print(`Loaded ${MODELS[v].name}`,"dim");summary3();return true}
    if(sub==="dtype"){const gg=GPUS[SERVERS[S.srv].gpu];if(!DTYPES[a]||(a==="fp4"&&!gg.fp4)){err(`${gg.name} supports bf16, fp8, int4 here${gg.fp4?", fp4":" (no FP4)"}.`);return true}if(a!==S.dtype&&locked("dtype"))return true;S.dtype=a;summary3();return true}
    if(sub==="batch"||sub==="users"){if(setNum("batch",a,1,1024,"Users per replica"))summary3();return true}
    if(sub==="context"||sub==="ctx"){if(setNum("ctx",a,512,262144,"Context"))summary3();return true}
    if(sub==="prompt"){if(setNum("prompt",a,128,262144,"Prompt"))summary3();return true}
    if(sub==="status"||sub==="bench"){summary3();return true}
  }
  if(W===4){
    if(sub==="status"||sub==="bench"){summary4();return true}
    if(["load","dtype","batch","users","gpu"].includes(sub)){err(sub==="gpu"?"This cluster is all H100s.":"The model runs through vLLM here: relaunch with vllm serve … (or foundry layout TPxPP).");return true}
    if(sub==="mode"){if(!C.includes("mode4")){err("Locked in this level.");return true}if(a!=="serve"&&a!=="train"){err("foundry mode serve | train");return true}S.mode=a;if(a==="serve"&&S.nodes<2)S.nodes=2;print(`Workload: ${a==="train"?"data-parallel training of Llama 3.1 8B":"multi-node serving"}`,"dim");summary4();return true}
    if(sub==="nodes"){const n=parseInt(a);if(![1,2,4].includes(n)){err("foundry nodes 1 | 2 | 4");return true}if(!C.includes("nodes")){err("Locked in this level: the cluster size is fixed.");return true}
      if(S.mode==="serve"&&n<2){err("Serving 405B BF16 needs at least 2 nodes.");return true}S.nodes=n;if(S.ray.head)S.ray.workers=["node-2","node-3","node-4"].slice(0,n-1);print(`${n} node${n>1?"s":""} (${n*8} GPUs)`,"dim");summary4();return true}
    if(sub==="net"){if(!NETS[a]){err("foundry net ib | roce | eth");return true}if(!C.includes("net")){err("Locked in this level.");return true}S.net=a;print(`Network: ${NETS[a].d}`,"dim");summary4();return true}
    if(sub==="gdr"){if(!C.includes("gdr")){err("Locked in this level.");return true}S.gdr=/^(on|true|1|yes)$/.test(a);print(`GPUDirect RDMA ${S.gdr?"on: NICs read GPU memory directly":"off: data is staged through CPU memory"}`,"dim");if(S.gdr&&!NETS[S.net].rdma)print("(No effect on plain TCP Ethernet: it has no RDMA.)","dim");summary4();return true}
    if(sub==="layout"){const m=a.match(/^(\d+)x(\d+)$/);if(!m){err("foundry layout TPxPP, e.g. foundry layout 8x2");return true}
      vllmCmd(["serve",MODELS[S.model].key,"--tensor-parallel-size",m[1],"--pipeline-parallel-size",m[2],"--distributed-executor-backend","ray"]);return true}
  }
  return false}

/* ============ nvidia-smi variants ============ */
function smiCmd(args){const S=G.S,a=args.join(" ");const gv=S.world===1?GPUS[S.gpu]:S.world===3?GPUS[SERVERS[S.srv].gpu]:null;if(gv&&gv.vendor==="amd"){err(`nvidia-smi: command not found. This is an AMD ${gv.name}: use amd-smi${/topo/.test(a)?" or rocm-smi --showtopo":""}.`);return}
  if(!args.length||args[0]==="-L"&&false){smi();return}
  if(/^topo\b/.test(a)){if(S.world<3){err("This bench has one GPU. Topology matters from World 3.");return}topo();return}
  const mm=a.match(/-mig\s+([01])/);if(mm&&!/^mig\b/.test(a)){if(!G.level.panels.includes("mig")){err("MIG is in the 'Share the GPU' level.");return}
    const on=mm[1]==="1";S.mig.mode=on;S.mig.inst=[];if(on)S.mig.share="none";print(on?"Enabled MIG Mode for GPU 00000000:18:00.0\nAll done.":"Disabled MIG Mode for GPU 00000000:18:00.0\nAll done.");return}
  if(/^mig\b/.test(a)){if(!G.level.panels.includes("mig")){err("MIG is in the 'Share the GPU' level.");return}
    if(!S.mig.mode){err("Unable to create GPU instance: MIG mode is not enabled. Run: sudo nvidia-smi -i 0 -mig 1");return}
    if(/-lgip/.test(a)){print("GPU instance profiles (GPU 0, H100 80GB):\n  "+pad("Name",10)+pad("ID",5)+pad("Compute",9)+pad("Memory",8)+"Max\n"+Object.entries(MIGP).map(([k,v])=>"  "+pad(k,10)+pad(v.id,5)+pad(v.c+"/7",9)+pad(v.gb+" GB",8)+Math.floor(Math.min(7/v.c,8/v.m))).join("\n"));return}
    if(/-lgi\b/.test(a)){print(S.mig.inst.length?S.mig.inst.map((p,i)=>`  GPU 0  instance ${i}  ${p}  (profile ${MIGP[p].id})`).join("\n"):"No GPU instances found.");return}
    if(/-dci|-dgi/.test(a)){S.mig.inst=[];S.mig.share="none";print("Destroyed all compute and GPU instances on GPU 0.");return}
    const ci=args.indexOf("-cgi");if(ci>=0){const list=(args[ci+1]||"").split(",").filter(Boolean).map(x=>MIG_ID[x]||x);const ck=migCheck(list);
      if(!list.length){err("-cgi needs a comma-separated list of profiles, e.g. 1g.10gb,2g.20gb");return}
      if(!ck.ok){err(`Unable to create GPU instances: ${ck.why}.`);return}
      S.mig.inst=list;S.mig.share="mig";print(list.map((p,i)=>`Successfully created GPU instance ID ${i} on GPU 0 using profile MIG ${p} (ID ${MIGP[p].id})`).join("\n")+(args.includes("-C")?`\nCreated ${list.length} compute instance${list.length>1?"s":""}.`:"\n(add -C to create compute instances too; done for you here)"));
      const A=migAssign(S);A.res.forEach(r=>print(r.inst?`  ${pad(r.t.n,14)} → ${r.inst.p} #${r.inst.i}`:`  ${pad(r.t.n,14)} → no instance with ${r.t.need} GB left`,r.inst?"ok":"err"));return}
    err("Try: nvidia-smi mig -lgip | -cgi PROFILES -C | -lgi | -dci");return}
  smi()}
function smiMulti(){const S=G.S;const drv=DRIVERS[580];let used=0,util=0;const gname=S.world===3?GPUS[SERVERS[S.srv].gpu].smi:"NVIDIA H100 80GB HBM3",gmib=S.world===3?GPUS[SERVERS[S.srv].gpu].smiMiB:81559;
  if(S.world===3){const M=w3(S);used=M.fits?M.usedPer:0;util=M.fits?100:0}
  else if(S.mode==="serve"&&S.job){const R=w4serve(S);used=R.fits?R.usedPer:0;util=R.fits?100:0}
  else if(S.mode==="train"){used=62;util=100}
  print(`NVIDIA-SMI ${drv.full}   Driver Version: ${drv.full}   CUDA Version: ${drv.cuda}${S.world===4?"   host: "+S.host:""}`,"dim");
  print("GPU  Name                    Memory-Usage           GPU-Util\n"+[...Array(8)].map((_,i)=>`  ${i}  ${pad(gname,22)}  ${lpad(Math.round(used*1e9/1048576)+"MiB",9)} / ${gmib}MiB    ${lpad(util+"%",4)}`).join("\n"))}
function topo(){const S=G.S;G.S.flags.topo=true;const hgx=S.world===4||S.srv==="hgx"||S.srv==="hgxb200";
  const cell=(i,j)=>i===j?" X ":hgx?"NV18":(Math.floor(i/2)===Math.floor(j/2)?"PIX":Math.floor(i/4)===Math.floor(j/4)?"NODE":"SYS");
  print("        "+[...Array(8)].map((_,j)=>pad("GPU"+j,6)).join("")+(S.world===4?"NIC0  ":"")+"CPU Affinity");
  for(let i=0;i<8;i++)print(pad("GPU"+i,8)+[...Array(8)].map((_,j)=>pad(cell(i,j),6)).join("")+(S.world===4?pad(i===0?"PIX":"SYS",6):"")+(i<4?"0-55":"56-111"));
  print(hgx?"\nNV18 = connection through 18 bonded NVLinks (via NVSwitch).":"\nPIX = same PCIe switch · NODE = same CPU socket · SYS = crosses between CPUs. No NVLink.","dim")}
function ncclTest(args){const S=G.S;if(S.world!==3){err(S.world===4?"Across nodes this runs under mpirun; here, use ib_write_bw to test the network.":"all_reduce_perf needs several GPUs: World 3.");return}
  S.flags.nccl=true;const srv=SERVERS[S.srv],amd=GPUS[srv.gpu].vendor==="amd";
  print(`# ${amd?"rccl-tests (RCCL = the AMD version of NCCL)":"nccl-tests"} all_reduce_perf · 8 × ${GPUS[srv.gpu].name} · ${srv.name}`,"dim");
  print("#     size     time(us)   algbw(GB/s)   busbw(GB/s)");
  ncclTable(srv,8).forEach(r=>{const sz=r.b>=1<<30?(r.b/(1<<30))+"G":r.b>=1<<20?(r.b/(1<<20))+"M":r.b>=1024?(r.b/1024)+"K":r.b+"";print("  "+lpad(sz,9)+lpad(f1(r.t*1e6),13)+lpad(f2(r.alg),14)+lpad(f2(r.bus),14))});
  const big=ncclTable(srv,8).pop();print(`# Avg bus bandwidth at 8G: ${f1(big.bus)} GB/s. Small messages are latency-bound (~${f0(srv.lat*1e6)} µs).`,"dim")}

/* ============ World 4 commands ============ */
function ibstat(){const S=G.S;if(S.world!==4){err("ibstat: no InfiniBand devices on this bench (World 4).");return}S.flags.ibstat=true;const n=NETS[S.net];
  if(!n.rdma){print("ibstat: no RDMA devices found. This server has one 100 GbE NIC (eth0) running plain TCP.");return}
  for(let k=0;k<2;k++)print(`CA 'mlx5_${k}'\n\tCA type: MT4129 (ConnectX-7)\n\tPort 1:\n\t\tState: Active\n\t\tPhysical state: LinkUp\n\t\tRate: 400\n\t\tLink layer: ${S.net==="ib"?"InfiniBand":"Ethernet"}`);
  print(`… mlx5_2 to mlx5_7 identical: 8 ports Active at 400 Gb/s on ${S.host} (one per GPU).`,"dim")}
function ibbw(args){const S=G.S;if(S.world!==4){err("ib_write_bw: the network is World 4.");return}const tgt=args.find(x=>/^node-\d$/.test(x));
  if(!tgt){err("Usage here: ib_write_bw node-2   (run from node-1 against another server)");return}if(tgt===S.host){err("Pick another server than the one you're on.");return}
  if(parseInt(tgt.slice(5))>S.nodes){err(`ib_write_bw: couldn't connect to ${tgt}: no such host in this ${S.nodes}-node cluster.`);return}
  const n=NETS[S.net];if(!n.rdma){err("ib_write_bw: no RDMA device. Try iperf3 for plain TCP.");return}
  const gb=S.net==="ib"?392.6:368.4;S.flags.ibbw=true;
  print(`---------------------------------------------------------------------------------------\n                    RDMA_Write BW Test · ${S.host} → ${tgt} · mlx5_0 · ${S.net==="ib"?"InfiniBand":"RoCE v2"}\n #bytes     #iterations    BW peak[Gb/sec]    BW average[Gb/sec]   MsgRate[Mpps]\n 65536      5000           ${f1(gb+1.1)}              ${f1(gb)}                 ${f2(gb*1e9/8/65536/1e6)}\n---------------------------------------------------------------------------------------`);
  print(`(≈ ${f1(gb/8)} GB/s on one NIC. Eight NICs per server ≈ ${f0(gb)} GB/s total; NVLink gives one GPU 450 GB/s each way.)`,"dim")}
function iperf(args){const S=G.S;if(S.world!==4){err("iperf3: the network is World 4.");return}const n=NETS[S.net];const gbps=n.key==="eth"?71.4:n.key==="roce"?96.0:58.0;
  print(`[ ID] Interval       Transfer     Bitrate\n[  5] 0.00-10.00 sec  ${f1(gbps*10/8)} GBytes  ${f1(gbps)} Gbits/sec   (TCP, one stream, through the CPU)`);if(n.rdma)print("(TCP can't use RDMA: ib_write_bw shows what the fabric really does.)","dim")}
function sshCmd(args){const S=G.S;if(S.world!==4){err("ssh: there's only one machine here. Multi-node is World 4.");return}const h=args[0];
  if(!/^node-\d$/.test(h||"")||parseInt(h.slice(5))>S.nodes){err(`ssh: Could not resolve hostname ${h||""}. Hosts: ${[...Array(S.nodes)].map((_,i)=>"node-"+(i+1)).join(", ")}`);return}
  S.host=h;print(`Welcome to ${h} (Ubuntu 22.04, 8 × H100)`,"dim")}
function rayCmd(args){const S=G.S;if(S.world!==4){err("ray: Ray clusters are in World 4.");return}const sub=args[0],rest=args.join(" ");
  if(sub==="start"){
    if(/--head/.test(rest)){if(S.ray.head&&S.ray.head!==S.host){err(`This cluster already has a head on ${S.ray.head}. Join it with ray start --address=${S.ray.head}:6379`);return}
      S.ray.head=S.host;print(`Local node IP: 10.0.0.${S.host.slice(5)}\n--------------------\nRay runtime started.\n--------------------\nTo add another node to this Ray cluster, run\n  ray start --address='${S.host}:6379'\nDashboard: http://${S.host}:8265`,"ok");return}
    const m=rest.match(/--address[= ]'?([\w.-]+):(\d+)'?/);if(!m){err("ray start --head   or   ray start --address=HEAD:6379");return}
    if(!S.ray.head){err(`ConnectionError: could not reach a Ray head at ${m[1]}:${m[2]}. Start the head first (ray start --head on node-1).`);return}
    if(m[1]!==S.ray.head&&m[1]!=="10.0.0."+S.ray.head.slice(5)){err(`ConnectionError: no Ray head at ${m[1]}:${m[2]}. The head is ${S.ray.head}.`);return}
    if(S.host===S.ray.head){err("This node is the head. ssh to another node first.");return}
    if(!S.ray.workers.includes(S.host))S.ray.workers.push(S.host);print(`Local node IP: 10.0.0.${S.host.slice(5)}\n--------------------\nRay runtime started.\nThis node joined the cluster at ${m[1]}:${m[2]} with 8 GPUs.`,"ok");return}
  if(sub==="status"){if(!S.ray.head){err("ConnectionError: Ray is not running. Start it with ray start --head.");return}const nodes=1+S.ray.workers.length,g=nodes*8;
    print(`======== Autoscaler status ========\nActive:\n ${nodes} node(s): ${[S.ray.head,...S.ray.workers].join(", ")}\nResources\n---------------------------------------------------------------\nUsage:\n ${S.job?S.job.tp*S.job.pp:0}.0/${g}.0 GPU\n 0.0/${nodes*224}.0 CPU\n 0B/${nodes*2}.00TiB memory`);
    if(g>=16)S.flags.raystatus16=true;return}
  if(sub==="stop"){if(S.ray.head===S.host){S.ray={head:null,workers:[]};S.job=null;print("Stopped all Ray processes. The cluster is gone.","dim")}else{S.ray.workers=S.ray.workers.filter(w=>w!==S.host);print(`Stopped Ray on ${S.host}.`,"dim")}return}
  err("ray start | ray status | ray stop")}
function vllmCmd(args){const S=G.S;
  if(S.world!==4){err("vllm is the next layer up (serving). Here, foundry load MODEL --dtype fp8 does the same job.");return}
  if(args[0]!=="serve"){err("vllm serve MODEL --tensor-parallel-size N --pipeline-parallel-size M --distributed-executor-backend ray");return}
  if(S.mode!=="serve"){err("This cluster is running training. foundry mode serve first.");return}
  const name=(args[1]||"").toLowerCase();let model=null;if(/405b/.test(name))model="llama-405b";else if(/70b/.test(name))model="llama-70b";
  if(!model){err("Model not found here. Try meta-llama/Llama-3.1-405B-Instruct");return}
  const opt=k=>{for(let i=0;i<args.length;i++){if(args[i]===k)return args[i+1];if(args[i].startsWith(k+"="))return args[i].split("=")[1]}return null};
  const tp=parseInt(opt("--tensor-parallel-size")||opt("-tp")||"1"),pp=parseInt(opt("--pipeline-parallel-size")||opt("-pp")||"1"),q=opt("--quantization");
  if(G.level.locks&&G.level.locks.model&&model!==S.model){err("Locked in this level: "+G.level.locks.model);return}
  const n=tp*pp;
  if(n>8&&S.host!==(S.ray.head||"node-1")){err(`Run vllm serve on the Ray head node (${S.ray.head||"node-1"}). You're on ${S.host}.`);return}
  if(n>8&&!S.ray.head){err(`ValueError: tensor_parallel_size × pipeline_parallel_size = ${n} GPUs, but this machine has 8. Start a Ray cluster across the nodes first.`);return}
  const avail=S.ray.head?rayGPUs(S):8;
  if(n>avail){err(`ValueError: the current placement group needs ${n} GPUs, but the Ray cluster has ${avail}. Did all nodes join?`);return}
  if(n>8&&!/--distributed-executor-backend[= ]ray/.test(args.join(" ")))print("INFO: more GPUs than one node has: using the Ray backend.","dim");
  const old={model:S.model,dtype:S.dtype,tp:S.tp,pp:S.pp,job:S.job};
  S.model=model;S.dtype=q==="fp8"?"fp8":"bf16";S.tp=tp;S.pp=pp;const R=w4serve(S);
  if(!R.fits){err(`torch.OutOfMemoryError: each of ${n} GPUs needs ${f1(R.usedPer)} GB for ${MODELS[model].name} ${DTYPES[S.dtype].name}; H100 has 80 GB.`);Object.assign(S,old);return}
  S.job={tp,pp};
  print(`INFO: Loading ${MODELS[model].name} (${DTYPES[S.dtype].name}) · TP ${tp} × PP ${pp} over ${n} GPUs${pp>1?` · layers split into ${pp} stages`:""}`,"dim");
  print(`INFO: Uvicorn running on http://${S.host}:8000 · model ready`,"ok");summary4()}
function amdSmi(v,args){const S=G.S;const g=S.world===1?GPUS[S.gpu]:S.world===3?GPUS[SERVERS[S.srv].gpu]:null;
  if(!g||g.vendor!=="amd"){err(`${v}: no AMD GPUs found. This machine has NVIDIA GPUs: use nvidia-smi.`);return}
  if(v==="rocm-smi"&&/showtopo/.test(args.join(" "))){S.flags.topo=true;print("        "+[...Array(8)].map((_,j)=>pad("GPU"+j,7)).join(""));for(let i=0;i<8;i++)print(pad("GPU"+i,8)+[...Array(8)].map((_,j)=>pad(i===j?"0":"XGMI",7)).join(""));print("\nXGMI = direct Infinity Fabric link. Every pair has one: a full mesh.","dim");return}
  S.flags.amdsmi=true;let used,util,pw,n=S.world===3?8:1;
  if(S.world===1){const M=w1(S);used=M.fits?M.used:0;util=M.fits?100:0;pw=M.fits?Math.round(M.power):Math.round(g.tdp*.1)}else{const M=w3(S);used=M.fits?M.usedPer:0;util=M.fits?100:0;pw=Math.round(g.tdp*.55)}
  print(`AMD SMI · ROCm 7 · amdgpu driver`,"dim");
  print("GPU  NAME                     POWER        GFX_UTIL   VRAM_USED / TOTAL\n"+[...Array(n)].map((_,i)=>`  ${i}  ${pad(g.smi,22)}  ${lpad(pw+" W",6)} / ${g.tdp} W  ${lpad(util+"%",5)}     ${lpad(f1(used),6)} / ${g.mem} GB`).join("\n"));
  if(S.world===1&&w1(S).fits)print(`(Like nvidia-smi, GFX_UTIL means a kernel is running. Matrix Cores are actually ${f1(w1(S).compUtil*100)}% busy.)`,"dim")}
function runMore(v,t){
  if(v==="all_reduce_perf"||v==="./all_reduce_perf"||v==="./build/all_reduce_perf"){ncclTest(t.slice(1));return true}
  if(v==="ibstat"){ibstat();return true}
  if(v==="ib_write_bw"){ibbw(t.slice(1));return true}
  if(v==="iperf3"){iperf(t.slice(1));return true}
  if(v==="ssh"){sshCmd(t.slice(1));return true}
  if(v==="exit"||v==="logout"){if(G.S.world===4&&G.S.host!=="node-1"){print(`logout · back on node-1`,"dim");G.S.host="node-1"}else print("(you're on the main machine)","dim");return true}
  if(v==="hostname"){print(G.S.world===4?G.S.host:"gpu-node-01");return true}
  if(v==="ray"){rayCmd(t.slice(1));return true}
  if(v==="amd-smi"||v==="rocm-smi"){amdSmi(v,t.slice(1));return true}
  return false}
function inspectMap(){return{cu:"cu",cus:"cu",xcd:"xcd",chiplet:"xcd",ifmesh:"ifmesh",mesh:"ifmesh","infinity-fabric":"ifmesh",nvswitch:"nvswitch",switch:"nvswitch",nvlink:"nvlink",pcie:"pcie",gpu8:"gpu8",nic:"nic",nics:"nic",leaf:"leaf",spine:"spine",node:"node",server:"node",ray:"rayhead",head:"rayhead",rayhead:"rayhead",mig:"mig"}}
const WORLD_INSPECT={1:["sm","hbm","bw","link","mig","cu","xcd"],2:["code","torch","lib","runtime","driver","gpu"],3:["nvswitch","nvlink","pcie","gpu8","ifmesh"],4:["nic","leaf","spine","node","rayhead"]};
function helpMore(w){
  if(w===3)return`SERVER COMMANDS (World 3, one 8-GPU server)
  nvidia-smi | nvidia-smi topo -m        GPUs and how they're connected
  all_reduce_perf -b 8 -e 8G -f 16 -g 8  NCCL benchmark (nccl-tests)
  foundry status                         memory, speed, cost for the layout
  foundry server hgx|pcie                NVLink board or PCIe server
  foundry tp 1|2|4|8                     tensor parallel size (8 ÷ TP = replicas)
  foundry load llama-70b|llama-405b|qwen-235b    foundry dtype bf16|fp8|int4
  foundry batch N  (users per replica)   foundry context N   foundry prompt N   foundry kv fp8
  foundry inspect nvswitch|nvlink|pcie
OTHER   clear   hint   help   ↑/↓ history   chain with &&`;
  return`CLUSTER COMMANDS (World 4, you're on ${G.S.host})
  ibstat                                 NIC status (InfiniBand / RoCE)
  ib_write_bw node-2                     RDMA bandwidth test to another server
  iperf3 -c node-2                       plain TCP test
  ssh node-2 | exit | hostname           move between servers
  ray start --head --port=6379           start a Ray cluster here
  ray start --address=node-1:6379        join this server to the cluster
  ray status | ray stop
  vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray
  foundry layout 8x2                     shortcut: relaunch with TP 8 × PP 2
  foundry status | foundry mode serve|train | foundry nodes 1|2|4
  foundry net ib|roce|eth | foundry gdr on|off
  foundry inspect nic|leaf|spine|node|ray
OTHER   clear   hint   help   ↑/↓ history   chain with &&`}
function manualMore(w){
  if(w===3)return[["Look",[["nvidia-smi topo -m","how GPUs connect"],["all_reduce_perf -b 8 -e 8G -f 16 -g 8","NCCL benchmark"],["foundry status",""]]],["Layout",[["foundry tp 1","8 replicas"],["foundry tp 2",""],["foundry tp 4",""],["foundry tp 8","one big model"],["foundry batch 64","users per replica"]]],["Hardware",[["foundry server hgx","NVLink"],["foundry server pcie","no NVLink"]]],["Model",[["foundry load llama-405b",""],["foundry load qwen-235b","MoE"],["foundry kv fp8",""]]]];
  return[["Network",[["ibstat",""],["ib_write_bw node-2",""],["iperf3 -c node-2","TCP"]]],["Ray",[["ray start --head --port=6379","on node-1"],["ssh node-2",""],["ray start --address=node-1:6379","on a worker"],["exit",""],["ray status",""]]],["Serve",[["vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 --distributed-executor-backend ray",""],["foundry layout 8x2",""],["foundry status",""]]],["Train",[["foundry net ib",""],["foundry gdr on",""],["foundry nodes 4",""]]]]}
</script>
