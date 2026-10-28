// Isolated architectural review. Synthetic fixtures are opt-in and never saved.
import {createScene} from '../app/warehouse-preview/scene.js';
import {SPACE_MANIFEST,hasBuildingFloor} from '../app/warehouse-preview/building.js';
import {syncAreas} from '../app/warehouse-preview/model.js';
import {projectLiveInventory} from '../app/warehouse-preview/live-inventory.js';

const $=id=>document.getElementById(id);
const spaces=SPACE_MANIFEST.filter(s=>['attic-parts','attic-racks'].includes(s.id));
const layout={version:1,revision:0,areas:[],stacks:[],tires:[],history:[]};
const locations=[],sets=[],bindings={};
let count=0;
for(const s of spaces){
 const id=`TEST-${s.id}`;bindings[id]=s.id;
 layout.areas.push({id,name:s.name,width:s.width,depth:s.depth,unit:'grid',floorRects:[{x:0,z:0,w:s.width,d:s.depth}],voidRects:[]});
 const option=document.createElement('option');option.value=id;option.textContent=s.name;$('space').append(option);
 const li=document.createElement('li');li.textContent=s.name;$('space-list').append(li);
 let n=0;
 for(let z=-s.depth/2+1;z<s.depth/2-1&&n<12;z+=1.6){
  for(let x=-s.width/2+1;x<s.width/2-1&&n<12;x+=1.7){
   if(!hasBuildingFloor(s.id,x,z,.42))continue;
   n++;count++;const rack=`R${n}`,stackId=`${id}-${rack}`,locationId=`test-location-${count}`;
   layout.stacks.push({id:stackId,areaId:id,rack,x,z,radius:.42,capacity:8,tireIds:[]});
   for(let owner=0;owner<2;owner++){
    const seatId=`${locationId}-${owner}`;
    locations.push({id:seatId,warehouse:'main',zone:id,rack,shelf:'1',slot:String(owner+1)});
    sets.push({id:`test-set-${count}-${owner}`,public_code:`PROBA-${count}-${owner}`,status:'in_storage',quantity:4,location_id:seatId,zone:id,rack,shelf:'1',slot:String(owner+1),customer:{full_name:owner?'Probni kupac B':'Probni kupac A'},vehicle:{plate:'PROBNI PODACI'}});
   }
  }
 }
}
let viewer=null,samples=false,cutaway=true;
function status(message){$('status').textContent=message;}
function update(){
 const state=samples?projectLiveInventory({layout,sets,locations}).state:{...layout,stacks:[],tires:[]};
 syncAreas(state);viewer?.setData(state,$('space').value);
 viewer?.setBuildingBindings(bindings);viewer?.setBuildingEnabled(true);viewer?.setCutaway(cutaway?'review':'closed');
 viewer?.setBuildingView($('space').value==='all'?'upper-assembly':bindings[$('space').value]);
 status(samples?'Sintetički probni setovi · bez poslovnih podataka. Dodirnite stupac za približavanje.':'Gornji sklop za provjeru · dimenzije su okvirne. Spoj s postojećom kućom nije potvrđen. Inventar nije učitan.');
}
try{
 viewer=createScene($('scene'),{onSelect:id=>{viewer.setSelection(id);viewer.focusStack(id);},onError:()=>{}});
 viewer.setBuildingBindings(bindings);viewer.setBuildingEnabled(true);update();
}catch(error){
 $('fallback').hidden=false;status('WebGL nije dostupan. Model i poslovni podaci nisu promijenjeni.');
 for(const id of ['cutaway','samples','reset','capture'])$(id).disabled=true;
}
$('space').onchange=update;
$('cutaway').onclick=()=>{cutaway=!cutaway;$('cutaway').setAttribute('aria-pressed',String(cutaway));viewer?.setCutaway(cutaway?'review':'closed');};
$('samples').onclick=()=>{samples=!samples;$('samples').setAttribute('aria-pressed',String(samples));$('focus-sample').hidden=!samples;update();};
$('focus-sample').onclick=()=>{const selected=sets.find(s=>$('space').value==='all'||s.zone===$('space').value);if(selected)viewer?.focusSet(selected.id);};
$('reset').onclick=()=>{viewer?.clearFocus();viewer?.reset();};
$('capture').onclick=()=>{const canvas=viewer?.getCanvas();if(!canvas)return;canvas.toBlob(blob=>{if(!blob){status('Sliku nije moguće spremiti.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ASC-prostorna-studija.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});};
window.addEventListener('pagehide',()=>viewer?.dispose(),{once:true});
