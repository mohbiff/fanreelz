export const TRAFFIC_ZONE='Europe/Stockholm';
export const calendarDate=time=>new Intl.DateTimeFormat('sv-SE',{timeZone:TRAFFIC_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
export function shiftDate(date,days){return new Date(Date.parse(date+'T12:00:00Z')+days*864e5).toISOString().slice(0,10)}
export function dayStart(date){
  const utc=Date.parse(date+'T00:00:00Z');
  const offset=new Intl.DateTimeFormat('en',{timeZone:TRAFFIC_ZONE,timeZoneName:'shortOffset'}).formatToParts(new Date(utc)).find(p=>p.type==='timeZoneName').value;
  const hours=Number(offset.replace('GMT',''))||0;
  return utc-hours*3600e3;
}
const count=value=>{
  const n=value&&typeof value==='object'?value.value:value;
  if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw Error('Daily statistics are incomplete. Please retry.');
  return n;
};
// Use each day's actual stats. Summing hourly unique counts overcounts visitors;
// page views are a different metric from visits and must not be substituted.
export async function trafficHistory(get,before,now=Date.now()){
  if(before!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(before)||!Number.isFinite(Date.parse(before+'T12:00:00Z'))||shiftDate(before,0)!==before))throw Error('Invalid history date');
  const dr=await get('/daterange');
  if(dr?.startDate===null)return {rows:[],from:null,nextBefore:null,timeZone:TRAFFIC_ZONE};
  const firstTime=typeof dr?.startDate==='number'?dr.startDate:Date.parse(dr?.startDate||dr?.mindate||'');
  if(!Number.isFinite(firstTime))throw Error('The start of the recorded history could not be loaded. Please retry.');
  const from=calendarDate(firstTime),yesterday=shiftDate(calendarDate(now),-1);
  let date=before?shiftDate(before,-1):yesterday;
  if(date>yesterday)date=yesterday;
  const dates=[];
  while(date>=from&&dates.length<14){dates.push(date);date=shiftDate(date,-1)}
  const rows=[];
  for(let i=0;i<dates.length;i+=3){
    rows.push(...await Promise.all(dates.slice(i,i+3).map(async date=>{
      const stats=await get('/stats',{startAt:dayStart(date),endAt:dayStart(shiftDate(date,1))-1,timezone:TRAFFIC_ZONE});
      return {date,visitors:count(stats.visitors),visits:count(stats.visits)};
    })));
  }
  return {rows,from,nextBefore:date>=from?rows.at(-1).date:null,timeZone:TRAFFIC_ZONE};
}
