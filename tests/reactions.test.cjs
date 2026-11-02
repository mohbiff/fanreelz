const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
let scripts=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|application\/ld\+json/.test(match[1]))continue;new vm.Script(match[2]);scripts++}
const start=html.indexOf('const REACTIONS='),end=html.indexOf('function counts(f)',start);
const groups=[{name:'Popular games',cats:[{id:'freefire',name:'Free Fire'}]},{name:'Fantasy',cats:[{id:'wow',name:'World of Warcraft'}]},{name:'Anime',cats:[{id:'naruto',name:'Naruto'}]}];
const context={document:{addEventListener:()=>{}},URLSearchParams,GROUPS:groups,CATS:groups.flatMap(g=>g.cats),groupOf:id=>groups.find(g=>g.cats.some(c=>c.id===id)),catName:id=>groups.flatMap(g=>g.cats).find(c=>c.id===id)?.name||id,state:{view:'reactions',reactionGroup:'Popular games'},allFilms:()=>[{id:'game',cat:'freefire',char:'Kelly'},{id:'fantasy',cat:'wow',char:'Arthas'},{id:'anime',cat:'naruto',char:'Naruto'}],allSeries:()=>[{episodes:[{id:'game-ep',cat:'freefire',char:'Kelly'},{id:'anime-ep',cat:'naruto',char:'Naruto'}]}],safetyFilmVisible:()=>true,isKids:()=>true,GUEST:{},acct:{online:true,uid:'test',readonly:false},guestMig:{},statMemo:null,trendMemo:null,stats:f=>({n:0,c:[0,0,0,0,0]}),esc:String,fmtN:String,findFilm:id=>({id}),needAccount:()=>true,render:()=>{},toast:()=>{},guestSave:()=>{},guestNudge:()=>{}};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
const read=x=>{const v=vm.runInContext('JSON.stringify('+x+')',context);return v===undefined?undefined:JSON.parse(v)};
assert.deepEqual(read('cleanReactions(["moving","epic","epic","unknown"])'),['epic','moving']);
assert.deepEqual(read('aggregateReactions({one:{film:["epic","moving","epic"]},two:{film:["funny"]},three:{film:["bad"]}})'),{film:{n:3,fans:2,c:[1,0,1,1,0]}});
assert.deepEqual(read('likedIds({old:5,low:1},{new:["funny"]})'),['old','new']);
assert.equal(read('reactionPairs().length'),10);
assert.equal(read('new Set(reactionPairs().map(a=>a.join(","))).size'),10);
assert.equal(read('cleanReactions(["epic","funny","moving"]).length'),2);
for(const ids of read('[...REACTIONS.map(r=>[r.id]),...reactionPairs()]')){
 context.testSelection=ids;
 assert.equal(vm.runInContext('matchesReactionFilter({id:"match"},testSelection,{match:{n:2,c:REACTIONS.map(r=>testSelection.includes(r.id)?1:0)}},testSelection.length===2?testSelection[1]:null)',context),true);
 assert.equal(vm.runInContext('matchesReactionFilter({id:"match"},testSelection,{match:{n:2,c:[0,0,0,0,0]}})',context),false);
}
assert.equal(vm.runInContext('matchesReactionFilter({id:"film"},["epic","funny"],aggregateReactions({a:{film:["epic"]},b:{film:["funny"]}}),"funny")',context),true);
assert.equal(read('reactionBrowsePath(["moving","epic"],"short")'),'/reactions?with=epic%2Cmoving&format=short');

