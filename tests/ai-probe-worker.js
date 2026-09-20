// TEST-ONLY entry point. NOT imported by the production Worker. No DB binding.
import {createDirector,DEFAULT_MODEL} from '../worker/director.js';
import {readJson,json} from '../worker/http.js';
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return json({error:'local_only'},403);
  if(url.pathname==='/health')return json({ok:true,probe:'real-ai-no-database'});
  if(url.pathname!=='/director'||request.method!=='POST')return json({error:'not_found'},404);
  try {
    const b=await readJson(request,4096);const duration=Number(b.duration||15);
    if(![15,30,60,90,120].includes(duration))return json({error:'invalid_duration'},400);
    const product=String(b.productName||'Botol minum').slice(0,120);
    const result=await createDirector(env,product,duration);
    return json({ok:true,model:env.AI_MODEL||DEFAULT_MODEL,source:'real-workers-ai',database:'not-used',result});
  }catch(e){return json({ok:false,error:e.code||'ai_probe_failed',stage:'ai_director'},503);}
}};
