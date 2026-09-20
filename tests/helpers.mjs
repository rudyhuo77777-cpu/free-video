import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
export const root=path.resolve(import.meta.dirname,'..');
export const guest='22222222-2222-4222-8222-222222222222';
export const other='44444444-4444-4444-8444-444444444444';
export class D1Adapter {
  constructor(migrate=true){this.sqlite=new DatabaseSync(':memory:');this.fault=null;this.operations=[];this.applied=new Set();if(migrate)this.migrate();}
  migrate(){let count=0;for(const name of fs.readdirSync(path.join(root,'migrations')).filter(x=>x.endsWith('.sql')).sort()){
    if(this.applied.has(name))continue;
    this.sqlite.exec('BEGIN');try{this.sqlite.exec(fs.readFileSync(path.join(root,'migrations',name),'utf8'));this.sqlite.exec('COMMIT');this.applied.add(name);count++;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}
  }return count;}
  prepare(sql){const db=this;function make(values=[]){return {sql,values,bind(...v){return make(v);},
    async first(column){const row=db.execute(sql,values,'get');return row?(column?row[column]:row):null;},
    async all(){const r=db.execute(sql,values,'all');return {success:true,results:r,meta:{changes:db.changes()}};},
    async run(){const r=db.execute(sql,values,'run');return {success:true,meta:{changes:Number(r.changes)}};}
  };}return make();}
  execute(sql,values,kind){this.operations.push({sql,values,kind});if(this.fault)this.fault(sql,values,kind);
    const stmt=this.sqlite.prepare(sql.replace(/\?(\d+)/g,(_,n)=>`:p${n}`));
    return stmt[kind](...(values.length?[Object.fromEntries(values.map((v,i)=>[`:p${i+1}`,v]))]:[]));}
  changes(){return Number(this.sqlite.prepare('SELECT changes() n').get().n);}
  async batch(stmts){this.sqlite.exec('BEGIN');try{
    const results=stmts.map(s=>{if(/^\s*(SELECT|PRAGMA)/i.test(s.sql)||/\bRETURNING\b/i.test(s.sql)){const rows=this.execute(s.sql,s.values,'all');return{success:true,results:rows,meta:{changes:this.changes()}};}
      const r=this.execute(s.sql,s.values,'run');return {success:true,results:[],meta:{changes:Number(r.changes)}};
    });this.sqlite.exec('COMMIT');return results;
  }catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
  value(sql,...v){return this.sqlite.prepare(sql).get(...v);}
  close(){this.sqlite.close();}
}
export function req(p='/api/scripts/jobs',payload={productName:'Botol minum',duration:15,idempotencyKey:'job-1'},headers={}) {
  return new Request('http://localhost:8790'+p,{method:payload===null?'GET':'POST',headers:{cookie:`free_video_guest=${guest}`,'content-type':'application/json','cf-connecting-ip':'192.0.2.25',...headers},...(payload===null?{}:{body:JSON.stringify(payload)})});
}
// CR-002: the narration budget is measured against real F5 delivery, so this shared fixture
// sizes its narration to ~70% of that budget instead of repeating one fixed sentence.
// Mirrors worker/director.js maxNarrationWords(); the fixture must conform to the contract,
// the contract must never be relaxed to fit the fixture.
const FIXTURE_NARRATION_OVERHEAD_SECONDS=1.33;
const FIXTURE_NARRATION_WORDS_PER_SECOND=1.8925;
const fixtureMaxWords=duration=>Math.floor((duration-FIXTURE_NARRATION_OVERHEAD_SECONDS)*FIXTURE_NARRATION_WORDS_PER_SECOND);
const FIXTURE_VOICE_WORDS='Cek bentuk dan detail produk ini sebelum memilih'.split(' ');
export function director(duration=15){const count={15:4,30:7,60:11,90:16,120:20}[duration];
  const budget=Math.max(count,Math.floor(fixtureMaxWords(duration)*0.7));
  const per=Array.from({length:count},()=>1);
  let left=budget-count;
  for(let i=0;left>0;i=(i+1)%count){per[i]+=1;left--;}
  const voiceFor=i=>{const out=[];while(out.length<per[i])out.push(FIXTURE_VOICE_WORDS[out.length%FIXTURE_VOICE_WORDS.length]);return out.join(' ')+'.';};
  return {
  version:'1.0',language:'id',ratio:'9:16',duration,productName:'Botol minum',style:'fast-commerce',cta:'Cek detail produknya.',
  scenes:Array.from({length:count},(_,i)=>({id:`scene-${i+1}`,duration:Math.floor(duration/count),template:i?'lifestyle':'problem_hook',assetKeyword:'bottle',headline:'Lihat detail produknya',voice:voiceFor(i),camera:'push_in',transition:'cut'}))};}
export function env(db,AI={run:async()=>({response:director()})}){return {DB:db,AI,FREE_SCRIPT_LIMIT:'3',ASSETS:{fetch:async()=>new Response('ASSET_FIXTURE')}};}
export function body(){return {productName:'Botol minum',duration:15,idempotencyKey:'job-1'};}
