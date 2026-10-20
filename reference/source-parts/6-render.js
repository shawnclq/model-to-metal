<script>
"use strict";
/* ============ world 1 visuals ============ */
const DIS_H=[7,19,30,44,51,66,78,85,99,110,122,137];
function chipSVG(S,M){
  if(M.g.vendor==="amd")return chipSVGamd(S,M);
  const g=M.g,frac=Math.min(1,M.used/g.mem),oom=!M.fits;
  const u=M.fits?M.bwUtil:0,dur=Math.max(.35,1.7-u*1.6).toFixed(2);
  let o=`<svg viewBox="0 0 600 300" role="img" aria-label="${esc(g.name)} package: ${g.sms} SMs, ${g.active} HBM stacks, memory ${Math.round(frac*100)}% full">`;
  o+=`<rect x="8" y="8" width="584" height="284" rx="16" class="pkg"/>`;
  const dies=g.dies===1?[{x:205,y:44,w:190,h:206}]:[{x:168,y:44,w:128,h:206},{x:304,y:44,w:128,h:206}];
  const st=[];
  if(g.dies===1){[0,1,2].forEach(i=>{st.push({x:112,y:44+i*72,w:78,h:62,side:"l"});st.push({x:410,y:44+i*72,w:78,h:62,side:"r"})})}
  else{[0,1,2,3].forEach(i=>{st.push({x:56,y:44+i*53,w:96,h:45,side:"l"});st.push({x:448,y:44+i*53,w:96,h:45,side:"r"})})}
  st.forEach((s,i)=>{const dummy=i>=g.active*1&&g.active<g.stacks&&i===st.length-1;
    const cy=s.y+s.h/2,x1=s.side==="l"?s.x+s.w+3:s.x-3,x2=s.side==="l"?(g.dies===1?dies[0].x-2:dies[0].x-2):(g.dies===1?dies[0].x+dies[0].w+2:dies[1].x+dies[1].w+2);
    if(!dummy)o+=`<line class="lane${u<.01?" idle":""}" data-i="bw" x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" style="--dur:${dur}s;opacity:${(.3+u*.85).toFixed(2)}"><title>Memory bandwidth</title></line>`;
    const fh=dummy?0:Math.max(0,s.h-4)*frac;
    o+=`<g class="stack${oom?" oom":""}${dummy?" dummy":""}" data-i="hbm"><title>${dummy?"Spacer (no memory)":g.hbm+" stack · "+g.stackGB+" GB"}</title><rect class="shell" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4"/>`;
    if(!dummy)o+=`<rect class="fill" x="${s.x+2}" y="${(s.y+s.h-2-fh).toFixed(1)}" width="${s.w-4}" height="${fh.toFixed(1)}" rx="2"/><text class="stklbl" x="${s.x+6}" y="${s.y+14}">${g.stackGB} GB</text>`;
    else o+=`<text class="chiplbl dim" x="${s.x+8}" y="${s.y+s.h/2+4}">spacer</text>`;
    o+=`</g>`});
  const perDie=g.smPhys/g.dies,enabled=g.sms/g.dies;
  dies.forEach((d,di)=>{
    o+=`<rect class="die" data-i="sm" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="3"><title>GPU die</title></rect>`;
    const cols=g.dies===1?12:8,rows=Math.ceil(perDie/cols),gap=2,cw=(d.w-12-gap*(cols-1))/cols,ch=(d.h-30-gap*(rows-1))/rows;
    let drawn=0;
    for(let i=0;i<perDie;i++){const c=i%cols,r=Math.floor(i/cols);const x=d.x+6+c*(cw+gap),y=d.y+6+r*(ch+gap);
      let dis=false;if(g.dies===1)dis=DIS_H.includes(i);else dis=i>=enabled;
      if(!dis)drawn++;
      o+=`<rect class="sm${dis?" dis":""}" ${dis?"":'data-i="sm"'} x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="1"/>`}
    o+=`<text class="dielbl" x="${d.x+6}" y="${d.y+d.h-8}" fill="#DCE8E3">${g.dies===1?g.sms+" SMs · 528 Tensor Cores":"die "+(di+1)+" · "+enabled+" SMs"}</text>`});
  if(g.dies===2)o+=`<rect class="linkbar" data-i="link" x="297" y="110" width="6" height="80" rx="2"><title>Die-to-die link</title></rect>`;
  o+=`<text class="chiplbl" x="22" y="276">${esc(g.name)} · ${esc(g.arch)} · ${g.mem} GB ${g.hbm} · ${g.bw} TB/s · ${f0(g.fp8)} TFLOPS FP8${g.fp4?" · "+f0(g.fp4)+" FP4":""}</text>`;
  if(oom)o+=`<text class="chiplbl" x="400" y="34" fill="var(--bad)" style="fill:var(--bad);font-weight:600">OUT OF MEMORY</text>`;
  return o+`</svg>`;
}
let flickT=null,curUtil=0;
function startFlicker(){clearInterval(flickT);const reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paint=()=>{const cells=document.querySelectorAll("#simBody rect.sm:not(.dis)");if(!cells.length)return;const p=curUtil;
    if(reduce){const n=Math.round(cells.length*p);cells.forEach((c,i)=>c.classList.toggle("on",i<n));return}
    cells.forEach(c=>c.classList.toggle("on",Math.random()<p))};
  paint();flickT=setInterval(paint,320)}

