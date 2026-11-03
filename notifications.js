// Notifications: a bell in the top bar for signed-in members. The list is worked out on the server from the
// challenges the member started, backed, offered to make or was asked to make (see notesFor in paid-requests.mjs).
let ntData=null,ntOpen=false,ntBusy=false;
const NT_ICON={asked:'🎯',accepted:'✅',declined:'✖️',noanswer:'⌛',offer:'🙋',notaken:'⌛',vote:'🗳️',won:'🏆',lost:'🎬',winner:'🎬',due:'⏰',delivered:'🍿',expired:'⌛'};
const ntAgo=t=>{const m=Math.round((Date.now()-t)/6e4);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'};
async function ntLoad(){if(ntBusy||!(acct?.online&&sbToken))return;ntBusy=true;try{ntData=await prqCall({action:'notes'})}catch(e){}ntBusy=false;ntBadge();if(ntOpen)ntPaint()}
function ntBadge(){const b=document.querySelector('#noteBtn .nbadge');if(!b)return;const n=ntData?.unread||0;b.hidden=!n;b.textContent=n>9?'9+':n;document.getElementById('noteBtn')?.setAttribute('aria-label',n?`Notifications, ${n} new`:'Notifications')}
function ntBell(){return `<button class="iconbtn bellbtn" id="noteBtn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false"><svg class="i" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="nbadge" hidden></span></button>`}
function ntPaint(){let p=document.getElementById('ntPanel');
 if(!p){p=document.createElement('div');p.id='ntPanel';p.className='ntpanel';p.setAttribute('role','dialog');p.setAttribute('aria-label','Notifications');document.body.appendChild(p)}
 const seen=ntData?.seenBefore??ntData?.seen??0,list=ntData?.notes||[];
 p.innerHTML=`<div class="nt-h"><b>Notifications</b></div>${!ntData?'<p class="vmeta nt-e">Loading…</p>':list.length?list.map(n=>`<button class="nt-i ${n.t>seen?'new':''}" data-nt-req="${esc(n.req)}" data-nt-tab="${esc(n.tab||'open')}"><span class="nt-ic">${NT_ICON[n.kind]||'⚡'}</span><span><span class="nt-t">${esc(n.text)}</span><small>${ntAgo(n.t)}</small></span></button>`).join(''):'<p class="vmeta nt-e">No notifications yet. Back or create a challenge and you\'ll hear here when voting starts, who wins and when the film is out.</p>'}`;
 const r=document.getElementById('noteBtn')?.getBoundingClientRect();if(r){p.style.top=(r.bottom+8)+'px';p.style.right=Math.max(8,innerWidth-r.right-8)+'px'}}
function ntClose(){ntOpen=false;document.getElementById('ntPanel')?.remove();document.getElementById('noteBtn')?.setAttribute('aria-expanded','false')}
document.addEventListener('click',async e=>{
 const it=e.target.closest?.('[data-nt-req]');
 if(it){const id=it.dataset.ntReq;ntClose();if(typeof prqTab!=='undefined')prqTab=it.dataset.ntTab;if(typeof prqQ!=='undefined')prqQ='';go({view:'requests'});
  const find=(k=0)=>{const c=document.querySelector(`[data-prq-card="${CSS.escape(id)}"]`);if(c){c.scrollIntoView({block:'center',behavior:'smooth'});c.classList.add('prq-flash');setTimeout(()=>c.classList.remove('prq-flash'),2200)}else if(k<20)setTimeout(()=>find(k+1),250)};find();return}
 if(e.target.closest?.('#noteBtn')){if(ntOpen){ntClose();return}ntOpen=true;e.currentTarget;document.getElementById('noteBtn').setAttribute('aria-expanded','true');
  if(ntData){ntData.seenBefore=ntData.seen;}ntPaint();await ntLoad();if(ntData){ntData.seenBefore=ntData.seen;ntPaint()}
  if(ntData?.unread){prqCall({action:'seen'}).catch(()=>{});ntData.unread=0;ntData.seen=Date.now();ntBadge()}return}
 if(ntOpen&&!e.target.closest?.('#ntPanel'))ntClose()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ntOpen)ntClose()});
addEventListener('resize',()=>{if(ntOpen)ntPaint()});
setInterval(()=>{if(!document.hidden)ntLoad()},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ntLoad()});
