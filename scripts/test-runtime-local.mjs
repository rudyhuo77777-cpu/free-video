// Actual workerd/Miniflare + local D1. AI is a TEST-ONLY fixture, not remote inference.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {requireNode,wrangler,wranglerPath,root} from './process.mjs';
import {availablePort,stopChild} from './local-test-support.mjs';
let child,persist;const records=[];
try{
  requireNode();wranglerPath();persist=fs.mkdtempSync(path.join(os.tmpdir(),'freevideo-d1-test-'));
  const cfg='wrangler.runtime-test.jsonc';
  wrangler(['d1','migrations','apply','DB','--local','--config',cfg,'--persist-to',persist],{env:{...process.env,CI:'true'}});
  // Second apply verifies the real Wrangler migration ledger skips already-applied files.
  wrangler(['d1','migrations','apply','DB','--local','--config',cfg,'--persist-to',persist],{env:{...process.env,CI:'true'}});
  const port=await availablePort(),base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,[wranglerPath(),'dev','--config',cfg,'--ip','127.0.0.1','--port',String(port),'--persist-to',persist],{cwd:root,stdio:'inherit',env:process.env});
  child.on('error',e=>console.error(e.message));let ready=false;
  for(let i=0;i<45;i++){if(child.exitCode!==null)throw new Error('Local workerd stopped. See preceding output.');try{const r=await fetch(base+'/__test_health',{signal:AbortSignal.timeout(500)});if((await r.json()).probe==='local-workerd-fixture-ai'){ready=true;break;}}catch{}await delay(1000);}
  if(!ready)throw new Error('Local workerd did not start. No production resource was touched.');
  const headers={'content-type':'application/json',cookie:'free_video_guest=22222222-2222-4222-8222-222222222222'};
  async function call(route,body,status){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});assert.equal(r.status,status,route);assert(r.headers.get('content-type').includes('application/json'));const j=await r.json();records.push({route,http:r.status,data:j});return j;}
  assert.equal((await call('/api/ready',undefined,200)).schemaVersion,2);
  assert.equal((await call('/api/scripts/quota',undefined,200)).remaining,3);
  const payload={productName:'Botol minum',duration:15,idempotencyKey:'runtime-001'};
  assert.equal((await call('/api/scripts/jobs',payload,200)).status,'completed');
  assert.equal((await call('/api/scripts/jobs',payload,200)).duplicate,true);
  assert.equal((await call('/api/scripts/jobs/runtime-001',undefined,200)).status,'completed');
  assert.equal((await call('/api/scripts/quota',undefined,200)).remaining,2);
  await call('/api/scripts/jobs',null,400);
  console.log('LOCAL WORKERD + D1 PASS. AI was a deterministic test fixture. No MP4/TTS/remote-AI acceptance claim.');
  fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/runtime-local-results.json'),JSON.stringify({timestamp:new Date().toISOString(),runtime:'real local workerd and D1',ai:'fixture',records},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}finally{await stopChild(child);if(persist)try{fs.rmSync(persist,{recursive:true,force:true});}catch{console.error(`Local temporary state retained: ${persist}`);}}
