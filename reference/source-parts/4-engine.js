<script>
"use strict";
/* ============ world 1 model: one GPU serving one model ============ */
function computeRate(g,dt){return dt==="fp8"?g.fp8:dt==="fp4"?(g.fp4||g.bf16):g.bf16} /* INT4 weight-only: math runs in 16-bit */
function w1(S){
  const g=GPUS[S.gpu],m=MODELS[S.model],d=DTYPES[S.dtype];
  const fp4bad=S.dtype==="fp4"&&!g.fp4;
  const kvd=KVDT[S.kvdt||"bf16"],kvT=kvTok(m)*kvd.f,act=activeP(m);
  const wGB=m.P*d.bytes/1e9, kvGB=S.batch*S.ctx*kvT/1e9, used=wGB+kvGB+RESERVE;
  const fits=!fp4bad&&used<=g.mem;
  const touched=m.moe?1-Math.pow(1-m.moe.k/m.moe.E,S.batch):1;
  const readGB=m.moe?(m.moe.nonExp+m.moe.expTotal*touched)*d.bytes/1e9:wGB;
  const bwEff=g.bw*1e12*MEM_EFF, peakTF=computeRate(g,S.dtype), rate=peakTF*1e12;
  const bytes=(readGB+kvGB)*1e9, tMem=bytes/bwEff, flops=2*act*S.batch, tComp=flops/(rate*DEC_EFF);
  const step=Math.max(tMem,tComp), perUser=1/step, total=S.batch/step;
  const preFl=2*act*S.prompt, preG=preFl/(rate*PRE_EFF);
  const attFl=2*S.prompt*S.prompt*m.h*m.L, preA=attFl/(g.bf16*1e12*ATT_EFF);
  const preM=wGB*1e9/bwEff, ttft=Math.max(preG+preA,preM);
  const cost=g.price/(total*3600)*1e6;
  const bwUtil=bytes/step/(g.bw*1e12), compUtil=flops/step/rate;
  const power=Math.min(g.tdp,g.tdp*(.14+.42*bwUtil+.5*compUtil)), tpk=total*3600/(power/1000);
  const I=flops/bytes, achTF=flops/step/1e12, ridge=peakTF/g.bw;
  const preI=preFl/(readGB*1e9), preTF=preFl/preG/1e12;
  return {g,m,d,kvd,act,touched,readGB,fp4bad,kvT,wGB,kvGB,used,fits,bwEff,peakTF,rate,bytes,tMem,flops,tComp,step,perUser,total,preFl,preG,attFl,preA,preM,ttft,cost,bwUtil,compUtil,power,tpk,I,achTF,ridge,preI,preTF,bound:tMem>=tComp?"memory":"compute"};
}

