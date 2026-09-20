import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'..');
export function requireNode(){const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<16))throw new Error('Node.js >=22.16 is required. Install a current supported Node.js LTS release, then reopen the terminal.');}
export function run(command,args=[],options={}){
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',...options});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${path.basename(command)} ${args.join(' ')} failed (exit ${result.status??'signal'}). Stopped; no further steps executed.`);
}
export function npm(args){run(process.platform==='win32'?'npm.cmd':'npm',args,{shell:process.platform==='win32'});}
export function wranglerPath(){const p=path.join(root,'node_modules/wrangler/bin/wrangler.js');if(!fs.existsSync(p))throw new Error('Wrangler is not installed. Run npm install first.');return p;}
export function wrangler(args,options={}){run(process.execPath,[wranglerPath(),...args],options);}
