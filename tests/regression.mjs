// Runs actual packaged Worker functions + genuine local SQLite.
// The D1 adapter emulates interface/transaction shape; AI is explicitly mocked here.
// No production resources, remote inference, TTS engine, or MP4 device claims.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import worker from '../worker/index.js';
import {ensureSchema,allowRate,quota,reserveJob,failJob,completeJob,recoverExpired,getJob,LEASE_MS} from '../worker/db.js';
import {createDirector,validateDirector,aiPayload,extractJson,maxNarrationWords} from '../worker/director.js';
import * as directorModule from '../worker/director.js';
globalThis.__fvDirectorModule=directorModule;
import {readJson} from '../worker/http.js';
import {D1Adapter,req,env,director,body,guest,other,root} from './helpers.mjs';
const results=[];
async function check(id,title,fn){try{const note=await fn();results.push({id,title,status:'PASS',note});console.log(`PASS ${id} ${title}`);}catch(error){results.push({id,title,status:'FAIL',message:error.message,stack:error.stack});console.log(`FAIL ${id} ${title}: ${error.message}`);}}
async function withDB(fn){const db=new D1Adapter();try{return await fn(db);}finally{db.close();}}
const fetchApi=(request,e)=>worker.fetch(request,e);
async function responseJson(r,status){assert.equal(r.status,status);assert(r.headers.get('content-type').includes('application/json'));return r.json();}
const used=db=>Number(db.value('SELECT used FROM guest_quota WHERE guest_id=?',guest)?.used||0);

await check('B01','migration apply ledger is repeatable, six application tables',()=>withDB(db=>{
  assert.equal(db.migrate(),0);assert.equal(db.value("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").n,6);
}));
await check('B02','migrated quota returns JSON',()=>withDB(async db=>assert.equal((await responseJson(await fetchApi(req('/api/scripts/quota',null),env(db)),200)).remaining,3)));
await check('D01','unmigrated DB returns 503 JSON rather than rejected Promise',async()=>{const db=new D1Adapter(false);try{
  const r=await fetchApi(req('/api/scripts/quota',null),env(db));const data=await responseJson(r,503);assert.equal(data.stage,'d1_schema');assert.equal(data.requestId,r.headers.get('x-request-id'));
}finally{db.close();}});
await check('D02','readiness rejects incomplete tables',async()=>{const db=new D1Adapter(false);try{
  db.sqlite.exec('CREATE TABLE guest_quota(guest_id TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)');await assert.rejects(()=>ensureSchema(db),/database_not_initialized/);
}finally{db.close();}});
for(const duration of [15,30,60,90,120])await check('A'+duration,`valid structured AI fixture, ${duration}s`,()=>withDB(async db=>{
  let calls=0;const r=await fetchApi(req(undefined,{...body(),duration}),env(db,{run:async()=>{calls++;return{response:director(duration)};}}));
  const data=await responseJson(r,200);assert.equal(data.result.duration,duration);assert.equal(data.result.scenes.reduce((n,s)=>n+s.duration,0),duration);assert.equal(data.remaining,2);assert.equal(calls,1);
}));
await check('A01','schema fallback retains complete schema and repair context',async()=>{
  const calls=[];await createDirector({AI:{run:async(m,r)=>{calls.push(r);if(calls.length===1)throw new Error("JSON Mode couldn't be met");return{response:director()};}}},'Botol minum',15);
  assert.equal(calls.length,2);assert(!calls[1].response_format);const prompt=JSON.stringify(calls[1].messages);assert(prompt.includes('scenes')&&prompt.includes('productName')&&prompt.includes('required'));
});
await check('A02','structurally invalid JSON receives bounded repair',async()=>{let calls=0;const seen=[];
  await createDirector({AI:{run:async(m,r)=>{seen.push(r);return{response:++calls===1?{script:'not a Director'}:director()};}}},'Botol minum',15);
  assert.equal(calls,2);assert(JSON.stringify(seen[1].messages).includes('not a Director'));assert(JSON.stringify(seen[1].messages).includes('director_scene_count'));
});
await check('A03','empty scenes rejected, never fabricated into a successful script',async()=>{
  let calls=0;await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;return{response:{scenes:[{}]}};}}},'Botol minum',120));assert.equal(calls,2);
});
await check('A04','duplicate IDs normalized without changing scene content',async()=>{
  const input=director();input.scenes.forEach(s=>s.id='duplicate');const out=await createDirector({AI:{run:async()=>({response:input})}},'Botol minum',15);
  assert.equal(new Set(out.scenes.map(s=>s.id)).size,4);assert.deepEqual(out.scenes.map(s=>s.voice),input.scenes.map(s=>s.voice));
});
await check('Q01','simple AI failure refunds once and RETAINS a failed audit record',()=>withDB(async db=>{
  const r=await fetchApi(req(),env(db,{run:async()=>{throw new Error('FIXTURE unavailable');}}));const data=await responseJson(r,503);
  assert.equal(data.stage,'ai_director');assert.equal(used(db),0);const row=db.value('SELECT status,quota_charged FROM script_requests');assert.equal(row.status,'failed');assert.equal(row.quota_charged,0);
}));
await check('Q02','post-completion quota-read error NEVER refunds finished work',()=>withDB(async db=>{
  let hit=false;db.fault=(sql)=>{if(!hit&&sql.startsWith('SELECT used FROM guest_quota')){hit=true;throw new Error('FIXTURE quota read');}};
  const data=await responseJson(await fetchApi(req(),env(db)),200);assert(hit);assert.equal(data.remaining,null);assert.equal(used(db),1);assert.equal(db.value('SELECT status FROM script_requests').status,'completed');
}));
await check('Q03','refund storage failure rolls back both operations, remains recoverable',()=>withDB(async db=>{
  db.fault=sql=>{if(sql.startsWith('UPDATE guest_quota SET used=CASE'))throw new Error('FIXTURE refund');};
  const data=await responseJson(await fetchApi(req(),env(db,{run:async()=>{throw new Error('FIXTURE AI');}})),503);
  assert.equal(data.stage,'d1_refund');assert.equal(used(db),1);assert.equal(db.value('SELECT status FROM script_requests').status,'reserved');
  db.fault=null;await recoverExpired(db,guest,Date.now()+LEASE_MS+1);assert.equal(used(db),0);assert.equal(db.value('SELECT status FROM script_requests').status,'expired');
}));
await check('Q04','expired reserved job can be retried and charged once',()=>withDB(async db=>{
  const old=Date.now()-86400000;await reserveJob(db,guest,'job-1','test-hash',3,old);
  db.sqlite.exec('UPDATE script_requests SET request_hash=NULL'); // legacy/pre-upgrade reservation fixture
  const data=await responseJson(await fetchApi(req(),env(db)),200);assert.equal(data.status,'completed');assert.equal(used(db),1);
}));
await check('Q05','atomic rate gate admits exactly one of 12 concurrent requests',()=>withDB(async db=>{
  const decisions=await Promise.all(Array.from({length:12},()=>allowRate(db,'same',1,90)));assert.equal(decisions.filter(Boolean).length,1);
}));
await check('Q06','duplicate completed job reuses durable result without AI/debit',()=>withDB(async db=>{
  let calls=0;const e=env(db,{run:async()=>{calls++;return{response:director()};}});await fetchApi(req(),e);
  const data=await responseJson(await fetchApi(req(),e),200);assert(data.duplicate);assert.equal(calls,1);assert.equal(used(db),1);
}));
await check('F01','FYP token is consumed exactly once under concurrency',()=>withDB(async db=>{
  const token=crypto.randomUUID();db.sqlite.prepare('INSERT INTO fyp_handoffs VALUES(?,?,?,?,0)').run(token,guest,JSON.stringify({productName:'fixture'}),Math.floor(Date.now()/1000)+600);
  const r=await Promise.all([fetchApi(req('/api/fyp/handoff/consume',{token}),env(db)),fetchApi(req('/api/fyp/handoff/consume',{token}),env(db))]);
  assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===409).length,1);
}));
await check('H01','malformed percent-encoded Cookie does not reject fetch',()=>withDB(async db=>{
  const r=await fetchApi(req('/api/health',null,{cookie:'free_video_guest=%ZZ'}),env(db));await responseJson(r,200);assert(r.headers.get('set-cookie'));
}));
await check('H02','malformed JSON returns controlled 400',()=>withDB(async db=>{
  const r=await fetchApi(new Request('http://localhost:8790/api/scripts/jobs',{method:'POST',body:'{broken'}),env(db));assert.equal((await responseJson(r,400)).error,'invalid_json');
}));
await check('H03','null request body returns controlled 400',()=>withDB(async db=>{
  const r=await fetchApi(new Request('http://localhost:8790/api/scripts/jobs',{method:'POST',body:'null'}),env(db));assert.equal((await responseJson(r,400)).error,'invalid_json_object');
}));

