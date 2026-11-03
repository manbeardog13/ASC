import {supabase} from '../js/supabaseClient.js';
import {createTyreStream} from './stock-strip-view.js';

const root=document.documentElement, host=document.createElement('aside');
host.className='asc-stock-strip';host.hidden=true;document.body.append(host);
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./stock-strip.css',import.meta.url).href;document.head.append(css);
const view=createTyreStream({host,onOpen:code=>{const detail=new URL('./set-detail.html',import.meta.url);detail.searchParams.set('code',code);location.assign(detail);}});
let actor=null, epoch=0, request=0, channel=null, scheduled=null, suspended=false;
function clear(){
  epoch++;request++;clearTimeout(scheduled);scheduled=null;host.hidden=true;root.classList.remove('has-stock-strip');view.update([]);
  if(channel&&supabase)void supabase.removeChannel(channel);channel=null;
}
async function refresh(){
  const who=actor, current=epoch, ticket=++request;
  if(!who||suspended||document.hidden||!supabase)return;
  const {data,error}=await supabase.from('storage_sets').select('public_code,quantity,status,picked_up_at,deleted_at,zone,rack,shelf,slot,vehicle:vehicles(plate,customer:customers(name)),tires(size)').in('status',['in_storage','reserved']).is('deleted_at',null).is('picked_up_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(6);
  if(current!==epoch||who!==actor||ticket!==request||suspended)return;
  view.update(error?[]:data);host.hidden=!!error||!data?.length;root.classList.toggle('has-stock-strip',!host.hidden);
}
function schedule(){clearTimeout(scheduled);scheduled=setTimeout(()=>void refresh().catch(()=>{ if(!host.hidden){host.hidden=true;root.classList.remove('has-stock-strip');}}),120);}
function activate(id){
  if(suspended)return;
  if(id!==actor){clear();actor=id;}
  if(!actor||typeof supabase?.from!=='function'||typeof supabase?.channel!=='function')return;
  if(!channel){channel=supabase.channel('asc-recent-sets');for(const table of ['storage_sets','vehicles','tires','customers']) channel.on('postgres_changes',{event:'*',schema:'public',table},schedule);channel.subscribe();}
  schedule();
}
if(typeof supabase?.from==='function')supabase.auth.onAuthStateChange((_event,session)=>{const id=session?.user?.id||null;if(!id||actor!==id){clear();actor=id;}setTimeout(()=>{if(actor===id)activate(id);},0);});
document.addEventListener('asc:sign-out',()=>{clear();actor=null;});
window.addEventListener('pagehide',()=>{suspended=true;clear();});
window.addEventListener('pageshow',async()=>{const stamp=epoch;suspended=false;const res=await supabase?.auth.getSession();if(stamp===epoch)activate(res?.data?.session?.user?.id||null);});
window.addEventListener('online',schedule);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
setInterval(()=>{if(!document.hidden&&actor)schedule();},30000);
function keyboard(){root.classList.toggle('is-typing',!!window.visualViewport && innerHeight-visualViewport.height>110);}
window.visualViewport?.addEventListener('resize',keyboard);keyboard();
