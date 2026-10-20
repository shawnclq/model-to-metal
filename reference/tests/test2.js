const {JSDOM,VirtualConsole}=require("jsdom");const fs=require("fs");
const html=fs.readFileSync(process.argv[2],"utf8");
// Load a copy of the page. `seed` runs before any game script, e.g. to put a save in localStorage.
// Error listeners are attached before parsing: game scripts run during parsing, so load-time errors would otherwise be missed.
function load(src,seed){const errors=[];const vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(String(e.message||e)));
  const dom=new JSDOM("<!doctype html><html><head></head><body>"+src+"</body></html>",{runScripts:"dangerously",pretendToBeVisual:true,url:"https://x.test/",virtualConsole:vc,
    beforeParse(w){w.addEventListener("error",e=>errors.push(e.message));w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});if(seed)seed(w)}});
  const w=dom.window;
  return new Promise(r=>setTimeout(()=>r({w,ev:s=>w.eval(s),errors,close:()=>w.close()}),300))}
// Pass/fail checks, on top of the printed playthrough log. Any failure makes the run exit 1.
const fails=[];let passes=0;const check=(name,ok,detail="")=>{if(ok)passes++;else fails.push(name+(detail?" — "+detail:""))};
const realErrors=errors=>errors.filter(e=>!/getContext/.test(e));
(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const {w,ev,errors}=await load(html);const out=[];

 /* ---- level catalog ---- */
 const ids=ev("[...LEVELS,...Object.values(LABS)].map(l=>l.id)");
 check("every level and lab ID is a kebab-case slug",ids.every(id=>/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)),ids.filter(id=>!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)).join(", "));
 check("level and lab IDs are unique",new Set(ids).size===ids.length);
 check("display numbers restart at 1 in each world",ev("WORLDS.every(W=>LEVELS.filter(l=>l.world===W.w).every((l,i)=>l.n===i+1))"));
 check("idx matches list position",ev("LEVELS.every((l,i)=>l.idx===i)"));
 {const p=await load(html.replace('id:"batching"','id:"tokens"'));const e=p.errors.join(" ");
  check("a duplicate ID stops the page with a clear error",/Duplicate ID "tokens"/.test(e),e.slice(0,200));p.close()}
 {const p=await load(html.replace('id:"batching"','id:"Fill The Factory"'));const e=p.errors.join(" ");
  check("a badly formed ID stops the page with a clear error",/badly formed ID: "Fill The Factory"/.test(e),e.slice(0,200));p.close()}

 /* ---- cross-references ---- */
 check("refs() renders a known reference as World X, Level N",ev(`refs("see {{lvl:moe-experts}}.")`)==="see World 0, Level 3.");
 check("refs() renders an unknown reference as plain words",ev(`refs("see {{lvl:no-such-level}}.")`)==="see another level.");
 // Walk every string in every level and lab, so a typo anywhere in level text is caught with its level named.
 const badRefs=ev(`(()=>{const bad=[];const walk=(v,id)=>{if(typeof v==="string"){for(const m of v.matchAll(LVL_REF_RE))if(!LEVEL_BY_ID.has(m[1]))bad.push(id+" → "+m[1])}
   else if(Array.isArray(v))v.forEach(x=>walk(x,id));else if(v&&typeof v==="object")Object.values(v).forEach(x=>walk(x,id))};
   [...LEVELS,...Object.values(LABS)].forEach(l=>walk(l,l.id));return bad})()`);
 check("every {{lvl:...}} reference names a real level",badRefs.length===0,badRefs.join(", "));
 {const p=await load(html);const left=[];
  for(const id of p.ev("LEVELS.map(l=>l.id)")){p.ev(`loadLevel("${id}")`);if(!p.ev("G.level.quiz"))while(!p.ev(`$("#hintBtn").hidden`))p.ev("showHint()");
   p.ev("win(3)");if(p.ev("G.level.quiz"))p.ev("G.level.questions.forEach((q,i)=>G.quizState.picked[i].push(q.a));renderQuiz()");
   if(p.ev(`(b=>{b.querySelectorAll("script").forEach(x=>x.remove());return b.innerHTML.includes("{{lvl:")})(document.body.cloneNode(true))`))left.push(id)}
  p.ev(`show("home");loadLevel("gpu-anatomy");run("help")`);if(p.ev(`OUT.some(o=>o.t.includes("{{lvl:"))`))left.push("help text");
  check("no raw {{lvl: tokens reach the page",left.length===0,left.join(", "));
  check("attention debrief points at the KV-cache level by its number",p.ev(`(loadLevel("attention"),win(3),$("#dBody").textContent)`).includes("(World 0, Level 7)"));p.close()}

 /* ---- saved progress ---- */
 const NEW="m2m-progress-v1",V4="gf-progress-v4";
 const seedStore=items=>w=>{for(const [k,v] of Object.entries(items))w.localStorage.setItem(k,typeof v==="string"?v:JSON.stringify(v))};
 const saved=p=>JSON.parse(p.w.localStorage.getItem(NEW));const xpOf=p=>Number(p.ev(`$("#xpNum").textContent`));
 // Stars the home screen shows on one level: lit ★ minus greyed-out ones.
 const shown=(p,id)=>p.ev(`(b=>b?b.textContent.length-[...b.querySelectorAll(".off")].reduce((t,x)=>t+x.textContent.length,0):-1)(document.querySelector('#piers [data-level="${id}"] .stars'))`);
 {let p=await load(html);p.ev(`loadLevel("moe-experts");win(2)`);const raw=p.w.localStorage.getItem(NEW);p.close();
  check("winning saves stars by level ID",JSON.stringify(JSON.parse(raw))==='{"v":1,"stars":{"moe-experts":2}}',raw);
  p=await load(html,seedStore({[NEW]:raw}));p.ev(`show("home")`);
  check("stars and XP survive a reload",shown(p,"moe-experts")===2&&xpOf(p)===100,`shown=${shown(p,"moe-experts")} xp=${xpOf(p)}`);p.close()}
 {const v4='{"xp":0,"done":{"3":2,"14":3,"99":3,"5":7}}';const p=await load(html,seedStore({[V4]:v4}));p.ev(`show("home")`);
  check("a v4 save converts by the frozen table",JSON.stringify(saved(p).stars)==='{"moe-experts":2,"prefill-decode":3}',JSON.stringify(saved(p)));
  check("converted stars show on the right levels",shown(p,"moe-experts")===2&&shown(p,"prefill-decode")===3&&shown(p,"attention-heads")===0);
  check("the v4 save is left unchanged",p.w.localStorage.getItem(V4)===v4);p.close()}
 {const p=await load(html,seedStore({[NEW]:{v:1,stars:{tokens:1}},[V4]:{xp:300,done:{"3":3}}}));
  check("conversion is skipped when a new save exists",JSON.stringify(saved(p).stars)==='{"tokens":1}');p.close()}
 check("V4_IDS matches today's level order",ev("V4_IDS.length===36&&V4_IDS.every((id,i)=>LEVELS[i].id===id)"));
 {const p=await load(html,seedStore({[NEW]:{v:1,stars:{"gpu-anatomy":3,"memory-fit":1,"quiz-one-gpu":2}}}));
  check("XP is 50 a star, 75 a star on quizzes (spec example: 350)",xpOf(p)===350,String(xpOf(p)));p.close()}
 {const p=await load(html);p.ev(`loadLevel("batching");win(1);win(2);win(3)`);
  check("1★ then 2★ then 3★ gives 150 XP, same as 3★ at once",xpOf(p)===150,String(xpOf(p)));
  p.ev("win(1)");check("a worse replay keeps the higher stars",saved(p).stars.batching===3&&xpOf(p)===150);p.close()}
 {const p=await load(html,seedStore({[NEW]:{v:1,stars:{"retired-level":3,tokens:3}}}));p.ev(`show("home")`);
  check("an unknown ID is not counted",xpOf(p)===150&&p.ev(`$("#doneNum").textContent`)==="1");
  p.ev(`loadLevel("parameters");win(3)`);check("an unknown ID is kept in the save",saved(p).stars["retired-level"]===3);p.close()}
 {const p=await load(html,seedStore({[NEW]:"not json{"}));
  check("a corrupt save starts at 0 XP",xpOf(p)===0&&realErrors(p.errors).length===0,JSON.stringify(realErrors(p.errors)));p.close()}
 {const p=await load(html,w=>Object.defineProperty(w,"localStorage",{get(){throw new Error("blocked")}}));
  p.ev(`loadLevel("batching");win(3)`);
  check("blocked storage: the game still loads and levels can be won",p.ev("G.won")&&xpOf(p)===150&&realErrors(p.errors).length===0,JSON.stringify(realErrors(p.errors)));p.close()}
 {let p=await load(html,seedStore({[V4]:{xp:300,done:{"1":3,"2":3}}}));p.ev(`show("home");$("#resetAll").click();$("#resetYes").click()`);
  const items={[NEW]:p.w.localStorage.getItem(NEW),[V4]:p.w.localStorage.getItem(V4)};p.close();
  p=await load(html,seedStore(items));check("reset then reload stays at 0 XP even with a v4 save present",xpOf(p)===0,String(xpOf(p)));p.close()}
 {const p=await load(html,seedStore({[NEW]:{v:1,stars:{tokens:3,"gpu-anatomy":2,"quiz-cluster":1}}}));
  p.ev(`LEVELS.splice(1,0,{id:"dummy-level",world:0,title:"Dummy",concept:"test",layers:{on:[],near:[]},goals:[],hints:[]});finaliseLevels();show("home")`);
  check("inserting a level keeps everyone's stars",shown(p,"tokens")===3&&shown(p,"gpu-anatomy")===2&&shown(p,"quiz-cluster")===1&&shown(p,"dummy-level")===0,
   ["tokens","gpu-anatomy","quiz-cluster","dummy-level"].map(id=>id+"="+shown(p,id)).join(" "));
  check("inserting a level shifts display numbers only",p.ev(`LEVEL_BY_ID.get("parameters").n`)===3);p.close()}

 /* ---- playthrough ---- */
 out.push("levels "+ids.length+" | "+ev("LEVELS.map(l=>l.id+':'+l.title).join(', ')"));const lost=[];
 for(const id of ev("LEVELS.map(l=>l.id)")){const tag=ev(`(l=>"W"+l.world+"L"+l.n)(LEVEL_BY_ID.get("${id}"))`);
   if(ev(`LEVEL_BY_ID.get("${id}").quiz`)){ev(`loadLevel("${id}")`);out.push(`${tag} ${id} quiz q=${ev("document.querySelectorAll('#quiz .q').length")}`);continue}
   ev(`loadLevel("${id}")`);const before=ev("goalOk(G.level,G.S)");const ans=ev("G.level.answer(G.S)");ev(`run(${JSON.stringify(ans)})`);
   await sleep(ev("G.level.title")==="Follow one matmul"?6000:1300);
   if(!ev("G.won"))lost.push(id);out.push(`${tag} ${id}: before=${before} after=${ev("goalOk(G.level,G.S)")} won=${ev("G.won")}\n   ${ev("OUT.slice(-5).map(o=>o.t).join(' | ')").slice(0,500)}`);ev(`$("#modal").hidden=true`)}
 check("every non-quiz level is won by its answer()",lost.length===0,lost.join(", "));
 for(const lab of ["gpu-lab","kernel-lab","server-lab","cluster-lab"]){ev(`loadLevel("${lab}")`);ev(`run("help && foundry status && nvidia-smi")`);out.push(lab+": "+ev("OUT.slice(-3).map(o=>o.t).join(' | ')").slice(0,300))}
 ev(`loadLevel("server-lab")`);ev(`run("foundry server mi300x && nvidia-smi && amd-smi && rocm-smi --showtopo && all_reduce_perf -g 8 && foundry tp 8 && foundry server hgxb200 && foundry dtype fp4 && foundry status")`);out.push("lab3 amd: "+ev("OUT.slice(-30).map(o=>o.t).join('\\n')"));ev(`renderCompare()`);out.push("compare rows: "+ev("document.querySelectorAll('#cmpBody tbody tr').length"));ev(`loadLevel("gpu-lab")`);ev(`run("foundry gpu mi355x && foundry dtype fp4 && amd-smi && foundry inspect cu")`);out.push("lab1 amd: "+ev("OUT.slice(-6).map(o=>o.t).join(' | ')"));
 ev(`loadLevel("cluster-lab")`);ev(`run("foundry mode train && foundry nodes 4 && foundry net eth && foundry status && foundry layout 8x2")`);out.push("lab4 train: "+ev("OUT.slice(-6).map(o=>o.t).join(' | ')"));
 // negative paths
 ev(`loadLevel("multi-node")`);ev(`run("vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 && ray start --address=node-1:6379 && ray start --head && vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 && vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8")`);out.push("ray neg: "+ev("OUT.slice(-8).map(o=>o.t).join(' | ')"));
 ev(`loadLevel("gpu-sharing")`);ev(`run("nvidia-smi mig -cgi 1g.10gb -C && sudo nvidia-smi -i 0 -mig 1 && nvidia-smi mig -lgip && nvidia-smi mig -cgi 3g.40gb,3g.40gb,1g.10gb -C && nvidia-smi mig -cgi 7g.80gb -C && foundry share timeslice")`);out.push("mig neg: "+ev("OUT.slice(-14).map(o=>o.t).join(' | ')"));

 /* ---- navigation ---- */
 ev(`show("home")`);ev(`document.querySelector('#piers [data-level="moe-on-gpu"]').click()`);
 check("clicking a level on the home screen opens it",ev("G.level&&G.level.id")==="moe-on-gpu");
 check("home lab buttons carry lab IDs",ev(`[...document.querySelectorAll('#piers .lab')].map(b=>b.dataset.level).join()`)==="gpu-lab,kernel-lab,server-lab,cluster-lab");
 ev(`loadLevel("quiz-inside-model");win(3)`);
 check("Next after the last World 0 level offers the first World 1 level",!ev(`$("#dNext").hidden`)&&ev(`$("#dNext").textContent`)==="Next: Meet the chip");
 ev(`$("#dNext").click()`);check("the Next button opens that level",ev("G.level.id")==="gpu-anatomy");
 ev(`loadLevel(LEVELS[LEVELS.length-1].id);win(3)`);check("no Next button after the last level",ev(`$("#dNext").hidden`));
 ev(`$("#modal").hidden=true`);ev(`renderCompare()`);
 const links=ev(`[...document.querySelectorAll('#cmpBody .lvlink')].map(b=>b.dataset.level+"="+b.textContent)`);
 check("Compare panel links use real IDs and current numbers",links.length===6&&links.every(x=>{const [id,label]=x.split("=");return ev(`(l=>!!l&&"W"+l.world+"·L"+l.n)(LEVEL_BY_ID.get(${JSON.stringify(id)}))`)===label}),links.join(" "));
 ev(`loadLevel("launch-overhead")`);ev(`run("foundry trace")`);check("trace error names the level by its current number",/World 2, Level 1 and the kernel lab/.test(ev("OUT.slice(-1)[0].t")),ev("OUT.slice(-1)[0].t"));
 out.push("ERRORS: "+JSON.stringify(errors));console.log(out.join("\n"));
 check("no page errors apart from canvas",realErrors(errors).length===0,JSON.stringify(realErrors(errors)));
 console.log(`\nCHECKS: ${passes} passed, ${fails.length} failed`+fails.map(f=>"\n  FAIL "+f).join(""));process.exit(fails.length?1:0)})();
