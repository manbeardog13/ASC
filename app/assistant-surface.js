// One conversation surface for ASC pages and the gated warehouse preview.
// Loading/opening the panel never sends a model request. Only an explicit send does.
const APP = new URL('./', import.meta.url);
let enginePromise;
function script(name) {
  const src=new URL(name,APP).href;
  const present=[...document.scripts].find(node=>node.src===src);
  if(present && (name==='agent-config.js'?typeof window.ASC_AGENT_URL==='string':Boolean(window.ASCAgent)))return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const node=present||document.createElement('script');
    const done=error=>{clearTimeout(timer);node.removeEventListener('load',loaded);node.removeEventListener('error',failed);if(error){node.remove();reject(error);}else resolve();};
    const loaded=()=>done(),failed=()=>done(new Error('Pomoćnik se nije učitao. Pokušaj ponovno.'));
    const timer=setTimeout(()=>done(new Error('Učitavanje je trajalo predugo. Pokušaj ponovno.')),15000);
    node.addEventListener('load',loaded,{once:true});node.addEventListener('error',failed,{once:true});
    if(!present){node.src=src;node.async=false;document.head.append(node);}
  });
}
function engine() {
  return enginePromise||(enginePromise=script('agent-config.js').then(()=>script('agent-gemini.js')).then(()=>{if(typeof window.ASCAgent?.ask!=='function')throw new Error('Pomoćnik se nije učitao. Pokušaj ponovno.');return window.ASCAgent;}).catch(error=>{enginePromise=null;throw error;}));
}
const routes={customers:'customers.html',checkin:'checkin.html',warehouse:'warehouse-preview/index.html',reminders:'reminders.html'};
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim();
const action=(label,route)=>({label,run:()=>{location.href=new URL(routes[route],APP).href;}});
const defaults=()=>[action('Pronađi gume','customers'),action('Zaprimi komplet','checkin'),action('Skladište','warehouse')];

