// Paid requests on the Requests page (step 1: pledges are promises, no money is charged yet).
// Open requests: days 0–3 fans pledge and verified creators offer; days 3–7 backers vote (one vote each) for who makes it.
// Creator requests: for one chosen verified creator, who accepts within 7 days. The maker has 30 days to deliver.
let prqData=null,prqBusy=false,prqCreators=null;const prqSel={};
const PRQ_AMOUNTS=[2,5,10,25,50];
const prqEur=c=>'€'+(c/100).toLocaleString('en-IE',{minimumFractionDigits:c%100?2:0,maximumFractionDigits:2});
const prqLeft=t=>{const d=t-Date.now();if(d<=0)return '';const h=Math.floor(d/36e5),days=Math.floor(h/24);return days?`${days} day${days===1?'':'s'} ${h%24} h left`:`${h} h left`};
async function prqCall(body){const r=await fetch('/api/paid-requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(sbToken||'')},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Something went wrong');return d}
async function prqLoad(){if(prqBusy)return;prqBusy=true;try{prqData=await prqCall({action:'list'})}catch(e){prqData={error:e.message,requests:[]}}prqBusy=false;if(state.view==='requests')prqPaint()}
const PRQ_PHASE={apply:'Open for creators',vote:'Creator voting',waiting:'Waiting for the creator',making:'Being made',delivered:'Delivered',notaken:'No creator',declined:'Declined',expired:'Not delivered'};
// a picture for the request: the most watched film of its world, or of the chosen creator
function prqCover(q){const pool=allFilms().filter(f=>f.yt&&(q.for?f.channelId===q.for.channel:q.cat&&f.cat===q.cat));const f=pool.sort((a,b)=>(b.ytViews||0)-(a.ytViews||0))[0];
 return f?`<div class="prq-cover"><img src="https://i.ytimg.com/vi/${esc(f.yt)}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`:`<div class="prq-cover prq-cover-empty">🎬</div>`}