function roofSVG(S,M){
  const g=M.g,W=600,H=270,ml=56,mr=18,mt=18,mb=42;
  const xmin=.5,xmax=16384,ymin=.5,ymax=Math.pow(10,Math.ceil(Math.log10(M.peakTF*1.8)));
  const L10=Math.log10,lx=v=>ml+(L10(v)-L10(xmin))/(L10(xmax)-L10(xmin))*(W-ml-mr),ly=v=>H-mb-(L10(Math.max(v,ymin))-L10(ymin))/(L10(ymax)-L10(ymin))*(H-mt-mb);
  let o=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Roofline chart">`;
  [1,10,100,1000,10000].forEach(x=>{o+=`<line class="ax" x1="${lx(x)}" y1="${mt}" x2="${lx(x)}" y2="${H-mb}"/><text class="axt" x="${lx(x)}" y="${H-mb+14}" text-anchor="middle">${f0(x)}</text>`});
  for(let y=1;y<=ymax;y*=10){o+=`<line class="ax" x1="${ml}" y1="${ly(y)}" x2="${W-mr}" y2="${ly(y)}"/><text class="axt" x="${ml-6}" y="${ly(y)+3}" text-anchor="end">${f0(y)}</text>`}
  o+=`<text class="axt" x="${(ml+W-mr)/2}" y="${H-8}" text-anchor="middle">arithmetic intensity: FLOPs per byte read from HBM (log)</text>`;
  o+=`<text class="axt" x="14" y="${(mt+H-mb)/2}" text-anchor="middle" transform="rotate(-90 14 ${(mt+H-mb)/2})">TFLOPS achieved (log)</text>`;
  const ridge=M.ridge;
  o+=`<polyline class="roof" points="${lx(xmin)},${ly(g.bw*xmin)} ${lx(ridge)},${ly(M.peakTF)} ${lx(xmax)},${ly(M.peakTF)}"/>`;
  o+=`<line class="ridge" x1="${lx(ridge)}" y1="${ly(M.peakTF)}" x2="${lx(ridge)}" y2="${H-mb}"/>`;
  o+=`<text class="axt" x="${lx(ridge)+5}" y="${H-mb-6}">ridge ≈ ${f0(ridge)}</text>`;
  o+=`<text class="zone" x="${lx(2)+12}" y="${ly(g.bw*2)+18}">memory roof: ${g.bw} TB/s</text>`;
  o+=`<text class="zone" x="${lx(ridge)+8}" y="${ly(M.peakTF)-6}">compute roof: ${f0(M.peakTF)} TFLOPS ${DTYPES[S.dtype].name}</text>`;
  if(M.fits){
    const px=lx(Math.min(xmax,Math.max(xmin,M.I))),py=ly(M.achTF);
    o+=`<circle class="pt-dec" cx="${px}" cy="${py}" r="7"/><text class="ptl" x="${px+10}" y="${py+16}">decode · ${S.batch} user${S.batch>1?"s":""} · ${f1(M.achTF)} TFLOPS</text>`;
    const qx=lx(Math.min(xmax,M.preI)),qy=ly(M.preTF);
    o+=`<circle class="pt-pre" cx="${qx}" cy="${qy}" r="7"/><text class="ptl" x="${qx+10}" y="${qy+22}" text-anchor="end">prefill · ${kfmt(S.prompt)}-token prompt</text>`;
  }
  return o+`</svg>`;
}
function infoHtml(id){const x=INFO[id];if(!x)return`<span class="tip">Tap part of the chip to learn what it does: the small squares (SMs), the stacks beside the die (HBM), or the moving dashes (bandwidth).</span>`;return`<b>${esc(x.t)}</b>${esc(x.d)}<div class="tip" style="margin-top:4px">${esc(x.tip)}</div>`}

