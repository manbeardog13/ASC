// Isolated architectural review: all rooms, synthetic opt-in inventory, no backend.
import {createScene} from '../app/warehouse-preview/scene.js';
import {SPACE_MANIFEST,mapAreaPoint,UPPER_SPACE_IDS} from '../app/warehouse-preview/building.js';
import {syncAreas} from '../app/warehouse-preview/model.js';
import {projectLiveInventory} from '../app/warehouse-preview/live-inventory.js';

const $=id=>document.getElementById(id);
const spaces=SPACE_MANIFEST.filter(s=>s.inventory);
const layout={version:1,revision:0,areas:[],stacks:[],tires:[],history:[]};
const locations=[],sets=[],bindings={};
const samplePoints={
 'house-ground':[[-4,-5],[-4,-2],[-4,1],[2,5]],
 'house-platform':[[-1,2],[1,2],[-1,4],[1,4]],
 'house-attic':[[-3,-4],[0,-4],[2,-4],[0,3]],
 'attic-parts':[[0,4],[2,4],[0,7],[2,7]],
 'attic-racks':[[0,-4],[1.8,-4],[3.6,8],[3.6,11]],
 'triangular-store':[[1,0],[0,2],[1.4,2]],
};
for(const s of spaces){
 const id=`TEST-${s.id}`;bindings[id]=s.id;
 const area={id,name:s.name,width:s.width,depth:s.depth,unit:'grid',floorRects:s.floorRects,voidRects:s.voidRects||[]};layout.areas.push(area);
 const option=document.createElement('option');option.value=id;option.textContent=s.name;$('space').append(option);
 const li=document.createElement('li');li.textContent=s.name;$('space-list').append(li);
 for(const [x,z]of samplePoints[s.id]||[]){
  if(!mapAreaPoint(s.id,area,x,z,.42))continue;
  const n=layout.stacks.filter(st=>st.areaId===id).length+1,rack=`R${String(n).padStart(2,'0')}`,stackId=`${id}-${rack}`;
  layout.stacks.push({id:stackId,areaId:id,rack,x,z,radius:.42,capacity:8,tireIds:[]});
  for(let owner=0;owner<2;owner++){
   const locationId=`${stackId}-${owner}`,public_code=`PROBA-${s.id}-${n}-${owner+1}`;
   locations.push({id:locationId,warehouse:'main',zone:id,rack,shelf:'1',slot:String(owner+1)});
   sets.push({id:locationId,public_code,status:'in_storage',quantity:4,location_id:locationId,zone:id,rack,shelf:'1',slot:String(owner+1),customer:{full_name:owner?'Probni kupac B':'Probni kupac A'},vehicle:{plate:'PROBNI PODACI'}});
  }
 }
}
for(const id of ['office','table-room']){
 const option=document.createElement('option');option.value=id;option.textContent=SPACE_MANIFEST.find(s=>s.id===id).name;$('space').append(option);
}
let viewer=null,samples=false,cutaway=true,top=false,failed=false,disposed=false;
const interactive=['space','cutaway','samples','focus-sample','reset','capture','presentation','plan','sample-set','sample-query','ambient','staff'];
function status(message){$('status').textContent=message;}
function selectedSpace(){return bindings[$('space').value]||$('space').value;}
function shownSpaceIds(){
 const selected=selectedSpace();
 if(selected==='all')return UPPER_SPACE_IDS;
 if(selected==='existing')return SPACE_MANIFEST.filter(s=>!UPPER_SPACE_IDS.includes(s.id)).map(s=>s.id);
 return [selected];
}
function eligibleSets(){const shown=shownSpaceIds();return sets.filter(s=>shown.includes(bindings[s.zone]));}
function refreshSetOptions(){
 const selected=$('sample-set').value,query=$('sample-query').value.trim().toLocaleLowerCase('hr');
 const matches=eligibleSets().filter(s=>[s.public_code,s.customer.full_name,s.rack].join(' ').toLocaleLowerCase('hr').includes(query));
 $('sample-set').replaceChildren();
 for(const set of matches){const opt=document.createElement('option');opt.value=set.id;opt.textContent=`${set.public_code} · ${set.rack} · 4 gume`;$('sample-set').append(opt);}
 if(matches.some(s=>s.id===selected))$('sample-set').value=selected;
 $('focus-sample').disabled=failed||!samples||!matches.length;$('sample-set').disabled=failed||!matches.length;
 $('sample-count').textContent=matches.length?`${matches.length} probnih setova · bez poslovnih podataka`:'Nema odgovarajućeg probnog seta.';
}
function summaryStatus(){
 const note=selectedSpace()==='all'?'Gornji sklop za provjeru · spoj s postojećom kućom nije potvrđen.':selectedSpace()==='existing'?'Postojeća kuća i prizemlje · gornji sklop prikazan je zasebno jer spoj nije potvrđen.':'Odabrani prostor za provjeru · dimenzije su okvirne.';
 status(samples?`Sintetički probni setovi · bez poslovnih podataka. ${note}`:`${note} Inventar nije učitan.`);
}
function clearSelection(){viewer?.clearFocus();summaryStatus();}
function update(){
 if(!viewer||failed)return;
 const ids=shownSpaceIds(),areas=layout.areas.filter(a=>ids.includes(bindings[a.id]));
 const partial={...layout,areas,stacks:layout.stacks.filter(s=>ids.includes(bindings[s.areaId]))};
 const state=samples?projectLiveInventory({layout:partial,sets:eligibleSets(),locations}).state:{...partial,stacks:[],tires:[]};
 syncAreas(state);viewer.clearFocus();viewer.setData(state,bindings[$('space').value]?$('space').value:'all');
 viewer.setBuildingBindings(bindings);viewer.setBuildingEnabled(true);viewer.setCutaway(cutaway?'review':'closed');
 viewer.setBuildingView(selectedSpace()==='all'?'upper-assembly':selectedSpace()==='existing'?'all':selectedSpace());
 viewer.setView(top?'top':'perspective');viewer.setPresentation?.($('presentation').value);
 refreshSetOptions();
 summaryStatus();
}
function fail(){
 failed=true;$('fallback').hidden=false;
 for(const id of interactive)$(id).disabled=true;
 if(viewer?.getCanvas())viewer.getCanvas().hidden=true;
 status('3D nije dostupan. Inventar i poslovni podaci nisu promijenjeni. Možete ponovno pokušati.');
}
function initialize(){
 if(disposed)return;
 viewer?.dispose();viewer=null;failed=false;$('fallback').hidden=true;
 for(const id of interactive)$(id).disabled=false;
 try{
  viewer=createScene($('scene'),{onRoomSelect:spaceId=>{const target=bindings[`TEST-${spaceId}`]?`TEST-${spaceId}`:spaceId;if([...$('space').options].some(option=>option.value===target)){$('space').value=target;update();}},onSelect:id=>{const stack=layout.stacks.find(s=>s.id===id);if(stack){const set=eligibleSets().find(s=>s.zone===stack.areaId&&s.rack===stack.rack);if(set){$('sample-query').value='';refreshSetOptions();$('sample-set').value=set.id;viewer.focusSet(set.id);}}},onError:fail});
  viewer.setAmbientEnabled($('ambient').checked);viewer.setStaffEnabled($('staff').checked);update();
 }catch(error){fail();}
}
$('space').onchange=update;
$('cutaway').onclick=()=>{cutaway=!cutaway;$('cutaway').setAttribute('aria-pressed',String(cutaway));viewer?.setCutaway(cutaway?'review':'closed');};
$('plan').onclick=()=>{top=!top;$('plan').setAttribute('aria-pressed',String(top));viewer?.setView(top?'top':'perspective');};
$('samples').onclick=()=>{samples=!samples;$('samples').setAttribute('aria-pressed',String(samples));$('sample-search').hidden=!samples;$('focus-sample').hidden=!samples;update();};
$('sample-query').oninput=()=>{clearSelection();refreshSetOptions();};
$('sample-set').onchange=clearSelection;
$('sample-search').onsubmit=event=>{event.preventDefault();if(!failed&&samples&&$('sample-set').value){const found=viewer?.focusSet($('sample-set').value);status(found?'Odabrani probni set: 4 gume označene zeleno. Ostale gume su prigušene.':'Ovaj probni set nema položaj u odabranom prikazu.');}};
$('presentation').onchange=()=>viewer?.setPresentation?.($('presentation').value);
$('ambient').onchange=()=>viewer?.setAmbientEnabled($('ambient').checked);
$('staff').onchange=()=>viewer?.setStaffEnabled($('staff').checked);
$('reset').onclick=()=>{top=false;$('plan').setAttribute('aria-pressed','false');viewer?.reset();summaryStatus();};
$('retry').onclick=initialize;
$('capture').onclick=()=>{
 const canvas=viewer?.getCanvas();if(!canvas||failed)return;
 try{canvas.toBlob(blob=>{if(disposed)return;if(!blob){status('Sliku nije moguće spremiti.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ASC-prostorna-studija.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}catch(error){status('Sliku nije moguće spremiti. Pokušajte ponovno.');}
};
window.addEventListener('pagehide',event=>{if(event.persisted)viewer?.pause();else{disposed=true;viewer?.dispose();}});
window.addEventListener('pageshow',event=>{if(event.persisted&&!failed)viewer?.resume();});
initialize();
