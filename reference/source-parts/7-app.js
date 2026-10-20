<script>
"use strict";
/* ============ state ============ */
/* ---- saved progress: best stars per permanent level ID. XP is never stored; it's worked out from stars. ---- */
const SAVE_KEY="m2m-progress-v1",V4_KEY="gf-progress-v4";
// FROZEN: the 36 levels in the order gf-progress-v4 numbered them (number 1 = index 0). Never edit or re-sort:
// it decodes old saves forever, whatever happens to LEVELS later.
const V4_IDS=["tokens","parameters","moe-experts","attention","attention-heads","generation","kv-cache-basics","quiz-inside-model",
 "gpu-anatomy","memory-fit","kv-cache-memory","memory-bandwidth","batching","prefill-decode","kv-quantisation","moe-on-gpu","perf-per-watt","gpu-sharing","amd-gpus","gpu-choice","quiz-one-gpu",
 "software-path","launch-overhead","kernel-fusion","driver-stack","quiz-software-path",
 "hgx-board","tensor-parallel","nvlink-vs-pcie","tp-vs-replicas","quiz-one-server",
 "fabric","multi-node","pipeline-parallel","data-parallel","quiz-cluster"];
const XP_PER_STAR=50,XP_PER_STAR_QUIZ=75; // whole numbers per star, so XP never needs rounding
const freshProgress=()=>({v:1,stars:{}});
const validStars=n=>n===1||n===2||n===3;
function loadProgress(){
  const p=store.get(SAVE_KEY,null);
  if(p&&typeof p==="object"&&p.v===1&&p.stars&&typeof p.stars==="object"&&!Array.isArray(p.stars))return p;
  // No usable new save: convert a v4 save once if there is one. The v4 save itself is never written or deleted (rollback safety).
  const old=store.get(V4_KEY,null),out=freshProgress();
  if(old&&typeof old==="object"&&old.done&&typeof old.done==="object"){
    for(const [k,n] of Object.entries(old.done)){const id=/^\d+$/.test(k)?V4_IDS[Number(k)-1]:undefined;if(id&&validStars(n))out.stars[id]=n}
    store.set(SAVE_KEY,out)}
  return out}
let progress=loadProgress();
// Entries for IDs not in LEVELS stay in the save untouched (a restored level gets its stars back); they just aren't counted.
const starsOf=id=>{const n=progress.stars[id];return validStars(n)?n:0};
const totalXp=()=>LEVELS.reduce((t,l)=>t+starsOf(l.id)*(l.quiz?XP_PER_STAR_QUIZ:XP_PER_STAR),0);
const G={mode:"home",level:null,S:null,hints:0,won:false,hist:[],hi:0,strip:null,wt:null};
const OUT=[];
function freshState(world){
  if(world===0)return freshW0();
  if(world===1)return{world:1,gpu:"h100",model:"llama-8b",dtype:"bf16",kvdt:"bf16",batch:1,ctx:4096,prompt:2048,flags:{},inspected:[],showRoof:false,info:null,mig:{mode:false,inst:[],share:"none"}};
  if(world===3)return{world:3,gpu:"h100",srv:"hgx",model:"llama-70b",dtype:"fp8",kvdt:"bf16",tp:1,batch:16,ctx:4096,prompt:8192,flags:{},inspected:[],info:null};
  if(world===4)return{world:4,gpu:"h100",mode:"fabric",nodes:2,net:"ib",gdr:true,model:"llama-405b",dtype:"bf16",kvdt:"bf16",tp:8,pp:2,batch:8,ctx:4096,prompt:8192,ray:{head:null,workers:[]},host:"node-1",job:null,flags:{},inspected:[],info:null};
  return{world:2,gpu:"h100",model:"llama-1b",dtype:"bf16",batch:1,ctx:2048,prompt:32768,mode:"decode",graphs:false,fuse:false,flash:false,driver:580,flags:{},inspected:[],info:null,lastRun:null,traceAt:-1};
}
function setMath(on){document.documentElement.classList.toggle("math-on",on);$("#mathBtn").setAttribute("aria-pressed",String(on));store.set("gf-math",on)}

/* ============ terminal ============ */
function print(text,cls){String(text).split("\n").forEach(l=>OUT.push({t:l,c:cls||""}));if(OUT.length>700)OUT.splice(0,OUT.length-700)}
function err(t){print(t,"err")}
function flushOut(){const el=$("#out");el.textContent="";const frag=document.createDocumentFragment();OUT.forEach(o=>{const s=document.createElement("div");s.textContent=o.t||" ";if(o.c)s.className=o.c;frag.appendChild(s)});el.appendChild(frag);el.scrollTop=el.scrollHeight}
function locked(key){const lk=(G.level&&G.level.locks)||{};if(lk[key]){err(`Locked in this level: ${lk[key]}`);return true}return false}
function summary1(){const S=G.S,M=w1(S);if(M.fits&&M.m.moe&&S.batch>=32)S.flags.moe32=true;
  if(M.fp4bad){err(`FP4 needs Blackwell Tensor Cores. ${M.g.name} (${M.g.arch}) has no FP4 math. Try INT4 (weight-only) or a B200.`);return}
  if(!M.fits){err(`CUDA out of memory: needs ${f1(M.used)} GB, ${M.g.name} has ${M.g.mem} GB`);return}
  print(`→ ${f1(M.used)} / ${M.g.mem} GB · fits · ${f1(M.perUser)} tok/s per user · ${f0(M.total)} tok/s total · ${fmtMoney(M.cost)} per 1M tokens · TTFT ${fmtT(M.ttft)}`,"ok")}
