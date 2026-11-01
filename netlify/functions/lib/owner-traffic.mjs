import { calendarDate, dayStart } from "./traffic-history.mjs";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const db=()=>{
 const key=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
 return {url:Netlify.env.get("SUPABASE_URL")+"/rest/v1/import_state",headers:{apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+key})}};
};
// Called only after moderate.mjs has verified the signed-in administrator.
export async function ownerTraffic(body,user){
 const {url,headers}=db(),now=Date.now();
 if(body.action==="owner-visit"){
   if(!uuid(body.visitId)||!uuid(body.deviceId)||!["phone","computer","tablet"].includes(body.device))return json({error:"Invalid owner visit"},400);
   const row={key:"owner-visit:"+user.id+":"+body.visitId,value:{deviceId:body.deviceId,device:body.device,at:new Date(now).toISOString(),day:calendarDate(now)}};
   const r=await fetch(url+"?on_conflict=key",{method:"POST",headers:{...headers,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify([row])});
   return r.ok?json({saved:true}):json({error:"Owner visit could not be saved"},503);
 }
 const days={today:1,"7d":7,"30d":30,"90d":90,"365d":365};
 if(body.range!=="all"&&!days[body.range])return json({error:"Invalid owner statistics range"},400);
 const since=body.range==="today"?dayStart(calendarDate(now)):body.range==="all"?0:now-days[body.range]*864e5;
 const prefix="owner-visit:"+user.id+":",counts={computer:0,phone:0,tablet:0},devices=new Set();
 let total=0,sampled=false;
 for(let offset=0;offset<20000;offset+=1000){
   const query=new URLSearchParams({key:"like."+prefix+"*",select:"value","value->>at":"gte."+new Date(since).toISOString(),order:"key.asc",offset:String(offset),limit:"1000"});
   const r=await fetch(url+"?"+query,{headers});
   if(!r.ok)return json({error:"Owner statistics could not be loaded"},503);
   const rows=await r.json();
   for(const {value:v} of rows)if(v&&Object.hasOwn(counts,v.device)){counts[v.device]++;devices.add(v.deviceId);total++}
   if(rows.length<1000)break;
   if(offset===19000)sampled=true;
 }
 return json({total,...counts,devices:devices.size,sampled,from:new Date(since).toISOString(),at:new Date(now).toISOString()});
}
