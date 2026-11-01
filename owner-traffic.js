/* Owner traffic is kept out of public analytics after admin identity is checked. */
(function(){
  "use strict";
  const MARK="fr_owner_device_v1", DEVICE="fr_owner_device_id_v1", SESSION="fr_owner_visit_v1", GAP=30*60e3;
  const memory={};
  const read=k=>{try{return localStorage.getItem(k)??memory[k]??null}catch{return memory[k]??null}};
  const write=(k,v)=>{memory[k]=v;try{localStorage.setItem(k,v)}catch{}};
  const kind=()=>/iPad|Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent)?"tablet":/Mobile|Android|iPhone/i.test(navigator.userAgent)?"phone":"computer";
  const uuid=()=>crypto.randomUUID();
  let started=false,owner=false,record=null,inFlight=new Set();
  function activity(){
    if(!owner||!record||document.visibilityState==="hidden")return Promise.resolve();
    const now=Date.now(),day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm"}).format(new Date(now));
    let device=read(DEVICE);if(!device){device=uuid();write(DEVICE,device)}
    let session;try{session=JSON.parse(read(SESSION)||"null")}catch{}
    if(!session||now-session.last>=GAP||session.day!==day)session={id:uuid(),last:now,day,recorded:false};
    session.last=now;write(SESSION,JSON.stringify(session));
    if(session.recorded||inFlight.has(session.id))return Promise.resolve();
    inFlight.add(session.id);
    return Promise.resolve(record({visitId:session.id,deviceId:device,device:kind()})).then(result=>{
      if(result?.saved!==true)throw Error(result?.error||"Owner visit was not saved");
      let current;try{current=JSON.parse(read(SESSION)||"null")}catch{}
      if(current?.id===session.id){current.recorded=true;write(SESSION,JSON.stringify(current))}
    }).catch(()=>{}).finally(()=>inFlight.delete(session.id));
  }
  function loadPublicAnalytics(){
    const um=document.createElement("script");um.defer=true;um.src="https://cloud.umami.is/script.js";um.dataset.websiteId="d8274143-7ceb-4717-aa02-13bfb95bfbf3";document.head.appendChild(um);
    const cf=document.createElement("script");cf.type="module";cf.src="https://static.cloudflareinsights.com/beacon.min.js";cf.dataset.cfBeacon=JSON.stringify({token:"94673d86616b4c7fb6b3d6c3ad8f7383"});document.head.appendChild(cf);
  }
  window.FanreelzTraffic={
    excluded:()=>owner||read(MARK)==="1",
    start(options={}){
      if(started)return Promise.resolve();
      started=true;owner=options.owner===true;record=options.record;
      if(owner)write(MARK,"1");
      if(owner||read(MARK)==="1"){
        window.umami={track:()=>{},identify:()=>{}};
        if(owner){
          let last=0;const touch=()=>{if(Date.now()-last<15000)return;last=Date.now();activity()};
          for(const event of ["click","keydown","scroll","focus","visibilitychange"])addEventListener(event,touch,{passive:true});
          return activity();
        }
      }else if(options.known!==false)loadPublicAnalytics();
      return Promise.resolve();
    }
  };
})();