function w1Math(S,M){
  const g=M.g,m=M.m,d=M.d,kvMB=M.kvT/1e6;
  const L=[];
  L.push(`<span class="h">MEMORY</span>`);
  L.push(`Weights   = ${f1(m.P/1e9)} B params × ${d.bytes} byte${d.bytes===1?"":"s"} (${d.name})${" ".repeat(Math.max(1,14-d.name.length))}= ${f1(M.wGB)} GB`);
  L.push(`KV cache  = ${S.batch} user${S.batch>1?"s":""} × ${f0(S.ctx)} tokens × ${f2(kvMB)} MB/token = ${f1(M.kvGB)} GB`);
  L.push(`            (${f2(kvMB)} MB = 2 [K,V] × ${m.L} layers × ${m.kvh} KV heads × ${m.hd} dims × ${M.kvd.f===1?"2 bytes":"1 byte (FP8 KV)"})`);
  L.push(`Runtime   ≈ ${RESERVE} GB (CUDA context, activations, workspace)`);
  L.push(`Total     = ${f1(M.used)} GB  vs  ${g.mem} GB on ${g.name}  → ${M.fits?"fits":'<span class="r">does not fit</span>'}`);
  if(M.fp4bad)L.push(`<span class="r">FP4 needs Blackwell Tensor Cores. Hopper has no FP4 math.</span>`);
  L.push("");
  L.push(`<span class="h">ONE DECODE STEP</span> (one new token for every user)`);
  if(m.moe)L.push(`experts touched = 1 − (1 − ${m.moe.k}/${m.moe.E})^${S.batch} = ${f0(M.touched*100)}% of ${f0(m.moe.expTotal/1e9)} B expert params; + ${f0(m.moe.nonExp/1e9)} B shared → read ${f1(M.readGB)} GB of weights`);
  L.push(`read  = ${f1((M.readGB+M.kvGB))} GB ÷ (${g.bw} TB/s × ${MEM_EFF*100}% achievable)  = ${fmtT(M.tMem)}`);
  L.push(`math  = 2 × ${f1(M.act/1e9)} B${m.moe?" active":""} × ${S.batch} = ${f1(M.flops/1e12)} TFLOP ÷ (${f0(M.peakTF)} TFLOPS × ${DEC_EFF*100}%) = ${fmtT(M.tComp)}${S.dtype==="int4"?"   (INT4 is weight-only: math runs at BF16 speed)":""}`);
  L.push(`step  = the slower of the two = ${fmtT(M.step)} → <span class="h">${M.bound}-bound</span>`);
  L.push(`Per user    = 1 ÷ ${fmtT(M.step)} = ${f1(M.perUser)} tok/s`);
  L.push(`Throughput  = ${S.batch} × ${f1(M.perUser)} = ${f0(M.total)} tok/s`);
  L.push(`Cost        = $${f2(g.price)}/hr ÷ (${f0(M.total)} tok/s × 3,600 s) × 1M = ${fmtMoney(M.cost)} per 1M tokens`);
  L.push(`Power       ≈ ${f0(g.tdp)} W rated × (14% + 42% × ${f0(M.bwUtil*100)}% bandwidth + 50% × ${f1(M.compUtil*100)}% math) = ${f0(M.power)} W (rough)`);
  L.push(`Energy      = ${f0(M.total)} tok/s × 3,600 ÷ ${f2(M.power/1000)} kW = ${f1(M.tpk/1e6)} M tokens per kWh`);
  L.push(`Intensity   = ${f1(M.flops/1e12)} TFLOP ÷ ${f1(M.bytes/1e9)} GB = ${f1(M.I)} FLOPs/byte (ridge ${f0(M.ridge)})`);
  L.push("");
  L.push(`<span class="h">PREFILL</span> (reading a ${f0(S.prompt)}-token prompt)`);
  L.push(`linear layers = 2 × ${f1(M.act/1e9)} B × ${f0(S.prompt)} = ${f1(M.preFl/1e15)} PFLOP ÷ (${f0(M.peakTF)} × ${PRE_EFF*100}%) = ${fmtT(M.preG)}`);
  L.push(`attention     = 2 × ${f0(S.prompt)}² × ${m.h} × ${m.L} layers = ${f2(M.attFl/1e15)} PFLOP ÷ (${f0(g.bf16)} BF16 × ${ATT_EFF*100}%) = ${fmtT(M.preA)}`);
  L.push(`first token   ≈ ${fmtT(M.ttft)}`);
  return `<pre class="mathbox">${L.join("\n")}</pre>`;
}
function renderW1(){
  const S=G.S,L=G.level;if(L.panels.includes("mig")){renderMIG();return}const M=w1(S);curUtil=M.fits?M.compUtil:0;
  const g=M.g,pct=x=>Math.max(0,Math.min(100,x)).toFixed(1);
  const cap=g.mem,scale=Math.max(cap,M.used);
  const wP=M.wGB/scale*100,kP=M.kvGB/scale*100,rP=RESERVE/scale*100,xP=M.used>cap?(M.used-cap)/scale*100:0;
  /* draw bar: weights, kv, reserve; overflow region hatched beyond capacity */
  let bar=`<div class="membar" role="img" aria-label="Memory ${f1(M.used)} of ${cap} GB"><span class="w" style="width:${pct(Math.min(wP,100-xP))}%"></span><span class="k" style="width:${pct(Math.max(0,Math.min(kP,100-xP-Math.min(wP,100-xP))))}%"></span><span class="r" style="width:${pct(Math.max(0,Math.min(rP,100-xP-wP-kP)))}%"></span>${xP?`<span class="x" style="width:${pct(xP)}%;margin-left:auto"></span>`:""}</div>`;
  const tiles=[
   ["Per user",M.fits?f1(M.perUser)+" tok/s":"—","speed each person sees"],
   ["Throughput",M.fits?f0(M.total)+" tok/s":"—","all users combined"],
   ["First token",M.fits?fmtT(M.ttft):"—",`for a ${kfmt(S.prompt)}-token prompt`],
   ["Cost",M.fits?fmtMoney(M.cost):"—","per 1M output tokens"],
   ["Power",M.fits?f0(M.power)+" W":"—",M.fits?`${f1(M.tpk/1e6)}M tokens per kWh`:`rated ${f0(g.tdp)} W`],
   ["Model reads",M.fits?f0(M.readGB)+" GB":"—",M.m.moe?`per step · ${f0(M.touched*100)}% of experts`:"of weights per step"]
  ];
  const showRoof=L.panels.includes("roof")&&S.showRoof;
  $("#simActs").innerHTML=`<button class="btn" type="button" data-compare="1">Compare GPUs</button> `+(L.panels.includes("roof")?`<button class="btn${S.showRoof?" primary":""}" type="button" data-cmd="foundry roofline${S.showRoof?" off":""}">${S.showRoof?"Hide roofline":"Roofline"}</button>`:"");
  $("#simBody").innerHTML=(L.panels.includes("pick")?pickHtml(S):"")+`<div class="simgrid">
   <div><div class="chipwrap">${chipSVG(S,M)}</div><div class="inspect" id="inspect">${infoHtml(S.info)}</div></div>
   <div class="side">
    <div><div class="sec-h"><span>HBM memory</span><b>${f1(M.used)} / ${cap} GB</b></div>${bar}
     <div class="memleg"><span><i style="background:var(--wt)"></i>Weights ${f1(M.wGB)} GB</span><span><i style="background:var(--kv)"></i>KV cache${M.kvd.f<1?" (FP8)":""} ${f1(M.kvGB)} GB</span><span><i style="background:var(--rsv)"></i>Runtime ${RESERVE} GB</span></div>
     ${M.fits?`<div class="memstat">${f1(cap-M.used)} GB free</div>`:`<div class="memstat bad">${M.fp4bad?"FP4 isn't supported on "+g.arch+" GPUs":"Out of memory: needs "+f1(M.used)+" GB, has "+cap+" GB"}</div>`}</div>
    <div class="quality"><span class="pill">${esc(M.d.name)}</span>${esc(M.d.q)} · <span class="pill">${esc(M.m.name)}</span>${M.m.moe?"MoE, "+f0(M.act/1e9)+"B active · ":""}${S.batch} user${S.batch>1?"s":""} × ${kfmt(S.ctx)} context</div>
    <div class="tiles">${tiles.map(t=>`<div class="tile${M.fits?"":" flag"}"><div class="k">${t[0]}</div><div class="v">${t[1]}</div><div class="s">${t[2]}</div></div>`).join("")}</div>
    <div class="meters">
     <div class="meter"><span>HBM bandwidth in use</span><b>${M.fits?pct(M.bwUtil*100)+"%":"—"}</b><div class="bar"><span style="width:${M.fits?pct(M.bwUtil*100):0}%"></span></div></div>
     <div class="meter t"><span>Tensor Core math in use</span><b>${M.fits?pct(M.compUtil*100)+"%":"—"}</b><div class="bar"><span style="width:${M.fits?pct(M.compUtil*100):0}%"></span></div></div>
     <div>${M.fits?`<span class="pill ${M.bound==="memory"?"mem":"cmp"}">${M.bound==="memory"?"Memory-bound":"Compute-bound"}</span> <span class="mathhint">Turn on Show the math to see why.</span>`:`<span class="pill bad">Not running</span>`}</div>
    </div>
   </div></div>
   <div style="margin-top:14px">${w1Math(S,M)}</div>
   ${showRoof?`<div class="roofsec"><div class="sec-h"><span>Roofline · ${esc(g.name)} · ${esc(DTYPES[S.dtype].name)}</span><b>blue = decode, yellow = prefill</b></div><div style="overflow-x:auto">${roofSVG(S,M)}</div><p class="map-cap" style="margin:6px 0 0">Anything left of the ridge is limited by memory bandwidth (the sloped roof). Right of it, by Tensor Core speed (the flat roof). More users per step moves decode right; a long prompt already sits far right.</p></div>`:""}`;
  startFlicker();
}

