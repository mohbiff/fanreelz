import {test} from 'node:test';
import assert from 'node:assert/strict';
import profile from '../netlify/functions/creator-profile.mjs';
test('claim and sync require an authenticated matching Google identity and exact YouTube channel ownership',async()=>{
 const oldFetch=globalThis.fetch,oldEnv=globalThis.Netlify,id='UC5FCyk1QkTBLgWm-w866PGg';let actor=null,owner=null,googleSub='google-1',owned=false,writes=0;
 globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'})[k]}};
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);if(u.pathname==='/auth/v1/user')return actor?Response.json(actor):new Response(null,{status:401});
  if(u.hostname==='www.googleapis.com'){assert.equal(options.headers.Authorization,'Bearer google-token');if(u.pathname.endsWith('/userinfo'))return Response.json({sub:googleSub});assert.equal(u.searchParams.get('mine'),'true');return Response.json({items:owned?[{id}]:[{id:'UC0000000000000000000000'}]})}
  if(u.pathname.endsWith('/import_state')){assert.equal(options.headers.apikey,'sb_secret_test');if(options.method==='POST'){writes++;const row=JSON.parse(options.body)[0];assert.ok(!JSON.stringify(row).includes('google-token'));if(!owner)owner=row.value;return new Response(null,{status:201})}return Response.json(owner?[{value:owner}]:[])}
  throw Error('Unexpected request '+u.pathname);
 };
 const call=async(action='claim')=>{const r=await profile(new Request('https://fanreelz.com/api/creator-profile',{method:'POST',headers:{Authorization:'Bearer session','Content-Type':'application/json'},body:JSON.stringify({channelId:id,providerToken:'google-token',action})}));return [r,await r.json()]};
 try{
  assert.equal((await call())[0].status,401);
  actor={id:'member',identities:[{provider:'google',id:'google-1'}]};assert.equal((await call())[0].status,403);assert.equal(writes,0);
  owned=true;googleSub='someone-else';assert.equal((await call())[0].status,403);assert.equal(writes,0);
  googleSub='google-1';const [r,d]=await call();assert.equal(r.status,200);assert.equal(d.mine,true);assert.equal(owner.userId,'member');assert.equal(writes,1);
  actor={id:'attacker',identities:[{provider:'google',id:'google-1'}]};assert.equal((await call('sync'))[0].status,409);assert.equal(writes,1);
  const [status,body]=await call('status');assert.equal(status.status,200);assert.deepEqual(body,{claimed:true,mine:false});assert.ok(!JSON.stringify(body).includes('userId'));
  actor={id:'member',identities:[{provider:'google',id:'google-1'}]};owned=false;assert.equal((await call('sync'))[0].status,403);
 }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldEnv}
});
