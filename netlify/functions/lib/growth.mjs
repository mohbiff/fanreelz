// Private Growth Center state uses import_state, whose RLS permits service-role access only.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function read(db,key){const r=await fetch(db.url+'import_state?key=eq.'+encodeURIComponent(key)+'&select=value',{headers:db.h});if(!r.ok)throw Error('Growth storage unavailable');return (await r.json())[0]?.value||{};}
async function write(db,key,value){const r=await fetch(db.url+'import_state',{method:'POST',headers:{...db.h,Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{key,value}])});if(!r.ok)throw Error('Could not save Growth Center settings');}
export async function growthAction(body,user,admin,db){
 try{
  const key='growth:'+user.id;
  if(body.action==='growthSave'){
   if(!Array.isArray(body.plans)||body.plans.length>100||!Array.isArray(body.watch)||body.watch.length>20)return json({error:'Up to 100 plans and 20 watched topics allowed'},400);
   const plans=[];
   for(const p of body.plans){
    if(typeof p.title!=='string'||!p.title.trim()||p.title.length>160||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date||!['planned','published'].includes(p.status))return json({error:'Invalid calendar entry'},400);
    plans.push({title:p.title.trim(),date:p.date,status:p.status});
   }
   if(body.watch.some(x=>typeof x!=='string'||!x.trim()||x.length>100))return json({error:'Invalid watched topic'},400);
   const value={plans,watch:[...new Set(body.watch.map(x=>x.trim().toLowerCase()))]};await write(db,key,value);return json({prefs:value});
  }
  if(body.action==='growthFeature'){
   if(!admin)return json({error:'Admins only'},403);
   const id=String(body.channelId||'').trim();if(id&&!/^[\w-]{1,100}$/.test(id))return json({error:'Invalid channel ID'},400);
   await write(db,'growth:featured',{channelId:id});return json({saved:true});
  }
  return json({error:'Unknown Growth Center action'},400);
 }catch{return json({error:'Growth Center storage unavailable. Try again.'},503);}
}
export async function growthData(user,db){
 const out={prefs:{plans:[],watch:[]},rankings:[],featured:null,personal:{available:false,reason:'Verified account-to-channel ownership and personal analytics are not connected. Views, followers, watch time and revenue are unavailable.'}};
 try{out.prefs=await read(db,'growth:'+user.id);out.prefs={plans:out.prefs.plans||[],watch:out.prefs.watch||[]};}catch{out.storageError='Calendar and alert settings could not be loaded. Saving is disabled until reload.';}
 try{
  const channels=new Map();let truncated=false;
  for(let offset=0;offset<20000;offset+=1000){
   const r=await fetch(db.url+`catalog?select=id,channel_id,channel&hidden=eq.false&age_restricted=eq.false&order=id.asc&offset=${offset}&limit=1000`,{headers:db.h});
   if(!r.ok)throw Error();const rows=await r.json();
   for(const v of rows){if(!v.channel_id)continue;const c=channels.get(v.channel_id)||{id:v.channel_id,name:v.channel||v.channel_id,films:0};c.films++;channels.set(c.id,c);}
   if(rows.length<1000)break;if(offset===19000)truncated=true;
  }
  out.rankings=[...channels.values()].sort((a,b)=>b.films-a.films||a.id.localeCompare(b.id)).slice(0,20);out.catalogSampled=truncated;
  const f=await read(db,'growth:featured');out.featured=channels.get(f.channelId)||null;
 }catch{out.catalogError='Catalogue rankings and featured creator could not be loaded.';}
 return out;
}
