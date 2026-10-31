import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {channelReference,runChannelImports} from '../netlify/functions/import-youtube.mjs';
import moderate from '../netlify/functions/moderate.mjs';

test('channel link validation supports handles, IDs and legacy usernames',()=>{
  assert.deepEqual(channelReference('https://www.youtube.com/@Example/videos'),{forHandle:'@Example'});
  assert.deepEqual(channelReference('https://youtube.com/channel/UCabcdefghijklmnopqrstuv'),{id:'UCabcdefghijklmnopqrstuv'});
  assert.deepEqual(channelReference('https://youtube.com/user/Example'),{forUsername:'Example'});
  for(const link of ['https://youtube.com.evil.test/@Example','https://evil.test/youtube.com/@Example','https://youtu.be/abcdefghijk','https://youtube.com/watch?v=abcdefghijk','https://youtube.com/%XX','http://youtube.com/@Example'])assert.equal(channelReference(link),null);
});

test('admin imports a whole channel across pages; failures retain cursor and moderation remains intact',async()=>{
  const oldFetch=globalThis.fetch,oldEnv=globalThis.Netlify;
  const channelId='UCabcdefghijklmnopqrstuv',jobs=new Map(),catalog=new Map([['yt-abcdefghijk',{hidden:true}]]);
  let fail=false,pages=0,auth='admin',apiCalls=0;
  globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',YOUTUBE_API_KEY:'test-youtube',ADMIN_EMAILS:'admin@test.invalid'})[k]}};
  globalThis.fetch=async(url,opts={})=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/user')return auth==='guest'?new Response(null,{status:401}):Response.json({id:'admin-id',email:auth==='admin'?'admin@test.invalid':'member@test.invalid'});
    if(u.hostname==='www.googleapis.com'){
      apiCalls++;
      if(u.pathname.endsWith('/channels'))return Response.json({items:[{id:channelId,snippet:{title:'Original Channel'},contentDetails:{relatedPlaylists:{uploads:'uploads-list'}}}]});
      if(u.pathname.endsWith('/playlistItems')){pages++;return Response.json({items:[{snippet:{resourceId:{videoId:u.searchParams.has('pageToken')?'lmnopqrstuv':'abcdefghijk'}}}],...(!u.searchParams.has('pageToken')?{nextPageToken:'page2'}:{})})}
      if(u.pathname.endsWith('/videos')){
        if(fail)return new Response(null,{status:503});
        return Response.json({items:[{id:u.searchParams.get('id'),snippet:{channelTitle:'Original Channel',channelId,title:'A film without AI keywords',description:'',publishedAt:'2026-10-01T00:00:00Z'},status:{privacyStatus:'public',embeddable:true},contentDetails:{duration:'PT3M'},statistics:{viewCount:'20'}},{id:'private',status:{privacyStatus:'private',embeddable:false}}]});
      }
    }
    if(u.pathname==='/rest/v1/import_state'){
      if(opts.method==='POST'){for(const x of JSON.parse(opts.body))jobs.set(x.key,x.value);return new Response(null,{status:204})}
      const key=u.searchParams.get('key');return Response.json([...jobs].filter(([k])=>!key?.startsWith('eq.')||k===key.slice(3)).map(([key,value])=>({key,value})));
    }
    if(u.pathname==='/rest/v1/catalog'){
      for(const row of JSON.parse(opts.body))catalog.set(row.id,{...catalog.get(row.id),...row});return new Response(null,{status:204});
    }
    throw Error('Unexpected fetch '+u);
  };
  const request=()=>new Request('https://fanreelz.com/api/moderate',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'addchannel',q:'https://youtube.com/@Example'})});
  try{
    auth='guest';assert.equal((await moderate(request())).status,403);
    auth='member';assert.equal((await moderate(request())).status,403);assert.equal(apiCalls,0);
    auth='admin';const response=await moderate(request()),first=await response.json();
    assert.equal(first.more,true);assert.equal(first.imported,1);assert.equal(first.channel,'Original Channel');
    const key='channel-import:'+channelId;assert.equal(jobs.get(key).nextPage,'page2');assert.equal(jobs.get(key).submittedBy,'admin-id');
    assert.equal(catalog.get('yt-abcdefghijk').channel,'Original Channel');assert.equal(catalog.get('yt-abcdefghijk').channel_id,channelId);assert.equal(catalog.get('yt-abcdefghijk').hidden,true);
    fail=true;await assert.rejects(runChannelImports());assert.equal(jobs.get(key).nextPage,'page2');
    fail=false;const second=await runChannelImports();assert.equal(second.more,false);assert.equal(second.processed,2);assert.equal(catalog.size,2);
    assert.equal(await runChannelImports(),null);
    jobs.get(key).lastRun='2026-01-01T00:00:00Z';await runChannelImports();assert.equal(jobs.get(key).nextPage,'page2');
    jobs.get(key).disabled=true;const previous=pages;assert.equal(await runChannelImports(),null);assert.equal(pages,previous);
  }finally{globalThis.fetch=oldFetch;globalThis.Netlify=oldEnv}
});

test('channel form has a clear location, label and submit action',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ctx=vm.createContext({esc:s=>String(s),adminChannelQ:'https://youtube.com/@Example',adminBusy:false,adminMsg:''});
  vm.runInContext(html.slice(html.indexOf('function channelImportBox(){'),html.indexOf('document.addEventListener("input",e=>{if(e.target.id==="adminChannel")')),ctx);
  const form=vm.runInContext('channelImportBox()',ctx);
  assert.match(form,/Import YouTube channel/);assert.match(form,/Import channel/);assert.match(form,/name="channel"/);
  assert.ok(html.includes('New videos</h1>${channelImportBox()}'));
  assert.ok(html.includes('adminDo({action:"addchannel",q}'));
});
