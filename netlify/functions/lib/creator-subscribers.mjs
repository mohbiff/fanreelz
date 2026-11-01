// Public channel statistics only. Never expose the private import_state records.
function db(){const key=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)return null;return {url:Netlify.env.get('SUPABASE_URL')+'/rest/v1/import_state',headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})}}}
async function save(d,rows,ignore=false){const r=await fetch(d.url,{method:'POST',headers:{...d.headers,'Content-Type':'application/json',Prefer:`resolution=${ignore?'ignore':'merge'}-duplicates,return=minimal`},body:JSON.stringify(rows)});if(!r.ok)throw Error('Subscriber storage unavailable')}
export async function subscriberCounts(ids){
 const d=db(),stats=new Map();if(!d)return stats;
 try{
  for(let offset=0;offset<10000;offset+=1000){
   const q=new URLSearchParams({select:'key,value',key:'like.channel-stats:*',order:'key.asc',offset:String(offset),limit:'1000'});
   const r=await fetch(d.url+'?'+q,{headers:d.headers});if(!r.ok)throw Error();const rows=await r.json();
   for(const row of rows){const v=row.value||{};stats.set(row.key.slice('channel-stats:'.length),{subscribers:typeof v.subscribers==='number'&&Number.isFinite(v.subscribers)&&v.subscribers>=0?v.subscribers:null,subscribersAt:v.updatedAt||null})}
   if(rows.length<1000)break;
  }
  const missing=ids.filter(id=>!stats.has(id)&&/^[\w-]{1,100}$/.test(id));
  if(missing.length)await save(d,missing.map(id=>({key:'channel-stats:'+id,value:{channelId:id,subscribers:null,updatedAt:'1970-01-01T00:00:00.000Z'}})),true);
 }catch{/* Rankings remain available when subscriber metadata is unavailable. */}
 return stats;
}
export async function refreshCreatorSubscribers(){
 const d=db(),api=Netlify.env.get('YOUTUBE_API_KEY');if(!d||!api)return;
 const q=new URLSearchParams({select:'key,value',key:'like.channel-stats:*',order:'value->>updatedAt.asc,key.asc',limit:'50'});
 const r=await fetch(d.url+'?'+q,{headers:d.headers});if(!r.ok)throw Error('Subscriber queue unavailable');
 const rows=(await r.json()).filter(x=>Date.now()-Date.parse(x.value?.updatedAt||'1970-01-01')>864e5);if(!rows.length)return;
 const ids=rows.map(x=>x.key.slice('channel-stats:'.length));
 const u=new URL('https://www.googleapis.com/youtube/v3/channels');u.search=new URLSearchParams({part:'statistics',id:ids.join(','),key:api});
 const response=await fetch(u);if(!response.ok)throw Error('YouTube subscriber refresh unavailable');const data=await response.json();if(!Array.isArray(data.items))throw Error('Invalid YouTube statistics');
 const byId=new Map(data.items.map(x=>[x.id,x.statistics]));const updatedAt=new Date().toISOString();
 await save(d,rows.map(row=>{const v=row.value||{},s=byId.get(row.key.slice('channel-stats:'.length)),n=Number(s?.subscriberCount);return {key:row.key,value:{...v,subscribers:s&&!s.hiddenSubscriberCount&&s.subscriberCount!=null&&Number.isFinite(n)?n:null,updatedAt}}}));
}