function prqCard(q){const sel=prqSel[q.id]||(prqSel[q.id]={amt:q.myPledge?q.myPledge/100:5,ch:q.myVote||null});
 const open=['apply','vote','waiting'].includes(q.phase)||(q.for&&q.phase==='making'),voting=q.phase==='vote';
 const when=q.phase==='apply'?prqLeft(q.applyEnd)+' to offer':voting?prqLeft(q.voteEnd)+' to vote':q.phase==='waiting'?prqLeft(q.answerBy)+' to answer':q.phase==='making'&&q.deliverBy?prqLeft(q.deliverBy)+' to deliver':'';
 const totalVotes=q.apps.reduce((a,x)=>a+x.votes,0)||0;
 const vote=voting&&q.apps.length?`<div class="prq-sec"><b>Who should make the film?</b>${q.apps.sort((a,b)=>b.votes-a.votes).map(a=>{const pc=totalVotes?Math.round(a.votes*100/totalVotes):0,on=sel.ch===a.channel;
   return `<button type="button" class="prq-opt ${on?'on':''}" data-prq-pick="${esc(q.id)}" data-ch="${esc(a.channel)}"><span class="prq-radio"></span><span class="prq-optname">${esc(a.name)}${a.sample?` <a href="${esc(a.sample)}" target="_blank" rel="noopener" class="vmeta">example ↗</a>`:''}${q.myVote===a.channel?' <small class="vmeta">· your vote</small>':''}</span><span class="vmeta">${pc}%</span><i class="prq-bar"><i style="width:${pc}%"></i></i></button>`}).join('')}</div>`:'';
 const offers=q.phase==='apply'&&!q.for?`<p class="vmeta">${q.appCount?q.appCount+' creator'+(q.appCount===1?'':'s')+' offered so far · shown when voting starts':'No creator has offered yet'}${q.myApp?' · ✓ you offered':''}</p>${q.myApp?'':`<button class="btn ghost" data-prq-apply="${esc(q.id)}">🎬 Accept the challenge</button>`}`:'';
 const forLine=q.for?`<p class="prq-for">For <b>${esc(q.for.name)}</b>${q.phase==='waiting'?' · waiting for them to accept':q.phase==='making'?' · accepted':''}</p>`:'';
 const answer=q.phase==='waiting'&&(q.for?.mine||isMod)?`<div class="row" style="gap:8px"><button class="btn" data-prq-accept="${esc(q.id)}">Accept · deliver within 30 days</button><button class="btn ghost" data-prq-decline="${esc(q.id)}">Decline</button></div>`:'';
 const deliver=q.phase==='making'&&(q.winner?.mine||isMod)?`<button class="btn" data-prq-deliver="${esc(q.id)}">Deliver the film</button>`:'';
 const pick=voting?q.apps.find(a=>a.channel===sel.ch):null;
 const back=open&&!q.for?.mine?`<div class="prq-sec"><b>Your pledge</b><div class="prq-amts">${PRQ_AMOUNTS.map(v=>`<button type="button" class="prq-amt ${sel.amt===v?'on':''}" data-prq-amt="${esc(q.id)}" data-v="${v}">€${v}</button>`).join('')}</div>
   <div class="prq-sum">${voting?`<span>Your creator</span><b>${pick?esc(pick.name):'Pick one above'}</b>`:''}<span>Pledge</span><b>€${sel.amt}</b></div>
   <p class="vmeta" style="margin:0">Your pledge goes to the creator who makes the film.</p>
   <button class="btn prq-go" data-prq-back="${esc(q.id)}" ${voting&&!pick?'disabled':''}>${q.myPledge?'Update pledge':'Pledge'} €${sel.amt}${voting?' and vote':''}</button></div>`:'';
 return `<article class="prq-card"><div class="prq-top"><span class="prq-phase prq-${esc(q.phase)}">${PRQ_PHASE[q.phase]||''}</span><span class="vmeta">${when?'⏱ '+when:''}</span></div>
  ${prqCover(q)}<h3>${esc(q.title)}</h3>${q.note?`<p class="rnote">${esc(q.note)}</p>`:''}${forLine}
  <div class="prq-stats"><div><span>Raised</span><b class="prq-raised">${prqEur(q.total)}</b></div><div><span>Backers</span><b>${q.backers}</b></div><div><span>${q.for?'Creator':'Creators'}</span><b>${q.for?'1':q.appCount}</b></div></div>
  ${q.delivered?`<a class="btn" href="${esc(q.delivered.url)}" target="_blank" rel="noopener">▶ Watch the film by ${esc(q.winner?.name||'')}</a>`:''}
  ${vote}${offers}${answer}${deliver}${back}
  ${isMod&&['apply','vote'].includes(q.phase)?`<button class="linkbtn" data-prq-skip="${esc(q.id)}">Admin test: skip to ${q.phase==='apply'?'voting':'making'}</button>`:''}<p class="vmeta" style="margin:0">Requested by ${esc(q.by)}${q.myPledge?` · you pledged ${prqEur(q.myPledge)}`:''}${isMod?` · <button class="linkbtn" data-prq-remove="${esc(q.id)}">Remove</button>`:''}</p></article>`}
function prqPaint(){const box=document.getElementById('prq');if(!box)return;const D=prqData;
 if(!D){box.innerHTML='<p class="vmeta">Loading paid requests…</p>';return}
 const live=(D.requests||[]).filter(q=>['apply','vote','waiting','making'].includes(q.phase)),done=(D.requests||[]).filter(q=>q.phase==='delivered');
 box.innerHTML=`<div class="wbar"><h2 class="sect-h" style="margin:0">💶 Paid requests <small class="plustag">BETA</small></h2><button class="btn" data-prq-new="">+ Start a paid request</button></div>
  <p class="lede" style="margin-top:6px">Pledge for the AI film you want, and the fans choose who makes it.</p>
  ${prqHow()}
  <div class="prq-note">${icon('shield')} <span><b>No money is charged yet.</b> Pledges are promises while payments are being set up. When they open, a pledge is charged only after the film is delivered, and never if nobody makes it.</span></div>
  ${D.error?`<p class="vmeta">${esc(D.error)}</p>`:''}
  <div class="prq-list">${live.length?live.map(prqCard).join(''):'<div class="empty">No paid requests yet. Start the first one!</div>'}</div>
  ${done.length?`<h3 class="sect-h" style="font-size:16px">Delivered</h3><div class="prq-list">${done.slice(0,10).map(prqCard).join('')}</div>`:''}`}
