import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('let spState=null'),html.indexOf('let endTimer=null'));
function setup(userAgent='iPhone',platform='',maxTouchPoints=1){
  const listeners={},commands=[],timers=[];
  const sp={style:{},classList:{contains:()=>false,add(){},remove(){}},getBoundingClientRect:()=>({height:600})};
  const steps=[];
  const frame={dataset:{fid:'yt-a'},closest:s=>s==='.sp'?sp:null,contentWindow:{postMessage(data){commands.push(typeof data==='string'?JSON.parse(data):data)}}};
  const ctx=vm.createContext({URL,navigator:{userAgent,platform,maxTouchPoints},
    localStorage:{getItem:()=>null,setItem(){}},state:{view:'shorts',film:'a',shortI:1},
    findFilm:()=>({yt:'a'}),md:{el:null},phone:()=>true,
    window:{},addEventListener(type,fn){(listeners['window:'+type]??=[]).push(fn)},setInterval(){},clearTimeout(){},
    setTimeout(fn){timers.push(fn)},stepShort(d){steps.push(d)},
    document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn)},
      querySelector:s=>s==='.sp iframe'?frame:s==='.sp'?sp:null,
      querySelectorAll:s=>['.player iframe, .sp iframe','.sp iframe, .player iframe','.sp iframe'].includes(s)?[frame]:[]},
    toast(){},
  });
  vm.runInContext(source,ctx);
  vm.runInContext('spShowCtl=()=>{}',ctx);
  const run=code=>vm.runInContext(code,ctx);
  return {ctx,run,commands,timers,listeners,frame,sp,steps};
}

function gestureTarget(selector){const target={closest:s=>s.split(',').some(x=>x.trim()===selector)?target:null};return target}
function event(target,y=300,x=150){return {target,touches:[{clientY:y,clientX:x}],changedTouches:[{clientY:y,clientX:x}],
  preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},stopPropagation(){}}}
function fire(fixture,type,e){for(const listener of fixture.listeners[type]||[]){listener(e);if(e.stopped)break}return e}

test('simulated Safari and iOS WebView touch sequences toggle exactly once, including compatibility clicks',()=>{
  for(const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148']){
    const f=setup(ua),surface=gestureTarget('.spcatch');
    f.run('spInfo(1)');
    for(let i=0;i<2;i++){
      fire(f,'touchstart',event(surface));
      const end=fire(f,'touchend',event(surface));assert.equal(end.prevented,true);
      assert.equal(f.commands.length,i+1,'touchend itself must issue the command');
      fire(f,'click',event(surface));assert.equal(f.commands.length,i+1,'compatibility click must not toggle again');
    }
    assert.deepEqual(f.commands.map(x=>x.func),['pauseVideo','playVideo']);
  }
});

test('desktop click on the video surface toggles directly without showing controls first',()=>{
  const f=setup('Windows NT'),surface=gestureTarget('.spcatch');f.run('spInfo(1)');
  fire(f,'click',event(surface));fire(f,'click',event(surface));
  assert.deepEqual(f.commands.map(x=>x.func),['pauseVideo','playVideo']);
});

test('iOS swipes in both directions change video synchronously at touchend and never toggle pause',()=>{
  for(const selector of ['.spcatch','.spicon'])for(const endY of [50,550]){
    const f=setup(),surface=gestureTarget(selector);
    f.run('spPeek=()=>({el:{style:{},remove(){}},h:600});spInfo(1)');
    fire(f,'touchstart',event(surface,300));fire(f,'touchmove',event(surface,endY));
    fire(f,'touchend',event(surface,endY));fire(f,'click',event(surface,endY));
    assert.deepEqual(f.steps,[endY<300?1:-1]);assert.equal(f.commands.length,0);
  }
});

test('horizontal drag, drag returning to start, cancel and multitouch never become play/pause taps',()=>{
  for(const action of ['horizontal','return','cancel','multitouch']){
    const f=setup(),surface=gestureTarget('.spcatch');
    f.run('spPeek=()=>({el:{style:{},remove(){}},h:600})');
    fire(f,'touchstart',event(surface));
    if(action==='horizontal')fire(f,'touchmove',event(surface,300,280));
    if(action==='return'){fire(f,'touchmove',event(surface,250));fire(f,'touchmove',event(surface,300))}
    if(action==='cancel')fire(f,'touchcancel',event(surface));
    if(action==='multitouch'){const e=event(surface);e.touches.push({clientX:250,clientY:300});fire(f,'touchstart',e)}
    fire(f,'touchend',event(surface));fire(f,'click',event(surface));
    assert.equal(f.commands.length,0,action);assert.equal(f.steps.length,0,action);
  }
});

test('seek and rail controls do not trigger the video surface toggle',()=>{
  for(const selector of ['.spseek','[data-spmute]','[data-spsheet]']){
    const f=setup(),target=gestureTarget(selector);
    // Playback gesture handlers only; mute/rail have their own separate action handlers.
    f.listeners.touchstart[0](event(target));f.listeners.touchend[0](event(target));f.listeners.click[0](event(target));
    assert.equal(f.commands.length,0);assert.equal(f.run('spTouchY'),null);
  }
});

