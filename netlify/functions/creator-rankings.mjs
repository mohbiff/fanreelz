import {rankCreators} from './lib/creator-rankings.mjs';
import {whoIs,isAdmin} from './moderate.mjs';
import {subscriberCounts} from './lib/creator-subscribers.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export default async function creatorRankings(req){
  if(req.method!=='GET')return json({error:'GET required'},405);
  try{
    const user=await whoIs(req),admin=isAdmin(user);
    if(!user?.id)return json({error:'Sign in to see Creator rankings'},401);
    const base=Netlify.env.get('SUPABASE_URL'),key=Netlify.env.get('SUPABASE_ANON_KEY');
    if(!base||!key)throw Error('Missing public database configuration');
    const videos=[];
    for(let offset=0;offset<40000;offset+=1000){
      const query=new URLSearchParams({select:'id,video_id,platform,channel_id,channel,views',hidden:'eq.false',platform:'eq.YouTube',channel_id:'not.is.null',order:'id.asc',offset:String(offset),limit:'1000'});
      const response=await fetch(base+'/rest/v1/catalog?'+query,{headers:{apikey:key,...(key.startsWith('sb_publishable_')?{}:{Authorization:'Bearer '+key})}});
      if(!response.ok)throw Error('Catalogue unavailable');
      const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid catalogue');videos.push(...rows);
      if(rows.length<1000){const ranked=rankCreators(videos);let rankings=ranked;if(admin){const counts=await subscriberCounts(ranked.map(c=>c.id)),plays=await fanreelzCounts(base,videos);rankings=ranked.map(c=>({...c,subscribers:null,subscribersAt:null,...counts.get(c.id),fanreelzViews:plays?.get(c.id)??(plays?0:null)}));}return json({rankings,videoCount:rankings.reduce((n,c)=>n+c.films,0),asOf:new Date().toISOString(),scope:'Visible YouTube videos imported into Fanreelz'});}
    }
    // Never present a partial catalogue as a complete leaderboard.
    throw Error('Catalogue exceeds request capacity');
  }catch{return json({error:'Creator rankings could not be loaded. Please try again.'},503)}
}
export const config={path:'/api/creator-rankings'};

async function fanreelzCounts(base,videos){
 try{
  const key=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)return null;
  const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})},views=new Map();let complete=false;
  for(let offset=0;offset<40000;offset+=1000){const q=new URLSearchParams({select:'id,n',order:'id.asc',offset:String(offset),limit:'1000'});const r=await fetch(base+'/rest/v1/film_views?'+q,{headers});if(!r.ok)throw Error();const rows=await r.json();if(!Array.isArray(rows))throw Error();for(const row of rows)views.set(row.id,Number(row.n)||0);if(rows.length<1000){complete=true;break}}
  if(!complete)return null;const totals=new Map(),seen=new Set();
  for(const v of videos){const id=v.video_id||v.id;if(seen.has(id))continue;seen.add(id);totals.set(v.channel_id,(totals.get(v.channel_id)||0)+(views.get(v.id)||0))}return totals;
 }catch{return null}
}
