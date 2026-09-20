import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyWebIntegrity} from '../scripts/web-integrity.mjs';
import {productionPlan,assertReleaseGate} from '../scripts/deploy-production.mjs';
import {DEFAULT_MODEL,resolveModel,createDirector} from '../worker/director.js';
import worker from '../worker/index.js';
import {D1Adapter,env,req,director,root,guest} from './helpers.mjs';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');const config=JSON.parse(read('wrangler.jsonc'));
const vars={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),FREE_VIDEO_D1_ID:'abcdef12-1234-4234-8234-123456789abc'};
const results=[];
async function test(id,fn){try{await fn();results.push({id,status:'PASS'});console.log(`PASS ${id}`);}catch(e){results.push({id,status:'FAIL',message:e.message});console.log(`FAIL ${id}: ${e.message}`);}}
await test('release name and version',()=>assert.equal(JSON.parse(read('VERSION.json')).version,'0.3.3.2-lite'));
await test('21 frozen web files unchanged; 2 Next-managed files validated',()=>{const result=verifyWebIntegrity(root);assert.equal(result.frozenFiles,21);assert.equal(result.managedFiles,2);});
await test('Core source and original migration retain reference bytes',()=>{for(const [p,h]of Object.entries(JSON.parse(read('tests/core-baseline-sha256.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex'),h,p);});
await test('production plan rejects missing account',()=>assert.throws(()=>productionPlan(config,{}),/ACCOUNT_ID/));
await test('production plan rejects missing DB identity',()=>assert.throws(()=>productionPlan(config,{CLOUDFLARE_ACCOUNT_ID:vars.CLOUDFLARE_ACCOUNT_ID}),/EXISTING/));
await test('production plan rejects local placeholder DB',()=>assert.throws(()=>productionPlan(config,{...vars,FREE_VIDEO_D1_ID:'00000000-0000-0000-0000-000000000001'}),/EXISTING/));
await test('production plan refuses wrong Worker name',()=>assert.throws(()=>productionPlan({...config,name:'another-project'},vars),/blocked/));
await test('production plan refuses multiple D1 bindings',()=>assert.throws(()=>productionPlan({...config,d1_databases:[...config.d1_databases,...config.d1_databases]},vars),/blocked/));
await test('production operation sequence migrates before publishing',()=>{const p=productionPlan(config,vars);assert.deepEqual(p.commands[0],['d1','migrations','apply','DB','--remote','--config','wrangler.resolved.jsonc']);assert.deepEqual(p.commands[1],['deploy','--config','wrangler.resolved.jsonc']);assert.equal(p.config.account_id,vars.CLOUDFLARE_ACCOUNT_ID);assert.equal(p.config.d1_databases[0].database_id,vars.FREE_VIDEO_D1_ID);assert.equal(config.d1_databases[0].database_id,'SET_EXISTING_D1_DATABASE_ID');});
await test('plan-only command executes with no Wrangler/deployment required',()=>{const r=spawnSync(process.execPath,['scripts/deploy-production.mjs','--plan'],{cwd:root,env:{...process.env,...vars},encoding:'utf8'});assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);assert.equal(p.commands.length,2);});
await test('failed process stops command sequence',()=>{const r=spawnSync(process.execPath,['--input-type=module','-e',`import {run} from './scripts/process.mjs';run(process.execPath,['-e','process.exit(9)']);console.log('SHOULD_NOT_RUN');`],{cwd:root,encoding:'utf8'});assert.notEqual(r.status,0);assert(!r.stdout.includes('SHOULD_NOT_RUN'));});
await test('preview config cannot access production D1',()=>{const l=JSON.parse(read('wrangler.local.jsonc'));assert.equal(l.d1_databases[0].remote,false);assert(l.d1_databases[0].database_id.startsWith('00000000-'));assert.notEqual(l.name,'free-video');assert.equal(l.ai.remote,true);});
await test('real AI test config has no D1 or production entry',()=>{const a=JSON.parse(read('wrangler.ai-test.jsonc'));assert.equal(a.d1_databases,undefined);assert.equal(a.ai.remote,true);assert.equal(a.main,'./tests/ai-probe-worker.js');assert.notEqual(a.name,'free-video');});
await test('runtime test config has no remote AI or D1',()=>{const r=JSON.parse(read('wrangler.runtime-test.jsonc'));assert.equal(r.ai,undefined);assert.equal(r.d1_databases[0].remote,false);assert.notEqual(r.name,'free-video');assert.notEqual(r.main,config.main);});
await test('declared startup/test scripts actually exist',()=>{const scripts=JSON.parse(read('package.json')).scripts;for(const s of Object.values(scripts)){for(const m of s.matchAll(/(?:node(?: --no-warnings)?)\s+((?:scripts|tests)\/[^\s&]+)/g))assert(fs.existsSync(path.join(root,m[1])),m[1]);}});
await test('deprecated model is rejected before inference',async()=>{let n=0;await assert.rejects(()=>createDirector({AI_MODEL:'@cf/meta/llama-3.1-8b-instruct',AI:{run:async()=>{n++;}}},'Botol minum',15),/ai_model_deprecated/);assert.equal(n,0);});
await test('new default matches configured model',()=>{assert.equal(DEFAULT_MODEL,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');assert.equal(resolveModel(config.vars),DEFAULT_MODEL);assert.equal(resolveModel({AI_MODEL:'  '}),DEFAULT_MODEL);});
await test('old -fast model is not mistakenly blacklisted',()=>assert.equal(resolveModel({AI_MODEL:'@cf/meta/llama-3.1-8b-instruct-fast'}),'@cf/meta/llama-3.1-8b-instruct-fast'));
await test('numeric upstream 403 becomes stable auth error, no retry',async()=>{let n=0;await assert.rejects(()=>createDirector({AI:{run:async()=>{n++;throw Object.assign(new Error('denied'),{code:403});}}},'Botol minum',15),/ai_auth_failed/);assert.equal(n,1);});
await test('untrusted error code is not returned as a diagnostic secret',async()=>{await assert.rejects(()=>createDirector({AI:{run:async()=>{throw Object.assign(new Error('provider unavailable'),{code:'some-secret-string'});}}},'Botol minum',15),e=>e.code==='ai_upstream_unavailable');});
await test('readiness rejects deprecated runtime model, no inference',async()=>{const db=new D1Adapter();try{const e=env(db);e.AI_MODEL='@cf/meta/llama-3.1-8b-instruct';const r=await worker.fetch(req('/api/ready',null),e);assert.equal(r.status,503);assert.equal((await r.json()).error,'ai_model_deprecated');}finally{db.close();}});
await test('deprecated model cannot take a free-script credit',async()=>{const db=new D1Adapter();try{const e=env(db);e.AI_MODEL='@cf/meta/llama-3.1-8b-instruct';const r=await worker.fetch(req(),e);assert.equal(r.status,503);assert.equal(db.value('SELECT COUNT(*) n FROM script_requests').n,0);}finally{db.close();}});
await test('custom model fallback request still contains full contract',async()=>{let request;await createDirector({AI_MODEL:'@cf/meta/llama-3.1-8b-instruct-fast',AI:{run:async(_,r)=>{request=r;return {response:director()};}}},'Botol minum',15);assert(request.messages[0].content.includes('assetKeyword'));assert(request.messages[0].content.includes('required'));});
await test('production plan refuses test-only entry',()=>assert.throws(()=>productionPlan({...config,main:'./tests/runtime-probe-worker.js'},vars),/blocked/));
await test('production plan refuses missing AI binding',()=>assert.throws(()=>productionPlan({...config,ai:undefined},vars),/blocked/));
// --- STEP 2 additions for FV-003. The release gate is asserted directly with an injected
// --- runCommand so the offline suite does not re-enter itself. Existing guards unchanged.
import {currentFingerprints} from '../scripts/verify.mjs';
const webManifest=JSON.parse(read('tests/web-baseline-sha256.json'));
function gateTree(){
  const r=fs.mkdtempSync(path.join(os.tmpdir(),'fv-gate-'));
  for(const p of [...Object.keys(webManifest),'tests/web-baseline-sha256.json','tests/web-tsconfig-reference.json']){
    const dst=path.join(r,p);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,p),dst);
  }
  fs.mkdirSync(path.join(r,'apps/web/out'),{recursive:true});
  fs.writeFileSync(path.join(r,'apps/web/out/index.html'),'<!doctype html><title>gate</title>');
  fs.writeFileSync(path.join(r,'package-lock.json'),'{"name":"gate","lockfileVersion":3,"packages":{}}');
  fs.mkdirSync(path.join(r,'evidence'),{recursive:true});
  return r;
}
function writeRecord(r,over={}){
  const rec={release:'0.3.3.2',status:'PASS',phases:['offline-before','build','typecheck','offline-after'],
    remoteAIExecuted:false,productionDeploymentExecuted:false,...currentFingerprints(r),...over};
  fs.writeFileSync(path.join(r,'evidence/build-verification.json'),JSON.stringify(rec,null,2)+'\n');
  return rec;
}
const noRun=()=>{};
function withGateTree(fn){const r=gateTree();try{return fn(r);}finally{fs.rmSync(r,{recursive:true,force:true});}}

await test('release gate accepts a tree whose verification matches it',()=>withGateTree(r=>{
  writeRecord(r);
  const steps=assertReleaseGate(r,{runCommand:noRun});
  assert.equal(steps.length,5);
}));
await test('release gate refuses a missing verification record',()=>withGateTree(r=>{
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/No evidence\/build-verification\.json/);
}));
await test('release gate refuses a non-PASS verification record',()=>withGateTree(r=>{
  writeRecord(r,{status:'FAIL'});
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/not PASS/);
}));
await test('release gate refuses an unreadable verification record',()=>withGateTree(r=>{
  fs.writeFileSync(path.join(r,'evidence/build-verification.json'),'{not json');
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/not readable JSON/);
}));
await test('release gate refuses a changed dependency lock',()=>withGateTree(r=>{
  writeRecord(r);
  fs.writeFileSync(path.join(r,'package-lock.json'),'{"name":"tampered","lockfileVersion":3,"packages":{}}');
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/package-lock\.json changed/);
}));
await test('release gate refuses a stale or swapped build output',()=>withGateTree(r=>{
  writeRecord(r);
  fs.writeFileSync(path.join(r,'apps/web/out/index.html'),'<!doctype html><title>ARBITRARY</title>');
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/apps\/web\/out changed/);
}));
await test('release gate refuses a frozen UI file changed after verification',()=>withGateTree(r=>{
  writeRecord(r);
  fs.appendFileSync(path.join(r,'apps/web/app/globals.css'),' ');
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/globals\.css/);
}));
await test('release gate refuses tampered Next-managed declarations',()=>withGateTree(r=>{
  writeRecord(r);
  fs.appendFileSync(path.join(r,'apps/web/next-env.d.ts'),'import "untrusted-package";\n');
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/next-env\.d\.ts/);
}));
await test('release gate refuses a missing static artifact',()=>withGateTree(r=>{
  writeRecord(r);
  fs.rmSync(path.join(r,'apps/web/out/index.html'));
  assert.throws(()=>assertReleaseGate(r,{runCommand:noRun}),/Static build missing|apps\/web\/out changed/);
}));
await test('release gate propagates an offline-check failure',()=>withGateTree(r=>{
  writeRecord(r);
  assert.throws(()=>assertReleaseGate(r,{runCommand:()=>{throw new Error('INJECTED offline failure');}}),/INJECTED/);
}));
await test('release gate runs the offline check before reading any verification record',()=>withGateTree(r=>{
  const order=[];
  assert.throws(()=>assertReleaseGate(r,{runCommand:()=>{order.push('offline');throw new Error('stop');}}),/stop/);
  assert.deepEqual(order,['offline']);
}));

const fail=results.filter(x=>x.status==='FAIL').length;
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/release-guards.json'),JSON.stringify({pass:results.length-fail,fail,total:results.length,results},null,2));
console.log(`\nRELEASE GUARDS: ${results.length-fail}/${results.length} PASS; ${fail} FAIL`);if(fail)process.exitCode=1;
