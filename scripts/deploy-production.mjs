// Invoked ONLY by an explicit `npm run deploy`. Never called by install/start/verify/test.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireNode,run,wrangler,root} from './process.mjs';
import {verifyWebIntegrity} from './web-integrity.mjs';
import {currentFingerprints} from './verify.mjs';

// The release gate. Every check below runs BEFORE the first Wrangler command; any failure
// throws, so control never reaches migration or deploy. Migration still precedes deploy and
// a non-zero migration still stops the sequence.
export function assertReleaseGate(projectRoot=root,{runCommand=run}={}) {
  const checked=[];
  // 1. Full source protection, the SAME policy npm run verify uses.
  const integrity=verifyWebIntegrity(projectRoot);
  checked.push(`web integrity ${integrity.frozenFiles}/21 frozen, ${integrity.managedFiles}/2 managed`);
  // 2. The same offline gate, re-run now.
  runCommand(process.execPath,['scripts/check-offline.mjs']);
  checked.push('offline check exit 0');
  // 3. A recorded verification that actually succeeded.
  const recordPath=path.join(projectRoot,'evidence/build-verification.json');
  if(!fs.existsSync(recordPath))throw new Error('No evidence/build-verification.json. Run npm run verify before deploy.');
  let record;
  try{record=JSON.parse(fs.readFileSync(recordPath,'utf8'));}
  catch{throw new Error('evidence/build-verification.json is not readable JSON. Run npm run verify before deploy.');}
  if(record.status!=='PASS')throw new Error(`Last verification status is ${record.status||'unknown'}, not PASS. Deployment blocked.`);
  checked.push('verification record status PASS');
  // 4. That verification must correspond to THIS source, lock and build output.
  const now=currentFingerprints(projectRoot);
  const mismatches=[];
  if(record.sourceFingerprint?.digest!==now.sourceFingerprint.digest)mismatches.push('source');
  if(record.lockFingerprint!==now.lockFingerprint)mismatches.push('package-lock.json');
  if(record.outFingerprint?.digest!==now.outFingerprint.digest)mismatches.push('apps/web/out');
  if(record.nextEnvSha256!==now.nextEnvSha256)mismatches.push('apps/web/next-env.d.ts');
  if(record.tsconfigSha256!==now.tsconfigSha256)mismatches.push('apps/web/tsconfig.json');
  if(mismatches.length)throw new Error(`Verification does not match the current tree (${mismatches.join(', ')} changed since it ran). Re-run npm run verify before deploy.`);
  checked.push('verification bound to current source, lock and output');
  // 5. The artifact itself must exist (original check, kept).
  if(!fs.existsSync(path.join(projectRoot,'apps/web/out/index.html')))throw new Error('Static build missing. Run npm run verify before deploy.');
  checked.push('apps/web/out/index.html present');
  return checked;
}
export function productionPlan(config,vars={}) {
  const c=structuredClone(config);
  const account=vars.CLOUDFLARE_ACCOUNT_ID||c.account_id;
  const id=vars.FREE_VIDEO_D1_ID||c.d1_databases?.find(x=>x.binding==='DB')?.database_id;
  if(!/^[a-f0-9]{32}$/i.test(account||''))throw new Error('Set CLOUDFLARE_ACCOUNT_ID to your verified Cloudflare account ID (not a token).');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||id.startsWith('00000000-'))throw new Error('Set FREE_VIDEO_D1_ID to the EXISTING production D1 database ID. Auto-provisioning is intentionally disabled.');
  if(c.name!=='free-video'||c.main!=='./worker/index.js'||c.ai?.binding!=='AI'||c.assets?.binding!=='ASSETS'||c.d1_databases?.length!==1||c.d1_databases[0].binding!=='DB')throw new Error('Unexpected Worker or DB binding: deploy blocked.');
  c.account_id=account;c.d1_databases[0].database_id=id;
  delete c.d1_databases[0].remote;
  return {config:c,commands:[
    ['d1','migrations','apply','DB','--remote','--config','wrangler.resolved.jsonc'],
    ['deploy','--config','wrangler.resolved.jsonc']
  ]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    requireNode();
    const plan=productionPlan(JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8')),process.env);
    if(process.argv.includes('--plan')){console.log(JSON.stringify({worker:plan.config.name,account:plan.config.account_id,databaseId:plan.config.d1_databases[0].database_id,commands:plan.commands},null,2));}
    else {
      for(const step of assertReleaseGate(root))console.log(`[release gate] ${step}`);
      run(process.execPath,['scripts/ui-integrity.mjs']);
      fs.writeFileSync(path.join(root,'wrangler.resolved.jsonc'),JSON.stringify(plan.config,null,2)+'\n');
      console.log(`Explicit production operation: ${plan.config.name}; D1 ${plan.config.d1_databases[0].database_id}. Migrate first; deploy only if migration succeeds.`);
      for(const args of plan.commands)wrangler(args,{env:{...process.env,CI:'true'}});
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
