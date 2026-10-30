import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleSafety} from '../netlify/functions/safety.mjs';

const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const records=new Map(),calls=[];
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async (url,options={})=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1),p=u.searchParams;
  calls.push({table,options,p});
  if(table==='profiles')return Response.json([{id:bob,name:'Bob'}]);
  if(table==='docs')return Response.json([{owner:bob,data:{items:[{id:'c1',film:'yt-abc',text:'Stored comment'}]}}]);
  if(table==='catalog')return Response.json([{id:'yt-abc',title:'Stored title'}]);
  assert.equal(table,'import_state');
  if(options.method==='POST'){const {key,value}=JSON.parse(options.body);records.set(key,value);return new Response(null,{status:201})}
  const filter=p.get('key');
  const matches=[...records].filter(([key])=>!filter||(filter.startsWith('eq.')?key===filter.slice(3):key.startsWith(filter.slice(5,-1))));
  if(options.method==='DELETE'){for(const [key]of matches)records.delete(key);return new Response(null,{status:204})}
  return Response.json(matches.map(([key,value])=>({key,value})).sort((a,b)=>b.key.localeCompare(a.key)));
};
const db={url:'https://test.invalid/rest/v1/',headers:{apikey:'test-service'}};
async function run(body,user={id:alice},admin=false){const req=new Request('https://test.invalid/api/safety',body===null?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const r=await handleSafety(req,user,admin,db);return {status:r.status,body:await r.json()}}
test('safety workflow keeps reports private, authenticates actions, and restores content',async()=>{
  try{
    assert.equal((await run({action:'report'},null)).status,401);
    assert.equal((await run({action:'queue'})).status,403);
    assert.equal((await run({action:'resolve',key:'x',resolution:'hide'})).status,403);
    assert.equal((await run({action:'block',target:alice})).status,400);
    assert.equal((await run({action:'block',target:'not-a-user'})).status,400);
    assert.equal((await run({action:'block',target:bob,owner:bob})).body.ok,true);
    assert.ok(records.has('safety:block:'+alice+':'+bob));
    assert.deepEqual((await run(null)).body.blocked,[bob]);
    assert.deepEqual((await run(null,{id:bob})).body.blocked,[]);
    assert.deepEqual((await run(null,null)).body.blocked,[]);
    assert.equal((await run({action:'unblock',target:bob})).body.ok,true);
    assert.deepEqual((await run(null)).body.blocked,[]);
    const report={action:'report',kind:'comment',owner:bob,id:'c1',reason:'Harassment or hate',details:'Please review',reporter:bob,text:'Fake text'};
    assert.equal((await run(report)).status,200);
    assert.equal((await run(report)).body.duplicate,true);
    const queue=(await run({action:'queue'},{id:alice},true)).body.reports;
    assert.equal(queue.length,1);
    assert.equal(queue[0].reporter,alice);
    assert.equal(queue[0].target.text,'Stored comment');
    assert.equal(JSON.stringify((await run(null,null)).body).includes('Please review'),false);
    assert.equal((await run({...report,owner:'invalid'})).status,400);
    assert.equal((await run({...report,reason:'invalid'})).status,400);
    assert.equal((await run({...report,details:'x'.repeat(1001)})).status,400);
    assert.equal((await run({...report,id:'missing'})).status,404);
    assert.equal((await run({action:'resolve',key:queue[0].key,resolution:'hide'},{id:alice},true)).body.ok,true);
    assert.deepEqual((await run(null,null)).body.hidden,[{owner:bob,id:'c1'}]);
    assert.equal((await run({action:'resolve',key:queue[0].key,resolution:'restore'},{id:alice},true)).body.ok,true);
    assert.deepEqual((await run(null,null)).body.hidden,[]);
    assert.equal((await run({action:'moderateComment',owner:bob,id:'c1'})).status,403);
    assert.equal((await run({action:'moderateComment',owner:bob,id:'c1'},{id:alice},true)).body.ok,true);
    assert.equal((await run({action:'restoreComment',owner:bob,id:'c1'},{id:alice},true)).body.ok,true);
    assert.ok(!calls.some(x=>x.table==='docs'&&x.options.method==='PATCH'),'Hiding preserves original comments');
  }finally{globalThis.fetch=fetchOriginal}
});
test('inline app scripts parse, hidden replies and blocked members are filtered',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [i,m]of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].entries()){if(m[1].trim())new vm.Script(m[1],{filename:'inline-'+i})}
  const safety=html.slice(html.indexOf('var safetyState='),html.indexOf('async function safetyCall'));
  const ctx=vm.createContext({});vm.runInContext(safety,ctx);
  vm.runInContext(`safetyState={blocked:['${bob}'],hidden:[{owner:'catalog',id:'yt-hidden'}]}`,ctx);
  assert.equal(vm.runInContext(`safetyFilmVisible({id:'x',byId:'${bob}'})`,ctx),false);
  assert.equal(vm.runInContext(`safetyFilmVisible({id:'yt-hidden'})`,ctx),false);
  assert.equal(vm.runInContext(`safetyFilmVisible({id:'visible'})`,ctx),true);
  assert.ok(html.includes('data-creport="${esc(c.uid)}|${esc(c.id)}"'));
  assert.ok(!html.includes('In the finished site a moderator would review this report'));
});
