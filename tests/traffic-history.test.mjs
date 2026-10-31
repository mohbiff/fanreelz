import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {trafficHistory,dayStart,shiftDate} from '../netlify/functions/lib/traffic-history.mjs';
import moderate from '../netlify/functions/moderate.mjs';

test('history counts complete Stockholm days, distinct visitors and visits, including zero-traffic days',async()=>{
  const calls=[],now=Date.parse('2026-10-31T14:00:00Z');
  const result=await trafficHistory(async(path,query)=>{
    if(path==='/daterange')return {startDate:'2026-10-28T08:00:00Z'};
    calls.push(query);
    return query.startAt===dayStart('2026-10-30')?{visitors:{value:50},visits:{value:80},pageviews:{value:150}}:{visitors:0,visits:0};
  },undefined,now);
  assert.deepEqual(result.rows,[{date:'2026-10-30',visitors:50,visits:80},{date:'2026-10-29',visitors:0,visits:0},{date:'2026-10-28',visitors:0,visits:0}]);
  assert.equal(result.from,'2026-10-28');assert.equal(result.nextBefore,null);
  for(const q of calls){assert.equal(q.timezone,'Europe/Stockholm');assert.ok(q.endAt<dayStart('2026-10-31'))}
});
test('history paginates all recorded days without gaps, overlaps or invented launch dates',async()=>{
  const get=async path=>path==='/daterange'?{startDate:'2026-09-29T13:00:00Z'}:{visitors:1,visits:2};
  const now=Date.parse('2026-10-31T23:30:00Z'); // Already 1 November in Stockholm.
  const dates=[];let before;
  do{const result=await trafficHistory(get,before,now);dates.push(...result.rows.map(r=>r.date));before=result.nextBefore}while(before);
  assert.equal(dates[0],'2026-10-31');assert.equal(dates.at(-1),'2026-09-29');assert.equal(new Set(dates).size,33);assert.equal(dates.length,33);
  for(let i=1;i<dates.length;i++)assert.equal(dates[i],shiftDate(dates[i-1],-1));
  await assert.rejects(trafficHistory(async()=>({}),undefined,now),/start of the recorded history/);
  await assert.rejects(trafficHistory(get,'2026-02-30',now),/Invalid history date/);
  assert.deepEqual((await trafficHistory(async()=>({startDate:null}),undefined,now)).rows,[]);
});
test('Stockholm daylight saving changes produce 23-hour and 25-hour days',()=>{
  assert.equal(dayStart('2026-03-30')-dayStart('2026-03-29'),23*3600e3);
  assert.equal(dayStart('2026-10-26')-dayStart('2026-10-25'),25*3600e3);
});
test('unavailable or incomplete daily statistics fail instead of being displayed as zero',async()=>{
  const dr={startDate:'2026-10-30T10:00:00Z'},now=Date.parse('2026-10-31T12:00:00Z');
  await assert.rejects(trafficHistory(async path=>path==='/daterange'?dr:{visitors:5},undefined,now),/incomplete/);
  await assert.rejects(trafficHistory(async path=>{if(path==='/daterange')return dr;throw Error('Unavailable')},undefined,now),/Unavailable/);
});
test('daily history is admin-only and reuses the existing Umami connection',async()=>{
  const previous=globalThis.fetch,oldEnv=globalThis.Netlify;
  let admin=false,statsCalls=0;
  globalThis.Netlify={env:{get:k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',ADMIN_EMAILS:'admin@test.invalid',UMAMI_API_KEY:'test-key'})[k]}};
  globalThis.fetch=async(url)=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/user')return Response.json({id:'test-user',email:admin?'admin@test.invalid':'member@test.invalid'});
    if(u.pathname.endsWith('/daterange'))return Response.json({startDate:new Date(Date.now()-864e5).toISOString()});
    if(u.pathname.endsWith('/stats')){statsCalls++;return Response.json({visitors:50,visits:80})}
    throw Error('Unexpected request '+u.pathname);
  };
  const req=()=>new Request('https://fanreelz.com/api/moderate',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'umami',metric:'daily-history'})});
  try{
    assert.equal((await moderate(req())).status,403);assert.equal(statsCalls,0);
    admin=true;const response=await moderate(req());assert.equal(response.status,200);
    const data=await response.json();assert.ok(data.rows.length);assert.equal(data.rows[0].visitors,50);assert.equal(data.rows[0].visits,80);
  }finally{globalThis.fetch=previous;globalThis.Netlify=oldEnv}
});
test('daily history table labels relative days and exposes older days and failures',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),main={innerHTML:''};
  const ctx=vm.createContext({Date,esc:s=>String(s),icon:()=>'',admSecTabs:()=>'',state:{},$:()=>main,document:{addEventListener(){}},render(){}});
  vm.runInContext(html.slice(html.indexOf('let umamiTab="overview"'),html.indexOf('function renderUmami(){')),ctx);
  const yesterday=shiftDate(new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'}),-1);
  ctx.rows=[{date:yesterday,visitors:50,visits:80},{date:shiftDate(yesterday,-1),visitors:0,visits:0}];
  vm.runInContext('trafficDays={loaded:true,rows,from:rows[1].date,nextBefore:rows[1].date};renderTrafficHistory()',ctx);
  assert.match(main.innerHTML,/Yesterday/);assert.match(main.innerHTML,/Day before yesterday/);assert.match(main.innerHTML,/Unique visitors/);assert.match(main.innerHTML,/>Visits</);assert.match(main.innerHTML,/Load older days/);
  vm.runInContext('trafficDays={...trafficDays,error:"API unavailable"};renderTrafficHistory()',ctx);assert.match(main.innerHTML,/role="alert"/);
});
