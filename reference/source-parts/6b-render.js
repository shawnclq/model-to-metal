<script>
"use strict";
/* ============ extra controls ============ */
function ctrlsMore(S,C,lk){let h="";
  const tog=(k,l,cur,cmdBase)=>seg(l,k,[{v:false,l:"Off",cmd:cmdBase+" off"},{v:true,l:"On",cmd:cmdBase+" on"}],!!cur,lk[k]);
  if(C.includes("srv"))h+=seg("Server","srv",(G.level.srvs||["hgx","pcie"]).map(k=>SERVERS[k]).map(x=>({v:x.key,l:x.short,s:"$"+x.price+"/hr",cmd:"foundry server "+x.key})),S.srv,lk.srv);
  if(C.includes("tp"))h+=seg("Tensor parallel size","tp",TP_STEPS.map(t=>({v:t,l:"TP "+t,s:(8/t)+" replica"+(t<8?"s":""),cmd:"foundry tp "+t})),S.tp,lk.tp);
  if(C.includes("mode4"))h+=seg("Workload","mode",[{v:"serve",l:"Serve",s:"one model, many GPUs",cmd:"foundry mode serve"},{v:"train",l:"Train",s:"data parallel",cmd:"foundry mode train"}],S.mode);
  if(C.includes("layout")&&S.mode==="serve")h+=seg("Layout (relaunches vLLM)","layout",[[16,1],[8,2],[4,4]].map(([t,p])=>({v:t+"x"+p,l:`TP ${t} × PP ${p}`,cmd:`foundry layout ${t}x${p}`})),S.job?S.job.tp+"x"+S.job.pp:"",lk.layout);
  if(C.includes("nodes")&&(S.mode==="train"||C.includes("mode4")))h+=seg("Nodes","nodes",[1,2,4].map(n=>({v:n,l:String(n),s:(n*8)+" GPUs",cmd:"foundry nodes "+n})),S.nodes,lk.nodes);
  if(C.includes("net"))h+=seg("Network","net",Object.values(NETS).map(n=>({v:n.key,l:n.name,s:n.s,cmd:"foundry net "+n.key})),S.net,lk.net);
  if(C.includes("gdr"))h+=tog("gdr","GPUDirect RDMA",S.gdr,"foundry gdr");
  if(C.includes("mig")){
    h+=seg("MIG mode","migmode",[{v:false,l:"Off",cmd:"sudo nvidia-smi -i 0 -mig 0"},{v:true,l:"On",cmd:"sudo nvidia-smi -i 0 -mig 1"}],S.mig.mode);
    const cur=S.mig.share==="mig"?S.mig.inst.join(","):S.mig.share==="timeslice"?"ts":"";
    h+=`<div class="ctl"><span>Layout</span><div class="seg" role="group" aria-label="MIG layout">${MIG_PRESETS.map(p=>`<button type="button" class="${cur===p.v?"on":""}" ${S.mig.mode?"":"disabled"} data-cmd="nvidia-smi mig -cgi ${p.v} -C">${p.l}</button>`).join("")}<button type="button" class="${cur==="ts"?"on":""}" data-cmd="foundry share timeslice">Time-slicing</button></div></div>`}
  return h}

