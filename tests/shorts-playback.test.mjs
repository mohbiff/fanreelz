import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('let spState=null'),html.indexOf('let endTimer=null'));
function setup(userAgent='iPhone',platform='',maxTouchPoints=1){
  const listeners={},commands=[],timers=[];
  const sp={style:{},classList:{contains:()=>false,add(){},remove(){}},getBoundingClientRect:()=>({height:600})};
  const frame={contentWindow:{postMessage(data){commands.push(typeof data==='string'?JSON.parse(data):data)}}};
  const ctx=vm.createContext({navigator:{userAgent,platform,maxTouchPoints},
    localStorage:{getItem:()=>null,setItem(){}},state:{view:'shorts',film:'a',shortI:1},
    findFilm:()=>({yt:'a'}),md:{el:null},phone:()=>true,
    window:{},addEventListener(){},setInterval(){},clearTimeout(){},
    setTimeout(fn){timers.push(fn)},
    document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn)},
      querySelector:s=>s==='.sp iframe'?frame:s==='.sp'?sp:null,
      querySelectorAll:()=>[]},
    toast(){},
  });
  vm.runInContext(source,ctx);
  vm.runInContext('spShowCtl=()=>{}',ctx);
  const run=code=>vm.runInContext(code,ctx);
  return {ctx,run,commands,timers,listeners,frame,sp};
}

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
  const event=y=>({target,touches:[{clientY:y}],changedTouches:[{clientY:y}],
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
