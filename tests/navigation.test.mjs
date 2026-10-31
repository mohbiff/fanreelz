import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../navigation.js',import.meta.url),'utf8');
function setup(){
  const listeners=[],ctx=vm.createContext({encodeURIComponent,acct:{uid:'member'},
    findFilm:id=>({id,format:id==='short'?'short':'film'}),
    document:{body:{querySelectorAll:()=>[]},addEventListener:(...args)=>listeners.push(args)},
    MutationObserver:class {observe(){}},
  });
  vm.runInContext('const PAGES=["about","live","you","browse","admin","history"];'+html.slice(html.indexOf('function pathFor(st){'),html.indexOf('function parsePath(){')),ctx);
  vm.runInContext(source,ctx);return {ctx,listeners};
}
test('navigation URLs point to reloadable film, short, category and profile pages',()=>{
  const {ctx}=setup();
  for(const [dataset,expected] of [[{open:'film/id'},'/film/film%2Fid'],[{open:'short'},'/shorts/short'],[{openFull:'short'},'/film/short'],[{view:'about'},'/about'],[{feed:'fresh'},'/feed/fresh'],[{cat:'warcraft',charGo:'Thrall & friends'},'/c/warcraft?char=Thrall%20%26%20friends'],[{user:'member'},'/u/member'],[{creator:'Original Channel'},'/creator/Original%20Channel'],[{series:'series1'},'/series/series1'],[{browse:'Games'},'/browse?g=Games'],[{liveopen:'stream'},'/live/stream']]){
    ctx.el={dataset};assert.equal(vm.runInContext('navigationHref(el)',ctx),expected);
  }
  ctx.el={dataset:{cat:'warcraft',loreGo:'lore'}};assert.equal(vm.runInContext('navigationHref(el)',ctx),null);
  for(const [dataset,expected] of [[{fmtnav:'series'},'/?f=series'],[{fmtnav:'short'},'/?f=short'],[{longnav:''},'/?f=film&d=o20'],[{you:'history'},'/history'],[{you:'channel'},'/u/member?tab=videos']]){
    ctx.el={dataset};assert.equal(vm.runInContext('navigationHref(el)',ctx),expected);
  }
});
test('middle/modified clicks keep browser defaults, left-click stays in the app, and actions stay buttons',()=>{
  const {ctx,listeners}=setup();assert.ok(listeners.some(([type,,capture])=>type==='click'&&capture));
  for(const options of [{button:1},{button:0,ctrlKey:true},{button:0,metaKey:true},{button:0,shiftKey:true},{button:0,altKey:true},{button:0,target:'_blank'}]){
    let prevented=false,stopped=false;const link={target:options.target||'',hasAttribute:()=>false};
    ctx.event={...options,target:{closest:()=>link},preventDefault:()=>{prevented=true},stopImmediatePropagation:()=>{stopped=true}};
    vm.runInContext('handleNavigationClick(event)',ctx);assert.equal(prevented,false);assert.equal(stopped,true);
  }
  let prevented=false,stopped=false;
  ctx.event={button:0,target:{closest:()=>({hasAttribute:()=>false})},preventDefault:()=>{prevented=true},stopImmediatePropagation:()=>{stopped=true}};
  vm.runInContext('handleNavigationClick(event)',ctx);assert.equal(prevented,true);assert.equal(stopped,false);
  ctx.event={target:{closest:()=>null},preventDefault:()=>assert.fail('Action button intercepted')};vm.runInContext('handleNavigationClick(event)',ctx);
  assert.ok(!source.match(/navigationSelector=.*data-(rate|save|follow|adminhide)/));
  assert.match(html,/<a class="vid" href=/);assert.ok(html.includes('<script src="/navigation.js"></script>'));
});
test('link conversion preserves child nodes and data attributes without nesting interactive controls',()=>{
  const {ctx}=setup(),child={tagName:'CANVAS'};
  const el={tagName:'BUTTON',dataset:{open:'film'},attributes:[{name:'class',value:'vid'},{name:'data-open',value:'film'},{name:'role',value:'button'},{name:'type',value:'button'}],firstChild:child,
    hasAttribute:()=>false,closest:()=>null,querySelector:()=>null,replaceWith(link){this.replaced=link}};
  let created;
  ctx.document.createElement=()=>created={attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v},appendChild(node){this.children.push(node);el.firstChild=null}};
  ctx.root={querySelectorAll:()=>[el]};vm.runInContext('linkifyNavigation(root)',ctx);
  assert.equal(el.replaced,created);assert.deepEqual(created.children,[child]);assert.equal(created.attrs.href,'/film/film');assert.equal(created.attrs['data-open'],'film');assert.equal(created.attrs.role,undefined);
  const nested={...el,replaced:null,querySelector:()=>({tagName:'BUTTON'})};ctx.root={querySelectorAll:()=>[nested]};vm.runInContext('linkifyNavigation(root)',ctx);assert.equal(nested.replaced,null);
});