// Additional tests beyond the 24 original release checks.
await check('D03','readiness cache cannot leak across different D1 bindings',async()=>{
  const a=new D1Adapter(),b=new D1Adapter(false);try{await ensureSchema(a);await assert.rejects(()=>ensureSchema(b));}finally{a.close();b.close();}
});
await check('D04','readiness rejects six old tables without the new migration',async()=>{
  const db=new D1Adapter(false);try{db.sqlite.exec(fs.readFileSync(path.join(root,'migrations/0001_core.sql'),'utf8'));await assert.rejects(()=>ensureSchema(db));}finally{db.close();}
});
await check('D05','readiness rejects missing required index',()=>withDB(async db=>{db.sqlite.exec('DROP INDEX idx_script_leases');await assert.rejects(()=>ensureSchema(db,true));}));
await check('D06','upgrade preserves project/results and does not over-refund old uncharged rows',async()=>{
  const db=new D1Adapter(false);try{
    db.sqlite.exec(fs.readFileSync(path.join(root,'migrations/0001_core.sql'),'utf8'));db.applied.add('0001_core.sql');
    db.sqlite.prepare('INSERT INTO guest_quota VALUES(?,?,?)').run(guest,2,0);
    const insert=db.sqlite.prepare('INSERT INTO script_requests VALUES(?,?,?,?,?,?)');
    insert.run('completed',guest,'completed',JSON.stringify(director()),0,0);insert.run('a-reserved',guest,'reserved',null,0,0);insert.run('b-uncharged',guest,'reserved',null,0,0);
    db.sqlite.prepare("INSERT INTO product_projects VALUES(?,?,?,'','','','[]','[]',0,0)").run('product-1',guest,'Keep this project');
    assert.equal(db.migrate(),1);assert.equal(db.migrate(),0);await ensureSchema(db,true);
    assert.equal(db.value('SELECT SUM(quota_charged) n FROM script_requests').n,2);
    await recoverExpired(db,guest);assert.equal(used(db),1);assert.equal(db.value('SELECT name FROM product_projects').name,'Keep this project');assert.equal(JSON.parse(db.value("SELECT result_json FROM script_requests WHERE status='completed'").result_json).productName,'Botol minum');
  }finally{db.close();}
});
await check('Q07','12 concurrent reservations cannot exceed three free credits',()=>withDB(async db=>{
  const all=await Promise.all(Array.from({length:12},(_,i)=>reserveJob(db,guest,'parallel-'+i,'hash'+i,3)));
  assert.equal(all.filter(x=>x.acquired).length,3);assert.equal(used(db),3);
}));
await check('Q08','12 same-key reservations produce one lease and one debit',()=>withDB(async db=>{
  const all=await Promise.all(Array.from({length:12},()=>reserveJob(db,guest,'same','hash',3)));
  assert.equal(all.filter(x=>x.acquired).length,1);assert.equal(used(db),1);
}));
await check('Q09','double failure/refund releases exactly one credit',()=>withDB(async db=>{
  const r=await reserveJob(db,guest,'a','h',3);await Promise.all([failJob(db,guest,'a',r.token,'fixture'),failJob(db,guest,'a',r.token,'fixture')]);assert.equal(used(db),0);
}));
await check('Q10','completed job cannot be refunded by a late failure',()=>withDB(async db=>{
  const r=await reserveJob(db,guest,'a','h',3);assert(await completeJob(db,guest,'a',r.token,director()));await failJob(db,guest,'a',r.token,'late');assert.equal(used(db),1);
}));
await check('Q11','late attempt cannot complete or refund a newer lease',()=>withDB(async db=>{
  const old=await reserveJob(db,guest,'a','h',3,Date.now()-LEASE_MS-1);await recoverExpired(db,guest);
  const newer=await reserveJob(db,guest,'a','h',3);assert(newer.acquired);assert.equal(await completeJob(db,guest,'a',old.token,director()),false);
  await failJob(db,guest,'a',old.token,'late');assert.equal(used(db),1);assert.equal((await getJob(db,guest,'a')).lease_token,newer.token);
}));
await check('Q12','failure in final reservation statement rolls the debit back',()=>withDB(async db=>{
  db.fault=sql=>{if(sql.startsWith('UPDATE script_requests SET quota_charged=1'))throw new Error('FIXTURE last step');};
  await assert.rejects(()=>reserveJob(db,guest,'a','h',3));assert.equal(used(db),0);assert.equal(db.value('SELECT COUNT(*) n FROM script_requests').n,0);
}));
await check('Q13','failure in refund status change preserves both reservation and debit',()=>withDB(async db=>{
  const r=await reserveJob(db,guest,'a','h',3);db.fault=sql=>{if(sql.startsWith("UPDATE script_requests SET status='failed'"))throw new Error('FIXTURE status update');};
  await assert.rejects(()=>failJob(db,guest,'a',r.token,'fixture'));assert.equal(used(db),1);assert.equal(db.value('SELECT status FROM script_requests').status,'reserved');
}));
await check('Q14','different payload under same idempotency key is rejected',()=>withDB(async db=>{
  const e=env(db);await fetchApi(req(),e);const data=await responseJson(await fetchApi(req(undefined,{...body(),productName:'Other product'}),e),409);assert.equal(data.error,'idempotency_conflict');assert.equal(used(db),1);
}));
await check('Q15','other guest cannot read or reuse job key',()=>withDB(async db=>{
  const e=env(db);await fetchApi(req(),e);const header={cookie:`free_video_guest=${other}`};
  await responseJson(await fetchApi(req('/api/scripts/jobs/job-1',null,header),e),404);await responseJson(await fetchApi(req(undefined,body(),header),e),404);
}));
await check('Q16','temporary persistence failure is not classified as AI failure',()=>withDB(async db=>{
  db.fault=sql=>{if(sql.startsWith("UPDATE script_requests SET status='completed'"))throw new Error('FIXTURE lost storage');};
  const data=await responseJson(await fetchApi(req(),env(db)),503);assert.equal(data.stage,'d1_persist');assert.equal(used(db),1);assert.equal(db.value('SELECT status FROM script_requests').status,'reserved');
  db.fault=null;await recoverExpired(db,guest,Date.now()+LEASE_MS+1);assert.equal(used(db),0);
}));
await check('Q17','lost response AFTER durable completion cannot refund or invoke AI again',()=>withDB(async db=>{
  const execute=db.execute.bind(db);let injected=false;
  db.execute=(sql,v,k)=>{const r=execute(sql,v,k);if(!injected&&sql.startsWith("UPDATE script_requests SET status='completed'")){injected=true;throw new Error('FIXTURE lost committed response');}return r;};
  let calls=0;const e=env(db,{run:async()=>{calls++;return{response:director()};}});
  assert.equal((await responseJson(await fetchApi(req(),e),503)).stage,'d1_persist');assert.equal(used(db),1);
  assert((await responseJson(await fetchApi(req(),e),200)).duplicate);assert.equal(calls,1);assert.equal(used(db),1);
}));
await check('Q18','expired status becomes failed for unchanged frontend polling contract',()=>withDB(async db=>{
  await reserveJob(db,guest,'job-1','h',3,Date.now()-LEASE_MS-1);const data=await responseJson(await fetchApi(req('/api/scripts/jobs/job-1',null),env(db)),200);assert.equal(data.status,'failed');assert.equal(used(db),0);
}));
await check('Q19','completed replay does not consume rate allowance',()=>withDB(async db=>{
  const e=env(db);await fetchApi(req(),e);const before=db.value('SELECT SUM(count) n FROM rate_limits').n;await fetchApi(req(),e);assert.equal(db.value('SELECT SUM(count) n FROM rate_limits').n,before);
}));
await check('Q20','free cap returns 402 without extra pending rows/debits',()=>withDB(async db=>{
  const e=env(db);for(let i=0;i<3;i++)await responseJson(await fetchApi(req(undefined,{...body(),idempotencyKey:'job'+i}),e),200);
  const data=await responseJson(await fetchApi(req(undefined,{...body(),idempotencyKey:'fourth'}),e),402);assert.equal(data.error,'free_script_limit_reached');assert.equal(used(db),3);assert.equal(db.value('SELECT COUNT(*) n FROM script_requests').n,3);
}));
await check('Q21','valid retry after failed AI works without duplicated debit',()=>withDB(async db=>{
  await fetchApi(req(),env(db,{run:async()=>{throw new Error('FIXTURE');}}));assert.equal(used(db),0);
  await responseJson(await fetchApi(req(),env(db)),200);assert.equal(used(db),1);assert.equal(db.value('SELECT attempts FROM script_requests').attempts,2);
}));
await check('Q22','repeated expiry recovery cannot refund completed credits',()=>withDB(async db=>{
  const a=await reserveJob(db,guest,'a','a',3);await completeJob(db,guest,'a',a.token,director());await reserveJob(db,guest,'b','b',3,Date.now()-LEASE_MS-1);
  await Promise.all([recoverExpired(db,guest),recoverExpired(db,guest)]);assert.equal(used(db),1);
}));
await check('R01','expired rate bucket resets atomically',()=>withDB(async db=>{
  db.sqlite.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('expired',10,0);
  const all=await Promise.all(Array.from({length:10},()=>allowRate(db,'expired',2,90)));assert.equal(all.filter(Boolean).length,2);
}));
await check('F02','concurrent FYP handoff creation consumes its binding once',()=>withDB(async db=>{
  const token=crypto.randomUUID();db.sqlite.prepare('INSERT INTO fyp_bindings VALUES(?,?,?)').run(token,guest,Math.floor(Date.now()/1000)+300);
  const payload={returnBinding:token,productName:'Botol minum',duration:15,viralHook:'Lihat detail produk'};
  const rs=await Promise.all([fetchApi(req('/api/fyp/handoff',payload),env(db)),fetchApi(req('/api/fyp/handoff',payload),env(db))]);
  assert.equal(rs.filter(r=>r.status===200).length,1);assert.equal(db.value('SELECT COUNT(*) n FROM fyp_handoffs').n,1);
}));
await check('F03','foreign or expired FYP token does not reveal payload',()=>withDB(async db=>{
  const token=crypto.randomUUID();db.sqlite.prepare('INSERT INTO fyp_handoffs VALUES(?,?,?,?,0)').run(token,guest,JSON.stringify({secret:'fixture'}),Math.floor(Date.now()/1000)+300);
  const data=await responseJson(await fetchApi(req('/api/fyp/handoff/consume',{token},{cookie:`free_video_guest=${other}`}),env(db)),404);assert(!JSON.stringify(data).includes('secret'));
}));
await check('H04','unknown API never falls through to HTML',()=>withDB(async db=>{await responseJson(await fetchApi(req('/api/unknown',null),env(db)),404);}));
await check('H05','encoded invalid path returns JSON 400',()=>withDB(async db=>{await responseJson(await fetchApi(req('/api/scripts/jobs/%ZZ',null),env(db)),400);}));
await check('H06','array JSON body rejected',()=>withDB(async db=>{await responseJson(await fetchApi(req(undefined,[]),env(db)),400);}));
await check('H07','oversized body without Content-Length rejected during streaming',async()=>{
  let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(10000));},cancel(){cancelled=true;}});
  const r=new Request('http://localhost/api',{method:'POST',body:stream,duplex:'half'});await assert.rejects(()=>readJson(r,20000),/request_too_large/);assert(cancelled);
});
await check('H08','missing AI binding fails before quota reservation',()=>withDB(async db=>{await responseJson(await fetchApi(req(),env(db,null)),503);assert.equal(used(db),0);}));
await check('H09','liveness is separate from database readiness',async()=>{const db=new D1Adapter(false);try{
  assert.equal((await responseJson(await fetchApi(req('/api/health',null),env(db)),200)).check,'liveness-only');await responseJson(await fetchApi(req('/api/ready',null),env(db)),503);
}finally{db.close();}});
await check('H10','ready reports inference not checked and does not call AI',()=>withDB(async db=>{let calls=0;const e=env(db,{run:async()=>{calls++;}});const data=await responseJson(await fetchApi(req('/api/ready',null),e),200);assert.equal(data.inferenceChecked,false);assert.equal(calls,0);}));
await check('H11','unexpected project storage failure remains controlled JSON',()=>withDB(async db=>{
  db.fault=sql=>{if(sql.startsWith('SELECT id,name'))throw new Error('FIXTURE storage');};await responseJson(await fetchApi(req('/api/projects',null),env(db)),500);
}));
await check('H12','cross-origin write is rejected',()=>withDB(async db=>{await responseJson(await fetchApi(req(undefined,body(),{origin:'https://evil.invalid'}),env(db)),403);}));
await check('A05','AI response wrapper variants are decoded',()=>{
  const d=director();for(const x of [{response:d},{result:{response:d}},{choices:[{message:{content:JSON.stringify(d)}}]},{choices:[{message:{parsed:d}}]},d])assert.deepEqual(aiPayload(x),d);
});
await check('A06','balanced parser supports quoted braces and JSON fences',()=>{
  const d=director();d.scenes[0].voice='Cek bentuk {produk} sebelum memilih.';assert.deepEqual(extractJson('```json\n'+JSON.stringify(d)+'\n```'),d);assert.deepEqual(extractJson('Here is JSON: '+JSON.stringify(d)),d);
});
await check('A07','ambiguous multiple JSON objects are rejected',()=>assert.throws(()=>extractJson('Prefix {} {}')));
await check('A08','NaN/infinity durations and empty voice cannot pass validator',()=>{
  for(const n of [NaN,Infinity,0,-1,999,'3']){const d=director();d.scenes[0].duration=n;assert.throws(()=>validateDirector(d,'Botol minum',15));}
  const d=director();d.scenes[0].voice=' ';assert.throws(()=>validateDirector(d,'Botol minum',15));
});
await check('A09','malformed AI output never exceeds two calls',async()=>{let calls=0;await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;return{response:'not json'};}}},'Botol minum',15));assert.equal(calls,2);} );
await check('A10','auth/quota/upstream errors are not blindly retried',async()=>{
  for(const message of ['Unauthorized 401','daily quota limit','Model not found','Upstream unavailable']){let calls=0;await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;throw new Error(message);}}},'Botol minum',15));assert.equal(calls,1);}
});
await check('A11','AI timeout is bounded and never starts an overlapping retry',async()=>{
  let calls=0;const start=Date.now();await assert.rejects(()=>createDirector({AI:{run:()=>{calls++;return new Promise(()=>{});}}},'Botol minum',15,'','',{timeoutMs:25}),/ai_timeout/);assert.equal(calls,1);assert(Date.now()-start<1000);
});
await check('A12','long video request has bounded larger output budget',async()=>{
  let seen;await createDirector({AI:{run:async(m,r)=>{seen=r;return{response:director(120)};}}},'Botol minum',120);assert.equal(seen.max_tokens,6144);assert(JSON.stringify(seen.messages).includes('120'));assert.equal(seen.response_format.json_schema.properties.scenes.minItems,18);
});
await check('A13','invalid enum or unreasonable total duration triggers rejection',()=>{
  const d=director();d.scenes[0].camera='fly-away';assert.throws(()=>validateDirector(d,'Botol minum',15));d.scenes[0].camera='push_in';d.scenes.forEach(s=>s.duration=1);assert.throws(()=>validateDirector(d,'Botol minum',15));
});
await check('P01','product project create/list contract preserved',()=>withDB(async db=>{
  const e=env(db);await responseJson(await fetchApi(req('/api/projects',{name:'Portable Blender',price:'Rp100.000',sellingPoints:['USB charging']}),e),201);
  const data=await responseJson(await fetchApi(req('/api/projects',null),e),200);assert.equal(data.projects.length,1);assert.equal(data.projects[0].price,'Rp100.000');
}));
await check('P02','null asset scene receives JSON 400',()=>withDB(async db=>{await responseJson(await fetchApi(req('/api/assets/plan',{scenes:[null]}),env(db)),400);}));
await check('S01','non-API path goes to original static asset binding',()=>withDB(async db=>{const r=await fetchApi(req('/video',null),env(db));assert.equal(await r.text(),'ASSET_FIXTURE');}));

