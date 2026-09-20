// TEST-ONLY entry: real local workerd + local D1, deterministic AI fixture.
// Never deployed or imported by the production entry.
import worker from '../worker/index.js';
function fixture(productName='Botol minum'){return {version:'1.0',language:'id',ratio:'9:16',duration:15,productName,style:'fast-commerce',cta:'Cek detail produk.',scenes:[4,4,4,3].map((duration,i)=>({id:`scene-${i+1}`,duration,template:i?'lifestyle':'problem_hook',assetKeyword:'bottle',headline:'Perhatikan detail produknya',voice:'Cek bentuk dan detail produk ini sebelum memilih.',camera:'push_in',transition:'cut'}))};}
export default {async fetch(request,env){
  if(new URL(request.url).pathname==='/__test_health')return Response.json({probe:'local-workerd-fixture-ai'});
  return worker.fetch(request,{...env,AI:{run:async()=>({response:fixture()})}});
}};
