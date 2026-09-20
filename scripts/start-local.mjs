import fs from 'node:fs';
import path from 'node:path';
import {requireNode,run,npm,wrangler,root} from './process.mjs';
import {requireFreePort} from './local-test-support.mjs';
try {
  requireNode();
  await requireFreePort(8790);
  if(!fs.existsSync(path.join(root,'node_modules/wrangler/bin/wrangler.js'))||!fs.existsSync(path.join(root,'node_modules/next/package.json'))){
    console.log('Installing pinned dependencies. Network required; failure stops here.');
    npm(['install','--no-audit','--no-fund','--fetch-retries=1','--fetch-timeout=30000']);
  }
  run(process.execPath,['scripts/verify.mjs']);
  wrangler(['d1','migrations','apply','DB','--local','--config','wrangler.local.jsonc'],{env:{...process.env,CI:'true'}});
  console.log('LOCAL Worker + LOCAL D1 at http://127.0.0.1:8790. AI calls go to Cloudflare and count toward your AI usage. No production D1/deployment is used.');
  wrangler(['dev','--config','wrangler.local.jsonc','--ip','127.0.0.1','--port','8790']);
}catch(error){console.error(error.message);process.exitCode=1;}