function summary2(){const S=G.S;
  if(S.mode==="prefill"){const R=w2prefill(S);if(R.oom)err(`torch.OutOfMemoryError: tried to allocate ${f1(R.scoresGB)} GB for attention scores; ${f1(R.free)} GB free`);else print(`→ prefill ${f0(R.N)} tokens · first token in ${fmtT(R.ttft)}`,"ok")}
  else{const R=w2decode(S);print(`→ ${R.n} kernels per token · ${fmtT(R.step/1e6)} per token (${f0(R.tps)} tok/s) · GPU busy ${f1(R.busy*100)}%`,"ok")}}
function needWorld(w){if(G.S.world!==w){err(`That command belongs to World ${w}. Type help for the commands here.`);return false}return true}

function smi(){const S=G.S;G.S.flags.smi=true;if(S.world>=3){smiMulti();return}
  const drv=S.world===2?DRIVERS[S.driver]:DRIVERS[580];
  let g,usedMiB,totMiB,util,pw;
  if(S.world===1){const M=w1(S);g=M.g;totMiB=g.smiMiB;usedMiB=M.fits?Math.round(M.used*1e9/1048576):0;util=M.fits?100:0;pw=M.fits?Math.min(g.tdp,Math.round(g.tdp*(.14+.42*M.bwUtil+.5*M.compUtil))):Math.round(g.tdp*.1)}
  else{g=GPUS.h100;totMiB=g.smiMiB;
    if(G.level.panels.includes("container")){usedMiB=0;util=0;pw=72}
    else{usedMiB=Math.round(w2used(S)*1e9/1048576);const b=S.mode==="prefill"?(w2prefill(S).oom?0:.99):w2decode(S).busy;util=Math.round(b*100);pw=Math.round(700*(.12+.6*b))}}
  const line="+-----------------------------------------------------------------------------------------+";
  const row=(a,b,c)=>"| "+pad(a,40)+"| "+pad(b,23)+"| "+pad(c,21)+"|";
  print([line,
   "| "+pad(`NVIDIA-SMI ${drv.full}`,34)+pad(`Driver Version: ${drv.full}`,32)+pad(`CUDA Version: ${drv.cuda}`,22)+"|",
   "|-----------------------------------------+------------------------+----------------------+",
   row("GPU  Name                 Persistence-M","Bus-Id          Disp.A","Volatile Uncorr. ECC"),
   row("Fan  Temp   Perf          Pwr:Usage/Cap","          Memory-Usage","GPU-Util  Compute M."),
   "|=========================================+========================+======================|",
   row("  0  "+pad(g.smi,26)+"      On","00000000:18:00.0 Off","                   0"),
   row(`N/A   ${util>50?58:36}C    P0      ${lpad(pw,5)}W / ${lpad(g.tdp,4)}W`,`${lpad(usedMiB+"MiB",10)} / ${totMiB}MiB`,`${lpad(util+"%",8)}     Default`),
   "+-----------------------------------------+------------------------+----------------------+"].join("\n"));
  if(S.world===1){const M=w1(S);if(M.fits)print(`(GPU-Util ${util}% only means a kernel was always running. Tensor Cores are actually ${f1(M.compUtil*100)}% busy.)`,"dim");else print("(Nothing is running: the model failed to load.)","dim")}
  if(S.world===1&&G.level.panels.includes("mig")&&S.mig.share==="mig")print("MIG devices:\n"+S.mig.inst.map((p,i)=>`  GPU 0 · instance ${i} · ${p}`).join("\n"));
  if(S.world===2&&G.level.driverStart)print(`(Top right: this driver supports CUDA up to ${drv.cuda}.)`,"dim");
}
function bench(){const S=G.S,M=w1(S);S.flags.bench=true;
  print(`Benchmark · ${M.m.name} · ${M.d.name} · ${M.g.name} · ${S.batch} user${S.batch>1?"s":""} × ${f0(S.ctx)} context`,"dim");
  if(!M.fits){summary1();return}
  print([`  memory       ${f1(M.used)} / ${M.g.mem} GB   (weights ${f1(M.wGB)} · KV ${f1(M.kvGB)} · runtime ${RESERVE})`,
   `  step time    ${fmtT(M.step)}   (${M.bound}-bound)`,
   `  per user     ${f1(M.perUser)} tok/s`,
   `  throughput   ${f0(M.total)} tok/s`,
   `  first token  ${fmtT(M.ttft)}   (${f0(S.prompt)}-token prompt)`,
   `  bandwidth    ${f1(M.bwUtil*100)}% of ${M.g.bw} TB/s    tensor cores ${f1(M.compUtil*100)}% of ${f0(M.peakTF)} TFLOPS`,
   `  cost         ${fmtMoney(M.cost)} per 1M tokens at $${f2(M.g.price)}/hr`].join("\n"))}
function inspect(id){const S=G.S;const map={sm:"sm",sms:"sm",tensor:"sm","tensor-cores":"sm",hbm:"hbm",memory:"hbm",bandwidth:"bw",bw:"bw",link:"link",code:"code",python:"code",pytorch:"torch",torch:"torch",libraries:"lib",library:"lib",lib:"lib",cublas:"lib",runtime:"runtime",cuda:"runtime",driver:"driver",gpu:"gpu",hardware:"gpu"};
  Object.assign(map,inspectMap());const k=map[String(id||"").toLowerCase()]||id;if(!INFO[k]){err(`Nothing called "${id}" to inspect. Try: ${S.world===1?"sm, hbm, bandwidth, link":"code, pytorch, libraries, runtime, driver, gpu"}`);return false}
  if(!WORLD_INSPECT[S.world].includes(k)){err(`Not on screen here. Try: ${WORLD_INSPECT[S.world].join(", ")}`);return false}
  if(k==="link"&&GPUS[S.gpu].dies===1)print("(This GPU has one die. The link only exists on Blackwell.)","dim");
  S.info=k;if(!S.inspected.includes(k))S.inspected.push(k);print(`${INFO[k].t}: ${INFO[k].d}`,"dim");return true}
