import net from 'node:net';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
export async function availablePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;}
export async function requireFreePort(port){const s=net.createServer();await new Promise((resolve,reject)=>{s.once('error',()=>reject(new Error(`Local port ${port} is already in use. Stop the other preview first.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
export async function stopChild(child){if(!child||child.exitCode!==null)return;if(process.platform==='win32'){spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}else child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>{const t=setTimeout(r,3000);t.unref();})]);}