async function availablePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));return port;}
await check('T01','real Voice Bridge HTTP CORS includes both :8790 origins and denies unrelated site',async()=>{
  const port=await availablePort();const child=spawn(process.execPath,[path.join(root,'apps/voice-bridge/server.mjs')],{env:{...process.env,AURIA_VOICE_BRIDGE_PORT:String(port),AURIA_VOICE_ALLOWED_ORIGINS:''},stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('bridge start timeout')),4000);t.unref();})]);
    for(const origin of ['http://localhost:3000','https://freevideo.eco-velo.com','http://localhost:8790','http://127.0.0.1:8790']) {
      const r=await fetch(`http://127.0.0.1:${port}/pair`,{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/pair`,{method:'OPTIONS',headers:{origin:'https://evil.invalid'}})).status,403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/tts`,{method:'POST',headers:{origin:'http://localhost:8790'},body:'{}'})).status,401);
  }finally{child.kill();if(child.exitCode===null)await once(child,'exit');}
});
await check('F04','only configured FYP origin receives CORS preflight',()=>withDB(async db=>{
  for(const [origin,status]of [['https://fyp.eco-velo.com',204],['https://evil.invalid',403]]){
    const r=await fetchApi(new Request('http://localhost:8790/api/fyp/handoff',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}}),env(db));
    assert.equal(r.status,status);assert.equal(r.headers.get('access-control-allow-origin'),status===204?origin:null);
  }
}));
// ===========================================================================
// STEP 4 — FIXTURE_AI coverage. Every AI here is a deterministic local fixture or a
// fault injector; NO remote inference is performed. A PASS below means
// "FIXTURE_AI PASS" for that layer only, never "the AI works".
// Existing assertions above are unchanged.
// ===========================================================================
const SCENE_RANGES_EXPECTED={15:[4,6],30:[6,10],60:[10,16],90:[14,20],120:[18,24]};
const DURATIONS=[15,30,60,90,120];
const VOICE_POOL=[
  'Cek bentuk dan detail produk ini sebelum kamu memilih.',
  'Bahan stainless tebal membuat botol ini awet dipakai setiap hari.',
  'Tutupnya rapat sehingga air tidak tumpah di dalam tas.',
  'Ukurannya pas untuk dibawa ke kantor maupun ke kampus.',
  'Bagian dalam mudah dibersihkan tanpa meninggalkan bau.',
  'Suhu air tetap terjaga selama beberapa jam pemakaian.'
];
const TEMPLATE_POOL=['problem_hook','lifestyle','feature_3','zoom_detail','comparison','price_drop','countdown_cta','final_cta'];
// Builds a director the ORIGINAL validateDirector accepts, with an explicit scene count.
function fixtureDirectorFor(duration,sceneCount,{totalOverride=null,voiceWords=null}={}){
  // CR-002: the narration budget is now measured against real F5 delivery, so the default
  // fixture narration must sit comfortably inside it instead of using fixed sentences.
  if(voiceWords===null) voiceWords=Math.max(sceneCount,Math.floor(maxNarrationWords(duration)*0.7));
  const count=sceneCount;
  const target=totalOverride??duration;
  const base=Math.floor(target/count);
  const durations=Array.from({length:count},()=>Math.max(1,base));
  let remainder=target-durations.reduce((a,b)=>a+b,0);
  for(let i=0;remainder>0;i=(i+1)%count){durations[i]+=1;remainder--;}
  for(let i=0;remainder<0;i=(i+1)%count){if(durations[i]>1){durations[i]-=1;remainder++;}}
  const scenes=durations.map((d,i)=>({
    id:`scene-${i+1}`,duration:d,
    template:i===0?'problem_hook':TEMPLATE_POOL[(i%(TEMPLATE_POOL.length-1))+1],
    assetKeyword:'stainless water bottle',headline:'Lihat detail produknya',
    voice:VOICE_POOL[i%VOICE_POOL.length],camera:'push_in',transition:'cut'
  }));
  if(voiceWords!==null){
    // Every scene needs at least one word (nonEmpty), so the minimum reachable total is
    // `count`. Distribute the remainder so the achieved total is EXACTLY voiceWords.
    const per=Array.from({length:count},()=>1);
    let left=voiceWords-count;
    for(let i=0;left>0;i=(i+1)%count){per[i]+=1;left--;}
    scenes.forEach((s,i)=>{s.voice=Array.from({length:per[i]},()=>'kata').join(' ');});
  }
  return {version:'1.0',language:'id',ratio:'9:16',duration,productName:'Botol minum stainless',
    style:'fast-commerce',cta:'Cek detail produknya sekarang.',scenes};
}
const rejects=(fn,code)=>{let thrown=null;try{fn();}catch(e){thrown=e;}assert(thrown,`expected ${code}, got success`);assert.equal(thrown.code,code,`expected ${code}, got ${thrown.code}`);};