/* ============ world 2 visuals ============ */
function stackHtml(S){
  return `<div class="stackdiag">${STACK2.map((r,i)=>`<button type="button" class="srow${S.traceAt===i?" lit":""}${S.inspected.includes(r.id)?" seen":""}${r.boundary?" boundary":""}" data-i="${r.id}"><span class="i">${r.i}</span><span><span class="lyr">${esc(r.lyr)}</span><span class="nm">${esc(r.name)}</span><span class="tg">${esc(r.tag)}</span><code>${esc(r.id==="driver"?`driver ${S.driver} queues the launch on the GPU's command stream`:r.code)}</code></span></button>`).join("")}</div>
  <div class="inspect" id="inspect">${S.info&&INFO[S.info]&&STACK2.some(r=>r.id===S.info)?infoHtml(S.info):'<span class="tip">Tap a row to see what that layer does. Rows 1–4 ship inside your container image; the line above row 5 is where the host begins.</span>'}</div>`;
}
function tlSVG(S,R){
  const W=640,H=150,ml=44,mr=10;let o=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kernel timeline"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--bad)" stroke-width="2" opacity=".5"/></pattern></defs>`;
  let ks,span,unit,cpu=[];
  if(S.mode==="prefill"){ks=R.layer;span=ks[ks.length-1].e;unit="ms"}
  else{const endIdx=R.ks.findIndex(k=>k.layerEnd===1);ks=R.ks.slice(0,endIdx+1);span=Math.max(ks[ks.length-1].e,S.graphs?GRAPH_LAUNCH:0);unit="µs";cpu=S.graphs?[[0,GRAPH_LAUNCH]]:R.cpu.slice(0,ks.length).filter(c=>c[0]<span)}
  const sx=t=>ml+t/span*(W-ml-mr);
  const yC=26,yG=78,hL=26;
  o+=`<text class="tl-lane" x="4" y="${yC+17}">CPU</text><text class="tl-lane" x="4" y="${yG+17}">GPU</text>`;
  o+=`<rect x="${ml}" y="${yC}" width="${W-ml-mr}" height="${hL}" fill="var(--panel-2)" stroke="var(--rule)"/><rect x="${ml}" y="${yG}" width="${W-ml-mr}" height="${hL}" fill="url(#hatch)" stroke="var(--rule)"/>`;
  if(S.mode==="prefill")o+=`<text class="tl-lane" x="${ml+6}" y="${yC+17}">launches take microseconds; each kernel below runs for milliseconds</text>`;
  else if(S.graphs)o+=`<rect class="tl-graph" x="${sx(0)}" y="${yC+2}" width="${Math.max(2,sx(GRAPH_LAUNCH)-sx(0))}" height="${hL-4}"/><text class="tl-lane" x="${sx(GRAPH_LAUNCH)+6}" y="${yC+17}">one graph replay launches every kernel in the token</text>`;
  else cpu.forEach((c,i)=>{o+=`<rect class="${i%2?"tl-cpu2":"tl-cpu"}" x="${sx(c[0])}" y="${yC+2}" width="${Math.max(1,sx(Math.min(c[1],span))-sx(c[0]))}" height="${hL-4}"><title>CPU launches kernel ${i+1}</title></rect>`});
  ks.forEach(k=>{const x=sx(k.s),w=Math.max(1.2,sx(k.e)-x);
    o+=`<rect class="tl-k-${k.k}" x="${x}" y="${yG+1}" width="${w}" height="${hL-2}"><title>${esc(k.n)} · ${unit==="ms"?f2(k.t)+" ms":f1(k.t)+" µs"}</title></rect>`;
    if(w>58)o+=`<text class="tl-name${k.k==="a"?" dk":""}" x="${x+4}" y="${yG+16}">${esc(k.n.length>16?k.n.slice(0,15)+"…":k.n)}</text>`});
  const ticks=5;for(let i=0;i<=ticks;i++){const t=span*i/ticks;o+=`<line class="ax" x1="${sx(t)}" y1="${yG+hL+2}" x2="${sx(t)}" y2="${yG+hL+7}"/><text class="axt" x="${sx(t)}" y="${yG+hL+19}" text-anchor="middle">${unit==="ms"?f1(t):f0(t)} ${unit}</text>`}
  o+=`<text class="axt" x="${ml}" y="14">${S.mode==="prefill"?"One transformer layer of "+MODELS[S.model].L+" (prefill)":"First 2 of "+MODELS[S.model].L+" layers in one token (decode)"}</text>`;
  return o+`</svg>`;
}
function tlLegend(){return `<div class="tlleg"><span><i style="background:var(--sea)"></i>matrix multiply (GEMM)</span><span><i style="background:var(--signal)"></i>attention</span><span><i style="background:var(--idle)"></i>small ops (norm, add, activation)</span><span><i style="background:color-mix(in srgb,var(--ink) 55%,transparent)"></i>CPU launch</span><span><i style="background:var(--ok)"></i>graph replay</span><span><i style="background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--bad) 50%,transparent) 0 2px,transparent 2px 6px)"></i>GPU idle</span></div>`}
function w2Math(S){
  const m=MODELS[S.model];const L=[];
  if(S.mode==="prefill"){const R=w2prefill(S);
    L.push(`<span class="h">PREFILL · ${m.name} · ${f0(R.N)} tokens · H100 BF16</span>`);
    L.push(`linear layers = 2 × ${f2(nonEmbed(m)/1e9)} B × ${f0(R.N)} = ${f0(R.gemmFl/1e12)} TFLOP ÷ (989 × ${PRE_EFF*100}%) = ${fmtT(R.gemm)}`);
    L.push(`attention     = 2 × ${f0(R.N)}² × ${m.h} × ${m.L} = ${f0(R.attFl/1e12)} TFLOP`);
    if(S.flash)L.push(`                FlashAttention: tiles in SRAM, ${ATT_EFF*100}% of peak = ${fmtT(R.attn)}`);
    else{L.push(`                score matrix per layer = ${m.heads} heads × ${f0(R.N)}² × 2 bytes = ${f1(R.scoresGB)} GB`);
      L.push(`                free HBM = 80 − ${f1(R.wGB)} − ${f1(R.kvGB)} − ${RESERVE} = ${f1(R.free)} GB → ${R.oom?'<span class="r">does not fit</span>':"fits"}`);
      if(!R.oom)L.push(`                write + read + write + read = ${f0(R.attnTraffic/1e9)} GB of HBM traffic = ${fmtT(R.attnTraffic/W2BW)}`)}
    L.push(`small ops     = ${R.nE} per layer × ${m.L} × read+write ${f2(2*R.N*m.h*2/1e9)} GB = ${f0(R.elemB/1e9)} GB ÷ ${f2(W2BW/1e12)} TB/s = ${fmtT(R.elem)}`);
    L.push(`first token   ≈ ${R.oom?'<span class="r">crashes</span>':fmtT(R.ttft)}`);
  }else{const R=w2decode(S);
    L.push(`<span class="h">DECODE · ${m.name} · 1 user · H100 BF16</span>`);
    L.push(`kernels per token = ${R.n}  (${m.L} layers × ${(R.n-3)/m.L} + 3)`);
    L.push(`GPU work          = ${f0(R.sum)} µs (weights ${f1(m.P*2/1e9)} GB ÷ ${f2(W2BW/1e12)} TB/s ≈ ${f0(m.P*2/W2BW*1e6)} µs + small-kernel floors)`);
    L.push(S.graphs?`CPU launch        = one graph replay ≈ ${GRAPH_LAUNCH} µs`:`CPU launch        = ${R.n} × ${CPU_LAUNCH} µs = ${f0(R.cpuT)} µs`);
    L.push(`step              = ${f0(R.step)} µs → ${f0(R.tps)} tok/s, GPU busy ${f1(R.busy*100)}%`);
  }
  return `<pre class="mathbox">${L.join("\n")}</pre>`;
}
function contHtml(S){
  const img=S.lastRun&&IMAGES[S.lastRun.image],drv=DRIVERS[S.driver];
  const runOk=S.lastRun&&S.lastRun.ok,gp=S.lastRun&&S.lastRun.gpus;
  let chk;
  if(!S.lastRun)chk=`<div class="check na">No container run yet</div>`;
  else if(!gp)chk=`<div class="check bad">✗ started without --gpus: the container can't see any GPU</div>`;
  else if(runOk)chk=`<div class="check ok">✓ CUDA ${img.cuda} runtime works with driver ${S.driver} (supports CUDA ${drv.cuda})</div>`;
  else chk=`<div class="check bad">✗ CUDA ${img.cuda} runtime needs driver ${img.minDrv}+; host has ${S.driver} (CUDA ${drv.cuda})</div>`;
  return `<div class="cont">
   <div class="cgroup ctr"><span class="gl">Container image · ${esc(S.lastRun?S.lastRun.image:"none")}</span>
    <div class="cbox"><span class="nm">Your app</span><span class="ds">python serve.py</span></div>
    <div class="cbox"><span class="nm">PyTorch ${img?img.torch:"—"}</span><span class="ds">framework + kernel libraries (cuBLAS, cuDNN)</span></div>
    <div class="cbox ${S.lastRun&&gp?(runOk?"ok":"bad"):""}"><span class="nm">CUDA runtime ${img?img.cuda:"—"}</span><span class="ds">bundled in the image</span></div>
   </div>
   ${chk}
   <div class="cbox ${gp?"ok":S.lastRun?"bad":""}"><span class="nm">NVIDIA Container Toolkit</span><span class="ds">${gp?"--gpus all: passes GPU devices + driver libraries in":"only connects when the container starts with --gpus"}</span></div>
   <div class="cgroup"><span class="gl">Host · gpu-node-01</span>
    <div class="cbox ${S.lastRun&&gp?(runOk?"ok":"bad"):""}"><span class="nm">NVIDIA driver ${drv.full}</span><span class="ds">supports CUDA ≤ ${drv.cuda}</span></div>
    <div class="cbox"><span class="nm">GPU</span><span class="ds">NVIDIA H100 80GB HBM3</span></div>
   </div></div>`;
}
function renderW2(){
  const S=G.S,L=G.level,P=L.panels;$("#simActs").innerHTML="";curUtil=0;clearInterval(flickT);
  let h="";
  if(P.includes("stack"))h+=`<div>${stackHtml(S)}</div>`;
  if(P.includes("container"))h+=contHtml(S);
  const showMem=P.includes("memory")&&S.mode==="prefill";
  if(showMem){const R=w2prefill(S),cap=80,u=R.wGB+R.kvGB+RESERVE;
    const sc=Math.min(100,R.scoresGB/cap*100),freeP=Math.max(0,R.free)/cap*100;
    h+=`<div><div class="sec-h"><span>HBM memory · H100 80 GB</span><b>${f1(u)} GB used before attention</b></div>
     <div class="membar"><span class="w" style="width:${(R.wGB/cap*100).toFixed(1)}%"></span><span class="k" style="width:${(R.kvGB/cap*100).toFixed(1)}%"></span><span class="r" style="width:${(RESERVE/cap*100).toFixed(1)}%"></span></div>
     <div class="memleg"><span><i style="background:var(--wt)"></i>Weights ${f1(R.wGB)} GB</span><span><i style="background:var(--kv)"></i>KV cache ${f1(R.kvGB)} GB</span><span><i style="background:var(--rsv)"></i>Runtime ${RESERVE} GB</span><span>Free ${f1(R.free)} GB</span></div>
     <div class="sec-h" style="margin-top:12px"><span>Attention scratch space, one layer</span><b>${S.flash?"FlashAttention: ~0 GB in HBM":f1(R.scoresGB)+" GB score matrix"}</b></div>
     <div class="scores">${S.flash?`<span style="width:1.5%;background:var(--ok)"></span>`:`<span style="width:${Math.min(sc,freeP).toFixed(1)}%;background:var(--signal)"></span>${R.oom?`<span class="x" style="width:${Math.max(0,Math.min(100,sc)-freeP).toFixed(1)}%;background:repeating-linear-gradient(135deg,var(--bad) 0 6px,color-mix(in srgb,var(--bad) 60%,transparent) 6px 12px)"></span>`:""}`}</div>
     <div class="memstat${R.oom?" bad":""}">${S.flash?"Score tiles live in each SM's 228 KB of on-chip memory and are thrown away after use.":R.oom?`Out of memory: tried to allocate ${f1(R.scoresGB)} GB with ${f1(R.free)} GB free.`:`Fits, but writing and re-reading it costs ${f0(R.attnTraffic/1e9)} GB of HBM traffic.`}</div></div>`}
  if(P.includes("timeline")){
    if(S.mode==="prefill"){const R=w2prefill(S);
      h+=`<div><div class="tlwrap">${tlSVG(S,R)}</div>${tlLegend()}</div>
      <div class="tiles"><div class="tile${R.oom?" flag":""}"><div class="k">First token</div><div class="v">${R.oom?"crash":fmtT(R.ttft)}</div><div class="s">${f0(R.N)}-token prompt</div></div>
      <div class="tile"><div class="k">Linear layers</div><div class="v">${fmtT(R.gemm)}</div><div class="s">compute-bound GEMMs</div></div>
      <div class="tile${R.oom?" flag":""}"><div class="k">Attention</div><div class="v">${R.oom?"OOM":fmtT(R.attn)}</div><div class="s">${S.flash?"FlashAttention":"plain, via HBM"}</div></div>
      <div class="tile"><div class="k">Small ops</div><div class="v">${fmtT(R.elem)}</div><div class="s">${R.nE} per layer${S.fuse?", fused":""}</div></div></div>`}
    else{const R=w2decode(S);
      h+=`<div><div class="tlwrap">${tlSVG(S,R)}</div>${tlLegend()}</div>
      <div class="tiles"><div class="tile"><div class="k">Per token</div><div class="v">${fmtT(R.step/1e6)}</div><div class="s">${f0(R.tps)} tok/s</div></div>
      <div class="tile${R.busy<.6?" flag":""}"><div class="k">GPU busy</div><div class="v">${f1(R.busy*100)}%</div><div class="s">time a kernel is running</div></div>
      <div class="tile"><div class="k">Kernels</div><div class="v">${R.n}</div><div class="s">per token</div></div>
      <div class="tile"><div class="k">CPU launching</div><div class="v">${fmtT(R.cpuT/1e6)}</div><div class="s">${S.graphs?"one graph replay":"one launch at a time"}</div></div></div>`}
  }
  if(P.includes("timeline")||showMem)h+=w2Math(S);
  $("#simBody").innerHTML=`<div class="w2grid">${h}</div>`;
}

