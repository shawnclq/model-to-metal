<script>
"use strict";
/* ============ AMD chiplet package ============ */
function chipSVGamd(S,M){
  const g=M.g,frac=Math.min(1,M.used/g.mem),oom=!M.fits,u=M.fits?M.bwUtil:0,dur=Math.max(.35,1.7-u*1.6).toFixed(2);
  let o=`<svg viewBox="0 0 600 300" role="img" aria-label="${esc(g.name)} package: 8 compute chiplets, ${g.cus} CUs, 8 HBM stacks, memory ${Math.round(frac*100)}% full">`;
  o+=`<rect x="8" y="8" width="584" height="284" rx="16" class="pkg"/>`;
  const area={x:168,y:44,w:264,h:206},st=[];
  [0,1,2,3].forEach(i=>{st.push({x:56,y:44+i*53,w:96,h:45,side:"l"});st.push({x:448,y:44+i*53,w:96,h:45,side:"r"})});
  st.forEach(s=>{const cy=s.y+s.h/2,x1=s.side==="l"?s.x+s.w+3:s.x-3,x2=s.side==="l"?area.x-2:area.x+area.w+2;
    o+=`<line class="lane${u<.01?" idle":""}" data-i="bw" x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" style="--dur:${dur}s;opacity:${(.3+u*.85).toFixed(2)}"><title>Memory bandwidth</title></line>`;
    const fh=Math.max(0,s.h-4)*frac;
    o+=`<g class="stack${oom?" oom":""}" data-i="hbm"><title>${g.hbm} stack · ${g.stackGB} GB</title><rect class="shell" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4"/><rect class="fill" x="${s.x+2}" y="${(s.y+s.h-2-fh).toFixed(1)}" width="${s.w-4}" height="${fh.toFixed(1)}" rx="2"/><text class="stklbl" x="${s.x+6}" y="${s.y+14}">${g.stackGB} GB</text></g>`});
  o+=`<rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" rx="4" fill="var(--die-edge)" opacity=".55"/>`;
  const xw=(area.w-6*5)/4,xh=(area.h-24-6*3)/2,cols=g.cuPhys===40?5:6,rows=Math.ceil(g.cuPhys/cols);
  for(let k=0;k<8;k++){const x=area.x+6+(k%4)*(xw+6),y=area.y+6+Math.floor(k/4)*(xh+6);
    o+=`<rect class="die" data-i="xcd" x="${x}" y="${y}" width="${xw}" height="${xh}" rx="2"><title>XCD ${k}</title></rect>`;
    const gap=1.5,cw=(xw-6-gap*(cols-1))/cols,ch=(xh-18-gap*(rows-1))/rows;
    for(let i=0;i<g.cuPhys;i++){const c=i%cols,r=Math.floor(i/cols),dis=i>=g.cuPerXcd;
      o+=`<rect class="sm${dis?" dis":""}" ${dis?"":'data-i="cu"'} x="${(x+3+c*(cw+gap)).toFixed(1)}" y="${(y+3+r*(ch+gap)).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx=".8"/>`}
    o+=`<text class="dielbl" x="${x+3}" y="${y+xh-4}" fill="#DCE8E3">XCD ${k}</text>`}
  o+=`<text class="dielbl" x="${area.x+6}" y="${area.y+area.h-6}" fill="#DCE8E3">8 compute chiplets on 4 I/O dies · ${g.cus} CUs · ${g.cus*4} Matrix Cores</text>`;
  o+=`<text class="chiplbl" x="22" y="276">${esc(g.name)} · AMD ${esc(g.arch)} · ${g.mem} GB ${g.hbm} · ${g.bw} TB/s · ${f0(g.fp8)} TFLOPS FP8${g.fp4?" · "+f0(g.fp4)+" FP4":""}</text>`;
  if(oom)o+=`<text class="chiplbl" x="400" y="34" style="fill:var(--bad);font-weight:600">OUT OF MEMORY</text>`;
  return o+`</svg>`}

