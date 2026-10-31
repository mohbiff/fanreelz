/* Native links support middle-click, Ctrl/Cmd-click, copying and browser menus.
   Ordinary left-clicks keep the existing in-page navigation handlers. */
const navigationSelector='[data-open],[data-open-full],[data-view],[data-feed],[data-cat],[data-creator],[data-user],[data-series],[data-browse],[data-liveopen],[data-fmtnav],[data-longnav],[data-you],#homeLogo';
function navigationHref(el) {
  const d=el.dataset;
  if(el.id==='homeLogo')return '/';
  if(d.openFull!==undefined)return pathFor({view:'watch',film:d.openFull});
  if(d.open!==undefined){const f=findFilm(d.open);return pathFor({view:f?.format==='short'||f?.vert?'shorts':'watch',film:d.open});}
  if(d.series!==undefined)return pathFor({view:'series',series:d.series});
  if(d.user!==undefined)return pathFor({view:'user',user:d.user});
  if(d.creator!==undefined)return pathFor({view:'creator',creator:d.creator});
  if(d.liveopen!==undefined)return pathFor({view:'liveplay',liveId:d.liveopen});
  if(d.browse!==undefined)return pathFor({view:'browse',bgroup:d.browse});
  if(d.fmtnav!==undefined)return pathFor({view:'home',format:d.fmtnav});
  if(d.longnav!==undefined)return pathFor({view:'home',format:'film',dur:'o20'});
  if(d.you!==undefined)return d.you==='channel'?(acct.uid?pathFor({view:'user',user:acct.uid})+'?tab=videos':'/you'):pathFor({view:d.you});
  if(d.view!==undefined)return pathFor({view:d.view});
  if(d.feed!==undefined)return pathFor({view:'home',feed:d.feed});
  if(d.cat!==undefined){
    // Lore buttons change an in-page filter that currently has no URL encoding.
    if(d.loreGo!==undefined)return null;
    return pathFor({view:'home',cat:d.cat,char:d.charGo||null});
  }
  return null;
}
function linkifyNavigation(root) {
  if(!root.querySelectorAll)return;
  const nodes=[...(root.matches?.(navigationSelector)?[root]:[]),...root.querySelectorAll(navigationSelector)];
  for(const el of nodes){
    if(!['A','BUTTON','DIV','SPAN'].includes(el.tagName)||el.hasAttribute('disabled'))continue;
    if(el.tagName!=='A'&&(el.closest('a')||el.querySelector('button,a,input,select,textarea')))continue;
    const href=navigationHref(el);if(!href)continue;
    let link=el;
    if(el.tagName!=='A'){
      link=document.createElement('a');
      for(const attr of el.attributes)if(!['type','role','tabindex'].includes(attr.name))link.setAttribute(attr.name,attr.value);
      while(el.firstChild)link.appendChild(el.firstChild);
      el.replaceWith(link);
    }
    link.setAttribute('href',href);
    link.setAttribute('data-fr-link','');
  }
}
function handleNavigationClick(event) {
  const link=event.target.closest?.('a[data-fr-link]');
  if(!link)return;
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download')||(link.target&&link.target!=='_self')){
    // Leave the native browser action intact and keep SPA handlers out of it.
    event.stopImmediatePropagation();return;
  }
  event.preventDefault();
}
document.addEventListener('click',handleNavigationClick,true);
linkifyNavigation(document.body);
new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.isConnected)linkifyNavigation(node);
}).observe(document.body,{childList:true,subtree:true});
