export function createGate({getAuth, loadApp, present, isVisible, now=Date.now, setTimer=setTimeout, clearTimer=clearTimeout}) {
  let generation=0, closed=false, authorized=false, suspended=false, authPromise, appPromise, auth, runtime, unsubscribe, expiry, userId;
  const timers=new Set();
  const later=(fn,ms)=>{const id=setTimer(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
  const cancel=id=>{if(id!==undefined){clearTimer(id);timers.delete(id);}};
  const bounded=p=>new Promise((resolve,reject)=>{
    const id=later(()=>reject(new Error('timeout')),10000);
    Promise.resolve(p).then(v=>{cancel(id);resolve(v);},e=>{cancel(id);reject(e);});
  });
  function pause(){try{runtime?.pause();}catch{}}
  function lock(message,terminal=false){
    generation++;authorized=false;cancel(expiry);pause();
    if(terminal){closed=true;for(const id of timers)clearTimer(id);timers.clear();try{runtime?.dispose();}catch{};unsubscribe?.();unsubscribe=null;}
    present(false,message);
  }
  function changed(event,session){
    if(closed)return;
    if(!session){lock('Prijava je završena. Ponovno se prijavite.',true);return;}
    if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){
      later(()=>{void check();},0);
    }
  }
  async function check(){
    if(closed||suspended||!isVisible())return;
    const ticket=++generation;authorized=false;cancel(expiry);pause();
    present(false,'Provjeravamo prijavu…');
    try{
      auth=await bounded(authPromise||(authPromise=getAuth()));
      if(ticket!==generation||closed)return;
      if(!unsubscribe)unsubscribe=auth.subscribe(changed);
      if(ticket!==generation||closed){if(closed){unsubscribe?.();unsubscribe=null;}return;}
      const session=await bounded(auth.getSession());
      if(ticket!==generation||closed)return;
      if(!session?.user?.id||!Number.isFinite(session.expires_at)||session.expires_at*1000<=now()){
        lock('Za probni prikaz potrebna je važeća ASC prijava.',true);return;
      }
      if(userId&&userId!==session.user.id){lock('Račun je promijenjen. Ponovno otvorite prikaz.',true);return;}
      userId=session.user.id;authorized=true;
      expiry=later(()=>lock('Prijava je istekla. Ponovno se prijavite.',true),
        Math.min(2147483647,session.expires_at*1000-now()));
      const start=await bounded(appPromise||(appPromise=loadApp()));
      if(ticket!==generation||closed||!isVisible())return;
      present(true,'');
      if(!runtime)runtime=start({isActive:()=>authorized&&!closed&&!suspended&&isVisible(),registerRuntime:value=>{runtime=value;}});
      runtime.resume();
    }catch{
      if(ticket===generation&&!closed)lock('Prikaz nije učitan. Provjerite vezu i pokušajte ponovno.',true);
    }
  }
  return {
    check,
    resume(){suspended=false;return check();},
    suspend(){suspended=true;if(!closed)lock('Prikaz je zaustavljen dok je kartica skrivena.');},
    dispose(){
      if(closed&&timers.size===0)return;
      closed=true;generation++;authorized=false;
      for(const id of timers)clearTimer(id);timers.clear();
      unsubscribe?.();unsubscribe=null;
      try{runtime?.dispose();}catch{}
    }
  };
}