test('there is one touch toggle route and one fallback click route; load/listen setup is consolidated',()=>{
  const f=setup();
  assert.equal(f.listeners.touchend.filter(fn=>String(fn).includes('spToggle()')).length,1);
  assert.equal(f.listeners.click.filter(fn=>String(fn).includes('spToggle()')).length,1);
  assert.equal(f.listeners.load.length,1);
  assert.equal((html.match(/spToggle\(\)/g)||[]).length,3,'definition plus the two deduplicated input routes');
});

test('wake retries are scoped to their original frame/video and cannot override explicit pause',()=>{
  const f=setup();f.run('spQueueWake(document.querySelector(".sp iframe"))');
  f.frame.dataset.fid='yt-b';for(const timer of f.timers)timer();assert.equal(f.commands.length,0);
  f.timers.length=0;f.run('spQueueWake(document.querySelector(".sp iframe"));spPaused=true');
  for(const timer of f.timers)timer();assert.equal(f.commands.length,0);
});

test('old video ended/paused messages are ignored until the reused player reports the new video',()=>{
  const f=setup();
  const start=html.indexOf('addEventListener("message",e=>{',html.indexOf('function showEnd'));
  f.run(html.slice(start,html.indexOf('document.addEventListener("click",e=>{',start)));
  f.run('spAwaitVideo="b"');
  const message=data=>fire(f,'window:message',{origin:'https://www.youtube-nocookie.com',source:f.frame.contentWindow,data});
  message({event:'onStateChange',info:0});message({event:'infoDelivery',info:{playerState:2,videoData:{video_id:'a'}}});
  assert.equal(f.steps.length,0);assert.equal(f.run('spState'),null);
  message({event:'infoDelivery',info:{playerState:1,videoData:{video_id:'b'}}});
  assert.equal(f.run('spAwaitVideo'),'');assert.equal(f.run('spState'),1);
  message({event:'onStateChange',info:0});assert.deepEqual(f.steps,[1]);
});

test('TikTok ready retries cannot resume a Short after a manual pause or video change',()=>{
  for(const mode of ['pause','changed']){
    const f=setup();
    const start=html.indexOf('addEventListener("message",e=>{',html.indexOf("/* TikTok's player"));
    f.run(html.slice(start,html.indexOf('const ageGate=',start)));
    fire(f,'window:message',{origin:'https://www.tiktok.com',source:f.frame.contentWindow,data:{'x-tiktok-player':true,type:'onPlayerReady'}});
    assert.equal(f.timers.length,3);
    if(mode==='pause')f.run('spPaused=true');else f.frame.dataset.fid='yt-b';
    for(const fn of f.timers)fn();assert.equal(f.commands.length,0);
  }
});

test('TikTok actual pause resumes with one tap; autoplay rejection retries muted only once',()=>{
  const f=setup();f.ctx.findFilm=()=>({tt:'a'});
  const start=html.indexOf('addEventListener("message",e=>{',html.indexOf("/* TikTok's player"));
  f.run(html.slice(start,html.indexOf('const ageGate=',start)));
  const message=(type,value)=>fire(f,'window:message',{origin:'https://www.tiktok.com',source:f.frame.contentWindow,data:{'x-tiktok-player':true,type,value}});
  message('onStateChange',2);f.run('spToggle()');assert.equal(f.commands.at(-1).type,'play');
  message('onStateChange',1);f.commands.length=0;
  message('onPlayerError',{errorCode:3002});message('onPlayerError',{errorCode:3002});
  assert.deepEqual(f.commands.map(x=>x.type),['mute','play']);assert.equal(f.run('spSoundMuted()'),true);
  f.commands.length=0;message('onPlayerReady');f.run('spPaused=true');
  for(const fn of f.timers)fn();message('onPlayerError',{errorCode:3002});assert.equal(f.commands.length,0);
});

