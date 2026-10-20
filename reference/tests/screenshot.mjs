import {chromium} from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});
await p.goto('file://'+process.argv[2]);
await p.evaluate(()=>{loadLevel(LEVELS.find(l=>l.title.startsWith("Many heads")).id)});
await p.evaluate(()=>{run("qhead 6")});await p.waitForTimeout(300);
await p.screenshot({path:'screenshot.png',clip:{x:0,y:0,width:1280,height:900}});await b.close();
