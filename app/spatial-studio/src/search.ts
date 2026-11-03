export const normalize=(v:unknown)=>String(v??'').toLocaleLowerCase('hr').replace(/[đ]/g,'d').normalize('NFD').replace(/\p{M}/gu,'').trim();
const tokenize=(text:string)=>normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function near(a:string,b:string){if(a.length<4||Math.abs(a.length-b.length)>1)return false;let i=0,j=0,e=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++e>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return e+(a.length-i)+(b.length-j)<=1;}
export function makeIndex(values:unknown[]){const terms=tokenize(values.join(' '));return {terms,joined:terms.join(' '),compact:terms.join('')};}
export function matches(idx:ReturnType<typeof makeIndex>,query:string){const terms=tokenize(query);return terms.every(t=>idx.joined.includes(t)||idx.compact.includes(t)||idx.terms.some(x=>near(t,x)));}
export const occupancy=(used:number|null,total:number)=> used===null||total<=0?'unknown':used/total<.4?'low':used/total<=.85?'mid':'high';

function stamp(code:string){let hash=0x811c9dc5;for(const c of code.toUpperCase()){hash^=c.charCodeAt(0);hash=Math.imul(hash,0x01000193)}return (hash>>>0).toString(36).toUpperCase().slice(-4).padStart(4,'0');}
export function scanValue(raw:string){
 const input=raw.trim();if(input.length>2048)return '';
 const segment=(value:string)=>value.replace(/^#\/?(?:set|slot)\//i,'').split('?')[0];
 try{
  if(!/^(?:https?:|#)/i.test(input))return /^[a-z0-9 ._/-]+$/i.test(input)?input:'';
  const u=new URL(input,'https://invalid.local/'), linked=u.searchParams.get('code')||u.searchParams.get('set')||decodeURIComponent(segment(u.hash));
  const k=u.searchParams.get('k')||new URLSearchParams(u.hash.split('?')[1]).get('k');
  return linked&&(!k||stamp(linked)===k.toUpperCase())?linked:'';
 }catch{return ''}
}