/* ============ MIG ============ */
function renderMIG(){
  const S=G.S;$("#simTitle").textContent="GPU partitions · H100 80GB";$("#simActs").innerHTML="";clearInterval(flickT);
  $("#simCap").innerHTML="An H100 split for sharing. The top row is its 7 <b>compute slices</b> (groups of SMs), the bottom row its 8 <b>memory slices</b> of 10 GB. Each coloured block is one isolated GPU instance.";
  const A=S.mig.share==="mig"?migAssign(S):null;let comp="",mem="";
  if(S.mig.share==="mig"){S.mig.inst.forEach((p,i)=>{const x=MIGP[p],c=TCOL[i%TCOL.length],who=A.inst[i].used;
      comp+=`<div class="mblk" data-i="mig" style="grid-column:span ${x.c};background:${c}">${p}${who?`<small>${esc(who)}</small>`:"<small>unused</small>"}</div>`;
      mem+=`<div class="mblk" data-i="mig" style="grid-column:span ${x.m};background:${c}">${x.gb} GB</div>`});
    const cu=S.mig.inst.reduce((a,p)=>a+MIGP[p].c,0),mu=S.mig.inst.reduce((a,p)=>a+MIGP[p].m,0);
    for(let i=cu;i<7;i++)comp+=`<div class="mblk free">idle</div>`;for(let i=mu;i<8;i++)mem+=`<div class="mblk free">unused</div>`}
  else if(S.mig.share==="timeslice"){comp=`<div class="mblk ts" style="grid-column:span 7">whole GPU · teams take turns</div>`;mem=`<div class="mblk ts" style="grid-column:span 8">80 GB shared by everyone · no limits per team</div>`}
  else{comp=`<div class="mblk one" style="grid-column:span 7">${S.mig.mode?"MIG on · no instances yet":"one GPU, one owner"}</div>`;mem=`<div class="mblk one" style="grid-column:span 8">80 GB</div>`}
  const rows=TENANTS.map(t=>{let st,cls="";
    if(S.mig.share==="mig"){const r=A.res.find(r=>r.t===t);if(r.inst){st=`✓ own ${r.inst.p} (#${r.inst.i})`;cls="ok"}else{st="✗ no instance big enough left";cls="bad"}}
    else if(S.mig.share==="timeslice"){st="shares the whole GPU · no isolation";cls="warn"}
    else{st="waiting for a GPU";cls=""}
    return`<div class="trow ${cls}"><b>${esc(t.n)}</b><span class="need">${t.need} GB</span><span class="ds">${esc(t.d)}</span><span class="st">${st}</span></div>`}).join("");
  $("#simBody").innerHTML=`<div class="w2grid">
   <div><div class="sec-h"><span>Compute slices · 7</span><b>${S.mig.mode?"MIG mode on":"MIG mode off"}</b></div><div class="miggrid c7">${comp}</div></div>
   <div><div class="sec-h"><span>Memory slices · 8 × 10 GB</span></div><div class="miggrid m8">${mem}</div></div>
   <div><div class="sec-h"><span>Teams</span><b>${A?(A.all?"everyone has an instance":A.res.filter(r=>r.inst).length+" of 5 placed"):""}</b></div><div class="tenants">${rows}</div></div>
   <div class="inspect" id="inspect">${S.info==="mig"?infoHtml("mig"):'<span class="tip">Tap an instance to learn how MIG isolates teams. Valid layouts use at most 7 compute and 8 memory slices.</span>'}</div>
  </div>`;
}

