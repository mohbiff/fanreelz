// Paid requests on the Requests page (step 1: pledges are promises, no money is charged yet).
// Days 0–3: fans pledge, verified creators offer to make it. Days 3–7: backers vote for a creator. Then the winner has 30 days.
let prqData=null,prqBusy=false;
const prqEur=c=>(c/100).toLocaleString('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:c%100?2:0});
const prqLeft=t=>{const d=t-Date.now();if(d<=0)return 'now';const h=Math.round(d/36e5);return h<48?h+' h':Math.round(h/24)+' days'};
async function prqCall(body){const r=await fetch('/api/paid-requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(sbToken||'')},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Something went wrong');return d}
async function prqLoad(){if(prqBusy)return;prqBusy=true;try{prqData=await prqCall({action:'list'})}catch(e){prqData={error:e.message,requests:[]}}prqBusy=false;if(state.view==='requests')prqPaint()}
const PRQ_PHASE={apply:['Open','Back it · creators can offer to make it'],vote:['Voting','Backers choose the creator'],making:['Being made','The chosen creator is making it'],delivered:['Delivered','The film is here'],notaken:['No creator','Nobody offered · pledges released'],expired:['Not delivered','Pledges released']};
function prqCard(q){const [ph,phText]=PRQ_PHASE[q.phase]||['',''];const signed=acct.online;
 const mineCh=(prqData.myChannels||[]);
 let act='';
 if(q.phase==='apply'||q.phase==='vote')act+=`<button class="btn" data-prq-pledge="${esc(q.id)}">${q.myPledge?'Change pledge ('+prqEur(q.myPledge)+')':'Back it · from 2 €'}</button>`;
 if(q.phase==='apply'&&mineCh.length&&!q.myApp)act+=`<button class="btn ghost" data-prq-apply="${esc(q.id)}">I'll make it</button>`;
 if(q.phase==='apply'&&q.myApp)act+=`<span class="pill">✓ You offered to make it</span>`;
 if(q.phase==='making'&&q.winner?.mine)act+=`<button class="btn" data-prq-deliver="${esc(q.id)}">Deliver the film</button>`;
 const apps=q.apps.length?`<div class="prq-apps"><b>${q.phase==='vote'?'Vote for who makes it':'Creators who offered'}</b>${q.apps.sort((a,b)=>b.votes-a.votes).map(a=>`<div class="prq-app"><span>${esc(a.name)}${a.sample?` · <a href="${esc(a.sample)}" target="_blank" rel="noopener">example</a>`:''}</span><span class="vmeta">${a.votes} vote${a.votes===1?'':'s'}</span>${q.phase==='vote'&&q.myPledge?`<button class="chip ${q.myVote===a.channel?'on':''}" data-prq-vote="${esc(q.id)}" data-ch="${esc(a.channel)}">${q.myVote===a.channel?'✓ Your vote':'Vote'}</button>`:''}</div>`).join('')}${q.phase==='vote'&&!q.myPledge?'<p class="vmeta">Back the request to vote.</p>':''}</div>`:q.phase==='apply'?`<p class="vmeta">${q.appCount?q.appCount+' creator'+(q.appCount===1?'':'s')+' offered so far · shown when voting starts':'No creator has offered yet'}</p>`:'';
 const when=q.phase==='apply'?'Voting starts in '+prqLeft(q.applyEnd):q.phase==='vote'?'Voting ends in '+prqLeft(q.voteEnd):q.phase==='making'?`${esc(q.winner?.name||'')} has ${prqLeft(q.deliverBy)} to deliver`:'';
 return `<div class="prq-card"><div class="prq-top"><span class="prq-phase prq-${esc(q.phase)}">${ph}</span><span class="vmeta">${esc(phText)}${when?' · '+when:''}</span></div>
  <h3>${esc(q.title)}</h3>${q.note?`<p class="rnote">${esc(q.note)}</p>`:''}
  <div class="prq-money"><b>${prqEur(q.total)}</b> pledged by ${q.backers} fan${q.backers===1?'':'s'} <span class="vmeta">· ${prqEur(q.creatorShare)} to the creator</span></div>
  ${q.delivered?`<p><a class="btn" href="${esc(q.delivered.url)}" target="_blank" rel="noopener">▶ Watch the film</a> <span class="vmeta">by ${esc(q.winner?.name||'')}</span></p>`:''}
  ${apps}<div class="row" style="gap:8px;flex-wrap:wrap">${act}</div><p class="vmeta" style="margin:6px 0 0">Requested by ${esc(q.by)}${isMod?` · <button class="linkbtn" data-prq-remove="${esc(q.id)}">Remove</button>`:''}</p></div>`}
function prqPaint(){const box=document.getElementById('prq');if(!box)return;const D=prqData;
 if(!D){box.innerHTML='<p class="vmeta">Loading paid requests…</p>';return}
 const open=(D.requests||[]).filter(q=>['apply','vote','making'].includes(q.phase)),done=(D.requests||[]).filter(q=>q.phase==='delivered');
 box.innerHTML=`<div class="wbar"><h2 class="sect-h" style="margin:0">💶 Paid requests <small class="plustag">BETA</small></h2><button class="btn" data-prq-new="">+ Start a paid request</button></div>
  <p class="lede" style="margin-top:6px">Pledge for the AI film you want. For 3 days creators can offer to make it, then backers vote for 4 days on who makes it. ${Math.round((D.rules?.creatorShare||.8)*100)} % of the pledges go to the creator who delivers.</p>
  <div class="prq-note">${icon('shield')} <span><b>No money is charged yet.</b> Pledges are promises while payments are being set up. When they open, a pledge is charged only after the film is delivered, and never if nobody makes it.</span></div>
  ${D.error?`<p class="vmeta">${esc(D.error)}</p>`:''}
  <div class="prq-list">${open.length?open.map(prqCard).join(''):'<div class="empty">No paid requests yet. Start the first one!</div>'}</div>
  ${done.length?`<h3 class="sect-h" style="font-size:16px">Delivered</h3><div class="prq-list">${done.slice(0,10).map(prqCard).join('')}</div>`:''}
`}
function prqAmountDialog(title,label,def,onOk){openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
  <form class="form" id="prqf"><label for="prqAmt">${esc(label)}<input id="prqAmt" type="number" min="2" max="500" step="1" value="${def}" required></label>
  <div class="row" style="gap:6px">${[2,5,10,20].map(v=>`<button type="button" class="chip" data-prq-amt="${v}">${v} €</button>`).join('')}</div>
  <p class="subnote">No money is charged now. When payments open, this is charged only if the film is delivered.</p>
  <div class="row"><button class="btn" type="submit">OK</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form></div>`,e=>{const c=e.target.closest('[data-prq-amt]');if(c)$('#prqAmt').value=c.dataset.prqAmt});
 $('#prqf').onsubmit=async e=>{e.preventDefault();const v=+$('#prqAmt').value;if(!(v>=2))return toast('Pledge at least 2 €');try{await onOk(v);closeModal()}catch(x){toast(x.message)}}}
function prqNew(){if(!needAccount('Sign in to start a paid request.'))return;
 openModal(`<div class="dlg" role="dialog" aria-modal="true" aria-label="Start a paid request"><h2>Start a paid request</h2>
  <form class="form" id="prqn"><label for="prqT">What AI film do you want?<input id="prqT" required minlength="5" maxlength="140" placeholder="e.g. A Viking saga in 1950s Super Panavision"></label>
  <label for="prqN">Details (optional)<input id="prqN" maxlength="400" placeholder="Story, tone, length"></label>
  <label for="prqA">Your pledge (from 2 €)<input id="prqA" type="number" min="2" max="500" step="1" value="5" required></label>
  <p class="subnote">Your own ideas, myths, legends and public-domain stories work best: creators decide what they can make. No money is charged now.</p>
  <div class="row"><button class="btn" type="submit">Post request</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form></div>`);
 $('#prqn').onsubmit=async e=>{e.preventDefault();const title=$('#prqT').value.trim(),note=$('#prqN').value.trim();
  if(typeof badText==='function'&&badText(title,note)){toast(BAD_MSG);return}
  try{await prqCall({action:'create',title,note,amount:+$('#prqA').value});closeModal();toast('Paid request posted');prqLoad()}catch(x){toast(x.message)}}}
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
document.addEventListener('click',async e=>{const t=e.target.closest?.('[data-prq-new],[data-prq-pledge],[data-prq-apply],[data-prq-vote],[data-prq-deliver],[data-prq-remove]');if(!t)return;e.preventDefault();
 if(t.dataset.prqNew!==undefined)return prqNew();
 if(!needAccount('Sign in to take part.'))return;
 const id=t.dataset.prqPledge||t.dataset.prqApply||t.dataset.prqVote||t.dataset.prqDeliver||t.dataset.prqRemove;
 if(t.dataset.prqPledge){const q=prqData.requests.find(x=>x.id===id);return prqAmountDialog('Back this request','Your pledge (from 2 €)',q?.myPledge?q.myPledge/100:5,async v=>{await prqCall({action:'pledge',id,amount:v});toast('Pledge saved');prqLoad()})}
 if(t.dataset.prqApply)return prqApply(id);
 if(t.dataset.prqDeliver)return prqDeliver(id);
 try{if(t.dataset.prqVote){await prqCall({action:'vote',id,channel:t.dataset.ch});toast('Vote saved')}
  else if(t.dataset.prqRemove){if(!confirm('Remove this paid request for everyone?'))return;await prqCall({action:'remove',id});toast('Removed')}
  prqLoad()}catch(x){toast(x.message)}});
