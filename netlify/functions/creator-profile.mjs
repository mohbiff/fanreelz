import {whoIs} from './moderate.mjs';
import {addChannel} from './import-youtube.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async function creatorProfile(req){
 if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  const user=await whoIs(req);if(!user?.id)return json({error:'Sign in first'},401);
  const body=await req.json(),id=String(body.channelId||'');if(!/^UC[\w-]{22}$/.test(id))return json({error:'Invalid YouTube channel'},400);
  const base=Netlify.env.get('SUPABASE_URL')+'/rest/v1/',key=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw Error();
  const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})};
  const read=async()=>{const r=await fetch(base+'import_state?key=eq.'+encodeURIComponent('creator-owner:'+id)+'&select=value',{headers});if(!r.ok)throw Error();return (await r.json())[0]?.value};
  const owner=await read();
  // a short code only this account gets for this channel (HMAC with a server-only secret, so nobody can guess another's)
  const mac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',mac,new TextEncoder().encode('creator-claim:'+user.id+':'+id)));
  const code='fanreelz-'+[...sig.slice(0,4)].map(b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b%32]).join('')+[...sig.slice(4,6)].map(b=>'23456789'[b%8]).join('');
  if(body.action==='status')return json({claimed:!!owner?.userId,mine:owner?.userId===user.id,code:owner?.userId?undefined:code});
  if(!['claim','sync'].includes(body.action))return json({error:'Unknown action'},400);
  if(owner?.userId&&owner.userId!==user.id)return json({error:'This profile is already claimed by another account'},409);
  // ownership: the channel's own public description must contain this account's code (no YouTube sign-in or extra Google permission)
  if(body.action==='claim'&&!(owner?.userId===user.id)){
   const r=await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&id='+id+'&key='+encodeURIComponent(Netlify.env.get('YOUTUBE_API_KEY')||''));
   if(!r.ok)return json({error:'YouTube could not be checked right now. Try again in a few minutes.'},503);
   const ch=(await r.json()).items?.[0];if(!ch)return json({error:'YouTube channel not found'},404);
   if(!String(ch.snippet?.description||'').includes(code))return json({error:`The code ${code} isn't in the channel description yet. Add it in YouTube Studio → Customisation → Basic info → Description, press Publish, then try again (YouTube can take a few minutes to update).`,code},403);
  }
  if(body.action==='sync'&&owner?.userId!==user.id)return json({error:'Claim the profile first'},403);
  if(!owner?.userId){const saved=await fetch(base+'import_state',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify([{key:'creator-owner:'+id,value:{userId:user.id,channelId:id,verifiedAt:new Date().toISOString()}}])});if(!saved.ok)throw Error();if((await read())?.userId!==user.id)return json({error:'This profile has already been claimed'},409)}
  if(body.action==='claim')return json({claimed:true,mine:true});
  const result=await addChannel('https://www.youtube.com/channel/'+id,user.id,{aiOnly:true});if(result.error)return json({error:result.error},503);
  return json({claimed:true,mine:true,synced:true,imported:result.imported,more:result.more});
 }catch{return json({error:'Creator verification is unavailable. Please try again.'},503)}
}
export const config={path:'/api/creator-profile'};