/* ============ World 3: HGX board ============ */
function boardSVG(S,M){
  const hgx=S.srv==="hgx"||S.srv==="hgxb200",mesh=!!M.srv.mesh,u=M.tp>1?Math.min(1,.25+M.commShare*1.6):0,dur=Math.max(.3,1.6-u*1.3).toFixed(2);
  let o=`<svg viewBox="0 0 600 290" role="img" aria-label="${esc(M.srv.name)}: 8 GPUs, ${M.rep} replicas of TP ${M.tp}">`;
  o+=`<rect x="4" y="4" width="592" height="282" rx="12" class="pkg"/>`;
  const pos=i=>({x:22+(i%4)*143,y:i<4?18:198,w:127,h:74});
  const lane=(x1,y1,x2,y2,k)=>`<line class="lane${u<.01?" idle":""}" data-i="${k}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="--dur:${dur}s;opacity:${(.3+u*.7).toFixed(2)};stroke-width:${hgx?3:2}"/>`;
  if(mesh){const ctr=i=>{const p=pos(i);return[p.x+p.w/2,i<4?p.y+p.h:p.y]};
    for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){const[a,b]=ctr(i),[c,d]=ctr(j);o+=lane(a,b,c,d,"ifmesh").replace("stroke-width:2","stroke-width:1.4")}
    o+=`<g data-i="ifmesh" style="cursor:pointer"><rect x="215" y="131" width="170" height="28" rx="4" class="die"/><text class="dielbl" x="300" y="149" text-anchor="middle" fill="#DCE8E3">Infinity Fabric mesh</text></g>`}
  else if(hgx){const sw=[0,1,2,3].map(j=>({x:135+j*90,y:128,w:62,h:34}));
    for(let i=0;i<8;i++){const p=pos(i),cx=p.x+p.w/2,cy=i<4?p.y+p.h:p.y;sw.forEach(s=>{o+=lane(cx,cy,s.x+s.w/2,i<4?s.y:s.y+s.h,"nvlink")})}
    sw.forEach(s=>{o+=`<g data-i="nvswitch" style="cursor:pointer"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" class="die"/><text class="dielbl" x="${s.x+s.w/2}" y="${s.y+21}" text-anchor="middle" fill="#DCE8E3">NVSwitch</text></g>`})}
  else{const ps=[{x:70,y:128,w:96,h:34,l:"PCIe switch"},{x:434,y:128,w:96,h:34,l:"PCIe switch"}],cpu=[{x:214,y:128,w:70,h:34,l:"CPU 0"},{x:316,y:128,w:70,h:34,l:"CPU 1"}];
    for(let i=0;i<8;i++){const p=pos(i),s=ps[(i%4)<2?0:1],cx=p.x+p.w/2,cy=i<4?p.y+p.h:p.y;o+=lane(cx,cy,s.x+s.w/2,i<4?s.y:s.y+s.h,"pcie")}
    o+=lane(166,145,214,145,"pcie")+lane(284,145,316,145,"pcie")+lane(386,145,434,145,"pcie");
    [...ps,...cpu].forEach(s=>{o+=`<g data-i="pcie" style="cursor:pointer"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" class="die"/><text class="dielbl" x="${s.x+s.w/2}" y="${s.y+21}" text-anchor="middle" fill="#DCE8E3">${s.l}</text></g>`})}
  for(let i=0;i<8;i++){const p=pos(i),grp=Math.floor(i/M.tp),c=TCOL[grp%TCOL.length],fr=Math.min(1,M.usedPer/M.g.mem);
    o+=`<g data-i="gpu8" style="cursor:pointer"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="var(--panel)" stroke="${c}" stroke-width="2"/><rect x="${p.x}" y="${p.y}" width="${p.w}" height="7" rx="3" fill="${c}"/>`;
    o+=`<text class="chiplbl" x="${p.x+8}" y="${p.y+25}">${M.g.vendor==="amd"?"GPU "+i+" · "+M.g.name:"GPU "+i}</text><text class="chiplbl dim" x="${p.x+p.w-8}" y="${p.y+25}" text-anchor="end">${M.rep>1?"replica "+(grp+1):"TP rank "+i}</text>`;
    o+=`<rect x="${p.x+8}" y="${p.y+38}" width="${p.w-16}" height="11" rx="2" fill="var(--panel-2)" stroke="var(--rule)"/><rect x="${p.x+8}" y="${p.y+38}" width="${((p.w-16)*fr).toFixed(1)}" height="11" rx="2" fill="${M.fits?"var(--wt)":"var(--bad)"}"/>`;
    o+=`<text class="chiplbl dim" x="${p.x+8}" y="${p.y+65}">${f1(M.usedPer)} / ${M.g.mem} GB</text></g>`}
  return o+`</svg>`}
