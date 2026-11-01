// Fanreelz subscriptions are separate from YouTube subscriptions.
function videoCreatorKey(f){return f.channelId||f.byId||f.by||byName(f)}
function creatorFollowing(key){return !!(myFollows[key]||(/^UC[\w-]{22}$/.test(key)&&myFollows[creatorFilms(key)[0]?.by]))}
function creatorSubscriptionButton(f){const key=videoCreatorKey(f);return `<button class="btn ${creatorFollowing(key)?'ghost':''}" data-follow="${esc(key)}">${creatorFollowing(key)?'Subscribed':'Subscribe'}</button>`}
function creatorClaimButton(films){const id=films.find(f=>f.channelId)?.channelId;return id?`<div style="margin-top:12px"><button class="chip" data-creator-claim="${esc(id)}">Own this channel? Claim your profile</button><button class="chip" data-creator-sync="${esc(id)}" hidden>Sync YouTube videos</button><p class="vmeta" data-creator-owner-note>Only the verified YouTube channel owner can claim or sync this profile.</p></div>`:''}
async function creatorProfileRequest(channelId,action,providerToken){const r=await fetch('/api/creator-profile',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(sbToken||'')},body:JSON.stringify({channelId,action,providerToken})});const data=await r.json();if(!r.ok){const e=Error(data.error||'Could not verify YouTube');e.reconnect=data.reconnect;throw e}return data}
async function loadCreatorOwner(films){const id=films.find(f=>f.channelId)?.channelId;if(!id||!acct.online)return;try{const d=await creatorProfileRequest(id,'status');const claim=document.querySelector('[data-creator-claim="'+id+'"]'),sync=document.querySelector('[data-creator-sync="'+id+'"]');if(claim){claim.hidden=d.claimed;sync.hidden=!d.mine;const note=document.querySelector('[data-creator-owner-note]');if(note)note.textContent=d.mine?'You own this verified creator profile.':d.claimed?'Verified YouTube creator.':'Only the verified YouTube channel owner can claim or sync this profile.'}}catch{}}
async function connectCreatorYoutube(channelId,action){
 if(!sb)return toast('Sign-in is still loading. Try again shortly.');
 sessionStorage.setItem('fr_creator_verify',JSON.stringify({channelId,action}));
 const back=APP?location.origin+'/app-auth?to='+encodeURIComponent(urlNow()):location.origin+urlNow();
 const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:back,scopes:'https://www.googleapis.com/auth/youtube.readonly',queryParams:{prompt:'consent select_account'}}});
 if(error){sessionStorage.removeItem('fr_creator_verify');toast('Could not connect YouTube. Please try again.')}
}
async function verifyCreator(channelId,action,returning=false){
 if(!acct.online)return connectCreatorYoutube(channelId,action);
 const {data}=await sb.auth.getSession();const token=data.session?.provider_token;
 if(!token){if(returning)return toast('YouTube permission was not received. Try connecting again.');return connectCreatorYoutube(channelId,action)}
 try{const result=await creatorProfileRequest(channelId,action,token);toast(action==='sync'?`Synced ${result.imported||0} videos.${result.more?' More videos continue importing automatically.':''}`:'YouTube ownership verified. This creator profile is yours.');if(action==='sync')await loadCatalog();render()}
 catch(e){if(e.reconnect&&!returning)return connectCreatorYoutube(channelId,action);toast(e.message)}
}
async function resumeCreatorVerification(){let pending;try{pending=JSON.parse(sessionStorage.getItem('fr_creator_verify'));sessionStorage.removeItem('fr_creator_verify')}catch{}if(pending&&acct.online)await verifyCreator(pending.channelId,pending.action,true)}
document.addEventListener('click',async e=>{const b=e.target.closest?.('[data-creator-claim],[data-creator-sync]');if(!b)return;e.preventDefault();if(b.disabled)return;b.disabled=true;try{await verifyCreator(b.dataset.creatorClaim||b.dataset.creatorSync,b.dataset.creatorSync?'sync':'claim')}finally{if(b.isConnected)b.disabled=false}});
