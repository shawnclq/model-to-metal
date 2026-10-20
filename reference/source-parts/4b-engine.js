<script>
"use strict";
/* ============ MIG ============ */
function migCheck(list){let c=0,m=0;for(const p of list){const x=MIGP[p];if(!x)return{ok:false,why:`unknown profile "${p}"`};c+=x.c;m+=x.m}
  if(c>7)return{ok:false,why:`needs ${c} compute slices; an H100 has 7`};if(m>8)return{ok:false,why:`needs ${m} memory slices (${m*10} GB); an H100 has 8 (80 GB)`};return{ok:true,c,m}}
function migAssign(S){const inst=S.mig.inst.map((p,i)=>({p,i,gb:MIGP[p].gb*.97,used:null}));
  const res=TENANTS.map(t=>({t,inst:null}));
  [...res].sort((a,b)=>b.t.need-a.t.need).forEach(r=>{const c=inst.filter(x=>!x.used&&x.gb>=r.t.need).sort((a,b)=>a.gb-b.gb)[0];if(c){c.used=r.t.n;r.inst=c}});
  return{res,inst,all:res.every(r=>r.inst)}}

/* ============ World 3: one 8-GPU server ============ */
function arTime(n,msg,link){if(n<=1)return 0;return link.lat*(1+.15*(n-2))+2*(n-1)/n*msg/link.bw}
function readGBof(m,d,batch){const t=m.moe?1-Math.pow(1-m.moe.k/m.moe.E,batch):1;return m.moe?(m.moe.nonExp+m.moe.expTotal*t)*d.bytes/1e9:m.P*d.bytes/1e9}
function w3(S){
  const srv=SERVERS[S.srv],g=GPUS[srv.gpu],m=MODELS[S.model],d=DTYPES[S.dtype],tp=S.tp,rep=8/tp,act=activeP(m);
  const kvT=kvTok(m)*KVDT[S.kvdt||"bf16"].f;
  const wPer=m.P*d.bytes/1e9/tp,kvPer=S.batch*S.ctx*kvT/1e9/tp,usedPer=wPer+kvPer+RESERVE,fits=usedPer<=g.mem&&!(S.dtype==="fp4"&&!g.fp4);
  const rate=computeRate(g,S.dtype)*1e12,bwEff=g.bw*1e12*MEM_EFF;
  const readPer=readGBof(m,d,S.batch)/tp;
  const tMem=(readPer+kvPer)*1e9/bwEff,tComp=2*act*S.batch/tp/(rate*DEC_EFF);
  const nAR=2*m.L,arDec=arTime(tp,S.batch*m.h*2,srv),tComm=nAR*arDec;
  const step=Math.max(tMem,tComp)+tComm,perUser=1/step,repT=S.batch/step,total=rep*repT;
  const preC=2*act*S.prompt/(tp*rate*PRE_EFF)+2*S.prompt*S.prompt*m.h*m.L/(tp*g.bf16*1e12*ATT_EFF);
  const arPre=arTime(tp,S.prompt*m.h*2,srv),preComm=nAR*arPre,ttft=preC+preComm;
  const cost=srv.price/(total*3600)*1e6;
  const linkUtil=tp>1?Math.min(1,(nAR*2*(tp-1)/tp*S.batch*m.h*2/step)/srv.bw*6):0;
  return{g,srv,m,d,tp,rep,act,kvT,wPer,kvPer,usedPer,fits,readPer,tMem,tComp,nAR,arDec,tComm,step,perUser,repT,total,preC,arPre,preComm,ttft,cost,commShare:tComm/step,linkUtil,bound:tMem>=tComp?"memory":"compute"};
}
function ncclTable(srv,n){const rows=[];for(let b=8;b<=8*1024*1024*1024;b*=16){const t=arTime(n,b,srv);rows.push({b,t,alg:b/t/1e9,bus:2*(n-1)/n*b/t/1e9})}return rows}

/* ============ World 4: many servers ============ */
function netBW(S){const n=NETS[S.net];let bw=n.perGPU*n.eff;if(n.rdma&&!S.gdr)bw*=.35;return bw}
function w4serve(S){
  const g=GPUS.h100,m=MODELS[S.model],d=DTYPES[S.dtype],tp=S.tp,pp=S.pp,n=tp*pp,act=activeP(m),net=NETS[S.net];
  const kvT=kvTok(m)*KVDT[S.kvdt||"bf16"].f;
  const wPer=m.P*d.bytes/1e9/n,kvPer=S.batch*S.ctx*kvT/1e9/n,usedPer=wPer+kvPer+RESERVE;
  const nodesNeeded=Math.ceil(n/8),gpusAvail=S.nodes*8;
  const fits=usedPer<=g.mem;
  const rate=computeRate(g,S.dtype)*1e12,bwEff=g.bw*1e12*MEM_EFF;
  const nvl=SERVERS.hgx,netLink={bw:netBW(S),lat:net.lat*4};
  const tpLink=tp<=8?nvl:netLink,tpSpans=tp>8;
  const nAR=2*m.L;
  const stageRead=readGBof(m,d,S.batch)/n*1e9/bwEff+kvPer*1e9/bwEff;
  const stageComm=(m.L/pp)*2*arTime(tp,S.batch*m.h*2,tpLink);
  const send=pp>1?(pp-1)*(net.lat*2+S.batch*m.h*2/(netBW(S)*Math.min(8,tp))):0;
  const tok=pp*(stageRead+stageComm)+send,perUser=1/tok;
  const preC=(2*act*S.prompt)/(tp*rate*PRE_EFF)+2*S.prompt*S.prompt*m.h*m.L/(tp*g.bf16*1e12*ATT_EFF);
  const preComm=nAR*arTime(tp,S.prompt*m.h*2,tpLink);
  const preSend=pp>1?(pp-1)*(net.lat*2+S.prompt*m.h*2/(netBW(S)*Math.min(8,tp))):0;
  const ttft=preC+preComm+preSend;
  const crossNode=tpSpans||pp>1;
  return{g,m,d,tp,pp,n,net,wPer,kvPer,usedPer,fits,nodesNeeded,gpusAvail,tpSpans,tpLink,stageRead,stageComm,send,tok,perUser,preC,preComm,preSend,ttft,crossNode,commShare:(pp*stageComm+send)/tok};
}
const TRAIN={model:"llama-8b",seqs:4,seq:4096,mfu:.45};
function w4train(S){
  const m=MODELS[TRAIN.model],N=S.nodes,net=NETS[S.net],grad=m.P*2;
  const tokGPU=TRAIN.seqs*TRAIN.seq,c=6*m.P*tokGPU/(GPUS.h100.bf16*1e12*TRAIN.mfu);
  const intra=2*7/8*grad/SERVERS.hgx.bw;
  const bw=netBW(S),inter=N>1?2*(N-1)/N*(grad/8)/bw+2*(N-1)*net.lat:0;
  const one=c+intra,step=c+intra+inter,eff=N>1?one/step:1,tput=N*8*tokGPU/step;
  return{m,N,net,grad,tokGPU,c,intra,bw,inter,one,step,eff,tput,ideal:N*8*tokGPU/one};
}
</script>
