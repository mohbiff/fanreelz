// A creator enters the leaderboard when an administrator explicitly imports
// their channel. Automatic discovery of a single video is not channel approval.
export async function selectedCreatorIds(db){
  const ids=new Set();
  for(let offset=0;offset<10000;offset+=1000){
    const q=new URLSearchParams({key:'like.channel-import:*',select:'value','value->>submittedBy':'not.is.null',order:'key.asc',offset:String(offset),limit:'1000'});
    const r=await fetch(db.url+'import_state?'+q,{headers:db.h});if(!r.ok)throw Error('Selected creators unavailable');
    const rows=await r.json();
    for(const {value} of rows)if(value?.submittedBy&&/^[\w-]{1,100}$/.test(value.channelId||''))ids.add(value.channelId);
    if(rows.length<1000)return ids;
  }
  throw Error('Selected creator list is incomplete');
}
