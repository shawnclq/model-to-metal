const {JSDOM}=require("jsdom");const fs=require("fs");
const html=fs.readFileSync(process.argv[2],"utf8");const errors=[];
const dom=new JSDOM("<!doctype html><html><head></head><body>"+html+"</body></html>",{runScripts:"dangerously",pretendToBeVisual:true,url:"https://x.test/"});
const w=dom.window;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
w.addEventListener("error",e=>errors.push(e.message));dom.virtualConsole.on("jsdomError",e=>errors.push(String(e.message||e)));
setTimeout(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const ev=s=>w.eval(s);const out=[];
 const n=ev("LEVELS.length");out.push("levels "+n+" | "+ev("LEVELS.map(l=>l.id+':'+l.title).join(', ')"));
 for(let id=1;id<=n;id++){if(ev(`LEVELS[${id-1}].quiz`)){ev(`loadLevel(${id})`);out.push(`L${id} quiz q=${ev("document.querySelectorAll('#quiz .q').length")}`);continue}
   ev(`loadLevel(${id})`);const before=ev("goalOk(G.level,G.S)");const ans=ev("G.level.answer(G.S)");ev(`run(${JSON.stringify(ans)})`);
   await sleep(ev("G.level.title")==="Follow one matmul"?6000:1300);
   out.push(`L${id} ${ev("G.level.title")}: before=${before} after=${ev("goalOk(G.level,G.S)")} won=${ev("G.won")}\n   ${ev("OUT.slice(-5).map(o=>o.t).join(' | ')").slice(0,500)}`);ev(`$("#modal").hidden=true`)}
 for(const lab of ["lab1","lab2","lab3","lab4"]){ev(`loadLevel("${lab}")`);ev(`run("help && foundry status && nvidia-smi")`);out.push(lab+": "+ev("OUT.slice(-3).map(o=>o.t).join(' | ')").slice(0,300))}
 ev(`loadLevel("lab3")`);ev(`run("foundry server mi300x && nvidia-smi && amd-smi && rocm-smi --showtopo && all_reduce_perf -g 8 && foundry tp 8 && foundry server hgxb200 && foundry dtype fp4 && foundry status")`);out.push("lab3 amd: "+ev("OUT.slice(-30).map(o=>o.t).join('\\n')"));ev(`renderCompare()`);out.push("compare rows: "+ev("document.querySelectorAll('#cmpBody tbody tr').length"));ev(`loadLevel("lab1")`);ev(`run("foundry gpu mi355x && foundry dtype fp4 && amd-smi && foundry inspect cu")`);out.push("lab1 amd: "+ev("OUT.slice(-6).map(o=>o.t).join(' | ')"));
 ev(`loadLevel("lab4")`);ev(`run("foundry mode train && foundry nodes 4 && foundry net eth && foundry status && foundry layout 8x2")`);out.push("lab4 train: "+ev("OUT.slice(-6).map(o=>o.t).join(' | ')"));
 // negative paths
 ev(`loadLevel(${ev("LEVELS.find(l=>l.title==='Two boxes, one model').id")})`);ev(`run("vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 && ray start --address=node-1:6379 && ray start --head && vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8 --pipeline-parallel-size 2 && vllm serve meta-llama/Llama-3.1-405B-Instruct --tensor-parallel-size 8")`);out.push("ray neg: "+ev("OUT.slice(-8).map(o=>o.t).join(' | ')"));
 ev(`loadLevel(${ev("LEVELS.find(l=>l.title==='Share the GPU').id")})`);ev(`run("nvidia-smi mig -cgi 1g.10gb -C && sudo nvidia-smi -i 0 -mig 1 && nvidia-smi mig -lgip && nvidia-smi mig -cgi 3g.40gb,3g.40gb,1g.10gb -C && nvidia-smi mig -cgi 7g.80gb -C && foundry share timeslice")`);out.push("mig neg: "+ev("OUT.slice(-14).map(o=>o.t).join(' | ')"));
 out.push("ERRORS: "+JSON.stringify(errors));console.log(out.join("\n"));process.exit(0)},300);
