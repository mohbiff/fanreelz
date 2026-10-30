import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import insights from '../netlify/functions/insights.mjs';
const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test',SUPABASE_ANON_KEY:'test',ADMIN_EMAILS:'admin@test.invalid'};
globalThis.Netlify={env:{get:k=>env[k]}};
let actor=null, saved=new Map(),failCatalog=false;
globalThis.fetch=async (url,opts={})=>{
 url=String(url);const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(url.includes('/auth/v1/user'))return actor?reply(actor):reply({},401);
 if(url.includes('import_state?')){const k=new URL(url).searchParams.get('key').slice(3);return reply([{value:k==='plus'?{ids:['plus-user']}:saved.get(k)||{}}]);}
 if(url.endsWith('import_state')){const [row]=JSON.parse(opts.body);saved.set(row.key,row.value);return reply({});}
 if(url.includes('search_events?'))return reply(Array.from({length:3},()=>({q:'Arthas',cc:'SE',zero:true,at:new Date().toISOString()})));
 if(url.includes('catalog?'))return failCatalog?reply({},503):reply([{id:'a',channel_id:'UC1',channel:'Creator <test>'}]);
 throw Error('Unexpected request '+url);
};
const call=async body=>{const r=await insights(new Request('https://fanreelz.com/api/insights',{method:'POST',headers:actor?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)}));return [r,await r.json()];};
assert.deepEqual((await call({}))[1],{plus:false,admin:false});
assert.equal((await call({action:'growthSave',plans:[],watch:[]}))[0].status,403);
actor={id:'plus-user',email:'plus@test.invalid'};
let [r,d]=await call({});assert.equal(d.plus,true);assert.ok(!('total'in d));assert.ok(!('n'in d.wanted[0]));assert.ok(!('n'in d.countries[0]));assert.equal(d.growth.rankings[0].films,1);assert.equal(d.growth.personal.available,false);assert.equal(r.headers.get('Cache-Control'),'no-store');
assert.equal((await call({action:'growthFeature',channelId:'UC1'}))[0].status,403);
assert.equal((await call({action:'growthSave',plans:[{title:'Plan',date:'2026-02-30',status:'planned'}],watch:[]}))[0].status,400);
assert.equal((await call({action:'growthSave',plans:[{title:'Plan',date:'2026-11-01',status:'planned'}],watch:['Arthas']}))[0].status,200);
assert.equal(saved.get('growth:plus-user').watch[0],'arthas');
assert.equal((await call({}))[1].growth.prefs.plans.length,1);
actor={id:'admin-user',email:'admin@test.invalid'};
assert.equal((await call({}))[1].total,3);
assert.equal((await call({action:'growthFeature',channelId:'UC1'}))[0].status,200);
assert.equal((await call({}))[1].growth.featured.id,'UC1');assert.equal((await call({}))[1].growth.prefs.plans.length,0);
failCatalog=true;assert.ok((await call({}))[1].growth.catalogError);
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');let scripts=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!m[2].trim()||/application\/ld\+json/.test(m[1]))continue;new vm.Script(m[2]);scripts++;}
const start=html.indexOf('function renderGrowthCenter('),end=html.indexOf('let growthSaving=',start);
const context={esc:s=>String(s).replaceAll('<','&lt;'),Intl};vm.createContext(context);vm.runInContext(html.slice(start,end),context);
const view=context.renderGrowthCenter({...d,admin:false});assert.ok(view.includes('Creator Rankings'));assert.ok(view.includes('Creator &lt;test>'));assert.ok(!view.includes('growthFeatureForm'));
console.log('PASS: access gates, admin-only counts, private account storage, date validation, featured creator permissions, data failures, UI escaping, '+scripts+' inline scripts parsed.');

