import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {rankCreators} from '../netlify/functions/lib/creator-rankings.mjs';
import handler from '../netlify/functions/creator-rankings.mjs';

test('rankings sum YouTube views per channel ID, deduplicate videos and preserve equal names',()=>{
  const video=(id,channel_id,views,extra={})=>({id,video_id:id,channel_id,channel:'Same name',views,platform:'YouTube',...extra});
  const rows=rankCreators([video('a','UC1',40),video('b','UC1','60'),video('c','UC2',500),video('a','UC1',40),video('hidden','UC2',9999,{hidden:true}),video('other','UC2',9999,{platform:'Vimeo'}),video('missing',null,9999),video('zero','UC3',null),video('invalid','UC3',-50)]);
  assert.deepEqual(rows.map(c=>[c.rank,c.id,c.views,c.films]),[[1,'UC2',500,1],[2,'UC1',100,2],[3,'UC3',0,2]]);
  assert.equal(rows[0].name,rows[1].name);
});
test('public rankings read all catalogue pages, use the public key and never return partial failures',async()=>{
  const oldFetch=globalThis.fetch,oldEnv=globalThis.Netlify;let failing=false;const offsets=[];
  globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test'})[k]}};
  globalThis.fetch=async(url,options)=>{
    if(new URL(url).pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer member'?Response.json({id:'free-member'}):new Response(null,{status:401});
    const q=new URL(url).searchParams,offset=+q.get('offset');offsets.push(offset);
    assert.equal(options.headers.apikey,'public-test');assert.equal(q.get('hidden'),'eq.false');assert.equal(q.get('platform'),'eq.YouTube');assert.equal(q.get('order'),'id.asc');
    if(offset===0)return Response.json(Array.from({length:1000},(_,i)=>({id:'a'+i,video_id:'a'+i,channel_id:'UC1',channel:'Many small videos',views:1})));
    if(failing)return new Response(null,{status:503});
    return Response.json([{id:'winner',video_id:'winner',channel_id:'UC2',channel:'Big <creator>',views:5000}]);
  };
  try{
    assert.equal((await handler(new Request('https://fanreelz.com/api/creator-rankings'))).status,401);
    assert.equal((await handler(new Request('https://fanreelz.com/api/creator-rankings',{headers:{Authorization:'Bearer invalid'}}))).status,401);
    const member=()=>new Request('https://fanreelz.com/api/creator-rankings',{headers:{Authorization:'Bearer member'}});
    const r=await handler(member());assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
    const data=await r.json();assert.deepEqual(offsets,[0,1000]);assert.equal(data.videoCount,1001);assert.equal(data.rankings[0].id,'UC2');assert.equal(data.rankings[1].views,1000);
    failing=true;const failed=await handler(member());assert.equal(failed.status,503);assert.equal('rankings' in await failed.json(),false);
    assert.equal((await handler(new Request('https://fanreelz.com/api/creator-rankings',{method:'POST'}))).status,405);
  }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldEnv}
});
test('public creator page labels the view scope, escapes names and links to the original YouTube channel',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),main={innerHTML:''};
  const ctx=vm.createContext({acct:{online:true},insightsTabs:()=>'<nav>Creator rankings · Free</nav>',renderInsightsSignin:()=>{main.innerHTML='Sign in / Sign up free'},document:{addEventListener(){}},encodeURIComponent,esc:s=>String(s).replaceAll('<','&lt;'),icon:()=>'',state:{view:'creators'},$:()=>main});
  vm.runInContext(html.slice(html.indexOf('let creatorBoard=null'),html.indexOf('function renderTop10(){')),ctx);
  vm.runInContext('creatorBoard={rankings:[{rank:1,id:"UC1",name:"Creator <test>",views:123456,films:4}],videoCount:4};renderCreatorRankings()',ctx);
  assert.match(main.innerHTML,/123,456/);assert.match(main.innerHTML,/Creator &lt;test>/);assert.match(main.innerHTML,/Videos outside Fanreelz are not included/);assert.match(main.innerHTML,/youtube.com\/channel\/UC1/);
  assert.ok(html.includes('creators:renderCreatorRankings'));assert.ok(html.includes('Creator rankings · Free'));
  vm.runInContext('acct.online=false;renderCreatorRankings()',ctx);assert.equal(main.innerHTML,'Sign in / Sign up free');
});