function trace(){const S=G.S;S.flags.trace=true;const m=MODELS["llama-8b"],bytes=m.h*m.inter*2,us=bytes/W2BW*1e6;
  const lines=[`[trace] y = x @ W        x: [1, ${m.h}] bf16    W: [${m.h}, ${m.inter}] bf16 (${f0(bytes/1e6)} MB)`,
   `  1 python    model.py:42  self.up_proj(x)  →  torch.matmul(x, W)`,
   `  2 pytorch   aten::mm → dispatch key CUDA → at::cuda::blas::gemm<bf16>`,
   `  3 library   cublasLtMatmul → heuristic picks sm90_xmma_gemm_bf16bf16_bf16f32 (Hopper Tensor Core kernel)`,
   `  4 runtime   cudaLaunchKernel  grid = 132 blocks × 384 threads  (one block per SM)`,
   `  5 driver    ${S.driver} pushes the launch onto stream 7's command queue`,
   `  6 gpu       132 SMs × 4 Tensor Cores · read ${f0(bytes/1e6)} MB of W from HBM · ${f1(us)} µs`];
  print(lines[0],"dim");let i=0;S.traceAt=0;renderSim();
  const step=()=>{if(G.S!==S)return;print(lines[i+1]);flushOut();S.traceAt=i;renderSim();i++;if(i<6)G.tt=setTimeout(step,420);else G.tt=setTimeout(()=>{if(G.S!==S)return;S.traceAt=-1;print("[trace] done · one line of Python, five layers of software, one kernel","ok");flushOut();renderSim();checkGoals()},700)};
  clearTimeout(G.tt);G.tt=setTimeout(step,250)}
function profile(){const S=G.S;
  if(S.mode==="prefill"){const R=w2prefill(S);
    if(R.oom){err(`profile: run crashed in attn_scores (out of memory: ${f1(R.scoresGB)} GB requested, ${f1(R.free)} GB free)`);return}
    S.flags.profiledOk=true;const t=R.ttft;
    print(`Profile · prefill ${f0(R.N)} tokens · ${MODELS[S.model].name} · H100`,"dim");
    print([["Category","Time","Share"],["matrix multiplies (GEMM)",fmtT(R.gemm),f1(R.gemm/t*100)+"%"],[S.flash?"flash_attn":"attention (scores, softmax, values)",fmtT(R.attn),f1(R.attn/t*100)+"%"],[`small ops (${R.nE}/layer)`,fmtT(R.elem),f1(R.elem/t*100)+"%"],["total → first token",fmtT(t),"100%"]].map(r=>"  "+pad(r[0],38)+lpad(r[1],10)+lpad(r[2],9)).join("\n"));return}
  const R=w2decode(S);S.flags.profiledOk=true;const agg={};R.ks.forEach(k=>{const a=agg[k.n]||(agg[k.n]={c:0,t:0});a.c++;a.t+=k.t});
  const rows=Object.entries(agg).sort((a,b)=>b[1].t-a[1].t).slice(0,8);
  print(`Profile · decode 1 token · ${MODELS[S.model].name} · H100 · ${S.graphs?"CUDA Graphs on":"eager launches"}`,"dim");
  print("  "+pad("Kernel",18)+lpad("Calls",7)+lpad("GPU µs",10)+lpad("Share",8)+"\n"+rows.map(([n,a])=>"  "+pad(n,18)+lpad(a.c,7)+lpad(f0(a.t),10)+lpad(f1(a.t/R.step*100)+"%",8)).join("\n"));
  print(`  ${pad("GPU idle",18)}${lpad("",7)}${lpad(f0(R.step-R.sum),10)}${lpad(f1((1-R.busy)*100)+"%",8)}`,R.busy<.7?"err":"");
  print(`  per token ${fmtT(R.step/1e6)} · ${R.n} kernels · CPU spent ${fmtT(R.cpuT/1e6)} launching`,"dim")}
function dockerCmd(t){const S=G.S;
  if(S.world!==2){err("docker: not needed here. This bench already has the model loaded. Containers are in World 2.");return}
  const sub=t[0];
  if(sub==="images"){print("REPOSITORY   TAG          SIZE\n"+Object.entries(IMAGES).map(([k,v])=>{const[r,tg]=k.split(":");return pad(r,13)+pad(tg,13)+v.size}).join("\n"));return}
  if(sub==="ps"){print("CONTAINER ID   IMAGE   STATUS\n(no running containers)");return}
  if(sub!=="run"){err(`docker: '${sub||""}' isn't simulated here. Try docker images or docker run --gpus all IMAGE`);return}
  let gpus=false,image=null;for(let i=1;i<t.length;i++){const a=t[i];
    if(a==="--gpus"){gpus=!!t[i+1];i++;continue} if(a.startsWith("--gpus="))
    {gpus=true;continue} if(a==="--rm"||a==="-it"||a==="-d"||a==="-i"||a==="-t")continue; if(a.startsWith("-"))continue; image=a;break}
  if(!image){err('"docker run" requires at least 1 argument: the image name. Try docker images.');return}
  if(!IMAGES[image]){err(`Unable to find image '${image}' locally. Available: ${Object.keys(IMAGES).join(", ")}`);return}
  const img=IMAGES[image],drv=DRIVERS[S.driver],dmaj=parseInt(drv.cuda);
  print(`==========\n== CUDA ==\n==========\nCUDA Version ${img.cuda}.1   ·   PyTorch ${img.torch}`,"dim");
  if(!gpus){S.lastRun={image,gpus:false,ok:false};print(">>> torch.cuda.is_available()\nFalse");err("No GPU devices inside the container. Start it with --gpus all so the NVIDIA Container Toolkit can pass the GPU and driver in.");return}
  const ok=img.major<=dmaj&&S.driver>=img.minDrv;S.lastRun={image,gpus:true,ok};
  if(!ok){print(">>> torch.cuda.is_available()");err(`RuntimeError: the NVIDIA driver on this host is too old (driver ${S.driver} supports CUDA ${drv.cuda}).\nThis image's CUDA ${img.cuda} runtime needs driver ${img.minDrv} or newer. Upgrade the driver or use an image built for CUDA ${drv.cuda.split(".")[0]}.x.`);return}
  print(">>> torch.cuda.is_available()\nTrue\n>>> torch.cuda.get_device_name(0)\n'NVIDIA H100 80GB HBM3'","ok");
  if(parseFloat(img.cuda)>parseFloat(drv.cuda))print(`(CUDA ${img.cuda} runtime on a ${drv.cuda} driver works through minor-version compatibility: same major version, 12.)`,"dim")}
