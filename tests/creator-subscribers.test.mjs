import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subscriberCounts,refreshCreatorSubscribers} from '../netlify/functions/lib/creator-subscribers.mjs';
test('subscriber metadata preserves zero and unknown, seeds only missing channels, and refreshes without importing videos',async()=>{
 const oldFetch=globalThis.fetch,oldEnv=globalThis.Netlify;const writes=[];let refresh=false,fail=false;
 globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',YOUTUBE_API_KEY:'test-key'})[k]}};
 globalThis.fetch=async(input,options={})=>{
  const u=new URL(input);
  if(u.hostname==='www.googleapis.com'){assert.equal(u.pathname,'/youtube/v3/channels');assert.equal(u.searchParams.get('part'),'statistics');if(fail)return new Response(null,{status:503});return Response.json({items:[{id:'zero',statistics:{subscriberCount:'0'}},{id:'hidden',statistics:{subscriberCount:'123',hiddenSubscriberCount:true}}]})}
  assert.equal(u.pathname,'/rest/v1/import_state');assert.equal(options.headers.apikey,'sb_secret_test');
  if(options.method==='POST'){writes.push({rows:JSON.parse(options.body),prefer:options.headers.Prefer});return new Response(null,{status:201})}
  return Response.json([{key:'channel-stats:zero',value:{subscribers:0,updatedAt:'2020-01-01'}},{key:'channel-stats:hidden',value:{subscribers:null,updatedAt:'2020-01-01'}}]);
 };
 try{
  const m=await subscriberCounts(['zero','hidden','new']);assert.equal(m.get('zero').subscribers,0);assert.equal(m.get('hidden').subscribers,null);assert.equal(m.has('new'),false);assert.equal(writes[0].prefer,'resolution=ignore-duplicates,return=minimal');assert.equal(writes[0].rows[0].key,'channel-stats:new');
  await refreshCreatorSubscribers();assert.equal(writes[1].rows[0].value.subscribers,0);assert.equal(writes[1].rows[1].value.subscribers,null);
  fail=true;await assert.rejects(refreshCreatorSubscribers());assert.equal(writes.length,2);
 }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldEnv}
});
