import { renderAppNavigation, applyNavAccess, syncThemeButton } from '../navigation.js';
import { saveOperation, LocalSaveError } from './persistence.js';
import { parseCroatianIntent, searchLocations, customerLabel } from './journey.js';
import { createTour } from './tour.js';
import { AREAS, seedState, validateState, canPlace, createStack, moveStack, setCapacity, addTire, removeTire, stats, LAYOUT_VERSION } from './model.js';
import { pinForSet } from '../../js/mapPin.js';
import { loadMyProfile } from '../../js/db.js';
export function startPreview({isActive=()=>false,registerRuntime=()=>{}}={}){
if(!isActive())throw new Error('ASC preview inactive');
let disposed=false;const listeners=[];
function listen(target,type,handler,options){const wrapped=(...args)=>{if(!disposed&&(type==='storage'||isActive()))handler(...args);};target.addEventListener(type,wrapped,options);listeners.push(()=>target.removeEventListener(type,wrapped,options));}

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'asc.warehouse.preview.v1', VIEW_KEY = 'asc.warehouse.preview.view.v1', CHECK_KEY = 'asc.warehouse.preview.checks.v1';
const paths = {
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 mic:'<rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"/>',
 scan:'<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M7 8v8m4-8v8m3-8v8m3-8v8"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.8 8.4c.4-2 4.6-2 4.6.6 0 2-2.4 2-2.4 4M12 17h.01"/>',
 menu:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 home:'<path d="m3 10 9-7 9 7v10H3ZM9 20v-7h6v7"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',minus:'<path d="M4 12h16"/>',
 focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="12" cy="12" r="3"/>',
 stack:'<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
 list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
 arrow:'<path d="m5 19 14-14M5 5h14v14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const icon = (name,size=19) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.stack}</svg>`;
$('asc-navigation').innerHTML=renderAppNavigation({warehouseOpen:true});
applyNavAccess($('asc-navigation'), null);
loadMyProfile().then((profile)=>applyNavAccess($('asc-navigation'), profile?.role)).catch(()=>{});
syncThemeButton($('sbTheme'));
$('sbTheme')?.addEventListener('click', ()=>{ window.ASCTheme?.toggle(); syncThemeButton($('sbTheme')); });
const appWarehouseGroup=$('asc-navigation').querySelector('.sb-group');
appWarehouseGroup.querySelector('button').onclick=()=>{const open=appWarehouseGroup.classList.toggle('open');appWarehouseGroup.querySelector('button').setAttribute('aria-expanded',String(open));appWarehouseGroup.querySelector('.sb-group-kids').inert=!open;};
for (const [id,name] of Object.entries({'menu-button':'menu','house-icon':'home','search-icon':'search','voice-button':'mic','scan-icon':'scan','zoom-in':'plus','zoom-out':'minus','camera-reset':'focus','place-icon':'plus','list-icon':'list'})) $(id).innerHTML=icon(name);

let storageAvailable=true, storageProblem=false;
function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
let state;
try {const raw=localStorage.getItem(KEY);state=raw===null?seedState():JSON.parse(raw);if(!state||!validateState(state).valid){storageProblem=true;state=seedState();}}catch{state=seedState();storageProblem=true;}
const storedView=readJSON(VIEW_KEY,{});
let areaId=AREAS.some(a=>a.id===storedView.areaId)||storedView.areaId==='all'?storedView.areaId:'2.3';
let selectedId=null, viewer=null, viewMode='3d', placing=null, toastTimer, scannerStream=null, scannerFrame=null, recognition=null, livePin=null;
let tour=null, scannerStarting=false, scannerGeneration=0;
let checkState=readJSON(CHECK_KEY,{}), viewReady=false;
try{localStorage.getItem(KEY);}catch{storageAvailable=false;}
const tyreById = id => state.tires.find(t=>t.id===id);
const selectedStack = () => state.stacks.find(s=>s.id===selectedId);
const area = () => AREAS.find(a=>a.id===areaId);
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function storeView(){try{localStorage.setItem(VIEW_KEY,JSON.stringify({areaId}));}catch{}}
let saving=false;
async function commit(operation,message,{recover=false}={}){
 if(disposed||!isActive())return false;
 if(saving){toast('Spremanje je u tijeku.');return false;}saving=true;
 try{
  const next=await saveOperation({key:KEY,storage:localStorage,locks:navigator.locks,expected:state,operation:current=>{if(disposed||!isActive())throw new LocalSaveError('Prikaz je zaustavljen. Promjena nije spremljena.');return operation(current);},recover});
  state=next;storageAvailable=true;storageProblem=false;render();$('save-status').textContent='Spremljeno na ovom uređaju';toast(message);return true;
 }catch(e){
  if(e.latest){state=e.latest;render();}
  $('save-status').textContent='Promjena nije spremljena';toast(e instanceof LocalSaveError?e.message:'Spremanje nije dostupno. Promjena nije spremljena.');return false;
 }finally{saving=false;}
}
function changeArea(id){if(id!=='all'&&!AREAS.some(a=>a.id===id))return;
 const keepMove=placing?.type==='move'&&id!=='all';if(!keepMove)endPlacement();else{placing.point=null;viewer?.setPlacementPreview(null);}
 areaId=id;selectedId=null;hideSearch();storeView();render();if(keepMove)renderPlacement();closeSidebar();tour?.notify('area');
}
function renderAreas(){
 const focusHost=document.activeElement?.closest('#areas,#area-tabs')?.id,focusArea=document.activeElement?.dataset.area;
 $('areas').innerHTML=AREAS.map(a=>{const n=stats(state,a.id);const on=areaId===a.id;return `<button class="sb-item ${on?'on':''}" data-m="warehouse" type="button" data-area="${a.id}" aria-pressed="${on}"><span class="sb-code">${a.id}</span><span class="t"><span>${esc(a.name)}</span><span class="sub">${n.occupied} guma · ${n.stacks} stupaca</span></span></button>`;}).join('');
 $('areas').querySelectorAll('button').forEach(b=>b.onclick=()=>changeArea(b.dataset.area));
 $('area-tabs').innerHTML=[{id:'all',name:'Sva skladišta'},...AREAS].map(a=>`<button class="${areaId===a.id?'active':''}" data-area="${a.id}" aria-pressed="${areaId===a.id}">${a.id==='all'?'':a.id+' · '}${esc(a.name)}</button>`).join('');
 $('area-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>changeArea(b.dataset.area));
 if(focusHost&&focusArea)$(focusHost).querySelector(`[data-area="${focusArea}"]`)?.focus({preventScroll:true});
 $('house-button').classList.toggle('on',areaId==='all');$('house-button').setAttribute('aria-pressed',String(areaId==='all'));
}
function render(){
 renderAreas();const current=area();const n=stats(state,areaId==='all'?null:areaId);
 $('area-code').textContent=areaId==='all'?'KUĆA / 02':areaId;$('area-name').textContent=current?.name||'Pregled kuće';
 $('area-subtitle').textContent=current?`${n.stacks} stupaca · ${n.occupied} guma`:'Tri prostora';
 $('stat-tyres').textContent=n.occupied;$('stat-vacant').textContent=n.vacant;
 $('geometry-note').textContent=areaId==='all'?'Razdvojene etaže · visine su okvirne':areaId==='2.2'?'Pristup i visina platforme nisu izmjereni':'Okviran tlocrt · visine nisu izmjerene';
 viewer?.setData(state,areaId);viewer?.setSelection(selectedId);renderInspector();renderLocation();if(viewMode==='plan')renderPlan();
}
function selectStack(id,focus=false){if(placing)endPlacement();const stack=state.stacks.find(s=>s.id===id);if(!stack)return;
 if(areaId!==stack.areaId){areaId=stack.areaId;storeView();}selectedId=id;render();if(focus)viewer?.focusStack(id);hideSearch();if(focus&&!tour?.active)$('inspector').focus();tour?.notify('found');
}
function renderInspectorBase(){
 const stack=selectedStack();const inspector=$('inspector');if(!stack||placing){inspector.hidden=true;return;}inspector.hidden=false;
 const tyres=stack.tireIds.map(tyreById).filter(Boolean);const occupied=tyres.length;
 const sameStack=inspector.dataset.stackId===stack.id;
 const editOpen=sameStack&&Boolean($('stack-tools')?.open);
 const openTyre=sameStack?inspector.querySelector('[data-tyre][aria-expanded="true"]')?.dataset.tyre:null;
 const qrOpen=sameStack&&Boolean($('tyre-qr')?.open);
 const focusId=sameStack&&inspector.contains(document.activeElement)?document.activeElement.id:null;
 inspector.dataset.stackId=stack.id;
 const liveBanner=livePin&&livePin.stackId===stack.id?`<div class="live-pin"><b>${esc(livePin.text)}</b></div>`:'';
 inspector.innerHTML=`${liveBanner}<div class="inspector-top"><div><h3>${esc(stack.id)}</h3><p class="sub">${esc(AREAS.find(a=>a.id===stack.areaId)?.name)}</p></div><button id="close-inspector" class="icon-button" aria-label="Zatvori detalje stupca">${icon('close',17)}</button></div>
 <div class="stack-occupancy"><div class="stack-meter" aria-hidden="true">${Array.from({length:stack.capacity},(_,i)=>`<i class="${i<occupied?'filled':''}"></i>`).join('')}</div><span><b>${occupied}/${stack.capacity}</b> mjesta</span></div>
 <div class="tyres">${tyres.map((t,i)=>`<button class="tyre-row" data-tyre="${esc(t.id)}" aria-expanded="false"><span class="tyre-dot" style="border-color:${/^#[a-f0-9]{6}$/i.test(t.color)?t.color:'#343c40'}"></span><span class="tyre-text"><b>${esc(customerLabel(t.customer))}</b><small>${esc(t.plate)}</small></span><em aria-label="Položaj ${i+1}">${i+1}</em><span class="tyre-chevron" aria-hidden="true">⌄</span></button>`).join('')||'<p class="empty-stack">Stupac je prazan.</p>'}</div>
 <div class="inspector-actions"><button id="add-tyre" class="button primary" ${occupied>=stack.capacity?'disabled':''}>${icon('plus',15)}Dodaj gumu</button><button id="focus-stack" class="button quiet">Približi</button></div>
 <details id="stack-tools" class="compact-details" ${editOpen?'open':''}><summary>Uredi stupac</summary><div class="disclosure-body"><div class="secondary-actions"><button id="move-stack" class="button quiet">Premjesti stupac</button><button id="remove-top" class="button quiet danger" ${occupied===0?'disabled':''}>Ukloni gornju gumu</button></div><label class="capacity-field">Kapacitet<input type="number" id="capacity-input" min="1" max="16" value="${stack.capacity}" aria-label="Kapacitet stupca"></label><p class="inspector-note">Položaj ${stack.x.toFixed(2)}, ${stack.z.toFixed(2)} · okvirne jedinice. Visina nije potvrđena.</p></div></details>`;
 $('close-inspector').onclick=()=>{selectedId=null;render();$('search').focus();};$('add-tyre').onclick=showAddTyre;$('move-stack').onclick=()=>beginPlacement('move');$('focus-stack').onclick=()=>viewer?.focusStack(stack.id);$('remove-top').onclick=()=>showRemoveTyre(stack.tireIds.at(-1));
 $('capacity-input').onchange=async e=>{const value=Number(e.target.value);if(!await commit(s=>setCapacity(s,stack.id,value),'Kapacitet je spremljen'))e.target.value=stack.capacity;};
 inspector.querySelectorAll('[data-tyre]').forEach(b=>b.onclick=()=>showTyre(b.dataset.tyre,true));
 if(openTyre){showTyre(openTyre);if($('tyre-qr'))$('tyre-qr').open=qrOpen;}
 if(focusId&&canFocus($(focusId)))$(focusId).focus({preventScroll:true});
}
function beginPlacement(type='place'){
 if(areaId==='all')changeArea('2.3');const stack=selectedStack();if(type==='move'&&!stack)return;
 placing={type,stackId:stack?.id,point:null,capacity:type==='move'?stack.capacity:8};viewer?.setMode(type);viewer?.setPlacementPreview(null);renderInspector();renderLocation();renderPlacement();
 toast(type==='move'?'Odaberite novi položaj. Možete promijeniti skladište prije spremanja.':'Dodirnite slobodno mjesto na podu.');
}
function endPlacement(){placing=null;viewer?.setMode('browse');viewer?.setPlacementPreview(null);$('placement-card').hidden=true;renderInspector();renderLocation();renderPlanPreview();}
function floorPick(point){if(!placing||areaId==='all')return;placing.point={x:Math.round(point.x*100)/100,z:Math.round(point.z*100)/100};renderPlacement();}
function renderPlacement(){if(!placing)return;const p=placing.point;const card=$('placement-card');card.hidden=false;$('placement-title').textContent=placing.type==='move'?'Premjesti stupac':'Dodaj stupac';$('place-capacity').value=placing.capacity;$('place-capacity').disabled=placing.type==='move';
 if(p){$('place-x').value=p.x;$('place-z').value=p.z;const valid=canPlace(state,areaId,p.x,p.z,.27,placing.type==='move'?placing.stackId:null);card.classList.toggle('invalid',!valid.valid);$('placement-hint').textContent=valid.valid?'Slobodan pod. Spremite novi položaj.':valid.reason;$('confirm-placement').disabled=!valid.valid;$('confirm-placement').textContent=placing.type==='move'?'Spremi položaj':'Dodaj ovdje';viewer?.setPlacementPreview({...p,areaId,valid:valid.valid,radius:.27});}
 else{card.classList.remove('invalid');$('placement-hint').textContent='Dodirnite pod ili unesite položaj.';$('confirm-placement').disabled=true;$('confirm-placement').textContent='Odaberi položaj';}
 renderPlanPreview();
}
$('place-button').onclick=()=>beginPlacement();$('cancel-placement').onclick=endPlacement;$('place-capacity').onchange=e=>{if(placing)placing.capacity=Number(e.target.value);};
for(const id of ['place-x','place-z'])$(id).onchange=()=>{if(placing)floorPick({x:Number($('place-x').value),z:Number($('place-z').value)});};
$('confirm-placement').onclick=async()=>{if(!placing?.point)return;const draft={...placing,areaId};let newId;
 const ok=await commit(s=>{const n=draft.type==='move'?moveStack(s,draft.stackId,{areaId:draft.areaId,...draft.point}):createStack(s,{areaId:draft.areaId,...draft.point,capacity:draft.capacity});newId=draft.type==='move'?draft.stackId:n.stacks.at(-1).id;return n;},draft.type==='move'?'Položaj je spremljen':'Stupac je dodan');
 if(ok){endPlacement();selectStack(newId);}
};

function renderPlan(){
 const mount=$('plan-view');if(areaId==='all'){mount.innerHTML=`<div class="plan-house-message"><p>Odaberite skladište za prikaz tlocrta.</p>${AREAS.map(a=>`<button class="button quiet" data-plan-area="${a.id}">${a.id} · ${esc(a.name)}</button>`).join('')}</div>`;mount.querySelectorAll('[data-plan-area]').forEach(b=>b.onclick=()=>changeArea(b.dataset.planArea));return;}
 const a=area();const rect=r=>`x="${r.x-r.w/2}" y="${r.z-r.d/2}" width="${r.w}" height="${r.d}"`;
 mount.innerHTML=`<svg viewBox="-5.7 -7.7 11.4 15.4" role="group" aria-label="${esc(a.name)} — tlocrt"><defs><pattern id="planks" width=".36" height="2" patternUnits="userSpaceOnUse"><rect width=".36" height="2" fill="#e9dccb"/><path d="M0 0v2" stroke="#d5c4ab" stroke-width=".012"/></pattern></defs><rect x="-5" y="-7" width="10" height="14" fill="none" stroke="#d1d4d6" stroke-width=".025" stroke-dasharray=".12 .14"/>${a.voidRects.map(r=>`<rect ${rect(r)} fill="#dce2e6" fill-opacity=".6"/>`).join('')}${a.floorRects.map(r=>`<rect ${rect(r)} fill="${areaId==='2.1'?'#e3e2dd':'url(#planks)'}" stroke="#bcb6ab" stroke-width=".025"/>`).join('')}${a.stair?`<g><rect ${rect(a.stair)} fill="#aeb6bc" stroke="#7b8791" stroke-width=".02"/>${Array.from({length:12},(_,i)=>`<path d="M${a.stair.x-a.stair.w/2} ${a.stair.z-a.stair.d/2+i*a.stair.d/12}h${a.stair.w}" stroke="#e2e7eb" stroke-width=".03"/>`).join('')}</g>`:''}${state.stacks.filter(s=>s.areaId===areaId).map(s=>`<g class="plan-stack" role="button" tabindex="0" data-plan-stack="${s.id}" aria-label="${s.id}, ${s.tireIds.length} od ${s.capacity} guma"><circle cx="${s.x}" cy="${s.z}" r="${s.radius+.045}" fill="${s.id===selectedId?'#f0c052':'#252e34'}" stroke="${s.id===selectedId?'#f0c052':'#3e474c'}" stroke-width=".025"/><circle cx="${s.x}" cy="${s.z}" r=".13" fill="#dddcd6"/><text x="${s.x}" y="${s.z+.055}" text-anchor="middle" fill="#303c45" font-family="Inter,sans-serif" font-size=".14">${s.tireIds.length}</text></g>`).join('')}<text x="0" y="-7.3" text-anchor="middle" fill="#87919c" font-size=".2" font-family="Inter,sans-serif">SJEVER ↑</text></svg>`;
 mount.querySelectorAll('[data-plan-stack]').forEach(el=>{el.onclick=e=>{if(!placing){e.stopPropagation();selectStack(el.dataset.planStack);}};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectStack(el.dataset.planStack,true);}};});
 mount.querySelector('svg').onclick=e=>{if(!placing)return;const svg=e.currentTarget;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const local=pt.matrixTransform(svg.getScreenCTM().inverse());floorPick({x:local.x,z:local.y});};
 renderPlanPreview();
}
function renderPlanPreview(){
 const svg=$('plan-view').querySelector('svg');if(!svg)return;svg.querySelector('#plan-preview')?.remove();if(!placing?.point)return;
 const p=placing.point,valid=canPlace(state,areaId,p.x,p.z,.27,placing.type==='move'?placing.stackId:null);
 const marker=document.createElementNS('http://www.w3.org/2000/svg','circle');
 for(const [key,value] of Object.entries({id:'plan-preview',cx:p.x,cy:p.z,r:.29,fill:valid.valid?'#328471':'#ff4e1b','fill-opacity':.28,stroke:valid.valid?'#328471':'#ff4e1b','stroke-width':.07,'pointer-events':'none'}))marker.setAttribute(key,String(value));svg.append(marker);
}
function setView(mode){viewMode=mode;$('plan-view').hidden=mode!=='plan';$('scene').hidden=mode==='plan';$('view-plan').classList.toggle('active',mode==='plan');$('view-3d').classList.toggle('active',mode==='3d');$('view-plan').setAttribute('aria-pressed',String(mode==='plan'));$('view-3d').setAttribute('aria-pressed',String(mode==='3d'));$('camera-reset').disabled=mode==='plan';$('zoom-in').disabled=mode==='plan';$('zoom-out').disabled=mode==='plan';if(mode==='plan'){renderPlan();$('scene-loading').hidden=true;}else{viewer?.resize();if(!viewReady)$('scene-loading').hidden=false;}}
$('view-plan').onclick=()=>setView('plan');$('view-3d').onclick=()=>setView('3d');$('zoom-in').onclick=()=>viewer?.zoom(1);$('zoom-out').onclick=()=>viewer?.zoom(-1);$('camera-reset').onclick=()=>viewer?.reset();$('house-button').onclick=()=>changeArea('all');

function hideSearch(){ $('search-results').hidden=true; $('search').setAttribute('aria-expanded','false'); }
function search(query){
 const box=$('search-results');if(!query.trim()){hideSearch();return;}
 const matches=searchLocations(state,query);box.hidden=false;$('search').setAttribute('aria-expanded','true');
 box.innerHTML=matches.length?`<p class="result-count" role="status">Pronađeno stupaca: ${matches.length}${matches.length>12?' · prikazano prvih 12':''}</p>`+matches.slice(0,12).map(r=>`<button class="result" data-result="${r.stack.id}"><span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></span><span class="result-location">${esc(r.area?.name)}<br>${esc(r.stack.id)} ↗</span></button>`).join(''):'<div class="no-results" role="status">Nema rezultata. Pokušajte s imenom, registracijom ili oznakom.<br><button id="clear-search">Očisti pretragu</button></div>';
 box.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>selectStack(b.dataset.result,true));
 $('clear-search')?.addEventListener('click',()=>{$('search').value='';hideSearch();$('search').focus();});
}
$('search').oninput=e=>search(e.target.value);
$('search').onkeydown=e=>{
 const results=[...$('search-results').querySelectorAll('[data-result]')];
 if(e.key==='ArrowDown'&&results.length){e.preventDefault();results[0].focus();}
 if(e.key==='Enter'){e.preventDefault();const found=searchLocations(state,e.target.value);if(found.length===1)selectStack(found[0].stack.id,true);else results[0]?.focus();}
 if(e.key==='Escape')hideSearch();
};
$('search-results').onkeydown=e=>{
 const buttons=[...$('search-results').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
 if(e.key==='Escape'){hideSearch();$('search').focus();}
};
listen(document,'pointerdown',e=>{if(!e.target.closest('.search-wrap'))hideSearch();if(!e.target.closest('#app-menu')&&!e.target.closest('#menu-button')){$('app-menu').hidden=true;$('menu-button').setAttribute('aria-expanded','false');}});
listen(document,'keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('search').focus();}if(e.key==='Escape'&&!$('dialog').open&&!tour?.active){endPlacement();hideSearch();closeSidebar();closeMenu();}if(placing&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const p=placing.point||{x:0,z:2};floorPick({x:p.x+(e.key==='ArrowRight'?0.1:e.key==='ArrowLeft'?-0.1:0),z:p.z+(e.key==='ArrowDown'?0.1:e.key==='ArrowUp'?-0.1:0)});}});

let dialogReturnFocus=null;
function canFocus(element){return element?.isConnected&&!element.closest('[hidden],[inert]')&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden';}
function openDialog(title,body){
 if(!$('dialog').open)dialogReturnFocus=document.activeElement;
 closeMenu();stopScanner();$('dialog-content').innerHTML=`<div class="dialog-inner"><div class="dialog-top"><h3 id="dialog-title" tabindex="-1">${title}</h3><button id="close-dialog" class="icon-button" aria-label="Zatvori prozor">×</button></div>${body}</div>`;
 $('close-dialog').onclick=closeDialog;if(!$('dialog').open)$('dialog').showModal();$('dialog-title').focus({preventScroll:true});
}
function closeDialog(){stopScanner();$('dialog').close();}
$('dialog').addEventListener('close',()=>{
 if(disposed||!isActive()||$('dialog').open)return;stopScanner();
 const focused=document.activeElement;
 if(focused!==document.body&&canFocus(focused)&&!$('dialog').contains(focused))return;
 const target=canFocus(dialogReturnFocus)?dialogReturnFocus:canFocus($('inspector'))?$('inspector'):$('menu-button');target.focus({preventScroll:true});
});
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
function showAddTyre(){const s=selectedStack();if(!s)return;const t=tyreById(s.tireIds.at(-1));openDialog('Dodaj probnu gumu',`<p class="dialog-intro">Dodajte gumu u <b>${esc(s.id)}</b>. Sprema se samo probni zapis.</p><form id="add-form"><label class="dialog-field">Ime kupca<input id="new-customer" required maxlength="60" value="${esc((t?.customer||'Primjer Novi kupac').replace(/^(Demo|Primjer) /,''))}"></label><label class="dialog-field">Probna registracija<input id="new-plate" required maxlength="20" value="${esc(t?.plate||'PROBNO-NOVO')}"></label><label class="dialog-field">Dimenzija gume<input id="new-size" required maxlength="35" value="${esc(t?.size||'205/55 R16')}"></label><div class="dialog-actions"><button class="button primary" type="submit">Dodaj u stupac</button></div></form>`);$('add-form').onsubmit=async e=>{e.preventDefault();const name='Primjer '+$('new-customer').value.trim().replace(/^(Demo|Primjer) /,'');const plate=$('new-plate').value.trim();const match=state.tires.find(x=>x.customer===name&&x.plate===plate);const details={customer:name,plate,size:$('new-size').value.trim(),...(match?{setId:match.setId,color:match.color,brand:match.brand}:{})};if(await commit(data=>addTire(data,s.id,details),'Probna guma je dodana'))closeDialog();};}
function showRemoveTyre(id){const s=selectedStack(),t=tyreById(id);if(!s||!t)return;openDialog('Ukloniti probnu gumu?',`<p class="dialog-intro">${esc(t.customer)} · ${esc(t.plate)}<br>Guma će biti uklonjena iz stupca ${esc(s.id)}. Ostale gume zadržavaju svoje oznake.</p><div class="dialog-actions"><button id="keep-tyre" class="button quiet">Zadrži gumu</button><button id="confirm-remove" class="button primary">Ukloni gumu</button></div>`);$('keep-tyre').onclick=closeDialog;$('confirm-remove').onclick=async()=>{if(await commit(data=>removeTire(data,s.id,id),'Guma je uklonjena'))closeDialog();};}
function renderInspector(){renderInspectorBase();renderFsPanel();}
// ---- Fullscreen 3D -------------------------------------------------------
// Entering 3D takes the whole screen (Fullscreen API, fixed full-viewport
// fallback). Phones try a landscape lock; where that is refused (iOS) a
// portrait-only "rotate" hint is shown instead.
let fsSetId=null;
const isFs=()=>document.documentElement.classList.contains('stage-fs');
function enterFs(){
 if(isFs())return;const stage=$('stage');
 document.documentElement.classList.add('stage-fs');stage.classList.add('is-fs');
 const req=stage.requestFullscreen||stage.webkitRequestFullscreen;
 const done=()=>{try{const o=screen.orientation;if(o&&o.lock)o.lock('landscape').then(()=>document.documentElement.classList.remove('fs-need-rotate')).catch(()=>document.documentElement.classList.add('fs-need-rotate'));else document.documentElement.classList.add('fs-need-rotate');}catch{document.documentElement.classList.add('fs-need-rotate');}};
 try{const r=req&&req.call(stage,{navigationUI:'hide'});if(r&&r.then)r.then(done,done);else done();}catch{done();}
 if(viewMode!=='3d')setView('3d');setTimeout(()=>viewer?.resize(),60);renderFsPanel();
}
function exitFs(){
 if(!isFs())return;document.documentElement.classList.remove('stage-fs','fs-need-rotate');$('stage').classList.remove('is-fs');
 try{screen.orientation?.unlock?.();}catch{}
 if(document.fullscreenElement||document.webkitFullscreenElement){(document.exitFullscreen||document.webkitExitFullscreen).call(document)?.catch?.(()=>{});}
 setTimeout(()=>viewer?.resize(),60);renderFsPanel();
}
listen(document,'fullscreenchange',()=>{if(!document.fullscreenElement&&isFs())exitFs();});
listen(document,'keydown',e=>{if(e.key==='Escape'&&isFs())exitFs();});
// Only whitelisted, buyer-safe fields are ever shown here. Entry price,
// internal cost and supplier never reach this panel.
const SAFE_FIELDS=[['setId','Komplet'],['customer','Kupac'],['plate','Registracija'],['brand','Marka'],['size','Dimenzija'],['code','Oznaka']];
function renderFsPanel(){
 const panel=$('fs-panel');if(!panel)return;const stack=selectedStack();
 if(!isFs()||!stack||placing){panel.hidden=true;return;}
 const tyres=stack.tireIds.map(tyreById).filter(Boolean);
 if(!fsSetId||!tyres.some(t=>t.setId===fsSetId))fsSetId=tyres.at(-1)?.setId||null;
 const pick=tyres.find(t=>t.setId===fsSetId);
 const where=id=>{const st=state.stacks.find(x=>x.tireIds.includes(id));return st?`${st.areaId} · ${st.id}`:'—';};
 let body='';
 if(!pick){body='<p class="fs-empty">Stupac je prazan.</p>';}
 else{
  const mine=state.tires.filter(t=>t.setId===pick.setId);
  const others=[...new Map(state.tires.filter(t=>t.customer===pick.customer&&t.setId!==pick.setId).map(t=>[t.setId,t])).values()];
  body=`<p class="eyebrow">Odabrani komplet</p><h3>${esc(customerLabel(pick.customer))}</h3><p class="sub">${esc(pick.plate)} · ${esc(pick.size)} · ${mine.length} gum${mine.length===1?'a':'e'}</p>
  <p class="fs-where">${esc(where(pick.id))}</p>
  <p class="eyebrow">Ostali kompleti kupca</p>${others.length?`<ul class="fs-others">${others.map(t=>`<li><button type="button" data-goto="${esc(t.id)}"><b>${esc(t.setId)}</b><span>${esc(where(t.id))}</span></button></li>`).join('')}</ul>`:'<p class="fs-empty">Nema drugih kompleta.</p>'}
  <details class="fs-more"><summary>Svi podaci stupca</summary><dl>${SAFE_FIELDS.map(([k,l])=>`<dt>${l}</dt><dd>${esc(pick[k]??'—')}</dd>`).join('')}<dt>Stupac</dt><dd>${esc(stack.id)}</dd><dt>Prostor</dt><dd>${esc(AREAS.find(a=>a.id===stack.areaId)?.name)}</dd><dt>Popunjenost</dt><dd>${tyres.length}/${stack.capacity}</dd><dt>Položaji kompleta</dt><dd>${tyres.map((t,i)=>t.setId===pick.setId?i+1:null).filter(Boolean).join(', ')}</dd></dl></details>`;
 }
 panel.hidden=false;
 const collapsed=panel.classList.contains('collapsed');
 panel.innerHTML=`<div class="fs-head"><b>${esc(stack.id)}</b><button type="button" class="fs-collapse" aria-expanded="${!collapsed}" aria-label="${collapsed?'Proširi':'Sažmi'} detalje">${collapsed?'›':'‹'}</button><button type="button" class="fs-close" aria-label="Zatvori detalje">×</button></div><div class="fs-body">${body}</div>`;
 panel.querySelector('.fs-collapse').onclick=()=>{panel.classList.toggle('collapsed');renderFsPanel();};
 panel.querySelector('.fs-close').onclick=()=>{selectedId=null;render();};
 panel.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{const t=tyreById(b.dataset.goto);const st=state.stacks.find(x=>x.tireIds.includes(t.id));if(st){fsSetId=t.setId;selectStack(st.id,true);}});
}
function showTyre(id,toggle=false){const t=tyreById(id);const row=[...$('inspector').querySelectorAll('[data-tyre]')].find(b=>b.dataset.tyre===id);if(!t||!row)return;
 const wasOpen=row.getAttribute('aria-expanded')==='true';
 $('tyre-details')?.remove();
 $('inspector').querySelectorAll('[data-tyre]').forEach(b=>{b.setAttribute('aria-expanded','false');b.removeAttribute('aria-controls');});
 if(wasOpen&&toggle){row.focus({preventScroll:true});return;}
 row.setAttribute('aria-expanded','true');row.setAttribute('aria-controls','tyre-details');
 const details=document.createElement('section');details.id='tyre-details';details.className='tyre-details';details.setAttribute('aria-label','Detalji odabrane gume');
 row.after(details);
 details.innerHTML=`<div class="inspector-top"><h4>${esc(t.size)}</h4><button id="close-tyre-details" class="icon-button" aria-label="Zatvori detalje gume">×</button></div><p class="tyre-brand">${esc(t.brand)}</p><details id="tyre-qr" class="compact-details"><summary>QR oznaka</summary><div class="code-label disclosure-body"><div id="tyre-qr-image"></div><strong>${esc(t.code)}</strong><p>Probna oznaka · samo ovaj prikaz</p></div></details><div class="dialog-actions"><button id="copy-code" class="button quiet">Kopiraj kod</button><button id="remove-label-tyre" class="button quiet danger">Ukloni gumu</button></div>`;
 const qrImage=$('tyre-qr-image');
 $('tyre-qr').ontoggle=e=>{if(disposed||!e.currentTarget.isConnected||!e.currentTarget.open||qrImage.childNodes.length)return;const payload=location.origin+location.pathname+'#tyre='+encodeURIComponent(t.code);try{const qr=window.qrcode(0,'M');qr.addData(payload);qr.make();qrImage.innerHTML=qr.createSvgTag({cellSize:5,margin:20,scalable:true});}catch{qrImage.textContent='QR oznaka trenutačno nije dostupna.';}};
 $('close-tyre-details').onclick=()=>{details.remove();row.setAttribute('aria-expanded','false');row.removeAttribute('aria-controls');row.focus({preventScroll:true});};
 $('copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(t.code);toast('Kod gume je kopiran');}catch{toast(t.code);}};$('remove-label-tyre').onclick=()=>showRemoveTyre(id);
}
function showList(){const stacks=state.stacks.filter(s=>areaId==='all'||s.areaId===areaId);openDialog('Popis stupaca',`<p class="dialog-intro">Odaberite stupac za detalje. Popis radi i bez 3D prikaza.</p><div class="stack-list">${stacks.map(s=>`<button class="result" data-list-stack="${s.id}"><span><b>${esc(s.id)}</b><small>Zauzeto ${s.tireIds.length} od ${s.capacity} mjesta</small></span><span class="result-location">Otvori ↗</span></button>`).join('')}</div>`);$('dialog-content').querySelectorAll('[data-list-stack]').forEach(b=>b.onclick=()=>{closeDialog();selectStack(b.dataset.listStack,true);});}
$('list-button').onclick=showList;

const CHECKS=[['geometry','Pod potkrovlja','Bočni otvori završavaju na sredini. Ispred stubišta nalazi se pod.'],['navigate','Tri skladišta','Otvorite sva skladišta, približite stupac i vratite se na pregled.'],['search','Pronađite gumu','Pretražite ime, registraciju ili oznaku stupca.'],['place','Dodaj stupac','Dodajte stupac na pod. Provjerite da otvori ostaju slobodni.'],['capacity','Kapacitet','Dodajte gumu i provjerite ograničenje kapaciteta.'],['move','Premještanje','Premjestite stupac na slobodan pod ili u drugo skladište.'],['qr','QR oznaka','Kopirajte kod gume i pronađite ga u skeneru.'],['persist','Spremanje','Osvježite stranicu i provjerite promjene.'],['fallback','Tlocrt i popis','Isprobajte tlocrt i popis stupaca.']];
function showGuide(){openDialog('Provjera prikaza',`<p class="dialog-intro">Označite što ste provjerili. Svi zapisi su probni.</p><div>${CHECKS.map(([id,title,description])=>`<label class="test-item"><input type="checkbox" data-check="${id}" ${checkState[id]?'checked':''}><span><b>${title}</b><small>${description}</small></span></label>`).join('')}</div><label class="dialog-field">Što treba popraviti?<textarea id="test-notes" rows="3" maxlength="4000" placeholder="Npr. desni otvor počinje predaleko…">${esc(checkState.notes||'')}</textarea></label><div class="status-note">Promjene ostaju na ovom uređaju. Stvarni podaci nisu povezani, a mjere nisu potvrđene.</div><div class="dialog-actions"><button id="guide-attic" class="button quiet">Otvori potkrovlje</button><button id="export-guide" class="button primary">Preuzmi probne podatke</button></div>`);$('dialog-content').querySelectorAll('[data-check]').forEach(i=>i.onchange=()=>{checkState[i.dataset.check]=i.checked;try{localStorage.setItem(CHECK_KEY,JSON.stringify(checkState));}catch{}});$('test-notes').oninput=e=>{checkState.notes=e.target.value;try{localStorage.setItem(CHECK_KEY,JSON.stringify(checkState));}catch{}};$('guide-attic').onclick=()=>{closeDialog();changeArea('2.3');};$('export-guide').onclick=exportSession;}
$('test-status-button').onclick=()=>{closeMenu();showGuide();};
function download(name,data,type){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportSession(){closeMenu();const output={module:'ASC house spatial test',build:'0.2.0',exportedAt:new Date().toISOString(),dataMode:'fictional-local-demo',layoutVersion:LAYOUT_VERSION,measurements:'unverified',areaId,checks:checkState,feedback:checkState.notes||'',validation:validateState(state),state};download('ASC_probni_podaci.json',JSON.stringify(output,null,2),'application/json');toast('Probni podaci su preuzeti');}
$('export-button').onclick=exportSession;$('menu-button').onclick=()=>{$('app-menu').hidden=!$('app-menu').hidden;$('menu-button').setAttribute('aria-expanded',String(!$('app-menu').hidden));};
$('capture-button').onclick=()=>{closeMenu();if(viewMode==='plan'||!viewer){toast('Za sliku otvorite 3D prikaz. Cijeli raspored možete preuzeti kroz probne podatke.');return;}try{viewer.getCanvas().toBlob(blob=>{if(blob){download('ASC_prikaz_skladista.png',blob,'image/png');toast('Slika je spremljena');}else toast('Sliku trenutačno nije moguće spremiti.');});}catch{toast('Preglednik ne može spremiti ovu sliku.');}};
$('reset-button').onclick=()=>{
 openDialog('Vratiti početni raspored?',`<p class="dialog-intro">Vratite početne gume i 133 stupca. Promjene s ovog uređaja bit će uklonjene. Prije vraćanja možete preuzeti izvorni zapis.</p><div class="dialog-actions"><button id="download-backup" class="button quiet">Preuzmi izvorni zapis</button><button id="cancel-reset" class="button quiet">Zadrži promjene</button><button id="confirm-reset" class="button primary">Vrati početno stanje</button></div>`);
 $('download-backup').onclick=()=>{try{const raw=localStorage.getItem(KEY);if(raw===null){exportSession();return;}download('ASC_izvorni_zapis.json',raw,'application/json');toast('Izvorni zapis je preuzet.');}catch{toast('Izvorni zapis nije dostupan.');}};
 $('cancel-reset').onclick=closeDialog;
 $('confirm-reset').onclick=async()=>{const ok=await commit(current=>({...seedState(),revision:current.revision+1}),'Početni raspored je vraćen',{recover:true});if(ok){selectedId=null;endPlacement();closeDialog();render();}};
};

function normalizeCode(raw){try{const u=new URL(raw);const hash=new URLSearchParams(u.hash.slice(1));return hash.get('tyre')||raw;}catch{return raw.trim();}}
function resolveCode(raw){const code=normalizeCode(raw).trim();const tyre=state.tires.find(t=>t.code===code||t.id===code);const stack=tyre&&state.stacks.find(s=>s.tireIds.includes(tyre.id));if(!stack){toast('Ova oznaka nije u probnim podacima. Stvarne ASC oznake još nisu povezane.');return false;}closeDialog();selectStack(stack.id,true);toast('Guma je pronađena');return true;}
function stopScanner(){const video=$('scan-video');if(video){video.pause();video.srcObject=null;video.hidden=true;}scannerGeneration++;scannerStarting=false;const start=$('start-camera');if(start)start.disabled=false;if(scannerFrame){cancelAnimationFrame(scannerFrame);scannerFrame=null;}if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}}
async function startScanner(){if(scannerStarting||scannerStream)return;const status=$('scan-status'),start=$('start-camera'),generation=++scannerGeneration;scannerStarting=true;if(start)start.disabled=true;try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera nije dostupna. Zalijepite kod ili odaberite fotografiju QR oznake.');const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(generation!==scannerGeneration||!$('dialog').open||!$('scan-video')){stream.getTracks().forEach(track=>track.stop());return;}scannerStream=stream;scannerStarting=false;const video=$('scan-video');video.hidden=false;video.srcObject=scannerStream;await video.play();if(generation!==scannerGeneration)return;status.textContent='Usmjerite kameru prema probnoj QR oznaci.';const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let last=0;function frame(now){if(generation!==scannerGeneration||!scannerStream||!$('dialog').open)return;if(now-last>180&&video.readyState>=2){last=now;const ratio=Math.min(1,720/video.videoWidth);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);ctx.drawImage(video,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);const result=window.jsQR?.(data.data,data.width,data.height,{inversionAttempts:'dontInvert'});if(result&&resolveCode(result.data))return;}scannerFrame=requestAnimationFrame(frame);}scannerFrame=requestAnimationFrame(frame);}catch(e){if(generation!==scannerGeneration)return;if(status)status.textContent=e.name==='NotAllowedError'?'Pristup kameri nije dopušten. Zalijepite kod ili odaberite fotografiju.':'Kamera nije dostupna. Zalijepite kod ili odaberite fotografiju.';stopScanner();}}
function showScan(){openDialog('Pronađi QR oznaku',`<p class="dialog-intro">Skenirajte probnu oznaku ili zalijepite kod.</p><video id="scan-video" class="scan-video" playsinline muted hidden></video><div id="scan-status" class="scan-status">Kamera se uključuje tek na vaš dodir.</div><div class="dialog-actions" style="justify-content:flex-start"><button id="start-camera" class="button quiet">Otvori kameru</button><label class="button quiet file-label">Odaberi fotografiju<input id="scan-photo" type="file" accept="image/*"></label></div><form id="scan-form"><label class="dialog-field">Probni kod ili poveznica<input id="scan-code" autocomplete="off" placeholder="ASC-DEMO-…" required></label><div class="dialog-actions"><button class="button primary" type="submit">Pronađi gumu</button></div></form>`);$('start-camera').onclick=startScanner;$('scan-form').onsubmit=e=>{e.preventDefault();resolveCode($('scan-code').value);};$('scan-photo').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;stopScanner();
 const generation=scannerGeneration,status=$('scan-status');
 const current=()=>generation===scannerGeneration&&$('dialog').open&&status?.isConnected;
 let bmp;
 try{
  bmp=await createImageBitmap(file);if(!current())return;
  const ratio=Math.min(1,1600/Math.max(bmp.width,bmp.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bmp.width*ratio);canvas.height=Math.round(bmp.height*ratio);
  const ctx=canvas.getContext('2d');ctx.drawImage(bmp,0,0,canvas.width,canvas.height);const im=ctx.getImageData(0,0,canvas.width,canvas.height),result=window.jsQR(im.data,im.width,im.height);
  if(result)resolveCode(result.data);else status.textContent='QR oznaka nije čitljiva. Pokušajte s jasnijom fotografijom ili kodom.';
 }catch{if(current())status.textContent='Slika nije čitljiva. Odaberite JPG ili PNG ili zalijepite kod.';}finally{bmp?.close();}
 };}

$('scan-button').onclick=showScan;
function handleVoice(text){const intent=parseCroatianIntent(text);if(intent.kind==='area'){changeArea(intent.value);toast(intent.value==='all'?'Otvoren pregled kuće.':'Otvoreno: '+area().name);return;}const query=intent.query;$('search').value=query;search(query);const found=searchLocations(state,query);if(found.length===1)selectStack(found[0].stack.id,true);else toast(found.length?'Odaberite odgovarajući stupac.':'Nema rezultata. Pokušajte upisati ime ili registraciju.');}
$('voice-button').onclick=()=>{if(recognition){recognition.stop();return;}const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){toast('Glas nije dostupan u ovom pregledniku. Upišite upit ili skenirajte oznaku.');$('search').focus();return;}try{recognition=new Recognition();recognition.lang='hr-HR';recognition.interimResults=false;recognition.continuous=false;recognition.onstart=()=>{$('voice-button').classList.add('listening');$('voice-button').setAttribute('aria-label','Zaustavi glasovnu pretragu');toast('Slušam. Izgovorite skladište, ime ili registraciju.');};recognition.onresult=e=>handleVoice(e.results[0][0].transcript);recognition.onerror=e=>toast(e.error==='not-allowed'?'Mikrofon nije dopušten. Upišite upit.':'Glas nije prepoznat. Pokušajte upisati upit.');recognition.onend=()=>{recognition=null;$('voice-button').classList.remove('listening');$('voice-button').setAttribute('aria-label','Glasovna pretraga');};recognition.start();}catch{recognition=null;toast('Glasovna pretraga nije dostupna.');}};
listen(window,'storage',e=>{if(e.key!==KEY||!e.newValue)return;try{const next=JSON.parse(e.newValue);if(validateState(next).valid&&next.revision>state.revision){state=next;if(selectedId&&!selectedStack())selectedId=null;render();if(placing)renderPlacement();toast('Primljene su promjene iz druge kartice.');}}catch{}});

listen(window,'hashchange',()=>{const code=new URLSearchParams(location.hash.slice(1)).get('tyre');if(code)resolveCode(code);});


function renderLocation(){
 const stack=selectedStack();$('location-area').textContent=area()?.name||'Svi prostori';
 $('location-stack').hidden=!stack;$('location-stack').textContent=stack?' / '+stack.id:'';
 $('found-location').hidden=!stack||Boolean(placing);
 if(stack){$('found-location').querySelector('b').textContent=stack.id;$('found-location-text').textContent=area().name;}
 $('back-overview').textContent=stack||areaId!=='all'?'Sva skladišta':'Pregled svih skladišta';
}
function closeMenu(){$('app-menu').hidden=true;$('menu-button').setAttribute('aria-expanded','false');}
const mobileNav=matchMedia('(max-width:1020px)');
let sidebarReturnFocus=null;
function syncSidebar(){const open=document.documentElement.classList.contains('side-open');$('sidebar').inert=mobileNav.matches&&!open;const expanded=!mobileNav.matches||open;$('open-sidebar').setAttribute('aria-expanded',String(expanded));$('asc-menu-button').setAttribute('aria-expanded',String(expanded));$('main-content').inert=mobileNav.matches&&open;}
function closeSidebar(){const wasOpen=document.documentElement.classList.contains('side-open');document.documentElement.classList.remove('side-open');syncSidebar();if(wasOpen){const target=canFocus(sidebarReturnFocus)?sidebarReturnFocus:$('asc-menu-button');target.focus({preventScroll:true});}}
function openSidebar(event){sidebarReturnFocus=event.currentTarget;closeMenu();document.documentElement.classList.add('side-open');syncSidebar();$('sidebar').querySelector('#asc-navigation a')?.focus({preventScroll:true});}
$('open-sidebar').onclick=openSidebar;$('asc-menu-button').onclick=openSidebar;
$('close-sidebar').onclick=closeSidebar;$('side-scrim').onclick=closeSidebar;
listen(mobileNav,'change',()=>{closeSidebar();});syncSidebar();
$('asc-navigation').addEventListener('click',e=>{const link=e.target.closest('a[href]');if(link&&link.getAttribute('aria-current')==='page'){e.preventDefault();closeSidebar();}});
$('sidebar').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeSidebar();}if(e.key==='Tab'&&mobileNav.matches&&document.documentElement.classList.contains('side-open')){const focusable=[...$('sidebar').querySelectorAll('button:not(:disabled),a[href]')].filter(el=>!el.closest('[inert],[hidden]')&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
$('back-overview').onclick=()=>{changeArea('all');$('search').value='';viewer?.reset();};
tour=createTour({isActive,getState:()=>state,navigate:changeArea,findExample:id=>{$('search').value=id;search(id);selectStack(id,true);},closeOverlays:()=>{closeDialog();closeMenu();closeSidebar();endPlacement();},onFinish:status=>{if(status==='completed')toast('Spremni ste. Upute su uvijek dostupne pod Pomoć.');}});
function showHelp(){closeSidebar();$('warehouse-help').open=true;$('warehouse-help').querySelector('summary').focus();}
for(const id of ['help-button','context-help'])$(id).onclick=showHelp;
for(const id of ['guide-button','help-tour'])$(id).onclick=()=>tour.start();


let scenePending=false,pausedDialog=false;
async function ensureScene(){
 if(disposed||!isActive()||viewer||scenePending)return;
 scenePending=true;
 try{
 try{
 const {createScene}=await import('./scene.js');
 if(!isActive()||disposed)return;
 $('fs-enter').onclick=enterFs;$('fs-exit').onclick=exitFs;$('fs-menu').onclick=e=>{exitFs();openSidebar(e);};
 listen($('scene'),'click',e=>{if(!isFs()&&viewMode==='3d'){e.stopPropagation();enterFs();}},true);
 viewer=createScene($('scene'),{onSelect:id=>selectStack(id),onLongPress:id=>{selectStack(id);beginPlacement('move');},onFloorPick:floorPick,onReady:()=>{viewReady=true;$('scene-loading').hidden=true;},onError:error=>{console.warn('Spatial renderer:',error);viewReady=false;$('scene-loading').hidden=true;setView('plan');$('view-3d').disabled=true;toast('3D nije dostupan. Tlocrt i popis i dalje rade.');}});
 if(viewer){viewer.setData(state,areaId);viewer.resize();viewReady=true;$('scene-loading').hidden=true;}
}catch(error){if(disposed||!isActive())return;console.warn('Spatial renderer could not load:',error);$('scene-loading').hidden=true;$('view-3d').disabled=true;setView('plan');toast('Prikazan je tlocrt jer 3D nije dostupan.');}
 }finally{scenePending=false;}
}
function stopVoice(){
 const current=recognition;recognition=null;
 if(current){current.onstart=null;current.onresult=null;current.onerror=null;current.onend=null;try{current.abort();}catch{}}
 $('voice-button').classList.remove('listening');$('voice-button').setAttribute('aria-label','Glasovna pretraga');
}
const runtime={
 pause(){stopScanner();const status=$('scan-status');if(status)status.textContent='Skeniranje je zaustavljeno. Otvorite kameru ili odaberite fotografiju.';stopVoice();tour?.pause();viewer?.pause();if($('dialog').open){pausedDialog=true;$('dialog').close();}},
 resume(){if(disposed||!isActive())return;tour?.resume();if(pausedDialog){pausedDialog=false;$('dialog').showModal();}if(viewer)viewer.resume();else void ensureScene();},
 dispose(){if(disposed)return;disposed=true;pausedDialog=false;if($('dialog').open)$('dialog').close();stopScanner();stopVoice();clearTimeout(toastTimer);tour?.dispose();for(const remove of listeners)remove();listeners.length=0;viewer?.dispose();viewer=null;}
};
registerRuntime(runtime);render();
async function highlightLiveQuery(){
 const params=new URLSearchParams(location.search);
 const setCode=params.get('set'), slot=params.get('slot');
 if(!setCode&&!slot)return;
 try{
  const db=await import('../../js/db.js');
  let row=null;
  if(setCode&&db.loadStorageSet)row=await db.loadStorageSet(setCode);
  else if(slot&&db.findLocationByQr)row=await db.findLocationByQr(slot);
  if(!row){toast('Živi komplet nije pronađen. Karta je i dalje probni prikaz.');return;}
  const pin=pinForSet(row,state.stacks);
  livePin={...pin,text:`${row.public_code||setCode||slot}${pin.where?' · '+pin.where:''}${pin.approx?' · približno na karti':''}`};
  if(pin.areaId&&AREAS.some(a=>a.id===pin.areaId))areaId=pin.areaId;
  if(pin.stackId&&state.stacks.some(s=>s.id===pin.stackId))selectedId=pin.stackId;
  render();
  if(selectedId)viewer?.focusStack(selectedId);
 }catch{toast('Živi položaj nije učitan. Karta je i dalje probni prikaz.');}
}
void ensureScene().then(()=>highlightLiveQuery());
const deepCode=new URLSearchParams(location.hash.slice(1)).get('tyre');if(deepCode)resolveCode(deepCode);
if(storageProblem){$('save-status').textContent='Potrebno je obnoviti probne podatke';toast('Spremljeni podaci nisu valjani. U dodatnim mogućnostima preuzmite izvorni zapis i vratite početni raspored.');}
if(!storageAvailable)$('save-status').textContent='Spremanje nije dostupno';

listen(document,'invalid',e=>{if(e.target.matches('input')){e.target.setCustomValidity(e.target.validity.valueMissing?'Ispunite ovo polje.':'Provjerite unesenu vrijednost.');}},true);
listen(document,'input',e=>{if(e.target.matches('input'))e.target.setCustomValidity('');});

return runtime;
}
