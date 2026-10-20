<script>
"use strict";
/* ============ World 0: mixture of experts ============ */
const MOE_TOKS=[" Paris"," def"," 42"," gracias"," protein"," the"];
function seedRand(str){let h=2166136261>>>0;for(const ch of str){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0}return()=>{h^=h<<13;h>>>=0;h^=h>>>17;h^=h<<5;h>>>=0;return h/4294967296}}
function routeToken(tok){const m=MODELS["qwen-235b"],E=m.moe.E,k=m.moe.k,r=seedRand(tok+"#route");
  const scores=[...Array(E)].map((_,i)=>({i,s:r()*2+(r()<.08?2.2:0)}));
  const top=scores.sort((a,b)=>b.s-a.s).slice(0,k);const w=softmax(top.map(x=>x.s*2.2));
  return top.map((x,j)=>({e:x.i,w:w[j]}))}
function moeBatch(B){const m=MODELS["qwen-235b"],used=new Set();for(let i=0;i<B;i++)routeToken((B===1?MOE_TOKS[0]:"tok"+i)).forEach(x=>used.add(x.e));
  const expect=1-Math.pow(1-m.moe.k/m.moe.E,B);
  return{used,frac:used.size/m.moe.E,expect,readGB:(m.moe.nonExp+m.moe.expTotal*used.size/m.moe.E)/1e9}}

/* ============ World 0: heads and KV heads ============ */
const HEAD_DESIGNS={mha:{n:32,name:"Multi-head (MHA)",note:"every query head has its own keys and values"},gqa:{n:8,name:"Grouped-query (GQA)",note:"groups of 4 query heads share one key/value head"},mqa:{n:1,name:"Multi-query (MQA)",note:"all 32 query heads share a single key/value head"}};
const HEAD_ROLES=["looks at the previous word","links pronouns to the nouns they mean","tracks the subject of the sentence","watches punctuation and sentence ends","finds matching quotes and brackets","attends to the first token (a resting spot)","copies repeated names","follows verbs to their objects"];
function headsCalc(design){const m=MODELS["llama-8b"],n=HEAD_DESIGNS[design].n,kvt=2*m.L*n*m.hd*2,ctx=4096;
  const free=80-m.P*2/1e9-RESERVE,perUser=kvt*ctx/1e9;return{n,kvt,perUser,users:Math.floor(free/perUser),free,long:kvt*131072/1e9}}
</script>
