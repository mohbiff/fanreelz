const count=value=>value!==undefined&&value!==null&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
export function channelStats(channel,updatedAt){
  const s=channel.statistics||{};
  return {channelId:channel.id,name:channel.snippet?.title||channel.id,subscribers:s.hiddenSubscriberCount?null:count(s.subscriberCount),
    channelViews:count(s.viewCount),publicVideos:count(s.videoCount),updatedAt};
}
export function attachChannelStatus(rankings,stats,imports){
  const byId=new Map(stats.map(s=>[s.channelId,s])),jobs=new Map(imports.map(j=>[j.channelId,j]));
  return rankings.map(c=>{
    const s=byId.get(c.id),j=jobs.get(c.id);
    return {...c,subscribers:s?.subscribers??null,channelViews:s?.channelViews??null,publicVideos:s?.publicVideos??null,
      statsUpdatedAt:s?.updatedAt||null,importVerifiedAt:j?.verifiedAt||null,
      importComplete:!!(j?.done&&j?.verifiedAt),importDisabled:!!j?.disabled};
  });
}
