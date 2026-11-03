import {supabase} from '../js/supabaseClient.js';
import {createTyreStream} from './stock-strip-view.js';

// Without both a session and revocation notifications the strip must expose no inventory.
if(typeof supabase?.from==='function' && typeof supabase.auth?.getSession==='function' &&
   typeof supabase.auth?.onAuthStateChange==='function') mountStockStrip();

function mountStockStrip(){
  const root=document.documentElement, host=document.createElement('aside');
  host.className='asc-stock-strip';host.hidden=true;document.body.append(host);
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./stock-strip.css',import.meta.url).href;document.head.append(css);
  const view=createTyreStream({host,onOpen:code=>{const detail=new URL('./set-detail.html',import.meta.url);detail.searchParams.set('code',code);location.assign(detail);}});
  let actor=null, epoch=0, request=0, channel=null, scheduled=null, suspended=false;
  function display(rows){
    view.update(rows);host.hidden=!rows?.length;root.classList.toggle('has-stock-strip',!host.hidden);
  }
  function clear(){
    epoch++;request++;clearTimeout(scheduled);scheduled=null;display([]);
    if(channel && typeof supabase.removeChannel==='function')void supabase.removeChannel(channel);channel=null;
  }
  async function refresh(){
    const who=actor, current=epoch, ticket=++request;
    if(!who||suspended||document.hidden)return;
    let rows=[];
    try{
      const {data,error}=await supabase.from('storage_sets').select('public_code,quantity,status,picked_up_at,deleted_at,zone,rack,shelf,slot,vehicle:vehicles(plate,customer:customers(name)),tires(size)').in('status',['in_storage','reserved']).is('deleted_at',null).is('picked_up_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(6);
      if(!error && Array.isArray(data))rows=data;
    }catch{/* An unavailable inventory must leave no previous customer visible. */}
    if(current===epoch&&who===actor&&ticket===request&&!suspended)display(rows);
  }
  function schedule(){clearTimeout(scheduled);scheduled=setTimeout(()=>void refresh(),120);}
  function activate(id){
    if(suspended)return;
    if(id!==actor){clear();actor=id;}
    if(!actor)return;
    if(!channel && typeof supabase.channel==='function'){
      channel=supabase.channel('asc-recent-sets');for(const table of ['storage_sets','vehicles','tires','customers'])channel.on('postgres_changes',{event:'*',schema:'public',table},schedule);channel.subscribe();
    }
    schedule();
  }
  supabase.auth.onAuthStateChange((_event,session)=>{const id=session?.user?.id||null;if(!id||actor!==id){clear();actor=id;}setTimeout(()=>{if(actor===id)activate(id);},0);});
  document.addEventListener('asc:sign-out',()=>{clear();actor=null;});
  window.addEventListener('pagehide',()=>{suspended=true;clear();});
  window.addEventListener('pageshow',async()=>{
    const stamp=epoch;suspended=false;let id=null;
    try{const res=await supabase.auth.getSession();if(!res?.error)id=res?.data?.session?.user?.id||null;}catch{/* Fail closed on a rejected session lookup. */}
    if(stamp===epoch)activate(id);
  });
  window.addEventListener('online',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  setInterval(()=>{if(!document.hidden&&actor)schedule();},30000);
  function keyboard(){root.classList.toggle('is-typing',!!window.visualViewport && innerHeight-visualViewport.height>110);}
  window.visualViewport?.addEventListener('resize',keyboard);keyboard();
}
