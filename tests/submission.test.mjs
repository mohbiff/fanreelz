import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import submit, {youtubeId} from '../netlify/functions/submit-youtube.mjs';
import worker from '../worker/index.mjs';

test('Cloudflare YouTube submit stores the original channel and a separate authenticated audit identity',async()=>{
  const original=globalThis.fetch,oldEnv=globalThis.Netlify,oldCaches=globalThis.caches;
  globalThis.caches={default:{}}; // POST bypasses the Cloudflare edge cache.
  const uid='11111111-1111-4111-8111-111111111111',calls=[],prior={id:'old',title:'Existing film'};
  let saved,audit,fail='',missing=false;
  const env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',YOUTUBE_API_KEY:'yt-test'};
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url);calls.push(u.pathname);
    if(u.pathname==='/auth/v1/user')return options.headers.Authorization==='Bearer signed-in'?Response.json({id:uid}):new Response(null,{status:401});
    if(u.hostname==='www.googleapis.com')return fail==='metadata'?new Response(null,{status:403}):Response.json({items:missing?[]:[{snippet:{channelTitle:'Original YouTube Channel',channelId:'UC-original'}}]});
    if(u.pathname==='/rest/v1/docs')return Response.json([{data:{films:[prior]}}]);
    if(u.pathname==='/rest/v1/import_state'){
      if(fail==='audit')return new Response(null,{status:500});
      assert.equal(options.headers.apikey,'sb_secret_test');audit=JSON.parse(options.body);return new Response(null,{status:201});
    }
    if(u.pathname==='/rest/v1/rpc/save_doc'){
      assert.equal(options.headers.Authorization,'Bearer signed-in');saved=JSON.parse(options.body);return new Response(null,{status:204});
    }
    throw Error('Unexpected fetch '+u);
  };
  const film={id:'forged',title:'Fan film',url:'https://youtu.be/abcdefghijk',cat:'games',format:'film',channelTitle:'Fake',channelId:'Fake',submittedBy:'someone-else',byId:'someone-else'};
  const request=(f=film,token='signed-in')=>new Request('https://fanreelz.com/api/submit-youtube',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({film:f})});
  try {
    const response=await worker.fetch(request(),env,{});
    assert.equal(response.status,200);
    const result=await response.json(),stored=saved.p_data.films[0];
    assert.equal(stored.channelTitle,'Original YouTube Channel');assert.equal(stored.channelId,'UC-original');
    assert.equal(saved.p_id,uid);assert.deepEqual(saved.p_data.films[1],prior);
    assert.equal(audit.value.submittedBy,uid);assert.equal(audit.value.filmId,stored.id);
    assert.equal(audit.value.videoId,'abcdefghijk');assert.equal(result.film.id,stored.id);
    assert.equal('submittedBy' in stored,false);assert.equal('byId' in stored,false);
    assert.equal(JSON.stringify(result).includes(uid),false);
    const count=calls.length;assert.equal((await submit(request(film,'invalid'))).status,401);assert.equal(calls.length,count+1);
    assert.equal((await submit(request({...film,url:'https://evil.test/youtube.com/watch?v=abcdefghijk'}))).status,400);
    missing=true;assert.equal((await submit(request())).status,422);missing=false;
    fail='metadata';assert.equal((await submit(request())).status,502);
    fail='audit';const writes=calls.filter(x=>x.endsWith('save_doc')).length;
    assert.equal((await submit(request())).status,503);assert.equal(calls.filter(x=>x.endsWith('save_doc')).length,writes);
    assert.equal((await submit(new Request('https://test/api/submit-youtube'))).status,405);
  }finally{globalThis.fetch=original;globalThis.Netlify=oldEnv;globalThis.caches=oldCaches}
});

test('public credit, legacy submissions, non-YouTube films and series remain compatible',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ctx=vm.createContext({acct:{uid:'submitter'},names:{submitter:'Submitter Name'}});
  vm.runInContext(html.slice(html.indexOf('function parseVid('),html.indexOf('const detectFormat=')),ctx);
  vm.runInContext(html.match(/const byName=.*;/)[0],ctx);
  for(const [metadata,expected] of [[{channelTitle:'Original Channel',channelId:'UC1'},'Original Channel'],[{},'YouTube creator']]){
    ctx.f={url:'https://youtube.com/shorts/abcdefghijk',...metadata};
    vm.runInContext('f={...f,...submissionCredit(f,"submitter"),...parseVid(f.url)}',ctx);
    assert.equal(vm.runInContext('byName(f)',ctx),expected);assert.equal(ctx.f.byId,undefined);assert.equal(ctx.f.submissionOwner,'submitter');
  }
  ctx.f={url:'https://vimeo.com/12345678'};
  assert.equal(vm.runInContext('submissionCredit(f,"submitter").byId',ctx),'submitter');
  assert.ok(html.includes('channelId||e.submissionOwner||e.byId'));
  assert.equal(youtubeId('https://www.youtube.com/watch?v=abcdefghijk&list=foo'),'abcdefghijk');
  assert.equal(youtubeId('https://youtube.com.evil.test/watch?v=abcdefghijk'),null);
});