function w3Math(S,M){const m=M.m,L=[],srv=M.srv;
  L.push(`<span class="h">LAYOUT</span>  8 GPUs = ${M.rep} replica${M.rep>1?"s":""} × TP ${M.tp}`);
  L.push(`weights per GPU = ${f1(m.P*M.d.bytes/1e9)} GB ÷ ${M.tp} = ${f1(M.wPer)} GB`);
  L.push(`KV per GPU      = ${S.batch} users × ${f0(S.ctx)} tokens × ${f2(M.kvT/1e6)} MB ÷ ${M.tp} = ${f1(M.kvPer)} GB`);
  L.push(`total per GPU   = ${f1(M.usedPer)} GB of ${M.g.mem} → ${M.fits?"fits":'<span class="r">does not fit</span>'}`);
  L.push("");L.push(`<span class="h">ONE DECODE STEP</span> (per replica, ${S.batch} users)`);
  L.push(`read = ${f1(M.readPer+M.kvPer)} GB per GPU ÷ (${M.g.bw} TB/s × 80%)        = ${fmtT(M.tMem)}`);
  L.push(`math = 2 × ${f1(M.act/1e9)} B × ${S.batch} ÷ ${M.tp} GPUs ÷ (${f0(computeRate(M.g,S.dtype))} × 60%) = ${fmtT(M.tComp)}`);
  L.push(M.tp>1?`talk = ${M.nAR} all-reduces (2 per layer × ${m.L}) × ${f1(M.arDec*1e6)} µs each = ${fmtT(M.tComm)}`:`talk = none (TP 1: GPUs never talk)`);
  if(M.tp>1)L.push(`       each all-reduce: ${f0(S.batch*m.h*2/1e3)} KB over ${srv.short}, ${f0(srv.bw/1e9)} GB/s, ~${f0(srv.lat*1e6)} µs latency`);
  L.push(`step = max(read, math) + talk = ${fmtT(M.step)}  (talk = ${f0(M.commShare*100)}%)`);
  L.push(`per user ${f1(M.perUser)} tok/s · replica ${f0(M.repT)} tok/s · server ${M.rep} × ${f0(M.repT)} = ${f0(M.total)} tok/s`);
  L.push(`cost = $${srv.price}/hr ÷ (${f0(M.total)} × 3,600) × 1M = ${fmtMoney(M.cost)} per 1M tokens`);
  L.push("");L.push(`<span class="h">PREFILL</span> (${f0(S.prompt)}-token prompt)`);
  L.push(`math = ${fmtT(M.preC)} · talk = ${M.nAR} × all-reduce of ${f0(S.prompt*m.h*2/1e6)} MB = ${fmtT(M.preComm)} → first token ${fmtT(M.ttft)}`);
  return`<pre class="mathbox">${L.join("\n")}</pre>`}
function renderW3(){
  const S=G.S,M=w3(S);clearInterval(flickT);$("#simActs").innerHTML="";
  $("#simTitle").textContent=`${M.srv.name} · ${M.m.name}`;
  $("#simCap").innerHTML=`Eight ${M.g.name}s on one board. ${M.srv.mesh?"Every GPU has its own <b>Infinity Fabric</b> link to every other GPU (a mesh, no switch)":S.srv==="pcie"?"GPUs reach each other through <b>PCIe switches</b> and the <b>CPUs</b>":"Each GPU links to all four <b>NVSwitch</b> chips"}. Same colour = one copy of the model (a replica); the bar in each GPU is its memory. Dashes move when GPUs talk.`;
  const t=[["Layout",`${M.rep} × TP ${M.tp}`,M.rep>1?`${M.rep} copies of the model`:"one copy across 8 GPUs"],["Per user",M.fits?f1(M.perUser)+" tok/s":"—","speed each person sees"],["Server",M.fits?f0(M.total)+" tok/s":"—","all replicas combined"],["First token",M.fits?fmtT(M.ttft):"—",`${kfmt(S.prompt)}-token prompt`],["GPUs talking",M.fits?f0(M.commShare*100)+"%":"—","of each decode step"],["Cost",M.fits?fmtMoney(M.cost):"—","per 1M tokens"]];
  $("#simBody").innerHTML=`<div class="w2grid"><div class="chipwrap">${boardSVG(S,M)}</div>
   ${M.fits?"":`<div class="memstat bad">Out of memory: each GPU needs ${f1(M.usedPer)} GB of ${M.g.mem} GB.</div>`}
   <div class="tiles">${t.map(x=>`<div class="tile${M.fits?"":" flag"}"><div class="k">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${x[2]}</div></div>`).join("")}</div>
   <div class="inspect" id="inspect">${S.info?infoHtml(S.info):'<span class="tip">Tap a GPU, an NVSwitch or a link to learn what it does.</span>'}</div>
   ${w3Math(S,M)}</div>`}

