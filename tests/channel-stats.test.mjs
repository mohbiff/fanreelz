import {test} from 'node:test';
import assert from 'node:assert/strict';
import {refreshChannelStats} from '../netlify/functions/import-youtube.mjs';
test('YouTube statistics refresh uses a bounded batch, preserves hidden subscribers and advances only after saving',async()=>{
  const oldFetch=globalThis.fetch,oldEnv=globalThis.Netlify,records=new Map();let fail=false,calls=0;
  globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',YOUTUBE_API_KEY:'test-key'})[k]}};
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url);
    if(u.hostname==='www.googleapis.com'){
      calls++;assert.equal(u.searchParams.get('part'),'snippet,statistics');assert.ok(u.searchParams.get('id').split(',').length<=50);
      return Response.json({items:[{id:'UC1',snippet:{title:'Original channel'},statistics:{viewCount:'1000000',subscriberCount:'12300',videoCount:'120'}},{id:'UC2',snippet:{title:'Hidden count'},statistics:{hiddenSubscriberCount:true,viewCount:'30',videoCount:'2'}}]});
    }
    if(options.method==='POST'){
      const rows=JSON.parse(options.body);if(fail&&rows[0].key.startsWith('channel-stats:'))return new Response(null,{status:503});
      for(const row of rows)records.set(row.key,row.value);return new Response(null,{status:204});
    }
    const key=u.searchParams.get('key');
    if(key==='eq.channel-stats-refresh')return Response.json(records.has('channel-stats-refresh')?[{value:records.get('channel-stats-refresh')}]:[]);
    assert.equal(u.searchParams.get('limit'),'50');return Response.json(+u.searchParams.get('offset')===0?[{value:{channelId:'UC1'}},{value:{channelId:'UC2'}}]:[]);
  };
  try{
    fail=true;await assert.rejects(refreshChannelStats());assert.equal(records.has('channel-stats-refresh'),false);
    fail=false;assert.equal((await refreshChannelStats()).updated,2);assert.equal(records.get('channel-stats:UC1').subscribers,12300);assert.equal(records.get('channel-stats:UC2').subscribers,null);
    assert.equal(records.get('channel-stats-refresh').offset,2);assert.equal((await refreshChannelStats()).complete,true);
    const n=calls;assert.equal((await refreshChannelStats()).waiting,true);assert.equal(calls,n);
  }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldEnv}
});