// --- T4-1 Director schema and the five duration boundaries -----------------
await check('X00','FIXTURE_AI: the narration budget matches the measured real-F5 figures (CR-002)',()=>{
  // evidence/dev/CR-002/C2-2/analysis.json — (duration - 1.33s overhead) x 1.8925 words/sec
  const expected={15:25,30:54,60:111,90:167,120:224};
  for(const [d,words] of Object.entries(expected)) assert.equal(maxNarrationWords(Number(d)),words,`${d}s budget`);
  for(const d of DURATIONS) assert(maxNarrationWords(d)<Math.ceil(d*3.6),`${d}s must be below the old unmeasured 3.6 w/s bound`);
  for(const d of DURATIONS) assert(maxNarrationWords(d)>Math.ceil(d*0.35),`${d}s upper bound must stay above the lower bound`);
  return 'FIXTURE_AI';
});
await check('X01','FIXTURE_AI: directorSchema pins the scene-count range for all five durations',()=>{
  const {directorSchema}=globalThis.__fvDirectorModule;
  for(const d of DURATIONS){
    const schema=directorSchema(d);
    const [lo,hi]=SCENE_RANGES_EXPECTED[d];
    assert.equal(schema.properties.scenes.minItems,lo,`${d}s minItems`);
    assert.equal(schema.properties.scenes.maxItems,hi,`${d}s maxItems`);
    assert.deepEqual(schema.properties.duration.enum,[d],`${d}s duration enum`);
  }
  return 'FIXTURE_AI';
});
await check('X02','FIXTURE_AI: scene-count lower bound minus one is rejected for all five durations',()=>{
  for(const d of DURATIONS){const [lo]=SCENE_RANGES_EXPECTED[d];
    rejects(()=>validateDirector(fixtureDirectorFor(d,lo-1),'Botol minum stainless',d),'director_scene_count');}
  return 'FIXTURE_AI';
});
await check('X03','FIXTURE_AI: scene-count lower and upper bounds are accepted for all five durations',()=>{
  for(const d of DURATIONS){const [lo,hi]=SCENE_RANGES_EXPECTED[d];
    for(const n of [lo,hi]) assert.equal(validateDirector(fixtureDirectorFor(d,n),'Botol minum stainless',d).scenes.length,n);}
  return 'FIXTURE_AI';
});
await check('X04','FIXTURE_AI: scene-count upper bound plus one is rejected for all five durations',()=>{
  for(const d of DURATIONS){const [,hi]=SCENE_RANGES_EXPECTED[d];
    rejects(()=>validateDirector(fixtureDirectorFor(d,hi+1),'Botol minum stainless',d),'director_scene_count');}
  return 'FIXTURE_AI';
});
await check('X05','FIXTURE_AI: total scene duration outside the +/-30% window is rejected',()=>{
  for(const d of DURATIONS){const [lo]=SCENE_RANGES_EXPECTED[d];
    rejects(()=>validateDirector(fixtureDirectorFor(d,lo,{totalOverride:Math.floor(d*0.6)}),'Botol minum stainless',d),'director_timeline_mismatch');
    rejects(()=>validateDirector(fixtureDirectorFor(d,lo,{totalOverride:Math.ceil(d*1.45)}),'Botol minum stainless',d),'director_timeline_mismatch');}
  return 'FIXTURE_AI';
});
await check('X06','FIXTURE_AI: a single scene longer than 15s is rejected',()=>{
  const d=60;const fx=fixtureDirectorFor(d,SCENE_RANGES_EXPECTED[d][0]);fx.scenes[0].duration=16;
  rejects(()=>validateDirector(fx,'Botol minum stainless',d),'director_invalid_duration');
  return 'FIXTURE_AI';
});
await check('X07','FIXTURE_AI: narration word budget is enforced on both sides for all five durations',()=>{
  const words=fx=>fx.scenes.reduce((n,s)=>n+s.voice.trim().split(/\s+/).length,0);
  const checked=[];
  for(const d of DURATIONS){const [lo]=SCENE_RANGES_EXPECTED[d];
    const min=Math.ceil(d*0.35),max=maxNarrationWords(d);
    // one word per scene is the floor the schema itself imposes
    if(min-1>=lo){
      const under=fixtureDirectorFor(d,lo,{voiceWords:min-1});
      assert.equal(words(under),min-1,`${d}s under-budget fixture must hold exactly ${min-1} words`);
      rejects(()=>validateDirector(under,'Botol minum stainless',d),'director_voice_budget');
    }
    const over=fixtureDirectorFor(d,lo,{voiceWords:max+1});
    assert.equal(words(over),max+1);
    rejects(()=>validateDirector(over,'Botol minum stainless',d),'director_voice_budget');
    const atMin=fixtureDirectorFor(d,lo,{voiceWords:Math.max(min,lo)});
    assert(validateDirector(atMin,'Botol minum stainless',d));
    const atMax=fixtureDirectorFor(d,lo,{voiceWords:max});
    assert.equal(words(atMax),max);
    assert(validateDirector(atMax,'Botol minum stainless',d));
    checked.push(`${d}s:${min}-${max}`);}
  return 'FIXTURE_AI '+checked.join(' ');
});
await check('X08','FIXTURE_AI: an unsupported duration is rejected outright',()=>{
  for(const d of [0,14,45,121,200,-30]) rejects(()=>validateDirector(fixtureDirectorFor(60,10),'Botol minum stainless',d),'director_invalid_object');
  return 'FIXTURE_AI';
});
await check('X09','FIXTURE_AI: duplicate scene ids are normalised to unique ids without inventing content',()=>{
  const d=30;const fx=fixtureDirectorFor(d,SCENE_RANGES_EXPECTED[d][0]);
  const originalVoices=fx.scenes.map(s=>s.voice);
  fx.scenes.forEach(s=>{s.id='same-id';});
  const out=validateDirector(fx,'Botol minum stainless',d);
  assert.equal(new Set(out.scenes.map(s=>s.id)).size,out.scenes.length);
  assert.deepEqual(out.scenes.map(s=>s.voice),originalVoices);
  return 'FIXTURE_AI';
});