/* ============ World 4: cluster ============ */
function clusterSVG(S,info){
  const n=S.nodes,W=640,gap=14,nw=(W-24-gap*(n-1))/n,ny=128,nh=150,net=NETS[S.net];
  const u=info.u,dur=Math.max(.3,1.6-u*1.3).toFixed(2);
  let o=`<svg viewBox="0 0 ${W} 290" role="img" aria-label="${n} servers on ${esc(net.name)}">`;
  o+=`<g data-i="spine" style="cursor:pointer"><rect x="${W/2-150}" y="8" width="300" height="24" rx="4" class="die"/><text class="dielbl" x="${W/2}" y="24" text-anchor="middle" fill="#DCE8E3">spine switches</text></g>`;
  for(let k=0;k<5;k++){const x=W/2-120+k*60;o+=`<line class="lane${u<.01?" idle":""}" data-i="spine" x1="${x}" y1="32" x2="${x}" y2="66" style="--dur:${dur}s;opacity:${(.3+u*.7).toFixed(2)}"/>`}
  o+=`<g data-i="leaf" style="cursor:pointer"><rect x="12" y="66" width="${W-24}" height="24" rx="4" class="die"/><text class="dielbl" x="${W/2}" y="82" text-anchor="middle" fill="#DCE8E3">leaf switches · ${net.rdma?"one per rail (GPU 1–8)":"one Ethernet switch"} · ${esc(net.name)}</text></g>`;
  for(let i=0;i<n;i++){const x=12+i*(nw+gap),host="node-"+(i+1),isHead=S.ray&&S.ray.head===host,isW=S.ray&&S.ray.workers.includes(host),cur=S.host===host;
    const nics=net.key==="eth"?[x+nw/2]:[...Array(8)].map((_,k)=>x+10+k*(nw-20)/7);
    nics.forEach(nx=>{o+=`<line class="lane${u<.01?" idle":""}" data-i="nic" x1="${nx}" y1="${ny}" x2="${nx}" y2="90" style="--dur:${dur}s;opacity:${(.3+u*.7).toFixed(2)};stroke-width:${net.key==="eth"?2:3}"/>`});
    o+=`<g data-i="node" style="cursor:pointer"><rect x="${x}" y="${ny}" width="${nw}" height="${nh}" rx="8" fill="var(--panel)" stroke="${cur?"var(--signal)":"var(--rule)"}" stroke-width="${cur?3:1.5}"/>`;
    o+=`<text class="chiplbl" x="${x+8}" y="${ny+20}">${host}${cur?" · you":""}</text></g>`;
    if(isHead||isW)o+=`<g data-i="rayhead" style="cursor:pointer"><rect x="${x+nw-62}" y="${ny+8}" width="54" height="16" rx="3" fill="${isHead?"var(--sea)":"var(--ok)"}"/><text x="${x+nw-35}" y="${ny+20}" text-anchor="middle" style="font-family:var(--mono);font-size:10px;fill:#fff">${isHead?"ray head":"worker"}</text></g>`;
    nics.forEach(nx=>{o+=`<rect data-i="nic" x="${nx-4}" y="${ny-4}" width="8" height="8" rx="1" fill="var(--signal)" style="cursor:pointer"/>`});
    const cols=4,gw=(nw-24-3*6)/cols,gh=34;
    for(let k=0;k<8;k++){const gx=x+12+(k%4)*(gw+6),gy=ny+34+Math.floor(k/4)*(gh+8),gi=i*8+k;const c=info.color(gi);
      o+=`<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="3" fill="${c||"var(--panel-2)"}" stroke="var(--rule)" data-i="node" style="cursor:pointer"/><text x="${gx+5}" y="${gy+14}" style="font-family:var(--mono);font-size:9.5px;fill:${c?"#fff":"var(--muted)"}">GPU ${k}</text>${info.label?`<text x="${gx+5}" y="${gy+27}" style="font-family:var(--mono);font-size:9px;fill:${c?"#fff":"var(--muted)"}">${info.label(gi)||""}</text>`:""}`}
    o+=`<text class="chiplbl dim" x="${x+8}" y="${ny+nh-10}">8 × H100 · NVLink inside</text>`}
  return o+`</svg>`}
function rayGPUs(S){return S.ray.head?8*(1+S.ray.workers.length):0}
function renderW4(){
  const S=G.S,L=G.level;clearInterval(flickT);$("#simActs").innerHTML="";const net=NETS[S.net];let tiles=[],math=[],info;
  $("#simTitle").textContent=S.mode==="train"?`Training cluster · ${S.nodes} node${S.nodes>1?"s":""} · ${net.name}`:`Cluster · ${S.nodes} nodes · ${net.name}`;
  $("#simCap").innerHTML=`Each box is one 8-GPU server. Yellow squares on top are its NICs (one per GPU on RDMA fabrics); lines run up to the leaf and spine switches. Dashes move with cross-server traffic.${S.mode==="serve"?" GPU colours show pipeline stages.":""}`;
  if(S.mode==="train"){const T=w4train(S);
    info={u:S.nodes>1?Math.min(1,.2+T.inter/T.step*2):0,color:()=>"var(--sea)",label:()=>"DP rank"};
    tiles=[["Step time",fmtT(T.step),`compute ${fmtT(T.c)}`],["Scaling",f1(T.eff*100)+"%",S.nodes>1?`of ideal on ${S.nodes} nodes`:"baseline: one node"],["Throughput",f0(T.tput/1e3)+"k tok/s",`ideal ${f0(T.ideal/1e3)}k`],["Gradient sync",fmtT(T.intra+T.inter),`network part ${fmtT(T.inter)}`],["Per-GPU network",f1(T.bw/1e9)+" GB/s",`${net.rdma?(S.gdr?"RDMA + GPUDirect":"RDMA via CPU memory"):"TCP, no RDMA"}`]];
    math=[`<span class="h">ONE TRAINING STEP</span> · ${T.m.name} · ${S.nodes} × 8 GPUs · ${f0(T.tokGPU)} tokens per GPU`,
     `compute  = 6 × ${f2(T.m.P/1e9)} B × ${f0(T.tokGPU)} tokens ÷ (989 TFLOPS × 45%) = ${fmtT(T.c)}`,
     `gradients = ${f1(T.grad/1e9)} GB (BF16), all-reduced every step`,
     `inside each node (NVLink) = 2 × 7/8 × ${f1(T.grad/1e9)} GB ÷ 450 GB/s = ${fmtT(T.intra)}`,
     S.nodes>1?`across nodes (per rail) = 2 × ${S.nodes-1}/${S.nodes} × ${f1(T.grad/8e9)} GB ÷ ${f1(T.bw/1e9)} GB/s = ${fmtT(T.inter)}`:`across nodes = none (one node)`,
     `   per-GPU bandwidth: ${esc(net.d)}${net.rdma&&!S.gdr?"; without GPUDirect, copies through CPU memory cut it to ~35%":""}`,
     `step = ${fmtT(T.c)} + ${fmtT(T.intra)} + ${fmtT(T.inter)} = ${fmtT(T.step)}`,
     `scaling efficiency = one-node step ÷ this step = ${fmtT(T.one)} ÷ ${fmtT(T.step)} = ${f1(T.eff*100)}%`]}
  else if(S.mode==="serve"){
    const R=S.job?w4serve(S):null;
    info={u:R?Math.min(1,(R.tpSpans?.25+R.commShare*1.5:.12)):0,color:gi=>{if(!R||gi>=R.n)return null;return TCOL[Math.floor(gi/R.tp)%TCOL.length]},label:gi=>!R||gi>=R.n?"":R.pp>1?"stage "+(Math.floor(gi/R.tp)+1):"TP "+gi};
    if(R){tiles=[["TP × PP",`${R.tp} × ${R.pp}`,R.tpSpans?"TP group crosses servers":R.pp>1?"TP inside, PP across":"one server"],["Per user",R.fits?f1(R.perUser)+" tok/s":"—","speed each person sees"],["First token",R.fits?fmtT(R.ttft):"—",`${kfmt(S.prompt)}-token prompt`],["Per GPU",f1(R.usedPer)+" GB","of 80 GB"],["Talking",f0(R.commShare*100)+"%","of each token's time"],["Ray",rayGPUs(S)+" GPUs",S.ray.head?`${1+S.ray.workers.length} node${S.ray.workers.length?"s":""}`:"not started"]];
      math=[`<span class="h">LAYOUT</span> ${R.m.name} ${R.d.name} on TP ${R.tp} × PP ${R.pp} = ${R.n} GPUs`,
       `per GPU = ${f0(R.m.P*R.d.bytes/1e9)} GB ÷ ${R.n} + KV ${f1(R.kvPer)} + 3 = ${f1(R.usedPer)} GB → ${R.fits?"fits":'<span class="r">does not fit</span>'}`,
       `TP all-reduces travel over ${R.tpSpans?'<span class="r">the network ('+esc(R.net.name)+")</span>":"NVLink (inside a server)"}; PP hand-offs ${R.pp>1?"cross the network once per stage":"none"}`,
       "",`<span class="h">ONE TOKEN</span> walks through ${R.pp} stage${R.pp>1?"s":""} in turn`,
       `per stage: read ${fmtT(R.stageRead)} + ${f0(R.m.L/R.pp*2)} all-reduces ${fmtT(R.stageComm)}`,
       `token = ${R.pp} × (${fmtT(R.stageRead)} + ${fmtT(R.stageComm)}) + hand-offs ${fmtT(R.send)} = ${fmtT(R.tok)} → ${f1(R.perUser)} tok/s`,
       "",`<span class="h">PREFILL</span> ${f0(S.prompt)} tokens`,
       `math ${fmtT(R.preC)} + all-reduces ${fmtT(R.preComm)} (${f0(S.prompt*R.m.h*2/1e6)} MB each, ${R.m.L*2} of them) + hand-offs ${fmtT(R.preSend)} = ${fmtT(R.ttft)}`]}
    else tiles=[["Ray",rayGPUs(S)+" GPUs",S.ray.head?`${1+S.ray.workers.length} node${S.ray.workers.length?"s":""} joined`:"not started"],["Model","not running","needs 812 GB: 2 servers"],["You are on",S.host,"ssh node-2 / exit"]]}
  else{info={u:S.flags.ibbw?.6:0,color:()=>null};
    tiles=[["Network",net.name,net.s+" per server"],["Per GPU",f1(net.perGPU/1e9)+" GB/s",net.rdma?"its own NIC (rail)":"shared NIC"],["NVLink per GPU","450 GB/s","each way, inside a server"],["Gap",`${f0(450e9/net.perGPU)}×`,"slower to leave the server"]]}
  $("#simBody").innerHTML=`<div class="w2grid"><div class="tlwrap">${clusterSVG(S,info)}</div>
   <div class="tiles">${tiles.map(x=>`<div class="tile"><div class="k">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${x[2]}</div></div>`).join("")}</div>
   <div class="inspect" id="inspect">${S.info&&INFO[S.info]?infoHtml(S.info):'<span class="tip">Tap a server, a NIC (yellow), a leaf or spine switch, or a Ray badge.</span>'}</div>
   ${math.length?`<pre class="mathbox">${math.join("\n")}</pre>`:""}</div>`}
</script>