function driverInstall(v){const S=G.S;if(S.world!==2){err("Drivers are a World 2 topic. This bench's driver is already fine.");return}
  const n=parseInt(v);if(!DRIVERS[n]){err(`E: Unable to locate package nvidia-driver-${v}. Available: ${Object.keys(DRIVERS).join(", ")}`);return}
  if(n===S.driver){print(`nvidia-driver-${n} is already the newest version (${DRIVERS[n].full}).`);return}
  print([`Draining GPU workloads on gpu-node-01 ...`,`Unpacking nvidia-driver-${n} (${DRIVERS[n].full}) ...`,`Building kernel module nvidia.ko ...`,`Rebooting gpu-node-01 ... back online after 3m 41s`,`Driver ${DRIVERS[n].full} loaded · supports CUDA ${DRIVERS[n].cuda}`].join("\n"),"dim");
  S.driver=n;S.flags.driver=true;print("(On a real cluster this is a rolling, node-by-node job. The GPU Operator automates it in World 5.)","dim")}

function setGpu(v){const S=G.S;v=String(v||"").toLowerCase().replace(/^nvidia-/,"").replace(/-?sxm$/,"");if(!GPUS[v]){err(`Unknown GPU "${v}". Options: ${GPU_ORDER.join(", ")}`);return false}
  if(S.world!==1){err("The kernel lab runs on an H100.");return false}if(!(G.level.gpus||NV_GPUS).includes(v)){err(`${GPUS[v].name} is not offered in this level. AMD GPUs appear in "Team red", "Pick the GPU" and the GPU lab.`);return false}if(v===S.gpu){print(`Already on ${GPUS[v].name}.`,"dim");return true}if(locked("gpu"))return false;
  S.gpu=v;const g=GPUS[v];print(`GPU: ${g.vendor==="amd"?"AMD ":""}${g.name} · ${g.arch} · ${g.mem} GB ${g.hbm} · ${g.bw} TB/s · ${f0(g.fp8)} TFLOPS FP8 · $${f2(g.price)}/hr (illustrative)`,"dim");return true}
function setModel(v){const S=G.S;v=String(v||"").toLowerCase();v=MODEL_ALIAS[v]||v;if(!MODELS[v]){err(`Unknown model "${v}". Options: ${Object.keys(MODELS).join(", ")}`);return false}
  if(S.world===2&&!["llama-1b","llama-8b"].includes(v)){err("The kernel lab uses llama-1b or llama-8b.");return false}
  if(S.world===1&&v==="llama-1b"){err("World 1 uses llama-8b, llama-70b or llama-405b.");return false}
  if(v!==S.model&&locked("model"))return false;S.model=v;if(v==="llama-8b")S.flags.saw8b=true;print(`Loaded ${MODELS[v].name} (${f1(MODELS[v].P/1e9)} B parameters)`,"dim");return true}
function setDtype(v){const S=G.S;v=String(v||"").toLowerCase().replace("nvfp4","fp4").replace("fp16","bf16");if(!DTYPES[v]){err(`Unknown precision "${v}". Options: bf16, fp8, int4, fp4`);return false}
  if(S.world!==1){err("The kernel lab runs in BF16.");return false}if(v!==S.dtype&&locked("dtype"))return false;S.dtype=v;return true}
function setNum(key,v,min,max,label){const S=G.S;const n=parseNum(v);if(!isFinite(n)||n<min||n>max){err(`${label} must be a number from ${f0(min)} to ${f0(max)}${key!=="batch"?" (you can write 8k)":""}.`);return false}
  if(n!==S[key]&&locked(key))return false;S[key]=n;
  if(key==="prompt"&&S.world===1&&S.ctx<n){S.ctx=n;print(`(context raised to ${f0(n)} so the prompt fits)`,"dim")}
  if(key==="ctx"&&S.world===1&&S.prompt>n){S.prompt=n;print(`(prompt lowered to ${f0(n)} to fit the context)`,"dim")}
  if(key==="prompt"&&S.world===2)S.ctx=Math.max(S.ctx,n);return true}
function toggle(key,v){const S=G.S;if(!needWorld(2))return false;const on=v===undefined?!S[key]:/^(on|true|1|yes|enable)$/i.test(v);S[key]=on;
  const names={graphs:"CUDA Graphs",fuse:"Kernel fusion",flash:"FlashAttention"};print(`${names[key]} ${on?"on":"off"}`,"dim");return true}

