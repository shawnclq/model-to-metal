<script>
"use strict";
function ctrlsW0b(S,C){let h="";
  if(C.includes("moebatch"))h+=seg("Tokens at once","moebatch",[1,4,8,16,32,64].map(b=>({v:b,l:String(b),cmd:"batch "+b})),S.moe.batch);
  if(C.includes("hdesign"))h+=seg("Design","hdesign",["mha","gqa","mqa"].map(k=>({v:k,l:HEAD_DESIGNS[k].name.split(" (")[0],s:HEAD_DESIGNS[k].n+" KV head"+(HEAD_DESIGNS[k].n>1?"s":""),cmd:"heads "+k})),S.hd.design);
  return h}
function w0bCmd(v,t){const S=G.S;if(S.world!==0)return false;const a=(t[1]||"").toLowerCase(),P=G.level.panels;
  if(v==="route"){if(!P.includes("moe")){err("Routing is in World 0, 'A team of experts'.");return true}
    const i=isNaN(parseInt(a))?MOE_TOKS.findIndex(x=>x.trim().toLowerCase()===a):parseInt(a);
    if(i<0||i>=MOE_TOKS.length){err(`route TOKEN, one of: ${MOE_TOKS.map(x=>x.trim()).join(", ")}`);return true}
    S.moe.tok=i;S.moe.batch=1;if(!S.moe.seen.includes(i))S.moe.seen.push(i);const r=routeToken(MOE_TOKS[i]);
    print(`"${MOE_TOKS[i].trim()}" → experts ${r.map(x=>x.e+1).join(", ")} (top weight ${f0(r[0].w*100)}%). 120 experts idle for this token.`,"ok");return true}
  if(v==="batch"){if(!P.includes("moe")){err("batch here is for the MoE level; GPU batching is in World 1.");return true}
    const n=parseInt(a);if(!(n>=1&&n<=256)){err("batch N, from 1 to 256");return true}S.moe.batch=n;if(n===1){if(S.moe.tok<0)S.moe.tok=0;print("One token at a time.","dim");return true}
    const b=moeBatch(n);print(`${n} tokens at once → ${b.used.size} of 128 experts used (${f0(b.frac*100)}%) · ${f0(b.readGB)} GB of weights read this step`,"ok");return true}
  if(v==="heads"){if(!P.includes("heads")){err("Head designs are in World 0, 'Many heads, shared notes'.");return true}
    if(!HEAD_DESIGNS[a]){err("heads mha | gqa | mqa");return true}S.hd.design=a;if(a==="mha")S.flags.mha=true;if(a==="mqa")S.flags.mqa=true;
    const c=headsCalc(a);print(`${HEAD_DESIGNS[a].name}: ${c.n} KV heads · ${f2(c.kvt/1e6)} MB per token · ${f0(c.users)} users with 4k chats fit on one H100`,"ok");return true}
  if(v==="qhead"){if(!P.includes("heads")){err("Query heads are in World 0, 'Many heads, shared notes'.");return true}
    const n=parseInt(a);if(!(n>=1&&n<=32)){err("qhead N, from 1 to 32");return true}S.hd.q=n-1;S.flags.qhead=true;const g=32/HEAD_DESIGNS[S.hd.design].n;
    print(`Query head ${n} searches key/value head ${Math.floor((n-1)/g)+1}${g>1?` (shared with ${g-1} others)`:""}.`,"dim");return true}
  return false}
</script>
