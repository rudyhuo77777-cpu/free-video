import {requireNode,run} from './process.mjs';
try {
  requireNode();
  run(process.execPath,['scripts/ui-integrity.mjs']);
  run(process.execPath,['scripts/lite-audit.mjs']);
  for(const file of ['worker/index.js','worker/db.js','worker/director.js','worker/http.js','apps/voice-bridge/server.mjs'])run(process.execPath,['--check',file]);
  run(process.execPath,['--no-warnings','tests/regression.mjs']);
  run(process.execPath,['--no-warnings','tests/release-guards.mjs']);
  run(process.execPath,['--no-warnings','tests/verification-fix.mjs']);
  console.log('\nOFFLINE CHECK PASS. AI outputs were fixtures. This is NOT remote AI, full build, or MP4 device acceptance.');
}catch(error){console.error(error.message);process.exitCode=1;}