// --- T4-2 Response shape parsing and tolerance ----------------------------
await check('X10','FIXTURE_AI: ten malformed AI response shapes each map to a stable error code',()=>{
  const cases=[
    ['empty string',()=>aiPayload({response:''}),'ai_json_missing'],
    ['numeric response',()=>aiPayload({response:42}),'ai_json_missing'],
    ['array response',()=>aiPayload({response:[1,2,3]}),'ai_json_missing'],
    ['prose without JSON',()=>aiPayload({response:'maaf, saya tidak bisa'}),'ai_json_invalid'],
    ['truncated JSON',()=>aiPayload({response:'{"version":"1.0","scenes":['}),'ai_json_invalid'],
    ['two JSON objects',()=>aiPayload({response:'{"a":1} {"b":2}'}),'ai_json_invalid'],
    ['upstream error envelope',()=>aiPayload({success:false,errors:[{message:'x'}]}),'ai_upstream_error'],
    ['refusal',()=>aiPayload({choices:[{message:{refusal:'no'}}]}),'ai_refused'],
    ['oversized response',()=>aiPayload({response:'x'.repeat(80001)}),'ai_response_too_large']
  ];
  for(const [name,fn,code] of cases){let t=null;try{fn();}catch(e){t=e;}assert(t,`${name}: expected ${code}`);assert.equal(t.code,code,`${name}`);}
  // Observed contract, asserted where it actually holds: `response: null` is nullish, so the
  // ?? chain in aiPayload() falls through and returns the envelope object. It is NOT an
  // aiPayload error; validateDirector rejects it one layer later. S13 covers end to end.
  assert.deepEqual(aiPayload({response:null}),{response:null},'null response falls through to the envelope');
  rejects(()=>validateDirector(aiPayload({response:null}),'Botol minum stainless',15),'director_scene_count');
  return 'FIXTURE_AI';
});
await check('X11','FIXTURE_AI: markdown-fenced and prose-wrapped JSON are recovered, not templated',()=>{
  const d=30;const fx=fixtureDirectorFor(d,SCENE_RANGES_EXPECTED[d][0]);
  const json=JSON.stringify(fx);
  assert.deepEqual(aiPayload({response:'```json\n'+json+'\n```'}),fx);
  assert.deepEqual(aiPayload({response:'Ini hasilnya:\n'+json+'\nselesai'}),fx);
  assert.deepEqual(aiPayload({response:fx}),fx);
  assert.deepEqual(aiPayload({result:{response:json}}),fx);
  assert.deepEqual(aiPayload({choices:[{message:{content:json}}]}),fx);
  return 'FIXTURE_AI';
});
await check('X12','FIXTURE_AI: empty scenes and empty narration are rejected, never filled in',()=>{
  const d=30;const lo=SCENE_RANGES_EXPECTED[d][0];
  const noScenes=fixtureDirectorFor(d,lo);noScenes.scenes=[];
  rejects(()=>validateDirector(noScenes,'Botol minum stainless',d),'director_scene_count');
  const emptyVoice=fixtureDirectorFor(d,lo);emptyVoice.scenes[1].voice='   ';
  rejects(()=>validateDirector(emptyVoice,'Botol minum stainless',d),'director_empty_content');
  const nullScene=fixtureDirectorFor(d,lo);nullScene.scenes[0]=null;
  rejects(()=>validateDirector(nullScene,'Botol minum stainless',d),'director_empty_scene');
  return 'FIXTURE_AI';
});
await check('X13','FIXTURE_AI: five durations x ten malformed shapes never yield a templated success',async()=>{
  const shapes=[
    ()=>({response:''}),()=>({response:null}),()=>({response:'not json'}),
    ()=>({response:'{"version":"1.0"'}),()=>({response:'{"a":1}{"b":2}'}),
    ()=>({success:false,errors:[{message:'x'}]}),()=>({choices:[{message:{refusal:'no'}}]}),
    ()=>({response:{version:'1.0',language:'id',ratio:'9:16',scenes:[]}}),
    ()=>({response:{version:'1.0',language:'en',ratio:'9:16',duration:15,productName:'x',style:'fast-commerce',cta:'x',scenes:[]}}),
    ()=>({response:'x'.repeat(80001)})
  ];
  let successes=0,calls=0;
  for(const d of DURATIONS){
    for(const shape of shapes){
      calls=0;
      try{await createDirector({AI:{run:async()=>{calls++;return shape();}}},'Botol minum stainless',d,'','',{timeoutMs:4000});successes++;}
      catch(e){assert(String(e.code||'').length>0,'error must carry a stable code');assert(calls<=2,`at most two model calls, saw ${calls}`);}
    }
  }
  assert.equal(successes,0,'no malformed AI shape may produce a success');
  return 'FIXTURE_AI';
});