assert.deepEqual(read('reactionBrowsePool().map(f=>f.id)'),['game','game-ep']);
assert.deepEqual(read('normaliseReactionScope({group:"Popular games",cat:"wow"})'),{group:'Fantasy',cat:'wow',char:null});
assert.equal(vm.runInContext('filmInReactionScope({cat:"freefire",char:"Kelly"},{cat:"freefire",char:"Kelly"})',context),true);
assert.equal(vm.runInContext('filmInReactionScope({cat:"freefire",char:"Hayato"},{cat:"freefire",char:"Kelly"})',context),false);
assert.equal(vm.runInContext('filmInReactionScope({cat:"naruto"},{group:"Popular games"})',context),false);
context.state={view:'browse',bgroup:'Popular games',group:'Fantasy',cat:'wow'};
assert.deepEqual(read('currentReactionScope()'),{group:'Popular games',cat:null,char:null});
context.state={view:'home',group:'Popular games',cat:'freefire',char:'Kelly'};
assert.deepEqual(read('currentReactionScope()'),{group:'Popular games',cat:'freefire',char:'Kelly'});
assert.match(read('reactionBrowsePath(["epic","funny"],"short",currentReactionScope())'),/g=Popular\+games&cat=freefire&char=Kelly/);
const routes=html.slice(html.indexOf('function pathFor(st)'),html.indexOf('const urlNow=',html.indexOf('function pathFor(st)')));
context.PAGES=['reactions'];context.location={pathname:'/reactions',search:'?with=epic%2Cfunny&g=Popular+games'};
vm.runInContext(routes,context);
assert.deepEqual(read('parsePath()'),{view:'reactions',reactionSecond:null,reactionFilter:['epic','funny'],reactionFormat:'all',reactionGroup:'Popular games',reactionCat:null,reactionChar:null});
assert.match(read('pathFor({view:"reactions",reactionFilter:["epic"],reactionGroup:"Popular games"})'),/g=Popular\+games/);
context.location={pathname:'/',search:'?g=Fantasy'};
assert.equal(read('parsePath().group'),'Fantasy');
assert.equal(read('pathFor({view:"home",group:"Popular games"})'),'/?g=Popular%20games');
assert.equal(read('pathFor({view:"home",format:"film",group:"Popular games"})'),'/?f=film&g=Popular%20games');

assert.deepEqual(read('leadingReactionIds({c:[4,6,2,7,10]})'),['informative','moving']);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["moving","informative"],{v:{n:29,c:[4,6,2,7,10]}},"moving")',context),true);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["epic"],{v:{n:29,c:[4,6,2,7,10]}})',context),false);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["impressive","moving"],{v:{n:29,c:[4,6,2,7,10]}})',context),false);
assert.deepEqual(read('leadingReactionIds({c:[5,0,0,0,0]})'),['epic']);
assert.deepEqual(read('leadingReactionIds({c:[0,0,0,0,0]})'),[]);
assert.deepEqual(read('leadingReactionIds({c:[2,2,2,2,2]})'),['epic','impressive']);
assert.deepEqual(read('leadingReactionIds({c:[4,6,2,7,1]})'),['moving','impressive']);

for(const key of read('REACTIONS.map(r=>r.id)')){
 context.reactionKey=key;
 assert.deepEqual(read('cycleReactionFilter([],null,reactionKey)'),{selection:[key],second:null});
 assert.deepEqual(read('cycleReactionFilter([reactionKey],null,reactionKey)'),{selection:[key],second:key});
 assert.deepEqual(read('cycleReactionFilter([reactionKey],reactionKey,reactionKey)'),{selection:[],second:null});
}
assert.equal(read('cycleReactionFilter(["epic","funny"],null,"moving").error'),'limit');
assert.equal(read('cycleReactionFilter(["epic","funny"],"epic","funny").error'),'second-conflict');
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["informative"],{v:{c:[0,0,0,10,6]}},"informative")',context),true);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["informative"],{v:{c:[0,0,0,6,10]}},"informative")',context),false);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["moving","informative"],{v:{c:[0,0,0,10,6]}},"informative")',context),true);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["informative"],{v:{c:[0,0,0,10,6]}})',context),false);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["informative"],{v:{c:[0,0,0,6,10]}})',context),true);
assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},["epic","funny"],{v:{c:[10,0,6,0,0]}})',context),false);
assert.match(read('reactionBrowsePath(["epic","informative"],"short",{group:"Popular games"},"informative")'),/second=informative/);
context.location={pathname:'/reactions',search:'?with=epic,informative&second=informative&g=Popular+games'};
assert.equal(read('parsePath().reactionSecond'),'informative');
assert.match(read('pathFor({...parsePath()})'),/second=informative/);
context.location={pathname:'/reactions',search:'?with=epic&second=informative'};
assert.equal(read('parsePath().reactionSecond'),null);
vm.runInContext('reactionFilterHint={key:"informative"}',context);
assert.match(vm.runInContext('reactionFilterHelp(REACTIONS.find(r=>r.id==="informative"),"informative")',context),/second-most-voted/);
assert.match(vm.runInContext('reactionFilterHelp(REACTIONS.find(r=>r.id==="informative"),"informative")',context),/does not add votes/);