// "How it works": open the first time, then remembers if the viewer folded it away
function prqHow(){let shut=false;try{shut=localStorage.getItem('fr_prq_how')==='0'}catch(e){}
 const step=(ic,t)=>`<div class="prq-step"><span>${ic}</span><b>${t}</b></div>`;
 const row=(n,sub,t,d)=>`<div class="prq-row"><div class="prq-day"><b>${n}</b><small>${sub}</small></div><div><b>${t}</b><p>${d}</p></div></div>`;
 return `<details class="prq-how" ${shut?'':'open'}><summary>How it works</summary>
  <div class="prq-steps">${step('💡','Post a request')}<i>→</i>${step('💶','Back it')}<i>→</i>${step('🗳️','Vote')}<i>→</i>${step('🎬','Film made')}</div>
  ${row('1–3','Days','Back it and creators sign up','Someone posts an idea, like "Vikings on Mars". Anyone can back it from €2, with no upper limit. Verified creators can sign up to make it, but their names stay hidden.')}
  ${row('4–7','Days','Creators revealed, voting opens','The creators who signed up are shown. Everyone who backed the request votes, one vote each, on who should make the film.')}
  ${row('7+','After','The winner makes it','The creator with the most votes gets the job and has 30 days to deliver. Pledges are charged only when the film is delivered, and the money goes to the creator who made it.')}
  <p class="prq-alt">Or <b>ask one creator directly</b>: they accept within 7 days, then have 30 days to deliver.</p></details>`}
document.addEventListener('toggle',e=>{if(e.target.classList?.contains('prq-how')){try{localStorage.setItem('fr_prq_how',e.target.open?'1':'0')}catch(x){}}},true);
// verified creators to choose from (names from their films on Fanreelz)
async function prqCreatorList(){if(!prqCreators){try{prqCreators=(await prqCall({action:'creators'})).creators||[]}catch(e){prqCreators=[]}}
 return prqCreators.map(id=>({id,name:allFilms().find(f=>f.channelId===id)?.by||''})).filter(c=>c.name).sort((a,b)=>a.name.localeCompare(b.name))}