function foundry(t){if(foundryMore(t))return;const S=G.S,sub=(t[0]||"").toLowerCase(),a=t[1],L=G.level;
  const after=afterAny;
  switch(sub){
   case"gpu":if(!needWorld(1))return;if(setGpu(a))after();return;
   case"load":{let dt=null;for(let i=2;i<t.length;i++){if(t[i].startsWith("--dtype")||t[i].startsWith("--quantization")){dt=t[i].includes("=")?t[i].split("=")[1]:t[i+1]}}
     if(setModel(a)){if(dt&&!setDtype(dt))return;after()}return}
   case"dtype":case"precision":case"quantize":case"quantise":if(!needWorld(1))return;if(setDtype(a))after();return;
   case"batch":case"users":if(!needWorld(1))return;if(setNum("batch",a,1,1024,"Users"))after();return;
   case"context":case"ctx":if(!needWorld(1))return;if(setNum("ctx",a,512,262144,"Context"))after();return;
   case"prompt":if(S.world===2&&!(L.controls||[]).includes("prompt2")){err("Locked in this level: the document is 32,768 tokens.");return}if(setNum("prompt",a,128,262144,"Prompt"))after();return;
   case"bench":if(!needWorld(1))return;bench();return;
   case"status":S.world===1?bench():afterAny();return;
   case"roofline":case"roof":if(!needWorld(1))return;if(!(L.panels||[]).includes("roof")){err(refs("The roofline opens from {{lvl:memory-bandwidth}} onward, and in the GPU lab."));return}
     if(a==="off"){S.showRoof=false;print("Roofline hidden.","dim");return}
     S.showRoof=true;S.flags.roof=true;{const M=w1(S);print(M.fits?`Roofline: decode at ${f1(M.I)} FLOPs/byte, ridge at ${f0(M.ridge)}. ${M.I<M.ridge?"Left of the ridge, so memory bandwidth is the limit.":"Right of the ridge, so compute is the limit."}`:"Roofline shown. Nothing is running yet: the model doesn't fit.","dim")}return;
   case"inspect":case"explain":inspect(a);return;
   case"trace":if(!needWorld(2))return;if(!(L.panels||[]).includes("stack")){err(refs("The trace view is in {{lvl:software-path}} and the kernel lab."));return}trace();return;
   case"graphs":case"cuda-graphs":if(!(L.controls||[]).includes("graphs")&&S.world===2){err("Not part of this level.");return}if(toggle("graphs",a))after();return;
   case"fuse":case"fusion":if(S.world===2&&!(L.controls||[]).includes("fuse")){err("Not part of this level.");return}if(toggle("fuse",a))after();return;
   case"flash":case"flashattention":if(S.world===2&&!(L.controls||[]).includes("flash")){err("Not part of this level.");return}if(toggle("flash",a))after();return;
   case"mode":if(!needWorld(2))return;if(!(L.controls||[]).includes("mode")){err("Locked in this level.");return}if(a!=="decode"&&a!=="prefill"){err("foundry mode decode | prefill");return}S.mode=a;print(`Phase: ${a}`,"dim");after();return;
   case"profile":if(!needWorld(2))return;if(!(L.panels||[]).includes("timeline")){err("The profiler is in the World 2 timeline levels and the kernel lab.");return}profile();return;
   case"driver":if(a==="install"){driverInstall(t[2]);return}err("foundry driver install VERSION");return;
   case"help":case"":printHelp();return;
   default:err(`foundry: unknown command "${sub}". Type help.`)}}
function printHelp(){const w=G.S.world;if(w===0){print(helpW0(),"dim");return}if(w>=3){print(helpMore(w),"dim");return}
  if(w===1)print(refs(`GPU COMMANDS (World 1)
  nvidia-smi                          GPU status, the way operators see it
  foundry status | bench              memory, speed, cost for the current setup
  foundry gpu h100|h200|b200|b300     swap the GPU
  foundry load llama-8b|llama-70b|llama-405b [--dtype fp8]
  foundry dtype bf16|fp8|int4|fp4     precision (fp4 needs Blackwell)
  foundry batch N                     users served in the same step
  foundry context N                   tokens kept per conversation (8k ok)
  foundry prompt N                    prompt length for time to first token
  foundry roofline [off]              show the roofline chart (from {{lvl:memory-bandwidth}})
  foundry inspect sm|hbm|bandwidth|link
OTHER   clear   hint   help   ↑/↓ history   chain with &&`),"dim");
  else print(`KERNEL COMMANDS (World 2, on an H100)
  nvidia-smi                          driver, CUDA version, GPU-Util
  foundry trace matmul                follow y = x @ W down the stack
  foundry inspect code|pytorch|libraries|runtime|driver|gpu
  foundry load llama-1b|llama-8b      model to profile
  foundry mode decode|prefill         one token at a time, or a whole prompt
  foundry graphs on|off               CUDA Graphs
  foundry fuse on|off                 kernel fusion
  foundry flash on|off                FlashAttention
  foundry profile                     where the time goes
  docker images | docker run [--gpus all] IMAGE
  sudo apt install nvidia-driver-N    change the host driver
OTHER   clear   hint   help   ↑/↓ history   chain with &&`,"dim")}

function run(line){const S=G.S;line=line.trim();if(!line||!S)return;G.hist.push(line);if(G.hist.length>60)G.hist.shift();G.hi=G.hist.length;print("$ "+line,"cmd");
  line.split(/\s*&&\s*/).forEach(part=>{const t=part.trim().split(/\s+/).filter(Boolean);if(!t.length)return;let v=t[0].toLowerCase();
    try{
     if(v==="sudo"){t.shift();v=(t[0]||"").toLowerCase()}
     if(v==="nvidia-smi"||v==="nvidia_smi"||v==="smi")smiCmd(t.slice(1));
     else if(v==="foundry"||v==="f")foundry(t.slice(1));
     else if(v==="docker")dockerCmd(t.slice(1));
     else if(v==="apt"||v==="apt-get"){const pk=t.find(x=>/nvidia-driver-\d+/.test(x));if(t[1]==="install"&&pk)driverInstall(pk.match(/nvidia-driver-(\d+)/)[1]);else err("apt: try sudo apt install nvidia-driver-580")}
     else if(v==="clear")OUT.length=0;
     else if(v==="help")printHelp();
     else if(v==="hint"){if(G.level.answer){showHint();print("(hint shown in the mission panel)","dim")}else print("No hints here.","dim")}
     else if(v==="python"||v==="python3")err(S.world===2?"python: run code inside a container: docker run --gpus all IMAGE":"python: not needed. foundry commands drive the bench.");
     else if(w0bCmd(v,t)){}
     else if(w0Cmd(v,t)){}
     else if(v==="vllm")vllmCmd(t.slice(1));
     else if(runMore(v,t)){}
     else if(v==="mpirun"||v==="torchrun")err(`${v}: launched for you here. In World 4, foundry mode train runs the job; foundry status shows it.`);
     else if(v==="kubectl")err("kubectl: Kubernetes arrives in World 5. Kube Harbor covers it today.");
     else err(`bash: ${v}: command not found. Type help.`)}catch(e){err("error: "+(e.message||e))}});
  flushOut();renderSim();checkGoals()}
