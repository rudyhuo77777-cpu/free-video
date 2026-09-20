// Pre-build and post-build gates use the SAME policy. No restore and no baseline rewriting.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {requireNode,run,npm,root} from './process.mjs';

// Fingerprints bind ONE successful verification to the exact source, dependency lock and
// build output it was produced from. Deploy re-computes them and refuses to publish when
// they no longer match. Nothing here changes the phase order or the exit-code semantics.
const SKIP_DIRS=new Set(['node_modules','.next','out','.git','evidence','governance','.claude']);
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function walkFiles(dir,rel,out,skipDirs){
  let entries;
  try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
  for(const entry of entries){
    if(entry.isSymbolicLink())continue;
    const name=rel?`${rel}/${entry.name}`:entry.name;
    if(entry.isDirectory()){if(skipDirs.has(entry.name))continue;walkFiles(path.join(dir,entry.name),name,out,skipDirs);}
    else if(entry.isFile()){
      if(name==='package-lock.json'||name.endsWith('.tsbuildinfo')||name.endsWith('wrangler.resolved.jsonc'))continue;
      out.push(name);
    }
  }
  return out;
}

function aggregate(projectRoot,files){
  const lines=files.sort().map(f=>`${f} ${sha256(fs.readFileSync(path.join(projectRoot,f)))}`);
  return {count:files.length,digest:sha256(lines.join('\n'))};
}

export function sourceFingerprint(projectRoot=root){
  return aggregate(projectRoot,walkFiles(projectRoot,'',[],SKIP_DIRS));
}

export function outFingerprint(projectRoot=root){
  const outDir=path.join(projectRoot,'apps/web/out');
  if(!fs.existsSync(outDir))return {count:0,digest:null,missing:true};
  const files=walkFiles(outDir,'',[],new Set());
  return {...aggregate(outDir,files),missing:false};
}

export function lockFingerprint(projectRoot=root){
  const lock=path.join(projectRoot,'package-lock.json');
  if(!fs.existsSync(lock))return null;
  return sha256(fs.readFileSync(lock));
}

export function fileSha256(projectRoot,relative){
  const p=path.join(projectRoot,relative);
  if(!fs.existsSync(p))return null;
  return sha256(fs.readFileSync(p));
}

export function currentFingerprints(projectRoot=root){
  return {
    sourceFingerprint:sourceFingerprint(projectRoot),
    lockFingerprint:lockFingerprint(projectRoot),
    outFingerprint:outFingerprint(projectRoot),
    nextEnvSha256:fileSha256(projectRoot,'apps/web/next-env.d.ts'),
    tsconfigSha256:fileSha256(projectRoot,'apps/web/tsconfig.json')
  };
}

export function dependenciesMissing(projectRoot=root) {
  const checks=[
    ['typescript','5.9.2'], ['wrangler','4.131.1'], ['next','16.3.3'],
    ['react','19.2.0'], ['react-dom','19.2.0'],
    ['mediabunny','1.56.1'], ['@mediabunny/aac-encoder','1.56.1']
  ];
  return checks.some(([name,version])=>!['','apps/web'].some(dir=>{
    const p=path.join(projectRoot,dir,'node_modules',name,'package.json');
    try{return JSON.parse(fs.readFileSync(p,'utf8')).version===version;}catch{return false;}
  }));
}

export function verifySequence({
  runCommand=run, npmCommand=npm, checkNode=requireNode,
  needsInstall=dependenciesMissing, installIfMissing=false, onPhase=()=>{}
}={}) {
  checkNode();
  onPhase('offline-before');runCommand(process.execPath,['scripts/check-offline.mjs']);
  if (installIfMissing && needsInstall()) {
    onPhase('install');
    npmCommand(['install','--no-audit','--no-fund','--fetch-retries=1','--fetch-timeout=30000']);
  }
  onPhase('build');npmCommand(['run','build']);
  onPhase('typecheck');npmCommand(['run','typecheck']);
  onPhase('offline-after');runCommand(process.execPath,['scripts/check-offline.mjs']);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const evidence={release:'0.3.3.2',startedAt:new Date().toISOString(),phases:[],status:'RUNNING',
    remoteAIExecuted:false,productionDeploymentExecuted:false,
    note:'Build/typecheck are local. Offline AI outputs are fixtures. No D1 migration is performed by this command.'};
  try {
    verifySequence({installIfMissing:process.argv.includes('--install-if-missing'),onPhase(phase){
      console.log(`\n[VERIFY ${phase}]`);evidence.phases.push(phase);
    }});
    evidence.status='PASS';
    console.log('\nBUILD + TYPECHECK + PRE/POST-BUILD OFFLINE CHECKS PASS. Remote AI/TTS/MP4 remain separate gates.');
  }catch(error){evidence.status='FAIL';evidence.error=error.message;console.error(error.message);process.exitCode=1;}
  finally {
    evidence.finishedAt=new Date().toISOString();
    Object.assign(evidence,currentFingerprints(root));
    if(evidence.status==='PASS'&&(!evidence.lockFingerprint||evidence.outFingerprint.missing)){
      evidence.status='FAIL';
      evidence.error=evidence.error||(!evidence.lockFingerprint
        ?'No package-lock.json: this verification cannot be bound to a dependency set.'
        :'No apps/web/out output: this verification cannot be bound to a build artifact.');
      process.exitCode=1;
      console.error(evidence.error);
    }
    fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
    fs.writeFileSync(path.join(root,'evidence/build-verification.json'),JSON.stringify(evidence,null,2)+'\n');
  }
}
