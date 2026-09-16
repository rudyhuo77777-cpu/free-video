import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const exists = p => fs.existsSync(path.join(root,p));
const assertions = [];
const check = (name, ok) => assertions.push({name,ok:Boolean(ok)});
const rootPkg = JSON.parse(read('package.json'));
const webPkg = JSON.parse(read('apps/web/package.json'));
const wrangler = read('wrangler.jsonc');
const worker = read('worker/index.js');
const next = read('apps/web/next.config.ts');
const css = read('apps/web/app/globals.css');


check('wrangler pinned', rootPkg.devDependencies?.wrangler === '4.131.1');
check('script status compatibility route', worker.includes('/api/scripts/jobs') && worker.includes('handleScriptStatus'));
check('daily IP AI guard', worker.includes('SCRIPT_DAILY_PER_IP_LIMIT') && worker.includes('script-day:'));
check('optional Turnstile backend', worker.includes('TURNSTILE_SECRET_KEY') && worker.includes('siteverify'));

check('single web/core build only', rootPkg.scripts.build.includes('@auria/core') && rootPkg.scripts.build.includes('@auria/web') && !rootPkg.scripts.build.includes('@auria/worker'));
check('no bullmq dependency', !JSON.stringify(rootPkg).includes('bullmq') && !JSON.stringify(webPkg).includes('bullmq'));
check('no redis dependency', !JSON.stringify(rootPkg).includes('ioredis') && !JSON.stringify(webPkg).includes('ioredis'));
check('no postgres dependency', !JSON.stringify(rootPkg).includes('postgres') && !JSON.stringify(webPkg).includes('postgres'));
check('no Railway file', !exists('RAILWAY-DEPLOY.md'));
check('no Docker compose', !exists('docker-compose.yml'));
check('no separate worker app', !exists('apps/worker'));
check('no Next route handlers', !exists('apps/web/app/api'));
check('static Next export', next.includes("output: 'export'"));
check('Cloudflare assets binding', wrangler.includes('"binding": "ASSETS"'));
check('Cloudflare AI binding', wrangler.includes('"binding": "AI"'));
check('Cloudflare D1 binding', wrangler.includes('\"binding\": \"DB\"'));
check('active Workers AI model', wrangler.includes('@cf/meta/llama-3.1-8b-instruct-fast') && worker.includes('@cf/meta/llama-3.1-8b-instruct-fast'));
check('D1 draft binding auto-provisionable', wrangler.includes('\"d1_databases\"') && wrangler.includes('\"binding\": \"DB\"') && !wrangler.includes('database_id'));

check('API worker first', wrangler.includes('"/api/*"'));
check('direct synchronous AI', worker.includes('env.AI.run') && !worker.includes('BullMQ'));
check('D1 quota', worker.includes('guest_quota') && worker.includes('FREE_SCRIPT_LIMIT'));
check('D1 projects', worker.includes('product_projects'));
check('keyless Commons', worker.includes('commons.wikimedia.org'));
check('keyless Openverse', worker.includes('api.openverse.org'));
check('render remains browser-side', exists('apps/web/lib/client/video-renderer.ts'));
check('UI CSS still present', css.length > 5000);
check('fixed Indonesian line', read('apps/web/app/page.tsx').includes('120 Detik. Gratis. Tanpa Kredit Video.'));
check('fixed Chinese line', read('apps/web/app/page.tsx').includes('全球首款免费生成超长视频120秒的网站'));

let failed = 0;
for (const a of assertions) {
  console.log(`${a.ok ? 'PASS' : 'FAIL'} ${a.name}`);
  if (!a.ok) failed++;
}
console.log(`\n${assertions.length-failed}/${assertions.length} PASS`);
if (failed) process.exit(1);