/* ============ world 2 model: kernels on an H100 ============ */
const W2G=GPUS.h100, W2BW=W2G.bw*1e12*MEM_EFF, CPU_LAUNCH=18, GRAPH_LAUNCH=15, MINK=2.5;
function nonEmbed(m){return m.P-(m.tied?1:2)*m.vocab*m.h}
function layerMats(m){return{qkv:m.h*(m.heads*m.hd+2*m.kvh*m.hd),o:m.heads*m.hd*m.h,gu:2*m.h*m.inter,dn:m.inter*m.h}}
function decodeKernels(S){
  const m=MODELS[S.model],M=layerMats(m),us=b=>b/W2BW*1e6;
  const kvL=S.ctx*m.kvh*m.hd*2*2;
  const G=(n,p)=>({n,k:"g",t:Math.max(MINK,us(p*2))+1,b:p*2});
  const E=n=>({n,k:"e",t:MINK,b:0});
  const A=(n,b)=>({n,k:"a",t:us(b)+3,b});
  const out=[];
  for(let l=0;l<m.L;l++){
    const att=S.flash?[A("flash_attn",kvL)]:[A("attn_scores",kvL/2),{n:"softmax",k:"a",t:MINK,b:0},A("attn_values",kvL/2)];
    if(S.fuse)out.push(E("add_rmsnorm"),G("qkv_proj",M.qkv),E("rope"),...att,G("o_proj",M.o),E("add_rmsnorm"),G("gate_up_proj",M.gu),E("silu_and_mul"),G("down_proj",M.dn));
    else out.push(E("rmsnorm"),G("qkv_proj",M.qkv),E("rope"),...att,G("o_proj",M.o),E("add"),E("rmsnorm"),G("gate_up_proj",M.gu),E("silu"),E("mul"),G("down_proj",M.dn),E("add"));
    out[out.length-1].layerEnd=l;
  }
  out.push(E("final_norm"),G("lm_head",m.vocab*m.h),E("argmax"));
  return out;
}
function w2decode(S){
  const ks=decodeKernels(S);let ge=0,sum=0;const cpu=[];
  ks.forEach((k,i)=>{let ready;
    if(S.graphs){ready=GRAPH_LAUNCH}else{ready=CPU_LAUNCH*(i+1);cpu.push([CPU_LAUNCH*i,CPU_LAUNCH*(i+1)])}
    const st=Math.max(ready,ge+(S.graphs?0.6:1));k.s=st;k.e=st+k.t;ge=k.e;sum+=k.t});
  const step=ge, busy=sum/step, cpuT=S.graphs?GRAPH_LAUNCH:CPU_LAUNCH*ks.length;
  return {ks,cpu,step,busy,sum,cpuT,n:ks.length,tps:1e6/step};
}
function w2prefill(S){
  const m=MODELS[S.model],N=S.prompt,M=layerMats(m),peak=W2G.bf16*1e12;
  const wGB=m.P*2/1e9,kvGB=N*kvTok(m)/1e9,free=W2G.mem-wGB-kvGB-RESERVE;
  const gemmFl=2*nonEmbed(m)*N, gemm=gemmFl/(peak*PRE_EFF);
  const attFl=2*N*N*m.h*m.L;
  const scoresGB=m.heads*N*N*2/1e9;
  const nE=S.fuse?4:7, elemB=nE*m.L*(2*N*m.h*2), elem=elemB/W2BW;
  let oom=false,attn,attnTraffic=0;
  if(S.flash){attn=attFl/(peak*ATT_EFF)}
  else{ if(scoresGB>free)oom=true; attnTraffic=4*scoresGB*1e9*m.L; attn=attFl/(peak*0.4)+attnTraffic/W2BW }
  const ttft=gemm+attn+elem;
  /* one layer's kernels at ms scale */
  const tot=M.qkv+M.o+M.gu+M.dn,gl=gemm/m.L,el=elem/(nE*m.L),al=attn/m.L,ms=x=>x*1e3;
  const G=(n,p)=>({n,k:"g",t:ms(gl*p/tot)}),E=n=>({n,k:"e",t:ms(el)});
  let att;
  if(S.flash)att=[{n:"flash_attn",k:"a",t:ms(al)}];
  else if(oom)att=[{n:"attn_scores · OOM",k:"x",t:ms(gl)}];
  else{const f=attFl/m.L/(peak*0.4),tr=attnTraffic/m.L/W2BW;att=[{n:"attn_scores",k:"a",t:ms(f/2+tr/4)},{n:"softmax",k:"a",t:ms(tr/2)},{n:"attn_values",k:"a",t:ms(f/2+tr/4)}]}
  const layer=S.fuse?[E("add_rmsnorm"),G("qkv_proj",M.qkv),E("rope"),...att,G("o_proj",M.o),E("add_rmsnorm"),G("gate_up_proj",M.gu),E("silu_and_mul"),G("down_proj",M.dn)]
                    :[E("rmsnorm"),G("qkv_proj",M.qkv),E("rope"),...att,G("o_proj",M.o),E("add"),E("rmsnorm"),G("gate_up_proj",M.gu),E("silu"),E("mul"),G("down_proj",M.dn),E("add")];
  let t=0;layer.forEach(k=>{k.s=t;k.e=t+k.t;t=k.e});
  return {N,wGB,kvGB,free,gemm,gemmFl,attFl,attn,elem,elemB,nE,scoresGB,oom,ttft,layer,attnTraffic};
}
function w2used(S){const m=MODELS[S.model];const n=S.mode==="prefill"?S.prompt:S.ctx;return m.P*2/1e9+n*kvTok(m)/1e9+RESERVE}
</script>
