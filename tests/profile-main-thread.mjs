// Profiles main-thread work while the site loads: long tasks, timing marks and the
// functions with the most self time. Usage: node tests/profile-main-thread.mjs <url>
import {chromium} from '@playwright/test';
const b=await chromium.launch({args:['--ignore-gpu-blocklist','--use-angle=d3d11']});
const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:1366,height:768}});
const p=await ctx.newPage();const cdp=await ctx.newCDPSession(p);
await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start');
await p.addInitScript(()=>{window.__long=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push([Math.round(e.startTime),Math.round(e.duration)]);}).observe({type:'longtask',buffered:true});});
await p.goto(process.argv[2]);
await p.waitForFunction(()=>performance.getEntriesByName('anima:full-detail').length>0,null,{timeout:60000});
await p.waitForTimeout(1500);
const {profile}=await cdp.send('Profiler.stop');
console.log('long tasks',JSON.stringify(await p.evaluate(()=>window.__long)));
console.log('marks',JSON.stringify(await p.evaluate(()=>performance.getEntriesByType('mark').map(m=>[m.name,Math.round(m.startTime)]))));
const self=new Map(),dt=profile.timeDeltas,byId=new Map(profile.nodes.map(n=>[n.id,n]));
profile.samples.forEach((id,i)=>{const n=byId.get(id),f=n.callFrame,k=`${f.functionName||'(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;self.set(k,(self.get(k)??0)+(dt[i]??0)/1000);});
[...self].filter(([k])=>!k.startsWith('(idle)')&&!k.startsWith('(program)')).sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v])=>console.log(v.toFixed(0).padStart(6),'ms',k));
await b.close();