/* ============ capstone: pick the GPU ============ */
const WL={
 chat:{t:"Busy chatbot",d:"Llama 3.1 70B FP8 · 64 users at once · 4k context",set:{model:"llama-70b",dtype:"fp8",batch:64,ctx:4096,prompt:2048,kvdt:"bf16"},
  req:[["Fits in memory",M=>M.fits,"not enough memory"],["At least 25 tokens/s per user",M=>M.fits&&M.perUser>=25,"too slow per user"],["At most $0.60 per 1M tokens",M=>M.fits&&M.cost<=.6,"too costly per token"]],
  why:"Limited by memory capacity (64 conversations of KV cache) and cost per token. Hopper runs out of memory; the B300 costs too much per token for what it adds."},
 doc:{t:"Contract Q&A",d:"Llama 3.1 70B FP8 · 16k-token prompts · 1 user at a time",set:{model:"llama-70b",dtype:"fp8",batch:1,ctx:32768,prompt:16384,kvdt:"bf16"},
  req:[["Fits in memory",M=>M.fits,"not enough memory"],["First token in at most 1.5 s",M=>M.fits&&M.ttft<=1.5,"first token too slow"],["At most $6.00 per GPU-hour",M=>M.g.price<=6,"over $6/hr"]],
  why:"Limited by compute: reading a long prompt is prefill. Only the newest generations (Blackwell, CDNA 4) have the FP8 math, and the B300's extra memory isn't worth its price here."},
 moe:{t:"Frontier MoE",d:"Qwen3 235B-A22B FP8 · 4 users · 8k context · one GPU",set:{model:"qwen-235b",dtype:"fp8",batch:4,ctx:8192,prompt:2048,kvdt:"bf16"},
  req:[["Fits on one GPU",M=>M.fits,"doesn't fit"],["At least 50 tokens/s per user",M=>M.fits&&M.perUser>=50,"too slow per user"]],
  why:"Limited by memory capacity: 235 GB of experts must be resident. Only GPUs with 256 GB or more qualify; after that, bandwidth sets the speed."}
};
function wlCheck(S,key,gpu){const T=Object.assign({},S,WL[key].set,{gpu:gpu||S.gpu});const M=w1(T);return{M,res:WL[key].req.map(r=>[r[0],!!r[1](M),r[2]]),ok:WL[key].req.every(r=>r[1](M))}}
function pickHtml(S){const all=Object.keys(WL).every(k=>S.picks[k]);
  let h=`<div class="picks">${Object.entries(WL).map(([k,w])=>{const c=wlCheck(S,k),cur=S.wl===k,p=S.picks[k];
    return`<button type="button" class="pick${cur?" cur":""}${p?" done":""}" data-cmd="foundry workload ${k}"><span class="pt">${esc(w.t)}</span><span class="pd">${esc(w.d)}</span>
      ${cur?`<span class="pr">${c.res.map(r=>`<i class="${r[1]?"y":"n"}">${r[1]?"✓":"✗"} ${esc(r[0])}</i>`).join("")}</span>`:""}
      <span class="pp">${p?`Picked: <b>${esc(GPUS[p].name)}</b>`:cur?"Choose a GPU, then foundry pick":"Tap to load this workload"}</span></button>`}).join("")}</div>`;
  if(all)h+=`<div class="sec-h" style="margin-top:12px"><span>Every GPU against every workload</span><b>✓ = meets all requirements</b></div><div class="tlwrap"><table class="cmp mini"><thead><tr><th>GPU</th>${Object.values(WL).map(w=>`<th>${esc(w.t)}</th>`).join("")}</tr></thead><tbody>${ALL_GPUS.map(g=>`<tr><th>${esc(GPUS[g].name)}</th>${Object.keys(WL).map(k=>{const c=wlCheck(S,k,g);return`<td class="${c.ok?"y":"n"}">${c.ok?"✓":"✗ "+esc((c.res.find(r=>!r[1])||["","",""])[2])}</td>`}).join("")}</tr>`).join("")}</tbody></table></div>`;
  return h}

