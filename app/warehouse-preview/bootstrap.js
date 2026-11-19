import { createGate } from './gate.js';
const root=document.getElementById('preview-root');
const gatePanel=document.getElementById('preview-gate');
const message=document.getElementById('preview-message');
let lastFocus=null;
const gate=createGate({
  async getAuth(){
    const {supabase}=await import('../../js/supabaseClient.js');
    if(!supabase?.auth)throw new Error('ASC auth unavailable');
    return {
      async getSession(){
        const {data,error}=await supabase.auth.getSession();
        if(error)throw error;
        if(data?.session)return data.session;
        try{
          const handoff=await import('../../js/neroSessionHandoff.js');
          const bridged=await handoff.establishHandoff();
          if(bridged?.session?.sub && Number.isFinite(bridged.session.exp)){
            return {user:{id:bridged.session.sub},expires_at:bridged.session.exp,bridged:true};
          }
        }catch{}
        return null;
      },
      subscribe(callback){
        const {data}=supabase.auth.onAuthStateChange((event,session)=>{
          // Only SIGNED_OUT is logout. INITIAL_SESSION with no ASC session must not
          // wipe a Nero handoff token before getSession() can consume it.
          if(event==='SIGNED_OUT'){
            import('../../js/neroSessionHandoff.js').then((m)=>m.clearHandoff()).catch(()=>{});
          }
          callback(event,session);
        });
        return ()=>data?.subscription?.unsubscribe();
      }
    };
  },
  async loadApp(){const module=await import('./app.js');return module.startPreview;},
  isVisible:()=>!document.hidden,
  present(ready,text){
    if(!ready&&root.contains(document.activeElement))lastFocus=document.activeElement;
    root.hidden=!ready;root.inert=!ready;
    gatePanel.hidden=ready;message.textContent=text;
    document.documentElement.dataset.previewState=ready?'ready':'locked';
    if(ready&&lastFocus?.isConnected){lastFocus.focus({preventScroll:true});lastFocus=null;}
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)gate.suspend();else void gate.resume();});
window.addEventListener('pagehide',event=>{if(event.persisted)gate.suspend();else gate.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)void gate.resume();});
void gate.check();
