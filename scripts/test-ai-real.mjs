import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {requireNode,wranglerPath,root} from './process.mjs';
import {requireFreePort,stopChild} from './local-test-support.mjs';
let child;
const evidence={timestamp:new Date().toISOString(),test:'real-workers-ai-probe',inferenceAttempted:false,productionDatabaseTouched:false,results:[]};
try {
  requireNode();
  if(!process.argv.includes('--accept-ai-usage'))throw new Error('This calls REAL Cloudflare AI (up to 2 calls per duration). Repeat with --accept-ai-usage to proceed. It does not touch production D1 or deploy a Worker.');
  await requireFreePort(8791);wranglerPath();
  console.log('REAL AI probe: Cloudflare usage applies. Local test-only Worker; no D1 binding.');
  child=spawn(process.execPath,[wranglerPath(),'dev','--config','wrangler.ai-test.jsonc','--ip','127.0.0.1','--port','8791'],{cwd:root,stdio:'inherit',env:process.env});
  child.on('error',e=>console.error(e.message));
  let ready=false;
  for(let i=0;i<90;i++){
    if(child.exitCode!==null)throw new Error('Wrangler exited. Check the authentication/network error above.');
    try{const r=await fetch('http://127.0.0.1:8791/health',{signal:AbortSignal.timeout(750)});const j=await r.json();if(r.ok&&j.probe==='real-ai-no-database'){ready=true;break;}}catch{}
    await delay(1000);
  }
  if(!ready)throw new Error('Local real-AI probe did not start. Run npx wrangler login in the correct Cloudflare account, then retry.');
  for(const duration of process.argv.includes('--all')?[15,30,60,90,120]:[15]){
    evidence.inferenceAttempted=true;
    const r=await fetch('http://127.0.0.1:8791/director',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productName:'Botol minum',duration}),signal:AbortSignal.timeout(135000)});
    const data=await r.json();evidence.results.push({duration,http:r.status,...data});
    console.log(JSON.stringify({duration,http:r.status,ok:data.ok,model:data.model,error:data.error,stage:data.stage,scenes:data.result?.scenes?.length}));
    if(!r.ok)break;
  }
  if(evidence.results.some(x=>!x.ok))throw new Error('REAL AI test failed. See evidence/real-ai-results.json; no dashboard clicking is necessary.');
  evidence.status='PASS';console.log('REAL AI PROBE PASS. Still not a TTS/MP4 device acceptance result.');
}catch(error){evidence.status='FAILED_OR_BLOCKED';evidence.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  await stopChild(child);
  fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/real-ai-results.json'),JSON.stringify(evidence,null,2)+'\n');
}
