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
        return data?.session??null;
      },
      subscribe(callback){
        const {data}=supabase.auth.onAuthStateChange(callback);
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