for(const [i,key] of read('REACTIONS.map(r=>r.id)').entries()){
 const first=Array(5).fill(0);first[i]=10;first[(i+1)%5]=6;
 const second=Array(5).fill(0);second[i]=6;second[(i+1)%5]=10;
 const third=Array(5).fill(0);third[i]=3;third[(i+1)%5]=10;third[(i+2)%5]=8;
 context.rankKey=key;context.primaryFixture={v:{c:first}};context.secondaryFixture={v:{c:second}};context.thirdFixture={v:{c:third}};
 assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},[rankKey],primaryFixture)',context),true);
 assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},[rankKey],secondaryFixture)',context),false);
 assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},[rankKey],secondaryFixture,rankKey)',context),true);
 assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},[rankKey],primaryFixture,rankKey)',context),false);
 assert.equal(vm.runInContext('matchesReactionFilter({id:"v"},[rankKey],thirdFixture,rankKey)',context),false);
}
let stored;context.acct.db={doc:path=>({set:async data=>{stored={path,data}}})};
(async()=>{
 vm.runInContext('reactionsReady=true',context);
 assert.equal(await vm.runInContext('toggleReaction("film","epic")',context),true);
 assert.equal(stored.path,'reactions/test');assert.deepEqual(read('myReactions.film'),['epic']);
 await vm.runInContext('toggleReaction("film","moving")',context);assert.deepEqual(read('myReactions.film'),['epic','moving']);
 assert.equal(await vm.runInContext('toggleReaction("film","funny")',context),false);assert.deepEqual(read('myReactions.film'),['epic','moving']);
 assert.match(vm.runInContext('reactionBox({id:"film"})',context),/aria-label="Funny"[^>]*disabled/);
 await vm.runInContext('toggleReaction("film","epic")',context);assert.deepEqual(read('myReactions.film'),['moving']);
 await vm.runInContext('toggleReaction("film","moving")',context);assert.deepEqual(read('myReactions'),{});assert.equal(read('reactionTotals.film'),undefined);
 context.acct.db={doc:()=>({set:async()=>{throw Error('offline')}})};
 assert.equal(await vm.runInContext('toggleReaction("film","funny")',context),false);assert.deepEqual(read('myReactions'),{});
 context.acct.online=false;await vm.runInContext('toggleReaction("film","funny")',context);assert.deepEqual(read('GUEST.reactions'),{film:['funny']});assert.deepEqual(read('reactionTotals'),{});
 assert(!html.includes('data-rate="'));assert(!html.includes('s.avg.toFixed'));assert(!html.includes('st.avg.toFixed'));
 console.log(scripts+' inline scripts parse; reaction multi-select, deduplication, removal, rollback, legacy likes and guest isolation, two-reaction limits and all 15 reaction selections, scoped groups/categories/characters, shareable routes and exact first/second-place filtering, click cycles and pop-up explanations pass.');
})().catch(e=>{console.error(e);process.exitCode=1});

