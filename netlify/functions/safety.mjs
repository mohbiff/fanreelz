import { whoIs, isAdmin } from './moderate.mjs';

const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
const validId = value => typeof value==='string' && /^[\w-]{1,160}$/.test(value);
const reasons = ['Harassment or hate','Sexual content','Violence or dangerous content','Spam or scam','Copyright or re-upload','Other'];

// Private safety records use the existing import_state table. Only the server's
// service role can access it; reporter identities and block lists are never public.
export async function handleSafety(req, user, admin, db) {
  const call = async (path, options={}) => {
    const r=await fetch(db.url+path,{...options,headers:{...db.headers,...options.headers}});
    if(!r.ok) throw Error('Safety storage unavailable');
    return r.status===204 ? null : r.json();
  };
  const read = async key => (await call('import_state?key=eq.'+encodeURIComponent(key)+'&select=key,value'))[0]?.value;
  const save = (key,value) => call('import_state',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({key,value})});
  try {
    if(req.method==='GET') {
      const hidden=await call('import_state?key=like.safety%3Ahidden%3A*&select=value&limit=5000');
      const blocks=user?await call('import_state?key=like.'+encodeURIComponent('safety:block:'+user.id+':*')+'&select=value&limit=1000'):[];
      return json({hidden:hidden.map(x=>({owner:x.value.owner,id:x.value.id})),blocked:blocks.map(x=>x.value.target)});
    }
    if(req.method!=='POST') return json({error:'POST required'},405);
    if(!user) return json({error:'Sign in to use safety controls.'},401);
    if(Number(req.headers.get('content-length'))>6000) return json({error:'Request too large'},413);
    const raw=await req.text();if(raw.length>6000)return json({error:'Request too large'},413);
    let b;try{b=JSON.parse(raw)}catch{return json({error:'Invalid request'},400)}
    if(!b||typeof b!=='object')return json({error:'Invalid request'},400);
    if(b.action==='block'||b.action==='unblock') {
      if(!uuid(b.target)||b.target===user.id)return json({error:'Invalid member'},400);
      const key='safety:block:'+user.id+':'+b.target;
      if(b.action==='block') {
        const profiles=await call('profiles?id=eq.'+encodeURIComponent(b.target)+'&select=id');
        if(!profiles.length)return json({error:'Member not found'},404);
        await save(key,{target:b.target});
      } else await call('import_state?key=eq.'+encodeURIComponent(key),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return json({ok:true});
    }
    if(b.action==='report') {
      if(!['comment','film','user'].includes(b.kind)||!validId(b.id)||!reasons.includes(b.reason)||typeof b.details!=='string'||b.details.length>1000)return json({error:'Choose a reason and valid content.'},400);
      let target;
      if(b.kind==='comment') {
        if(!uuid(b.owner))return json({error:'Invalid member'},400);
        const rows=await call('docs?col=eq.comments&owner=eq.'+encodeURIComponent(b.owner)+'&select=data');
        const c=rows[0]?.data?.items?.find(x=>String(x.id)===b.id);
        if(!c)return json({error:'Comment not found'},404);
        target={kind:'comment',id:b.id,owner:b.owner,film:String(c.film||''),text:String(c.text||'').slice(0,1000)};
      } else if(b.kind==='user') {
        if(!uuid(b.id))return json({error:'Invalid member'},400);
        const rows=await call('profiles?id=eq.'+encodeURIComponent(b.id)+'&select=id,name');
        if(!rows.length)return json({error:'Member not found'},404);
        target={kind:'user',id:b.id,owner:b.id,text:String(rows[0].name||'')};
      } else {
        const rows=await call('catalog?id=eq.'+encodeURIComponent(b.id)+'&select=id,title');
        if(rows.length)target={kind:'film',id:b.id,text:rows[0].title};
        else {
          const rows=await call('docs?col=eq.submissions&select=owner,data&limit=5000');
          for(const row of rows){const f=row.data?.films?.find(x=>String(x.id)===b.id);if(f){target={kind:'film',id:b.id,owner:row.owner,text:String(f.title||'')};break}}
          if(!target)return json({error:'Film not found'},404);
        }
      }
      const recent=await call('import_state?key=like.safety%3Areport%3A*&select=key,value&order=key.desc&limit=1000');
      const mine=recent.filter(x=>x.value.reporter===user.id&&Date.parse(x.value.createdAt)>Date.now()-3600000);
      if(mine.some(x=>x.value.status==='open'&&x.value.target.kind===target.kind&&x.value.target.id===target.id&&x.value.target.owner===target.owner))return json({ok:true,duplicate:true});
      if(mine.length>=10)return json({error:'Too many reports. Please try again later.'},429);
      const createdAt=new Date().toISOString();
      const key='safety:report:'+createdAt+':'+crypto.randomUUID();
      await save(key,{reporter:user.id,target,reason:b.reason,details:b.details.trim(),status:'open',createdAt});
      return json({ok:true});
    }
    if(!admin)return json({error:'Admins only'},403);
    if(b.action==='restoreComment') {
      if(!uuid(b.owner)||!validId(b.id))return json({error:'Invalid comment'},400);
      await call('import_state?key=eq.'+encodeURIComponent('safety:hidden:'+b.owner+':'+b.id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return json({ok:true});
    }
    if(b.action==='moderateComment') {
      if(!uuid(b.owner)||!validId(b.id))return json({error:'Invalid comment'},400);
      const rows=await call('docs?col=eq.comments&owner=eq.'+encodeURIComponent(b.owner)+'&select=data');
      if(!rows[0]?.data?.items?.some(c=>String(c.id)===b.id))return json({error:'Comment not found'},404);
      await save('safety:hidden:'+b.owner+':'+b.id,{owner:b.owner,id:b.id});
      return json({ok:true});
    }
    if(b.action==='queue') {
      const rows=await call('import_state?key=like.safety%3Areport%3A*&select=key,value&order=key.desc&limit=500');
      return json({reports:rows.map(x=>({key:x.key,...x.value}))});
    }
    if(b.action==='resolve') {
      if(typeof b.key!=='string'||!b.key.startsWith('safety:report:')||b.key.length>150||!['hide','dismiss','restore'].includes(b.resolution))return json({error:'Invalid review action'},400);
      const report=await read(b.key);if(!report)return json({error:'Report not found'},404);
      const t=report.target;
      if(b.resolution==='hide'&&t.kind==='user')return json({error:'Review the member’s individual content before hiding it.'},400);
      const hiddenKey='safety:hidden:'+(t.owner||'catalog')+':'+t.id;
      if(b.resolution==='hide')await save(hiddenKey,{owner:t.owner||'catalog',id:t.id});
      if(b.resolution==='restore')await call('import_state?key=eq.'+encodeURIComponent(hiddenKey),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      await save(b.key,{...report,status:b.resolution==='hide'?'hidden':b.resolution==='restore'?'restored':'dismissed',reviewedAt:new Date().toISOString(),reviewer:user.id});
      return json({ok:true});
    }
    return json({error:'Unknown safety action'},400);
  }catch{return json({error:'Safety controls could not be saved. Please try again.'},503)}
}

export default async req => {
  try {
    const user=await whoIs(req),key=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!key)return json({error:'Safety service unavailable'},503);
    const headers={apikey:key,'Content-Type':'application/json'};
    if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
    return handleSafety(req,user,isAdmin(user),{url:Netlify.env.get('SUPABASE_URL')+'/rest/v1/',headers});
  } catch {return json({error:'Safety service unavailable'},503)}
};
export const config={path:'/api/safety'};