function exec(cmd){run(cmd)}
function insert(txt){const i=$("#cmd");i.value=txt;try{i.focus();i.setSelectionRange(txt.length,txt.length)}catch(e){}}

/* ============ game flow ============ */
const ALL=()=>LEVELS;
function saveProgress(){store.set(SAVE_KEY,progress);updateXp()}
function updateXp(){$("#xpNum").textContent=totalXp();$("#totNum").textContent=LEVELS.length;$("#doneNum").textContent=LEVELS.filter(l=>starsOf(l.id)).length}
function nextLevelId(){const l=LEVELS.find(l=>!starsOf(l.id));return l?l.id:null}
function starsHtml(n){return[1,2,3].map(i=>i<=n?"★":'<span class="off">★</span>').join("")}
function renderHome(){const next=nextLevelId();
  $("#stackMap").innerHTML=LAYERS.map(x=>{const c=STACK_COVER[x.n];return`<div class="${c?c[1]:""}"><span class="num">${String(x.n).padStart(2,"0")}</span><span><b>${esc(x.name)}</b></span><span class="w">${c?c[0]:"later chapters"}</span></div>`}).join("");
  $("#piers").innerHTML=WORLDS.map(W=>`<section class="pier"><div class="pier-head"><h2>${esc(W.h)}</h2><p>${esc(W.p)}</p></div><div class="levels">${LEVELS.filter(l=>l.world===W.w).map(l=>`<button class="lvl${l.id===next?" next":""}" data-level="${l.id}">${l.id===next?'<span class="badge">Up next</span>':""}<span class="n">${String(l.n).padStart(2,"0")}</span><span class="t">${esc(l.title)}</span><span class="c">${esc(l.concept)}</span><span class="stars">${starsOf(l.id)?starsHtml(starsOf(l.id)):'<span class="off">★★★</span>'}</span></button>`).join("")}${LABS[W.w]?`<button class="lvl lab" data-level="${LABS[W.w].id}"><span class="n">∞</span><span class="t">${LABS[W.w].title}</span><span class="c">Sandbox: every knob unlocked</span><span class="stars"></span></button>`:""}</div></section>`).join("");
  $("#soon").innerHTML=SOON.map(s=>`<div class="lvl soon" aria-disabled="true"><span class="n">${s.n}</span><span class="t">${esc(s.t)}</span><span class="c">${esc(s.c)}</span><span class="stars"></span></div>`).join("");
  $("#startBtn").textContent=next?(next===LEVELS[0].id?"Start level 1":refs(`Continue: {{lvl:${next}}}`)):"Replay level 1";updateXp()}
function show(mode){G.mode=mode;$("#home").hidden=mode!=="home";$("#game").hidden=mode!=="game";$("#levelsBtn").hidden=mode!=="game";if(mode==="home"){renderHome();clearInterval(flickT)}try{window.scrollTo(0,0)}catch(e){}}
function getLevel(id){return LEVEL_BY_ID.get(id)||Object.values(LABS).find(l=>l.id===id)}
function loadLevel(id){const L=getLevel(id);if(!L)return;$("#cmpModal").hidden=true;clearTimeout(G.tt);clearTimeout(G.wt);
  G.level=L;G.S=freshState(L.world);if(L.setup)L.setup(G.S);G.hints=0;G.won=false;G.strip=null;OUT.length=0;
  $("#mEyebrow").textContent=L.lab?`Sandbox · World ${L.world}`:`World ${L.world} · Level ${L.n}`;
  $("#mTitle").textContent=L.title;$("#mConcept").textContent=L.concept;$("#mBrief").innerHTML=refs(L.brief)||(L.quiz?`<p>${L.questions.length} questions on what you just did. Pick an answer; wrong picks show why, and you can try again. Fewer mistakes, more stars.</p>`:"");
  const gl=L.goals||[];$("#goalWrap").hidden=!gl.length;$("#mGoals").innerHTML=gl.map((g,i)=>`<li data-g="${i}">${esc(refs(g.t))}</li>`).join("");
  $("#hintWrap").hidden=!L.answer;$("#mHints").innerHTML="";$("#hintBtn").hidden=false;$("#hintBtn").textContent="Show a hint";
  $("#manual").hidden=true;$("#manualBtn").setAttribute("aria-expanded","false");$("#glossSide").hidden=true;$("#glossBtn").setAttribute("aria-expanded","false");
  const quiz=!!L.quiz;$("#simCard").hidden=quiz;$("#termCard").hidden=quiz;$("#quiz").hidden=!quiz;$("#restartBtn").textContent=quiz?"Restart quiz":"Restart level";$("#manualBtn").hidden=quiz;
  renderStrip();
  if(quiz){G.quizState={picked:L.questions.map(()=>[]),mistakes:0};renderQuiz();clearInterval(flickT)}
  else{
    if(L.driverStart){print("$ docker run --gpus all llm:cuda13.0","cmd");print("==========\n== CUDA ==\n==========\nCUDA Version 13.0.1   ·   PyTorch 2.9.0","dim");print(">>> torch.cuda.is_available()");err("RuntimeError: the NVIDIA driver on this host is too old (driver 535 supports CUDA 12.2).\nThis image's CUDA 13.0 runtime needs driver 580 or newer.")}
    print(L.lab?`${L.title} ready. Type help for the command list.`:`World ${L.world} · Level ${L.n}: ${L.title}. Type help for commands, or hint for a nudge.`,"dim");
    if(L.world===1&&L.title!=="Meet the chip"&&!L.panels.includes("mig")&&!L.panels.includes("pick")){const M=w1(G.S);if(!M.fits)summary1()}
    if(L.world===3&&!L.quiz){if(!w3(G.S).fits)summary3()}
    flushOut();renderChips();renderSim()}
  show("game");checkGoals()}
