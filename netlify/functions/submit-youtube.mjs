// Shared by Cloudflare and Netlify. All secrets come from the existing env adapter.
import { whoIs } from './moderate.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export function youtubeId(link) {
  try {
    const u=new URL(link),host=u.hostname.toLowerCase().replace(/^www\./,'');
    if(u.protocol!=='https:')return null;
    let id;
    if(host==='youtu.be')id=u.pathname.slice(1).split('/')[0];
    else if(['youtube.com','m.youtube.com','music.youtube.com'].includes(host)) {
      id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    }
    return /^[\w-]{11}$/.test(id||'')?id:null;
  } catch {return null}
}

export default async function submitYoutube(req) {
  if(req.method!=='POST')return json({error:'POST required'},405);
  try {
    const user=await whoIs(req);
    if(!user)return json({error:'Sign in to submit a video.'},401);
    const raw=await req.text();
    if(raw.length>6000)return json({error:'Request too large'},413);
    let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid request'},400)}
    const f=body?.film,id=youtubeId(f?.url);
    if(!id||!f||typeof f.title!=='string'||!f.title.trim()||f.title.length>120||
      typeof f.cat!=='string'||!/^[-\w]{1,80}$/.test(f.cat)||
      !['film','short','episode'].includes(f.format))return json({error:'Invalid YouTube submission'},400);
    const env=k=>Netlify.env.get(k),service=env('SUPABASE_SERVICE_ROLE_KEY');
    if(!env('YOUTUBE_API_KEY')||!service)return json({error:'Submission service unavailable'},503);
    const yt=new URL('https://www.googleapis.com/youtube/v3/videos');
    yt.search=new URLSearchParams({part:'snippet',id,key:env('YOUTUBE_API_KEY')});
    const metadata=await fetch(yt);
    if(!metadata.ok)return json({error:'YouTube metadata unavailable. Please try again.'},502);
    const snippet=(await metadata.json()).items?.[0]?.snippet;
    if(!snippet?.channelTitle||!snippet?.channelId)return json({error:'YouTube video or channel not found'},422);
    // Whitelist public fields: never accept creator/submitter identity from the browser.
    const film={id:'u'+crypto.randomUUID(),title:f.title.trim(),cat:f.cat,
      char:String(f.char||'').slice(0,120),topic:String(f.topic||'').slice(0,60),
      tool:String(f.tool||'Unknown').slice(0,80),format:f.format,
      seriesTitle:String(f.seriesTitle||'').slice(0,80),season:Math.max(1,Math.min(50,+f.season||1)),ep:Math.max(1,Math.min(500,+f.ep||1)),
      src:'YouTube',url:'https://www.youtube.com/watch?v='+id,t:Date.now(),hue:Math.floor(Math.random()*360),
      channelTitle:snippet.channelTitle,channelId:snippet.channelId};
    const base=env('SUPABASE_URL')+'/rest/v1/',headers={apikey:env('SUPABASE_ANON_KEY'),Authorization:req.headers.get('Authorization'),'Content-Type':'application/json'};
    const previous=await fetch(base+'docs?col=eq.submissions&id=eq.'+encodeURIComponent(user.id)+'&select=data',{headers});
    if(!previous.ok)throw Error('Storage read failed');
    const films=(await previous.json())[0]?.data?.films||[];
    const auditHeaders={apikey:service,'Content-Type':'application/json'};
    if(!service.startsWith('sb_secret_'))auditHeaders.Authorization='Bearer '+service;
    // Audit is private (import_state has RLS and no public policies). Record attempts
    // before publishing so an audit write failure cannot publish an untracked film.
    const audit=await fetch(base+'import_state',{method:'POST',headers:auditHeaders,body:JSON.stringify({key:'submission:'+film.id,value:{submittedBy:user.id,filmId:film.id,videoId:id,channelTitle:film.channelTitle,channelId:film.channelId,submittedAt:film.t}})});
    if(!audit.ok)throw Error('Audit write failed');
    const saved=await fetch(base+'rpc/save_doc',{method:'POST',headers,body:JSON.stringify({p_col:'submissions',p_id:user.id,p_data:{films:[film,...films].slice(0,200)}})});
    if(!saved.ok)throw Error('Submission write failed');
    return json({film});
  } catch {return json({error:'Could not save the video. Please try again.'},503)}
}
export const config={path:'/api/submit-youtube'};
