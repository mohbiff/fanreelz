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
  if(body.action==='status')return json({claimed:!!owner?.userId,mine:owner?.userId===user.id});
  if(!['claim','sync'].includes(body.action))return json({error:'Unknown action'},400);
  if(owner?.userId&&owner.userId!==user.id)return json({error:'This profile is already claimed by another account'},409);
  const token=body.providerToken;if(typeof token!=='string'||!token||token.length>8192)return json({error:'Connect your Google account and allow read-only YouTube access',reconnect:true},403);
  const googleHeaders={Authorization:'Bearer '+token};
  const identityResponse=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:googleHeaders});
  if(!identityResponse.ok)return json({error:'Google verification expired. Reconnect YouTube.',reconnect:true},403);
  const identity=await identityResponse.json();
  if(!identity.sub||!user.identities?.some(i=>i.provider==='google'&&String(i.identity_data?.sub||i.id)===String(identity.sub)))return json({error:'Use the Google account linked to your signed-in Fanreelz account'},403);
  const response=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&maxResults=50',{headers:googleHeaders});
  if(!response.ok)return json({error:'YouTube permission is missing or expired. Reconnect and choose the account that owns this channel.',reconnect:true},403);
  const channels=await response.json();if(!channels.items?.some(c=>c.id===id))return json({error:'This YouTube account does not own this creator profile. Choose the correct YouTube channel account.'},403);
  if(!owner?.userId){const saved=await fetch(base+'import_state',{method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify([{key:'creator-owner:'+id,value:{userId:user.id,channelId:id,verifiedAt:new Date().toISOString()}}])});if(!saved.ok)throw Error();if((await read())?.userId!==user.id)return json({error:'This profile has already been claimed'},409)}
  if(body.action==='claim')return json({claimed:true,mine:true});
  const result=await addChannel('https://www.youtube.com/channel/'+id,user.id);if(result.error)return json({error:result.error},503);
  return json({claimed:true,mine:true,synced:true,imported:result.imported,more:result.more});
 }catch{return json({error:'Creator verification is unavailable. Please try again.'},503)}
}
export const config={path:'/api/creator-profile'};