function renderChips(){const L=G.level;$("#chips").innerHTML=(L.chips||[]).map(c=>`<button type="button" data-ins="${esc(c)}">${esc(c)}</button>`).join("")}
function showHint(){const L=G.level;if(!L.answer)return;const total=L.hints.length+1;if(G.hints>=total)return;G.hints++;const ol=$("#mHints");ol.innerHTML="";
  L.hints.slice(0,G.hints).forEach(h=>{const li=document.createElement("li");li.textContent=refs(h);ol.appendChild(li)});
  if(G.hints===total){const a=L.answer(G.S);const li=document.createElement("li");li.innerHTML=`<div class="answer"><span>Answer:</span> <code>${esc(a)}</code> <button class="btn" type="button" data-ins="${esc(a)}">Use it</button></div>`;ol.appendChild(li);$("#hintBtn").hidden=true}
  else $("#hintBtn").textContent=G.hints===total-1?"Show the answer":"Next hint"}
const goalOk=(L,S)=>L.goals.map(g=>{try{return!!g.ok(S)}catch(e){return false}});
function checkGoals(){const L=G.level;if(!L||L.quiz||!G.S)return;const res=goalOk(L,G.S);
  document.querySelectorAll("#mGoals li").forEach((li,i)=>li.classList.toggle("ok",!!res[i]));
  if(G.won||!L.goals.length)return;clearTimeout(G.wt);
  if(res.every(Boolean)){const S=G.S;G.wt=setTimeout(()=>{if(G.level===L&&G.S===S&&!G.won&&goalOk(L,S).every(Boolean))win()},900)}}
function win(stars){const L=G.level;G.won=true;if(stars===undefined){const total=L.hints.length+1;stars=G.hints===0?3:G.hints<total?2:1}
  if(stars>starsOf(L.id)){progress.stars[L.id]=stars;saveProgress()} // stars only go up
  $("#dEyebrow").textContent=L.quiz?"Checkpoint complete":`World ${L.world} · Level ${L.n} cleared`;$("#dTitle").textContent=L.title;$("#dStars").innerHTML=starsHtml(stars);
  $("#dBody").innerHTML=refs(L.debrief)+(L.links?`<div class="links"><div><b>↑ Up</b><span>${esc(refs(L.links.up))}</span></div><div><b>↓ Down</b><span>${esc(refs(L.links.down))}</span></div></div>`:"")+(stars<3?`<p style="color:var(--muted);font-size:13px;margin-top:10px">${L.quiz?"Retake with fewer wrong picks for 3 stars.":"Replay without the answer hint for 3 stars."}</p>`:"");
  const nxt=L.lab?null:LEVELS[L.idx+1];$("#dNext").hidden=!nxt;if(nxt)$("#dNext").textContent=`Next: ${nxt.title}`;$("#modal").hidden=false;try{$("#dNext").hidden?$("#dStay").focus():$("#dNext").focus()}catch(e){}}
function renderQuiz(){const L=G.level,st=G.quizState;
  $("#quiz").innerHTML=L.questions.map((q,i)=>{const done=st.picked[i].includes(q.a);return`<div class="q"><h4>${i+1}. ${esc(refs(q.q))}</h4><div class="opts">${q.o.map((o,j)=>`<button type="button" data-q="${i}" data-o="${j}" class="${st.picked[i].includes(j)?(j===q.a?"right":"wrong"):""}" ${done?"disabled":""}>${esc(refs(o))}</button>`).join("")}</div>${done?`<div class="why">${esc(refs(q.why))}</div>`:st.picked[i].length?`<div class="why">Not quite. Try another answer.</div>`:""}</div>`}).join("");
  if(L.questions.every((q,i)=>st.picked[i].includes(q.a))&&!G.won){const m=st.mistakes;setTimeout(()=>win(m===0?3:m<=2?2:1),500)}}
function renderManual(){const w=G.S?G.S.world:1;if(w===0){$("#manual").innerHTML=manualW0().map(([h,cs])=>`<h4>${h}</h4>`+cs.map(([c,d])=>`<button type="button" data-ins="${esc(c)}">${esc(c)}${d?`<span>${esc(d)}</span>`:""}</button>`).join("")).join("");return}if(w>=3){$("#manual").innerHTML=manualMore(w).map(([h,cs])=>`<h4>${h}</h4>`+cs.map(([c,d])=>`<button type="button" data-ins="${esc(c)}">${esc(c)}${d?`<span>${esc(d)}</span>`:""}</button>`).join("")).join("");return}
  const W1=[["Status",[["nvidia-smi","GPU status"],["foundry status","memory, speed, cost"],["foundry bench","full benchmark"]]],["Hardware",[["foundry gpu h100",""],["foundry gpu h200",""],["foundry gpu b200",""],["foundry gpu b300",""]]],["Model & precision",[["foundry load llama-70b",""],["foundry dtype fp8",""],["foundry dtype int4","weight-only"],["foundry dtype fp4","Blackwell only"]]],["Workload",[["foundry batch 32","users per step"],["foundry context 8192","tokens per conversation"],["foundry prompt 16384","for first-token time"]]],["Look closer",[["foundry roofline",""],["foundry inspect sm",""],["foundry inspect hbm",""]]]];
  const W2=[["Status",[["nvidia-smi","driver & CUDA version"],["foundry profile","where time goes"]]],["Path",[["foundry trace matmul",""],["foundry inspect libraries",""],["foundry inspect driver",""]]],["Optimise",[["foundry graphs on","CUDA Graphs"],["foundry fuse on","kernel fusion"],["foundry flash on","FlashAttention"],["foundry load llama-8b",""],["foundry mode prefill",""]]],["Containers",[["docker images",""],["docker run --gpus all llm:cuda12.4",""],["sudo apt install nvidia-driver-580",""]]]];
  $("#manual").innerHTML=(w===1?W1:W2).map(([h,cs])=>`<h4>${h}</h4>`+cs.map(([c,d])=>`<button type="button" data-ins="${esc(c)}">${esc(c)}${d?`<span>${esc(d)}</span>`:""}</button>`).join("")).join("")}
