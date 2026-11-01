import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {rankCreators} from '../netlify/functions/lib/creator-rankings.mjs';
import handler from '../netlify/functions/creator-rankings.mjs';
import {channelStats,attachChannelStatus} from '../netlify/functions/lib/channel-stats.mjs';

test('rankings sum YouTube views per channel ID, deduplicate videos and preserve equal names',()=>{
  const video=(id,channel_id,views,extra={})=>({id,video_id:id,channel_id,channel:'Same name',views,platform:'YouTube',...extra});
  const rows=rankCreators([video('a','UC1',40),video('b','UC1','60'),video('c','UC2',500),video('a','UC1',40),video('hidden','UC2',9999,{hidden:true}),video('other','UC2',9999,{platform:'Vimeo'}),video('missing',null,9999),video('zero','UC3',null),video('invalid','UC3',-50)]);
  assert.deepEqual(rows.map(c=>[c.rank,c.id,c.views,c.films]),[[1,'UC2',500,1],[2,'UC1',100,2],[3,'UC3',0,2]]);
  assert.equal(rows[0].name,rows[1].name);
});
test('public rankings read all catalogue pages, use the public key and never return partial failures',async()=>{
  const oldFetch=globalThis.fetch,oldEnv=globalThis.Netlify;let failing=false;const offsets=[];
  globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'})[k]}};
  globalThis.fetch=async(url,options)=>{
    if(new URL(url).pathname.endsWith('/import_state'))return Response.json([{key:'channel-stats:UC2',value:{channelId:'UC2',subscribers:12000,channelViews:9000,publicVideos:4,updatedAt:'2026-11-01'}},{key:'channel-import:UC2',value:{channelId:'UC2',done:true,verifiedAt:'2026-11-01'}}]);
    const q=new URL(url).searchParams,offset=+q.get('offset');offsets.push(offset);
    assert.equal(options.headers.apikey,'public-test');assert.equal(q.get('hidden'),'eq.false');assert.equal(q.get('platform'),'eq.YouTube');assert.equal(q.get('order'),'id.asc');
    if(offset===0)return Response.json(Array.from({length:1000},(_,i)=>({id:'a'+i,video_id:'a'+i,channel_id:'UC1',channel:'Many small videos',views:1})));
    if(failing)return new Response(null,{status:503});
    return Response.json([{id:'winner',video_id:'winner',channel_id:'UC2',channel:'Big <creator>',views:5000}]);
  };
  try{
    const r=await handler(new Request('https://fanreelz.com/api/creator-rankings'));assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'public, max-age=300');
    const data=await r.json();assert.deepEqual(offsets,[0,1000]);assert.equal(data.videoCount,1001);assert.equal(data.rankings[0].id,'UC2');assert.equal(data.rankings[1].views,1000);
    failing=true;const failed=await handler(new Request('https://fanreelz.com/api/creator-rankings'));assert.equal(failed.status,503);assert.equal('rankings' in await failed.json(),false);
    assert.equal((await handler(new Request('https://fanreelz.com/api/creator-rankings',{method:'POST'}))).status,405);
  }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldEnv}
});
test('public creator page labels the view scope, escapes names and links to the original YouTube channel',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),main={innerHTML:''};
  const ctx=vm.createContext({document:{addEventListener(){}},setInterval:(fn,ms)=>assert.equal(ms,300000),encodeURIComponent,isMod:false,esc:s=>String(s).replaceAll('<','&lt;'),icon:()=>'',state:{view:'creators'},$:()=>main});
  vm.runInContext(html.slice(html.indexOf('let creatorBoard=null'),html.indexOf('function renderTop10(){')),ctx);
  vm.runInContext('creatorBoard={rankings:[{rank:1,id:"UC1",name:"Creator <test>",views:123456,films:4}],videoCount:4};renderCreatorRankings()',ctx);
  assert.match(main.innerHTML,/123,456/);assert.match(main.innerHTML,/Creator &lt;test>/);assert.match(main.innerHTML,/not the whole channel/);assert.match(main.innerHTML,/youtube.com\/channel\/UC1/);assert.match(main.innerHTML,/YouTube subscribers/);assert.match(main.innerHTML,/Full import pending/);
  assert.ok(html.includes('creators:renderCreatorRankings'));assert.ok(html.includes('["creators","Creator rankings","trophy"]'));
  vm.runInContext('creatorRankTab="subscribers";creatorBoard={rankings:[{id:"missing",name:"Missing",views:99999,subscribers:null},{id:"small",name:"Small",views:9000,subscribers:10},{id:"large",name:"Large",views:5,subscribers:5000}]};renderCreatorRankings()',ctx);
  assert.ok(main.innerHTML.indexOf('>Large</a>')<main.innerHTML.indexOf('>Small</a>'));assert.ok(main.innerHTML.indexOf('>Small</a>')<main.innerHTML.indexOf('>Missing</a>'));assert.match(main.innerHTML,/Unavailable/);
});
test('channel counts preserve hidden and missing subscribers and do not treat legacy done flags as verified',()=>{
  const hidden=channelStats({id:'UC1',statistics:{subscriberCount:'100',hiddenSubscriberCount:true,viewCount:'5000',videoCount:'10'}},'2026-11-01');
  assert.equal(hidden.subscribers,null);assert.equal(hidden.channelViews,5000);
  assert.equal(channelStats({id:'UC1',statistics:{}},'now').subscribers,null);
  const known=channelStats({id:'UC2',statistics:{subscriberCount:'12000',viewCount:'30000',videoCount:'20'}},'now');assert.equal(known.subscribers,12000);
  const out=attachChannelStatus([{id:'UC1'},{id:'UC2'}],[hidden,known],[{channelId:'UC1',done:true},{channelId:'UC2',done:true,verifiedAt:'2026-11-01',submittedBy:'private-user'}]);
  assert.equal(out[0].importComplete,false);assert.equal(out[1].importComplete,true);assert.ok(!JSON.stringify(out).includes('private-user'));
});