/* ============ Compare GPUs panel ============ */
function cmpBest(vals,hi=true){const v=vals.filter(x=>typeof x==="number");const b=hi?Math.max(...v):Math.min(...v);return x=>x===b}
function renderCompare(){
  const gs=ALL_GPUS.map(k=>GPUS[k]);
  const lv=t=>{const l=LEVELS.find(x=>x.title===t);return l?`<button type="button" class="lvlink" data-level="${l.id}">W${l.world}·L${l.n}</button>`:""};
  const row=(label,fn,num,hi,link)=>{const vals=gs.map(fn);const best=num?cmpBest(vals,hi):()=>false;return`<tr><th>${label}${link?" "+link:""}</th>${vals.map(v=>`<td class="${best(v)?"best":""}">${typeof v==="number"?(Number.isInteger(v)?f0(v):String(v)):v}</td>`).join("")}</tr>`};
  const t=`<div class="tlwrap"><table class="cmp"><thead><tr><th></th>${gs.map(g=>`<th class="${g.vendor}">${esc(g.name)}<small>${g.vendor==="amd"?"AMD":"NVIDIA"} · ${esc(g.arch)}</small></th>`).join("")}</tr></thead><tbody>
   ${row("Memory (GB)",g=>g.mem,true,true,lv("Room to talk"))}
   ${row("Memory type",g=>g.hbm,false)}
   ${row("Bandwidth (TB/s)",g=>g.bw,true,true,lv("Fast chip, slow tokens"))}
   ${row("BF16 TFLOPS",g=>g.bf16,true,true)}
   ${row("FP8 TFLOPS",g=>g.fp8,true,true,lv("Two speeds"))}
   ${row("FP4 TFLOPS",g=>g.fp4||"—",true,true)}
   ${row("Compute blocks",g=>g.vendor==="amd"?`${g.cus} CUs on 8 chiplets`:`${g.sms} SMs on ${g.dies} die${g.dies>1?"s":""}`,false)}
   ${row("GPU-to-GPU link",g=>g.link,false,true,lv("Meet the HGX board"))}
   ${row("Power (W)",g=>g.tdp,true,false,lv("Watts per token"))}
   ${row("Cooling",g=>g.tdp>1000?"liquid":"air or liquid",false)}
   ${row("Software",g=>g.vendor==="amd"?"ROCm · HIP · RCCL":"CUDA · cuBLAS · NCCL",false,true,lv("Team red"))}
   ${row("Price here ($/hr)",g=>"$"+f2(g.price),false)}
  </tbody></table></div>`;
  $("#cmpBody").innerHTML=`<p class="map-cap">Peak dense figures from vendor data sheets (sparse figures are 2× and rarely reachable). B200 memory is the usable 180 GB of 192. Hourly prices are this game's illustrative numbers, not quotes. Green marks the best in each row; the L-buttons open the level where that row matters.</p>
   ${t}
   <div class="cmpgrid">
    <div><h4>NVIDIA, generation by generation</h4><ul>
     <li><b>H100 → H200:</b> the same Hopper chip with more and faster memory (HBM3e). Wins wherever memory is the limit; no faster for prompt reading.</li>
     <li><b>H200 → B200:</b> new Blackwell architecture: two dies acting as one GPU, ~2.3× FP8 math, new FP4, 8 TB/s, NVLink 5 at twice the speed, and 1,000 W.</li>
     <li><b>B200 → B300:</b> Blackwell Ultra: 288 GB and more FP4 math, same bandwidth, 1,400 W and liquid cooling.</li>
     <li><b>Rack scale:</b> GB200/GB300 NVL72 puts 72 GPUs on one NVLink domain instead of 8.</li></ul></div>
    <div><h4>AMD, generation by generation</h4><ul>
     <li><b>MI300X:</b> CDNA 3, built from 8 compute chiplets. Its 192 GB was the most memory per GPU when it launched, at H100-class compute.</li>
     <li><b>MI325X:</b> the same chip with 256 GB of HBM3e and 6 TB/s: AMD's version of the H100 → H200 step.</li>
     <li><b>MI355X:</b> CDNA 4: ~2× FP8 math, FP4 and FP6, 288 GB at 8 TB/s, 1,400 W and liquid cooling. Its specs sit alongside B300.</li>
     <li><b>Next:</b> the MI400 series (432 GB HBM4) and the 72-GPU Helios rack, AMD's answer to NVL72.</li></ul></div>
    <div><h4>Reading a spec sheet</h4><ul>
     <li>Match the spec to the bottleneck: memory GB for model + users, TB/s for token speed, TFLOPS for long prompts and big batches.</li>
     <li>Check whether TFLOPS are <b>dense or sparse</b>, and which precision.</li>
     <li>Check the <b>GPU-to-GPU link</b> if a model spans GPUs, and the <b>power and cooling</b> your racks can take.</li>
     <li>Software decides how much of the peak you actually get. Benchmark your model, on your inference engine, on both vendors.</li></ul></div>
    <div><h4>Beyond GPUs</h4><ul>
     <li><b>Google TPU</b> (latest: Ironwood, 192 GB HBM per chip): built only for AI, available only in Google Cloud, joined into pods of thousands of chips. Programmed with JAX or PyTorch/XLA.</li>
     <li><b>AWS Trainium</b>: Amazon's own training and inference chips, available only on AWS, programmed with the Neuron SDK.</li>
     <li>These trade portability for price and scale: your code and skills don't move to another cloud as easily.</li></ul></div>
   </div>`;
}
</script>