function renderGloss(el){el.innerHTML=GLOSS.map(([t,s,d])=>`<div><dt>${esc(t)}<span>${esc(s)}</span></dt><dd>${esc(d)}</dd></div>`).join("")}

/* ============ events ============ */
document.addEventListener("click",e=>{
  const lv=e.target.closest("[data-level]");if(lv){loadLevel(lv.dataset.level);return}
  const ins=e.target.closest("[data-ins]");if(ins){insert(ins.dataset.ins);return}
  const cm=e.target.closest("[data-cmd]");if(cm&&!cm.disabled){exec(cm.dataset.cmd);return}
  const st=e.target.closest("[data-strip]");if(st){G.strip=Number(st.dataset.strip);renderStrip();return}
  const ii=e.target.closest("[data-i]");if(ii&&G.S&&G.mode==="game"){const S=G.S,k=ii.dataset.i;
    if(!S.inspected.includes(k))S.inspected.push(k);S.info=k;
    const box=$("#inspect");if(box)box.innerHTML=infoHtml(k);
    if(S.world===2||S.world===0)renderSim();checkGoals();return}
  const mo=e.target.closest("[data-moe]");if(mo){exec("route "+MOE_TOKS[+mo.dataset.moe].trim());return}
  const qh=e.target.closest("[data-qh]");if(qh){exec("qhead "+(+qh.dataset.qh+1));return}
  const at=e.target.closest("[data-att]");if(at){exec("attend "+at.dataset.att);return}
  const gr=e.target.closest("[data-genrow]");if(gr){exec("generate inspect "+(+gr.dataset.genrow+1));return}
  const cp=e.target.closest("[data-compare]");if(cp){renderCompare();$("#cmpModal").hidden=false;try{$("#cmpClose").focus()}catch(_){}return}
  const q=e.target.closest("[data-q]");if(q&&!q.disabled){const i=+q.dataset.q,j=+q.dataset.o,st2=G.quizState;if(!st2.picked[i].includes(j)){st2.picked[i].push(j);if(j!==G.level.questions[i].a)st2.mistakes++}renderQuiz();return}
});
$("#cmdForm").addEventListener("submit",e=>{e.preventDefault();const i=$("#cmd");run(i.value);i.value=""});
$("#cmd").addEventListener("keydown",e=>{if(e.key==="ArrowUp"){if(G.hi>0){G.hi--;e.target.value=G.hist[G.hi]||""}e.preventDefault()}else if(e.key==="ArrowDown"){if(G.hi<G.hist.length){G.hi++;e.target.value=G.hist[G.hi]||""}e.preventDefault()}});
$("#homeBtn").onclick=()=>show("home");$("#levelsBtn").onclick=()=>show("home");
$("#startBtn").onclick=()=>loadLevel(nextLevelId()||LEVELS[0].id);
$("#hintBtn").onclick=showHint;
$("#restartBtn").onclick=()=>loadLevel(G.level.lab?G.level.id:G.level.id);
$("#manualBtn").onclick=()=>{const m=$("#manual"),open=m.hidden;if(open)renderManual();m.hidden=!open;$("#manualBtn").setAttribute("aria-expanded",String(open))};
$("#glossBtn").onclick=()=>{const m=$("#glossSide"),open=m.hidden;if(open)renderGloss(m);m.hidden=!open;$("#glossBtn").setAttribute("aria-expanded",String(open))};
$("#mathBtn").onclick=()=>setMath(!document.documentElement.classList.contains("math-on"));
$("#dNext").onclick=()=>{$("#modal").hidden=true;const n=LEVELS[G.level.idx+1];if(n)loadLevel(n.id)};
$("#dStay").onclick=()=>{$("#modal").hidden=true};
$("#dLevels").onclick=()=>{$("#modal").hidden=true;show("home")};
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")$("#modal").hidden=true});
$("#cmpClose").onclick=()=>{$("#cmpModal").hidden=true};$("#cmpModal").addEventListener("click",e=>{if(e.target.id==="cmpModal")$("#cmpModal").hidden=true});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("#modal").hidden=true;$("#cmpModal").hidden=true}});
function bindReset(){$("#resetAll").onclick=()=>{$("#resetWrap").innerHTML='<span class="confirm">Erase all stars and XP? <button class="btn" id="resetYes">Erase</button> <button class="btn ghost" id="resetNo">Keep</button></span>';
  $("#resetYes").onclick=()=>{progress=freshProgress();saveProgress();restoreReset();renderHome()};$("#resetNo").onclick=restoreReset}}
function restoreReset(){$("#resetWrap").innerHTML='<button class="btn ghost" id="resetAll">Reset progress</button>';bindReset()}
bindReset();
renderGloss($("#glossList"));
setMath(!!store.get("gf-math",false));
renderHome();
</script>