/* ============ controls ============ */
function seg(label,key,opts,cur,lock){return `<div class="ctl${lock?" locked":""}" title="${lock?esc(lock):""}"><span>${label}</span><div class="seg" role="group" aria-label="${label}">${opts.map(o=>`<button type="button" class="${o.v===cur?"on":""}" ${lock?"disabled":""} data-cmd="${esc(o.cmd)}" aria-pressed="${o.v===cur}">${o.l}${o.s?`<small>${o.s}</small>`:""}</button>`).join("")}</div></div>`}
function renderCtrls(){
  const S=G.S,L=G.level,C=L.controls||[],lk=L.locks||{};let h="";
  if(C.includes("gpu"))h+=seg("GPU","gpu",(L.gpus||NV_GPUS).map(k=>({v:k,l:GPUS[k].name.replace(" SXM",""),s:"$"+f2(GPUS[k].price)+"/hr",cmd:"foundry gpu "+k})),S.gpu,lk.gpu);
  if(C.includes("model"))h+=`<div class="ctl${lk.model?" locked":""}" title="${esc(lk.model||"")}"><span>Model</span><select id="selModel" ${lk.model?"disabled":""}>${(S.world===1||S.world===3?["llama-8b","llama-70b","llama-405b","qwen-235b"]:["llama-70b","llama-405b"]).map(k=>`<option value="${k}" ${k===S.model?"selected":""}>${MODELS[k].name}</option>`).join("")}</select></div>`;
  if(C.includes("workload"))h+=seg("Workload","wl",Object.entries(WL).map(([k,w])=>({v:k,l:w.t,cmd:"foundry workload "+k})),S.wl);
  if(C.includes("kv"))h+=seg("KV cache","kvdt",[{v:"bf16",l:"16-bit",cmd:"foundry kv bf16"},{v:"fp8",l:"FP8",cmd:"foundry kv fp8"}],S.kvdt||"bf16",lk.kvdt);
  if(C.includes("dtype"))h+=seg("Precision","dtype",DT_ORDER.map(k=>({v:k,l:DTYPES[k].name,s:DTYPES[k].bytes+" B/param",cmd:"foundry dtype "+k})),S.dtype,lk.dtype);
  if(C.includes("batch")){const i=Math.max(0,BATCH_STEPS.indexOf(S.batch));h+=`<div class="ctl${lk.batch?" locked":""}" title="${esc(lk.batch||"")}"><span>${S.world===3?"Users per replica":"Users at once"}</span><div class="range"><input type="range" id="rngBatch" min="0" max="${BATCH_STEPS.length-1}" step="1" value="${BATCH_STEPS.includes(S.batch)?i:BATCH_STEPS.findIndex(b=>b>=S.batch)}" ${lk.batch?"disabled":""} aria-label="Users at once"><output id="outBatch">${S.batch}</output></div></div>`}
  if(C.includes("ctx"))h+=seg("Context per user","ctx",CTX_STEPS.map(v=>({v,l:kfmt(v),cmd:"foundry context "+v})),S.ctx,lk.ctx);
  if(C.includes("prompt"))h+=seg("Prompt","prompt",PROMPT_STEPS.map(v=>({v,l:kfmt(v),cmd:"foundry prompt "+v})),S.prompt,lk.prompt);
  if(C.includes("model2"))h+=seg("Model","model",["llama-1b","llama-8b"].map(k=>({v:k,l:MODELS[k].name.replace("Llama ",""),cmd:"foundry load "+k})),S.model,lk.model);
  if(C.includes("mode"))h+=seg("Phase","mode",[{v:"decode",l:"Decode",s:"1 token at a time",cmd:"foundry mode decode"},{v:"prefill",l:"Prefill",s:"read a prompt",cmd:"foundry mode prefill"}],S.mode);
  if(C.includes("prompt2")&&S.mode==="prefill")h+=seg("Prompt","prompt",[4096,8192,16384,32768].map(v=>({v,l:kfmt(v),cmd:"foundry prompt "+v})),S.prompt);
  const tog=(k,l,s)=>seg(l,k,[{v:false,l:"Off",cmd:`foundry ${k} off`},{v:true,l:"On",cmd:`foundry ${k} on`}],!!S[k]).replace("<span>"+l+"</span>",`<span>${l}</span>`);
  if(C.includes("graphs"))h+=tog("graphs","CUDA Graphs");
  if(C.includes("fuse"))h+=tog("fuse","Kernel fusion");
  if(C.includes("flash"))h+=tog("flash","FlashAttention");
  h+=ctrlsMore(S,C,lk);
  if(S.world===0)h+=ctrlsW0(S,C)+ctrlsW0b(S,C);
  $("#ctrls").innerHTML=h;$("#ctrls").hidden=!h;
  const sm=$("#selModel");if(sm)sm.onchange=()=>exec("foundry load "+sm.value);
  const rb=$("#rngBatch");if(rb){rb.oninput=()=>{$("#outBatch").textContent=BATCH_STEPS[rb.value]};rb.onchange=()=>exec("foundry batch "+BATCH_STEPS[rb.value])}
}
function renderStrip(){
  const L=G.level,on=L.layers.on,near=L.layers.near;
  $("#strip").innerHTML=`<span class="lead">Stack</span>`+LAYERS.map(x=>`<button type="button" data-strip="${x.n}" class="${on.includes(x.n)?"on":near.includes(x.n)?"near":""}${G.strip===x.n?" sel":""}" title="${esc(x.name)}">${x.n} ${esc(x.s)}</button>`).join("");
  const sel=LAYERS.find(x=>x.n===(G.strip||on[0]));
  $("#stripNote").innerHTML=`<b>${sel.n} · ${esc(sel.name)}.</b> ${esc(sel.d)} ${on.includes(sel.n)?"<i>This level works here.</i>":near.includes(sel.n)?"<i>This level touches it.</i>":""}`;
}
function renderSim(){
  const S=G.S,L=G.level;if(!S||L.quiz)return;
  $("#simTitle").textContent=S.world===1?`GPU bench · ${GPUS[S.gpu].name}`:L.panels.includes("container")?"GPU server · containers":L.panels.includes("stack")&&!L.panels.includes("timeline")?"From Python to silicon":`Kernel profiler · H100 · ${MODELS[S.model].name}`;
  $("#simCap").innerHTML=S.world===1?(GPUS[S.gpu].vendor==="amd"?"The package from above: 8 compute chiplets (<b>XCDs</b>) covered in <b>Compute Units</b> (lit when doing math), with <b>HBM</b> stacks beside them (fill shows how full memory is). Dashes are data moving between them.":"The package as seen from above: the dark <b>die</b> covered in <b>SMs</b> (lit when doing math), with <b>HBM</b> stacks beside it (fill shows how full memory is). Dashes are data moving between them."):L.panels.includes("container")?"What runs where on one GPU server. Green means that link works, red means it's the problem.":L.panels.includes("timeline")?"A timeline of what the CPU and GPU are doing. Each block on the GPU row is one kernel; hatched red means the GPU is sitting idle.":"Each row is one layer of software. Tap a row to inspect it.";
  renderCtrls();$("#cmdForm label").textContent=S.world===4?S.host+"$":"$";
  if(S.world===0)renderW0();else if(S.world===1)renderW1();else if(S.world===2)renderW2();else if(S.world===3)renderW3();else renderW4();
}
</script>