// --- T4-3 Upstream error classification, timeout, bounded retry -----------
await check('X14','FIXTURE_AI: 401/403 become ai_auth_failed with exactly one model call',async()=>{
  for(const code of [401,403,'401','403']){
    let calls=0;
    await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;throw Object.assign(new Error('denied'),{code});}}},'Botol minum stainless',15,'','',{timeoutMs:4000}),e=>e.code==='ai_auth_failed');
    assert.equal(calls,1,`code ${code} must not retry`);
  }
  return 'FIXTURE_AI';
});
await check('X15','FIXTURE_AI: 429 becomes ai_quota_exceeded with exactly one model call',async()=>{
  let calls=0;
  await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;throw Object.assign(new Error('rate'),{code:429});}}},'Botol minum stainless',15,'','',{timeoutMs:4000}),e=>e.code==='ai_quota_exceeded');
  assert.equal(calls,1);
  return 'FIXTURE_AI';
});
await check('X16','FIXTURE_AI: 5xx and unknown upstream failures become ai_upstream_unavailable, one call',async()=>{
  for(const thrown of [Object.assign(new Error('bad gateway'),{code:502}),Object.assign(new Error('boom'),{code:500}),new Error('socket hang up')]){
    let calls=0;
    await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;throw thrown;}}},'Botol minum stainless',15,'','',{timeoutMs:4000}),e=>e.code==='ai_upstream_unavailable');
    assert.equal(calls,1,'non-retryable upstream failure must not retry');
  }
  return 'FIXTURE_AI';
});
await check('X17','FIXTURE_AI: an untrusted error code is never echoed back as the reason',async()=>{
  await assert.rejects(()=>createDirector({AI:{run:async()=>{throw Object.assign(new Error('provider unavailable'),{code:'SECRET-abcdef-token'});}}},'Botol minum stainless',15,'','',{timeoutMs:4000}),
    e=>e.code==='ai_upstream_unavailable'&&!String(e.code).includes('SECRET'));
  return 'FIXTURE_AI';
});
await check('X18','FIXTURE_AI: a malformed result is repaired at most once, so at most two model calls',async()=>{
  let calls=0;
  await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;return {response:'not json at all'};}}},'Botol minum stainless',15,'','',{timeoutMs:8000}),e=>String(e.code).startsWith('ai_json_'));
  assert.equal(calls,2,'exactly one repair attempt');
  return 'FIXTURE_AI';
});
await check('X19','FIXTURE_AI: a successful repair on the second call is accepted',async()=>{
  const d=30;const good=fixtureDirectorFor(d,SCENE_RANGES_EXPECTED[d][0]);
  let calls=0;
  const out=await createDirector({AI:{run:async()=>{calls++;return calls===1?{response:'garbage'}:{response:good};}}},'Botol minum stainless',d,'','',{timeoutMs:8000});
  assert.equal(calls,2);assert.equal(out.scenes.length,good.scenes.length);
  return 'FIXTURE_AI';
});
await check('X20','FIXTURE_AI: a timeout raises ai_timeout and never issues another model call',async()=>{
  let calls=0;
  await assert.rejects(()=>createDirector({AI:{run:async()=>{calls++;return new Promise(()=>{});}}},'Botol minum stainless',15,'','',{timeoutMs:300}),e=>e.code==='ai_timeout');
  await new Promise(r=>setTimeout(r,400));
  assert.equal(calls,1,'no overlapping repair after a timeout');
  return 'FIXTURE_AI';
});
await check('X21','FIXTURE_AI: a missing or non-callable AI binding fails before any inference',async()=>{
  await assert.rejects(()=>createDirector({},'Botol minum stainless',15),e=>e.code==='ai_binding_unavailable');
  await assert.rejects(()=>createDirector({AI:{}},'Botol minum stainless',15),e=>e.code==='ai_binding_unavailable');
  return 'FIXTURE_AI';
});
await check('X22','FIXTURE_AI: every one of the five durations reaches the model with its pinned max_tokens',async()=>{
  const expected={15:2048,30:3072,60:4096,90:6144,120:6144};
  for(const d of DURATIONS){
    let seen=null;
    const good=fixtureDirectorFor(d,SCENE_RANGES_EXPECTED[d][0]);
    await createDirector({AI:{run:async(_m,r)=>{seen=r;return {response:good};}}},'Botol minum stainless',d,'','',{timeoutMs:8000});
    assert.equal(seen.max_tokens,expected[d],`${d}s max_tokens`);
    assert(seen.messages[0].content.includes('assetKeyword'),'contract must be present');
    assert(seen.messages[1].content.includes(`total durasi tepat ${d} detik`),'duration must be stated');
  }
  return 'FIXTURE_AI';
});

