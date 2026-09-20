// Structural guards ONLY. Behavioural tests and real-cloud tests are separate gates.
import fs from 'node:fs';
import path from 'node:path';
import {root} from './process.mjs';
import {DEFAULT_MODEL,resolveModel} from '../worker/director.js';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const p=JSON.parse(read('package.json')),w=JSON.parse(read('wrangler.jsonc')),l=JSON.parse(read('wrangler.local.jsonc'));
const worker=read('worker/index.js'),db=read('worker/db.js'),ai=read('worker/director.js');
const packages=['package.json','apps/web/package.json','apps/voice-bridge/package.json','packages/core/package.json'].map(x=>JSON.parse(read(x)));
const deps=Object.assign({},...packages.flatMap(x=>[x.dependencies||{},x.devDependencies||{}]));
const checks=[
 ['Wrangler pinned',p.devDependencies.wrangler==='4.131.1'],
 ['core + static web build, no separate service',p.scripts.build==='npm run build -w @auria/core && npm run build -w @auria/web'],
 ['no BullMQ/Redis/Postgres dependency',['bullmq','redis','ioredis','postgres','pg'].every(x=>!deps[x])],
 ['no obsolete backend service or container files',['apps/worker','Dockerfile','docker-compose.yml','RAILWAY-DEPLOY.md'].every(x=>!exists(x))],
 ['no Next server route directory',!exists('apps/web/app/api')],
 ['static Next export retained',read('apps/web/next.config.ts').includes("output: 'export'")],
 ['one production Worker entry',w.main==='./worker/index.js'&&w.name==='free-video'],
 ['static assets + API precedence',w.assets.binding==='ASSETS'&&w.assets.run_worker_first.includes('/api/*')],
 ['AI binding declared',w.ai.binding==='AI'],
 ['one D1 binding, explicit migrations',w.d1_databases.length===1&&w.d1_databases[0].binding==='DB'&&w.d1_databases[0].migrations_dir==='migrations'],
 ['no request-time DDL',!(/CREATE\s+TABLE/i.test(worker+db))],
 ['additive migration files present',exists('migrations/0001_core.sql')&&exists('migrations/0002_atomic_jobs.sql')],
 ['default model not in known deprecation list',resolveModel(w.vars)===DEFAULT_MODEL],
 ['local D1 stays local and separate',l.d1_databases[0].remote===false&&l.d1_databases[0].database_id!==w.d1_databases[0].database_id],
 ['local AI explicitly remote',l.ai.remote===true],
 ['UI unchanged check included',exists('scripts/ui-integrity.mjs')],
 ['real behaviour regression included',exists('tests/regression.mjs')],
 ['deployment routed through migration guard',p.scripts.deploy==='node scripts/deploy-production.mjs'],
 ['idempotent job GET compatibility',worker.includes('handleScriptStatus')],
 ['keyless Commons and Openverse kept',worker.includes('commons.wikimedia.org')&&worker.includes('api.openverse.org')],
 ['local render/TTS clients present',exists('apps/web/lib/client/video-renderer.ts')&&exists('apps/web/lib/client/tts.ts')],
 ['fixed Indonesian copy preserved',read('apps/web/app/page.tsx').includes('120 Detik. Gratis. Tanpa Kredit Video.')],
 ['fixed Chinese copy preserved',read('apps/web/app/page.tsx').includes('全球首款免费生成超长视频120秒的网站')]
];
let failed=0;for(const [name,ok]of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`\nSTRUCTURAL AUDIT: ${checks.length-failed}/${checks.length} PASS. This is not behavioural or online acceptance.`);
if(failed)process.exitCode=1;
