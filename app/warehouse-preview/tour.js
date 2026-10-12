import { tutorialExample } from './journey.js';
const KEY='asc.warehouse.preview.tutorial.hr.v1';
const steps=[
  {title:'Odaberite prostor',text:'Kuća ima tri skladišta. Krenimo od potkrovlja.',action:'Otvori potkrovlje'},
  {title:'Pronađite gume',text:'Upišite ime, registraciju ili oznaku. Isprobajmo jedan stupac.',action:'Pronađi primjer'},
  {title:'Ovdje su',text:'Stupac je označen. Detalji su ispod prikaza. Dodirnite gumu za QR oznaku.',action:'Završi vodič'},
];
export function createTour({getState,navigate,findExample,closeOverlays,onFinish=()=>{},isActive=()=>true}) {
  const card=document.getElementById('tour-card'), welcome=document.getElementById('welcome');
  let step=-1, initialFocus=null, acting=false;
  let seen=false;try{seen=Boolean(localStorage.getItem(KEY));}catch{}
  welcome.hidden=seen;
  function remember(status){try{localStorage.setItem(KEY,JSON.stringify({version:1,status,at:new Date().toISOString()}));}catch{}}
  function clearHighlight(){document.querySelectorAll('.tour-target').forEach(el=>el.classList.remove('tour-target'));}
  function finish(status='completed'){
    if(step<0)return;
    step=-1;card.hidden=true;clearHighlight();document.body.classList.remove('tour-active');remember(status);
    if(initialFocus?.isConnected && !initialFocus.closest('[hidden],[inert]') && initialFocus.getClientRects().length)initialFocus.focus();
    else document.getElementById('help-button').focus();
    onFinish(status);
  }
  function render(){
    if(step<0)return;clearHighlight();const item=steps[step];
    const target=step===0?(matchMedia('(max-width:1020px)').matches?document.getElementById('area-tabs'):document.getElementById('areas')):step===1?document.querySelector('.search-wrap'):document.getElementById('inspector');
    if(target&&!target.hidden){target.classList.add('tour-target');target.scrollIntoView({block:'start',behavior:'auto'});}
    card.innerHTML=`<div class="tour-header"><div class="tour-progress" aria-label="Korak ${step+1} od 3">${steps.map((_,i)=>`<i class="${i<=step?'done':''}" aria-hidden="true"></i>`).join('')}<span>${step+1} / 3</span></div><button id="tour-close" class="icon-button" aria-label="Zatvori vodič">×</button></div><h3 id="tour-heading" tabindex="-1">${item.title}</h3><p>${item.text}</p><div class="tour-actions">${step?'<button id="tour-back" class="button quiet">Natrag</button>':'<button id="tour-skip" class="button quiet">Preskoči</button>'}<button id="tour-next" class="button primary">${item.action}</button></div>`;
    card.hidden=false;document.body.style.setProperty('--tour-height',`${card.getBoundingClientRect().height}px`);
    document.getElementById('tour-close').onclick=()=>finish('dismissed');
    document.getElementById('tour-skip')?.addEventListener('click',()=>finish('dismissed'));
    document.getElementById('tour-back')?.addEventListener('click',()=>{step--;render();});
    document.getElementById('tour-next').onclick=()=>{
      if(step===2){finish();return;}
      acting=true;
      if(step===0)navigate('2.3');
      else {const sample=tutorialExample(getState());if(sample)findExample(sample.id);}
      acting=false;step++;render();
    };
    document.getElementById('tour-heading').focus({preventScroll:true});
  }
  function start(){initialFocus=document.activeElement;closeOverlays();welcome.hidden=true;step=0;document.body.classList.add('tour-active');render();}
  function notify(event){if(acting||step<0)return;if(step===0&&event==='area'||step===1&&event==='found'){step++;render();}}
  document.getElementById('start-tour').onclick=start;
  document.getElementById('dismiss-tour').onclick=()=>{welcome.hidden=true;remember('dismissed');};
  const onKey=e=>{if(!isActive())return;if(e.key==='Escape'&&step>=0&&!document.querySelector('dialog[open]')){e.preventDefault();finish('dismissed');}};
  document.addEventListener('keydown',onKey);
  const resize=()=>{if(step>=0)document.body.style.setProperty('--tour-height',`${card.getBoundingClientRect().height}px`);};
  window.addEventListener('resize',resize);
  return {start,notify,get active(){return step>=0;},finish,pause(){card.hidden=true;clearHighlight();document.body.classList.remove('tour-active');},resume(){if(step>=0){document.body.classList.add('tour-active');render();}},dispose(){document.removeEventListener('keydown',onKey);window.removeEventListener('resize',resize);clearHighlight();card.hidden=true;document.body.classList.remove('tour-active');}};
}