// --- T4-4 Late results and owner changes ----------------------------------
await check('X23','FIXTURE_AI: a late AI result cannot complete a job whose lease already expired',async()=>withDB(async db=>{
  const e=env(db);await ensureSchema(db);
  const r=await reserveJob(db,guest,'late-1',await (async()=>'hash-1')(),3);
  assert(r.acquired);
  db.sqlite.exec("UPDATE script_requests SET lease_expires_at=1 WHERE idempotency_key='late-1'");
  await recoverExpired(db,guest);
  const completed=await completeJob(db,guest,'late-1',r.token,director(15));
  assert.equal(completed,false,'an expired lease must not be completable');
  const row=db.value("SELECT status,result_json,quota_charged FROM script_requests WHERE idempotency_key='late-1'");
  assert.equal(row.status,'expired');assert.equal(row.result_json,null);assert.equal(Number(row.quota_charged),0);
  return 'FIXTURE_AI';
}));
await check('X24','FIXTURE_AI: a late AI result cannot overwrite a newer owner of the same key',async()=>withDB(async db=>{
  await ensureSchema(db);
  const first=await reserveJob(db,guest,'late-2','hash-2',3);assert(first.acquired);
  db.sqlite.exec("UPDATE script_requests SET status='failed',quota_charged=0,lease_token=NULL WHERE idempotency_key='late-2'");
  const second=await reserveJob(db,guest,'late-2','hash-2',3);assert(second.acquired);
  assert.notEqual(second.token,first.token,'a new attempt must fence the old one');
  assert.equal(await completeJob(db,guest,'late-2',first.token,director(15)),false,'the stale owner must not complete');
  assert.equal(await completeJob(db,guest,'late-2',second.token,director(15)),true);
  return 'FIXTURE_AI';
}));
await check('X25','FIXTURE_AI: a late refund from a stale owner cannot release a second credit',async()=>withDB(async db=>{
  await ensureSchema(db);
  const first=await reserveJob(db,guest,'late-3','hash-3',3);assert(first.acquired);
  assert.equal(used(db),1);
  await failJob(db,guest,'late-3',first.token,'ai_upstream_unavailable');
  assert.equal(used(db),0);
  await failJob(db,guest,'late-3',first.token,'ai_upstream_unavailable');
  assert.equal(used(db),0,'a repeated refund must not go below the real usage');
  return 'FIXTURE_AI';
}));

const pass=results.filter(r=>r.status==='PASS').length;
const summary={version:'0.3.3',node:process.version,sqlite:'real local Node SQLite; D1-shaped transaction adapter',ai:'fixtures/fault injection; NOT remote inference',timestamp:new Date().toISOString(),pass,fail:results.length-pass,total:results.length,results};
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/regression-results.json'),JSON.stringify(summary,null,2));
console.log(`\nREGRESSION: ${pass}/${results.length} PASS; ${results.length-pass} FAIL`);process.exitCode=pass===results.length?0:1;