async function prqNew(){if(!needAccount('Sign in to start a paid request.'))return;const cr=await prqCreatorList();
 openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="Start a paid request"><h2>Start a paid request</h2>
  <form class="form" id="prqn"><label for="prqT">What AI film do you want?<input id="prqT" required minlength="5" maxlength="140" placeholder="e.g. Vikings on Mars"></label>
  <label for="prqN">Details (optional)<input id="prqN" maxlength="400" placeholder="Story, tone, length"></label>
  <label for="prqW">World (optional)<select id="prqW"><option value="">Any / my own idea</option>${CATS.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
  <fieldset class="ratepick"><legend>Who can make it?</legend><label class="chk"><input type="radio" name="prqMode" value="open" checked> <span>Any verified creator: they offer, backers vote</span></label>
   <label class="chk"><input type="radio" name="prqMode" value="one" ${cr.length?'':'disabled'}> <span>One creator I choose${cr.length?'':' (no verified creators yet)'}</span></label>
   <select id="prqWho" hidden>${cr.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></fieldset>
  <label for="prqA">Your pledge (from 2 €)<input id="prqA" type="number" min="2" max="500" step="1" value="5" required></label>
  <p class="subnote">Your own ideas, myths, legends and public-domain stories work best: creators decide what they can make. No money is charged now.</p>
  <div class="row"><button class="btn" type="submit">Post request</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form></div>`);
 document.querySelectorAll('[name="prqMode"]').forEach(r=>r.onchange=()=>{$('#prqWho').hidden=document.querySelector('[name="prqMode"]:checked').value!=='one'});
 $('#prqn').onsubmit=async e=>{e.preventDefault();const title=$('#prqT').value.trim(),note=$('#prqN').value.trim(),one=document.querySelector('[name="prqMode"]:checked').value==='one';
  if(typeof badText==='function'&&badText(title,note)){toast(BAD_MSG);return}
  const who=one?cr.find(c=>c.id===$('#prqWho').value):null;
  try{await prqCall({action:'create',title,note,cat:$('#prqW').value,amount:+$('#prqA').value,...(who?{creator:who.id,creatorName:who.name}:{})});closeModal();toast(who?'Request sent to '+who.name:'Paid request posted');prqLoad()}catch(x){toast(x.message)}}}
function prqApply(id){const chs=prqData.myChannels||[];const nameOf=ch=>ch.name||allFilms().find(f=>f.channelId===ch.id)?.by||'Your channel';
 openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="Offer to make it"><h2>Offer to make this film</h2>
  <form class="form" id="prqp"><label for="prqC">Your verified channel<select id="prqC">${chs.map(c=>`<option value="${esc(c.id)}">${esc(nameOf(c))}</option>`).join('')}</select></label>
  <label for="prqS">Link to an earlier film of yours (optional)<input id="prqS" type="url" placeholder="https://youtube.com/watch?v=…"></label>
  <p class="subnote">Backers see your offer when voting starts. If you win, you have 30 days to deliver.</p>
  <div class="row"><button class="btn" type="submit">Offer</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form></div>`);
 $('#prqp').onsubmit=async e=>{e.preventDefault();const ch=chs.find(c=>c.id===$('#prqC').value);try{await prqCall({action:'apply',id,channel:ch.id,name:nameOf(ch),sample:$('#prqS').value.trim()});closeModal();toast('Offer sent');prqLoad()}catch(x){toast(x.message)}}}
function prqDeliver(id){openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="Deliver the film"><h2>Deliver the film</h2>
  <form class="form" id="prqd"><label for="prqU">YouTube link to the finished film<input id="prqU" type="url" required placeholder="https://youtube.com/watch?v=…"></label>
  <div class="row"><button class="btn" type="submit">Deliver</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form></div>`);
 $('#prqd').onsubmit=async e=>{e.preventDefault();try{await prqCall({action:'deliver',id,url:$('#prqU').value.trim()});closeModal();toast('Delivered. Thank you!');prqLoad()}catch(x){toast(x.message)}}}
document.addEventListener('click',async e=>{const t=e.target.closest?.('[data-prq-new],[data-prq-pick],[data-prq-amt],[data-prq-back],[data-prq-apply],[data-prq-skip],[data-prq-accept],[data-prq-decline],[data-prq-deliver],[data-prq-remove]');if(!t||e.target.closest('a[target]'))return;e.preventDefault();
 if(t.dataset.prqNew!==undefined)return prqNew();
 if(t.dataset.prqPick){prqSel[t.dataset.prqPick].ch=t.dataset.ch;return prqPaint()}
 if(t.dataset.prqAmt){prqSel[t.dataset.prqAmt].amt=+t.dataset.v;return prqPaint()}
 if(!needAccount('Sign in to take part.'))return;
 const id=t.dataset.prqBack||t.dataset.prqApply||t.dataset.prqSkip||t.dataset.prqAccept||t.dataset.prqDecline||t.dataset.prqDeliver||t.dataset.prqRemove;
 if(t.dataset.prqApply){const q=prqData.requests.find(x=>x.id===id);
  if(q?.mineRequest&&!isMod)return toast("You started this request, so you can't take it yourself.");
  if(!(prqData.myChannels||[]).length&&!isMod)return toast('Only verified creators can take a request. Claim your channel on your creator page first ("Own this channel?").');
  if(!(prqData.myChannels||[]).length&&isMod){try{await prqCall({action:'apply',id,test:true,name:'Fanreelz test creator'});toast('Admin test: you took the challenge as "Fanreelz test creator"');prqLoad()}catch(x){toast(x.message)}return}
  return prqApply(id)}
 if(t.dataset.prqSkip){try{await prqCall({action:'skip',id});toast('Admin test: moved to the next phase');prqLoad()}catch(x){toast(x.message)}return}
 if(t.dataset.prqDeliver)return prqDeliver(id);
 try{if(t.dataset.prqBack){const s=prqSel[id];await prqCall({action:'pledge',id,amount:s.amt,...(s.ch?{channel:s.ch}:{})});toast('Pledge saved'+(s.ch?' and vote counted':''))}
  else if(t.dataset.prqAccept){await prqCall({action:'accept',id});toast('Accepted. You have 30 days to deliver.')}
  else if(t.dataset.prqDecline){if(!confirm('Decline this request? The pledges are released.'))return;await prqCall({action:'decline',id});toast('Declined')}
  else if(t.dataset.prqRemove){if(!confirm('Remove this paid request for everyone?'))return;await prqCall({action:'remove',id});toast('Removed')}
  prqLoad()}catch(x){toast(x.message)}});
