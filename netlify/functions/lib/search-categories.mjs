import CATS from "./catmap.mjs";
const normalize=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const aliases=CATS.flatMap(category=>[category.name,category.id].map(normalize).filter(name=>name.length>=3).map(name=>({name,category}))).sort((a,b)=>b.name.length-a.name.length);
// Return an existing catalogue category only; never return visitor-supplied text.
export function categoryForSearch(value){
 const query=" "+normalize(value)+" ";
 return aliases.find(({name})=>query.includes(" "+name+" "))?.category||null;
}