test('Safari UI updates keep the iframe and every ancestor in place while replacing controls and metadata',()=>{
  // A small DOM fixture rejects removal/reparenting of the player or any ancestor.
  // The production update function, rather than a second implementation of it, runs against this contract.
  class Node {
    constructor(name,children=[]){this.name=name;this.childNodes=[];this.style={};this.append(...children)}
    append(...nodes){for(const n of nodes){if(n.protected)assert.fail('Reparented protected '+n.name);n.remove();n.parentElement=this;this.childNodes.push(n)}}
    remove(){if(this.protected)assert.fail('Removed protected '+this.name);if(this.parentElement){const a=this.parentElement.childNodes;a.splice(a.indexOf(this),1);this.parentElement=null}}
    contains(n){return this===n||this.childNodes.some(x=>x.contains(n))}
    closest(s){return this.name===s?this:this.parentElement?.closest(s)}
    querySelector(s){for(const n of this.childNodes){if(n.name===s)return n;const hit=n.querySelector(s);if(hit)return hit}return null}
    set innerHTML(value){if(this.protected)assert.fail('Replaced protected subtree '+this.name)}
  }
  const frame=new Node('iframe'),oldControls=new Node('old controls'),sp=new Node('.sp',[frame,oldControls]);
  const col=new Node('.spcol',[sp,new Node('old next')]),view=new Node('.shorts-view',[col,new Node('old metadata')]);
  const main=new Node('#main',[view]);
  for(const n of [frame,sp,col,view,main])n.protected=true;
  const ctx=vm.createContext({frame,$:()=>main,document:{createElement:()=>new Node('tmp',[
    new Node('.shorts-view',[new Node('.spcol',[new Node('.sp',[new Node('new controls')]),new Node('new next')]),new Node('new metadata')])])}});
  vm.runInContext(html.slice(html.indexOf('function spRenderMain('),html.indexOf('function renderShorts()')),ctx);
  for(let i=0;i<3;i++)vm.runInContext('spRenderMain("replacement HTML",frame)',ctx);
  assert.equal(frame.parentElement,sp);assert.equal(sp.parentElement,col);assert.equal(col.parentElement,view);assert.equal(view.parentElement,main);
  assert.equal(oldControls.parentElement,null);assert.equal(main.querySelector('new metadata').parentElement,view);
  assert.equal(sp.childNodes.filter(n=>n.name==='new controls').length,1);
});

test('one press pauses/resumes despite stale YouTube state deliveries',()=>{
  const {run,commands}=setup();
  run('spInfo(1);spToggle();spInfo(1);spToggle()');
  assert.deepEqual(commands.map(x=>x.func),['pauseVideo','playVideo']);
  assert.equal(run('spIsPaused()'),false);
  run('spInfo(2)'); // late acknowledgement of the first press
  assert.equal(run('spIsPaused()'),false);
  run('spInfo(1);spToggle();spInfo(2)');
  assert.equal(run('spIsPaused()'),true);
});

test('a player that paused itself resumes with one press; buffering pauses with one press',()=>{
  const {run,commands}=setup();
  run('spInfo(2);spToggle();spInfo(1);spInfo(3);spToggle()');
  assert.deepEqual(commands.map(x=>x.func),['playVideo','pauseVideo']);
});

test('iOS starts muted through wake and delayed mute application; explicit sound tap enables audio',()=>{
  const {run,commands}=setup();
  run('spAutoMuted=spIOS;spWake();spApplyMute()');
  assert.deepEqual(commands.map(x=>x.func).filter(Boolean),['mute','playVideo','mute']);
  assert.match(run('spMuteBtn()'),/aria-label="Sound on"/);
  commands.length=0;
  run('spToggleMute();spApplyMute()');
  assert.deepEqual(commands.map(x=>x.func),['unMute','unMute']);
  run('spInfo(1);spToggle()');commands.length=0;
  run('spWake()');assert.equal(commands.length,0,'load retries must respect explicit pause');
  assert.equal(setup('Macintosh','MacIntel',5).run('spIOS'),true);
});

test('Android and desktop retain sound and pause commands',()=>{
  for(const ua of ['Android','Windows NT']){
    const {run,commands}=setup(ua);
    run('spAutoMuted=spIOS;spWake();spInfo(1);spToggle()');
    assert.deepEqual(commands.map(x=>x.func).filter(Boolean),['unMute','playVideo','pauseVideo']);
    assert.equal(run('spSoundMuted()'),false);
  }
});

test('swipe starting over pause control cannot create a pause click; next genuine tap works',()=>{
  const {run,ctx,listeners,commands}=setup();
  const target={closest:s=>s.includes('.spicon')?target:null};
  const event=y=>({target,touches:[{clientY:y,clientX:150}],changedTouches:[{clientY:y,clientX:150}],
    preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},stopPropagation(){}});
  run('spPeek=()=>({el:{style:{},remove(){}},h:600});spInfo(1)');
  const start=event(500);listeners.touchstart[0](start);
  assert.equal(run('spTouchY'),500);
  listeners.touchmove[0](event(200));
  const end=event(200);listeners.touchend[0](end);assert.equal(end.prevented,true);
  const ghost=event(200);listeners.click[0](ghost);
  assert.equal(ghost.stopped,true);assert.equal(commands.length,0);
  listeners.touchstart[0](event(200));listeners.touchend[0](event(200));
  listeners.click[0](event(200));
  assert.deepEqual(commands.map(x=>x.func),['pauseVideo']);
});

test('new YouTube frames use inline muted bootstrap only in Shorts and reset command state',()=>{
  const render=html.slice(html.indexOf('function renderShorts()'),html.indexOf('function spRailOut'));
  assert.ok(render.includes('spAutoMuted=spIOS&&!!f.yt'));
  assert.ok(render.includes('((spMuted||spAutoMuted)?"&mute=1":"")'));
  assert.ok(render.includes('spPaused=false;spPending=null;spState=null'));
  assert.match(html,/playsinline=1&enablejsapi=1/);
  assert.match(render,/<button type="button" class="spicon"/);
});
