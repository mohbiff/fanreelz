// Count each YouTube upload once, and identify creators by channel ID, not name.
export function rankCreators(videos){
  const channels=new Map(),seen=new Set();
  for(const video of videos){
    if(video.hidden||video.platform&&video.platform!=='YouTube'||!video.channel_id)continue;
    const id=video.video_id||video.id;if(!id||seen.has(id))continue;seen.add(id);
    const c=channels.get(video.channel_id)||{id:video.channel_id,name:video.channel||video.channel_id,films:0,views:0};
    c.films++;const views=Number(video.views);if(Number.isFinite(views)&&views>0)c.views+=Math.floor(views);
    channels.set(c.id,c);
  }
  return [...channels.values()].sort((a,b)=>b.views-a.views||b.films-a.films||a.id.localeCompare(b.id)).map((c,i)=>({...c,rank:i+1}));
}
