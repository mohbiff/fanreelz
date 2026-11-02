const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
let scripts=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|application\/ld\+json/.test(match[1]))continue;new vm.Script(match[2]);scripts++}
const start=html.indexOf('const REACTIONS='),end=html.indexOf('function counts(f)',start);
const context={GUEST:{},acct:{online:true,uid:'test',readonly:false},guestMig:{},statMemo:null,trendMemo:null,stats:f=>({n:0,c:[0,0,0,0,0]}),esc:String,fmtN:String,findFilm:id=>({id}),needAccount:()=>true,render:()=>{},toast:()=>{},guestSave:()=>{},guestNudge:()=>{}};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
const read=x=>{const v=vm.runInContext('JSON.stringify('+x+')',context);return v===undefined?undefined:JSON.parse(v)};
assert.deepEqual(read('cleanReactions(["moving","epic","epic","unknown"])'),['epic','moving']);
assert.deepEqual(read('aggregateReactions({one:{film:["epic","moving","epic"]},two:{film:["funny"]},three:{film:["bad"]}})'),{film:{n:3,fans:2,c:[1,0,1,1,0]}});
assert.deepEqual(read('likedIds({old:5,low:1},{new:["funny"]})'),['old','new']);
let stored;context.acct.db={doc:path=>({set:async data=>{stored={path,data}}})};
(async()=>{
 vm.runInContext('reactionsReady=true',context);
 assert.equal(await vm.runInContext('toggleReaction("film","epic")',context),true);
 assert.equal(stored.path,'reactions/test');assert.deepEqual(read('myReactions.film'),['epic']);
 await vm.runInContext('toggleReaction("film","moving")',context);assert.deepEqual(read('myReactions.film'),['epic','moving']);
 await vm.runInContext('toggleReaction("film","epic")',context);assert.deepEqual(read('myReactions.film'),['moving']);
 await vm.runInContext('toggleReaction("film","moving")',context);assert.deepEqual(read('myReactions'),{});assert.equal(read('reactionTotals.film'),undefined);
 context.acct.db={doc:()=>({set:async()=>{throw Error('offline')}})};
 assert.equal(await vm.runInContext('toggleReaction("film","funny")',context),false);assert.deepEqual(read('myReactions'),{});
 context.acct.online=false;await vm.runInContext('toggleReaction("film","funny")',context);assert.deepEqual(read('GUEST.reactions'),{film:['funny']});assert.deepEqual(read('reactionTotals'),{});
 assert(!html.includes('data-rate="'));assert(!html.includes('s.avg.toFixed'));assert(!html.includes('st.avg.toFixed'));
 console.log(scripts+' inline scripts parse; reaction multi-select, deduplication, removal, rollback, legacy likes and guest isolation pass.');
})().catch(e=>{console.error(e);process.exitCode=1});