export function mountAssistant(mount,{context=()=>({}),tools,isActive=()=>true,localRequest,actions=defaults}={}) {
  const css=new URL('assistant-surface.css',APP).href;
  if(!document.querySelector('link[data-asc-chat-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=css;link.dataset.ascChatStyle='';document.head.append(link);}
  mount.classList.add('asc-chat-mount');
  mount.innerHTML=`<details class="asc-chat"><summary><span class="asc-chat-mark" aria-hidden="true">✦</span><span><b>Pitaj ASC</b><small>Pitanje ili zadatak</small></span><span class="asc-chat-chevron" aria-hidden="true">⌄</span></summary><div class="asc-chat-body"><div class="asc-chat-log" role="log" aria-label="Razgovor s ASC" aria-relevant="additions text"></div><div class="asc-chat-actions" aria-label="Sljedeći korak"></div><form class="asc-chat-form"><label class="asc-chat-label">Što trebaš?<textarea rows="1" maxlength="2000" placeholder="Npr. gdje su Markove gume?" enterkeyhint="send"></textarea></label><div class="asc-chat-controls"><button type="button" class="asc-chat-mic" aria-label="Diktiraj poruku" aria-pressed="false">Govori</button><button type="button" class="asc-chat-read" aria-pressed="false">Čitaj odgovor</button><button type="button" class="asc-chat-stop" hidden>Zaustavi</button><button type="submit" class="asc-chat-send">Pošalji</button></div></form><p class="asc-chat-status" role="status" aria-live="polite"></p></div></details>`;
  const $=s=>mount.querySelector(s),panel=$('details'),log=$('.asc-chat-log'),input=$('textarea'),form=$('form'),status=$('.asc-chat-status'),send=$('.asc-chat-send'),stop=$('.asc-chat-stop'),mic=$('.asc-chat-mic'),read=$('.asc-chat-read'),next=$('.asc-chat-actions');
  let alive=true,busy=false,generation=0,agent=null,recognition=null,voiceGeneration=0,readOn=false;
  const active=()=>alive&&isActive()&&!document.hidden;
  const currentContext=()=>typeof context==='function'?context():context;
  function showActions(list=typeof actions==='function'?actions():actions) {
    next.replaceChildren();
    for(const item of (list||[]).slice(0,4)){
      const button=document.createElement('button');button.type='button';button.textContent=item.label;
      button.onclick=()=>{if(!active()||busy)return;if(item.run){try{item.run();}catch{status.textContent='Radnja nije uspjela. Pokušaj ponovno.';}}else open(item.prompt||item.label,Boolean(item.submit));};next.append(button);
    }
  }
  function message(who,text) {
    const bubble=document.createElement('article');bubble.className='asc-chat-bubble is-'+who;
    const label=document.createElement('small');label.textContent=who==='user'?'Ti':who==='local'?'U aplikaciji':'ASC AI';bubble.append(label);
    const p=document.createElement('p');
    if(text.length>220){p.textContent=text.slice(0,200)+'…';const details=document.createElement('details'),summary=document.createElement('summary'),full=document.createElement('p');summary.textContent='Cijeli odgovor';full.textContent=text;details.append(summary,full);bubble.append(p,details);}else{p.textContent=text;bubble.append(p);}
    log.append(bubble);while(log.children.length>30)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;
  }
  function working(value){busy=value;send.disabled=value;input.readOnly=value;stop.hidden=!value;mic.disabled=value||!Recognition;next.inert=value;form.setAttribute('aria-busy',String(value));}
  function speak(text){if(!readOn||!active()||!window.speechSynthesis)return;const utterance=new SpeechSynthesisUtterance(text);utterance.lang='hr-HR';speechSynthesis.cancel();speechSynthesis.speak(utterance);}
  function stopVoice(){voiceGeneration++;if(recognition){const previous=recognition;recognition=null;try{previous.abort();}catch{}}mic.setAttribute('aria-pressed','false');mic.textContent='Govori';}
  function suspend(){generation++;const wasListening=Boolean(recognition);stopVoice();agent?.cancel();window.speechSynthesis?.cancel();if(busy){working(false);status.textContent='Zaustavljeno. Ranije dovršene radnje ostaju sačuvane.';}else if(wasListening)status.textContent='Diktiranje je zaustavljeno.';}
  async function submit(text) {
    text=String(text||'').trim();if(!text||busy||!active())return;
    stopVoice();const ticket=++generation;working(true);input.value='';message('user',text);status.textContent='Primljeno…';
    const stillActive=()=>active()&&ticket===generation;
    try{
      const value=currentContext();const submittedContext=typeof value==='string'?value:JSON.parse(JSON.stringify(value||{}));
      const local=await localRequest?.(text);
      if(!stillActive())return;
      if(local){message('local',local.text);showActions(local.actions);status.textContent='';speak(local.text);return;}
      // Navigation/help can complete without a provider; never disguise that as AI.
      const q=normal(text);
      const navigation=q.replace(/[.!?]+$/,'').match(/^(?:molim\s+)?(?:otvori|pokazi|prikazi|idi na)\s+(kupce|kupci|zaprimanje|zaprimi|prijam|skladiste|podsjetnike|podsjetnici)$/);
      if(navigation){
        const destination={kupce:'customers',kupci:'customers',zaprimanje:'checkin',zaprimi:'checkin',prijam:'checkin',skladiste:'warehouse',podsjetnike:'reminders',podsjetnici:'reminders'}[navigation[1]];
        status.textContent='Otvaram stranicu…';action('',destination).run();return;
      }
      if(/^(pomoc|help|sto mozes|sto mozes uciniti|kako koristiti)(\?)?$/.test(q)){
        const help='Mogu pronaći gume, provjeriti stanje i pripremiti prijam. Spremanje potvrđuješ u obrascu.';message('local',help);showActions();status.textContent='';return;
      }
      agent=await engine();if(!stillActive())return;
      if(!agent?.configured())throw new Error('AI veza nije postavljena. Brze radnje i dalje rade.');
      status.textContent='Čekam AI odgovor…';
      const answer=await agent.ask(text,event=>{
        if(!stillActive())return;
        if(event.type==='tool')status.textContent='Provjeravam u aplikaciji…';
        if(event.type==='error')status.textContent=event.message;
      },{context:submittedContext,tools,isActive:stillActive});
      if(!stillActive())return;
      if(!answer?.trim())throw new Error('AI nije vratio odgovor. Pokušaj ponovno.');
      message('assistant',answer);showActions();status.textContent='';speak(answer);
    }catch(error){
      if(!stillActive())return;
      status.textContent=error.name==='AbortError'?'Zaustavljeno.':(error.userMessage||error.message||'AI nije dostupan. Brze radnje i dalje rade.');
      // Keep the exact request for an explicit retry; never auto-replay a task.
      input.value=text;showActions();
    }finally{if(ticket===generation&&alive)working(false);}
  }
  function open(prompt='',run=false) {
    if(!active())return;panel.open=true;showActions();
    if(prompt)input.value=String(prompt).slice(0,2000);
    mount.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'nearest'});
    input.focus({preventScroll:true});if(run&&prompt)void submit(prompt);
  }
  form.onsubmit=event=>{event.preventDefault();void submit(input.value);};
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
  stop.onclick=()=>{suspend();if(active())input.focus({preventScroll:true});};
  panel.addEventListener('toggle',()=>{if(!panel.open)suspend();else if(!log.children.length&&!busy)showActions();});
  read.hidden=!window.speechSynthesis;
  read.onclick=()=>{readOn=!readOn;read.setAttribute('aria-pressed',String(readOn));if(!readOn)window.speechSynthesis?.cancel();};
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){mic.disabled=true;mic.title='Glas nije podržan u ovom pregledniku. Upiši poruku.';}
  mic.onclick=()=>{
    if(!active()||busy||!Recognition)return;if(recognition){recognition.stop();return;}
    const token=++voiceGeneration,r=new Recognition();let heard=false,voiceError=false;recognition=r;r.lang='hr-HR';r.interimResults=true;r.continuous=false;
    r.onresult=event=>{if(token!==voiceGeneration||!active())return;heard=true;input.value=[...event.results].map(row=>row[0].transcript).join(' ').slice(0,2000);};
    r.onerror=event=>{if(token!==voiceGeneration)return;voiceError=true;status.textContent=event.error==='not-allowed'?'Dopusti mikrofon ili upiši poruku.':'Glas nije prepoznat. Upiši poruku.';};
    r.onend=()=>{if(token!==voiceGeneration)return;recognition=null;mic.setAttribute('aria-pressed','false');mic.textContent='Govori';if(active()&&!voiceError){status.textContent=heard&&input.value.trim()?'Provjeri poruku pa pošalji.':'Nisam prepoznao govor. Pokušaj ponovno ili upiši poruku.';if(heard)input.focus({preventScroll:true});}};
    try{r.start();mic.setAttribute('aria-pressed','true');mic.textContent='Završi';status.textContent='Slušam…';}catch{stopVoice();status.textContent='Mikrofon nije dostupan. Upiši poruku.';}
  };
  const visibility=()=>{if(document.hidden)suspend();},hide=()=>suspend();
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',hide);
  showActions();
  return {open,suspend,dispose(){suspend();alive=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',hide);mount.replaceChildren();}};
}
