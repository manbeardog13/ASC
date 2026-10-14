import { mountAssistant } from '../assistant-surface.js';
import { matchScore, normalize } from '../agent-search.js';
import { AREAS, stats } from './model.js';
import { searchLocations, customerLabel } from './journey.js';

// The preview owns fictional, browser-local inventory. Its assistant must never
// resolve a demo identifier against live customers or silently save a mutation.
export function warehouseConversation(api) {
  const {getState,getArea,getSelected,isActive=()=>true}=api;
  const state=()=>getState();
  const selected=()=>state().stacks.find(s=>s.id===getSelected());
  const effect=fn=>(...args)=>{if(!isActive())throw new Error('Prikaz je zaustavljen.');return fn(...args);};
  const choose=effect(id=>api.selectStack(id,false));
  const stackActions=stack=>[
    {label:stack.id+' · Karta',run:()=>{choose(stack.id);document.getElementById('stage')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}},
    ...(stack.tireIds.length<stack.capacity?[{label:stack.id+' · Dodaj',run:effect(()=>{choose(stack.id);api.showAddTyre();})}]:[]),
    {label:stack.id+' · Premjesti',run:effect(()=>{choose(stack.id);api.beginPlacement('move');})}
  ];
  const actions=()=>selected()?stackActions(selected()):[
    {label:'Sva skladišta',run:effect(()=>api.changeArea('all'))},
    {label:'Slobodna mjesta',prompt:'Gdje ima slobodnih mjesta?',submit:true},
    {label:'Pronađi gume',prompt:'Pronađi gume '}
  ];
  const context=()=>{
    const stack=selected(),area=getArea();
    return {page:'warehouse-preview',dataScope:'Fictional local demo only; never live customer inventory.',
      area:area==='all'?'Sva skladišta':AREAS.find(a=>a.id===area)?.name,
      selectedStack:stack?{id:stack.id,occupied:stack.tireIds.length,capacity:stack.capacity}:null,
      instruction:'Use local tools for facts. Actions prepare forms or select views; saving requires explicit confirmation. Do not claim a save, print or message delivery.'};
  };
  function search(query){
    const direct=searchLocations(state(),query);if(direct.length)return direct;
    const tires=new Map(state().tires.map(t=>[t.id,t]));
    return state().stacks.flatMap(stack=>{
      const matchedTires=stack.tireIds.map(id=>tires.get(id)).filter(t=>t&&matchScore([customerLabel(t.customer),t.plate,t.code,t.id,t.setId,t.brand,t.size],query)!==null);
      const area=AREAS.find(a=>a.id===stack.areaId);
      if(!matchedTires.length&&matchScore([stack.id,area?.name],query)===null)return [];
      return [{stack,area,matchedTires}];
    });
  }
  const projection=hit=>({stack:hit.stack.id,area:hit.area?.name,
    occupied:hit.stack.tireIds.length,capacity:hit.stack.capacity,
    tires:hit.matchedTires.slice(0,8).map(t=>({id:t.id,set:t.setId,customer:customerLabel(t.customer),plate:t.plate,size:t.size}))});
  function searchReply(query){
    const found=search(query);
    if(!found.length)return {text:'Nema podudaranja u probnom prikazu. Pokušaj ime, registraciju ili oznaku kompleta.',actions:actions()};
    if(found.length===1){const hit=found[0];return {text:`Probni prikaz: ${hit.area.name} · ${hit.stack.id}. ${hit.matchedTires.length||hit.stack.tireIds.length} guma.`,actions:stackActions(hit.stack)};}
    return {text:`Probni prikaz: pronađeno je ${found.length} stupaca. Odaberi mjesto; za uži izbor dodaj registraciju ili oznaku kompleta.`,
      actions:found.slice(0,4).map(hit=>({label:hit.stack.id,run:()=>choose(hit.stack.id)}))};
  }
  function localRequest(text){
    const q=normalize(text),stack=selected();
    if(/^(pomoc|help|sto mozes|sto mozes uciniti)$/.test(q))return {text:'Ovdje mogu pronaći probne gume, pokazati prostor i pripremiti dodavanje ili premještanje. Promjene potvrđuješ sam.',actions:actions()};
    const command=q.replace(/^(molim )?(otvori|pokazi|prikazi|idi na|odi na) /,'');
    if(/^(sva skladista|sve|cijelo skladiste|pregled kuce)$/.test(command)){effect(()=>api.changeArea('all'))();return {text:'Prikazana su sva tri probna skladišta.',actions:actions()};}
    const area=AREAS.filter(a=>command===normalize(a.id)||matchScore([a.name],command)!==null);
    if(area.length===1){effect(()=>api.changeArea(area[0].id))();return {text:`Otvoreno: ${area[0].name}.`,actions:actions()};}
    if(/^(tlocrt|3d|3 d)$/.test(command)){
      if(command==='tlocrt'&&getArea()==='all')return {text:'Za tlocrt odaberi skladište.',actions:AREAS.map(a=>({label:a.name,run:effect(()=>{api.changeArea(a.id);api.setView('plan');})}))};
      if(command!=='tlocrt'&&document.getElementById('view-3d')?.disabled)return {text:'3D trenutno nije dostupan. Tlocrt i popis i dalje rade.',actions:[{label:'Tlocrt',prompt:'Tlocrt',submit:true}]};
      effect(()=>api.setView(command==='tlocrt'?'plan':'3d'))();return {text:command==='tlocrt'?'Prikazan je tlocrt.':'Odabran je 3D prikaz.',actions:actions()};
    }
    if(/^(gdje (ima|su) )?slobodn\w*( mjesta)?$/.test(q)||/^(stanje|kapacitet|koliko (ima |je )?(guma|mjesta)( ovdje| u ovom stupcu)?)$/.test(q)){
      if(q.includes('slobodn')){
        const free=state().stacks.filter(s=>(getArea()==='all'||s.areaId===getArea())&&s.tireIds.length<s.capacity);
        return {text:free.length?`Probni prikaz: ${free.length} stupaca ima slobodna mjesta. Odaberi stupac.`:'U ovom probnom prostoru nema slobodnih mjesta.',actions:free.slice(0,4).map(s=>({label:`${s.id} · ${s.capacity-s.tireIds.length} mjesta`,run:()=>choose(s.id)}))};
      }
      const counts=stack?{occupied:stack.tireIds.length,vacant:stack.capacity-stack.tireIds.length}:stats(state(),getArea()==='all'?null:getArea());
      return {text:`Probni prikaz${stack?' · '+stack.id:''}: ${counts.occupied} guma, ${counts.vacant} slobodnih mjesta.`,actions:actions()};
    }
    if(/^(dodaj|zaprimi) (gumu|gume|komplet)$/.test(q)){
      if(!stack)return {text:'Najprije odaberi stupac na karti.',actions:actions()};
      if(stack.tireIds.length>=stack.capacity)return {text:'Ovaj stupac je pun. Odaberi drugi.',actions:actions()};
      effect(()=>api.showAddTyre())();return {text:'Obrazac za probnu gumu je otvoren. Još ništa nije spremljeno.',actions:actions()};
    }
    if(/^(premjesti|pomakni) (stupac|ovo|ovaj stupac)$/.test(q)){
      if(!stack)return {text:'Najprije odaberi stupac.',actions:actions()};
      effect(()=>api.beginPlacement('move'))();return {text:'Odaberi novo mjesto pa potvrdi premještanje.',actions:actions()};
    }
    const query=text.replace(/^(molim\s+)?(pronađi|pronadi|nađi|nadi|potraži|potrazi|gdje\s+(su|je))\s+/i,'')
      .replace(/^(gume|gumu|komplet)\s+(od\s+|za\s+)?/i,'').replace(/\s+gume[?!.]*$/i,'').replace(/[?!.]+$/,'').trim();
    if(query&&search(query).length)return searchReply(query);
    return null;
  }
  const result=value=>({result:JSON.stringify({scope:'local_demo',...value})});
  const exactStack=id=>state().stacks.find(s=>s.id===id);
  const expectedContexts=new WeakMap();
  const remember=ctx=>{if(ctx?.signal)expectedContexts.set(ctx.signal,context());};
  const guard=ctx=>{ctx?.assertActive?.();if(!isActive())throw new Error('Prikaz je zaustavljen.');
    const initial=typeof ctx?.context==='string'?JSON.parse(ctx.context):ctx?.context;
    const captured=(ctx?.signal&&expectedContexts.get(ctx.signal))||initial;
    if(captured?.selectedStack?.id!==selected()?.id||captured?.area!==context().area)throw new Error('Odabir je promijenjen. Ponovno potvrdi zadatak.');};
  const tools={
    search_sets:async({query=''})=>result({matches:search(String(query).slice(0,200)).slice(0,12).map(projection)}),
    get_set:async({code=''})=>{
      const key=String(code).toUpperCase(),matches=state().tires.filter(t=>[t.id,t.code,t.setId].some(v=>v?.toUpperCase()===key));
      const stacks=state().stacks.filter(s=>s.id.toUpperCase()===key||s.tireIds.some(id=>matches.some(t=>t.id===id)));
      return result({matches:stacks.slice(0,12).map(stack=>projection({stack,area:AREAS.find(a=>a.id===stack.areaId),matchedTires:matches.filter(t=>stack.tireIds.includes(t.id))}))});
    },
    inventory_overview:async()=>result({areas:AREAS.map(a=>({name:a.name,...stats(state(),a.id)}))}),
    due_pickups:async()=>result({available:false,message:'Probni prikaz nema rokove preuzimanja. Ne zaključuj rok iz ovih podataka.'}),
    create_tire_set:async(_input,ctx)=>{
      guard(ctx);const stack=selected();if(!stack)return result({saved:false,message:'Zatraži odabir stupca na karti.'});
      if(stack.tireIds.length>=stack.capacity)return result({saved:false,message:'Stupac je pun.'});
      api.showAddTyre();return result({saved:false,message:'Otvoren je obrazac za jednu probnu gumu. Korisnik treba unijeti podatke i potvrditi spremanje.'});
    },
    open_set:async({code=''},ctx)=>{
      guard(ctx);const direct=exactStack(code);const found=direct?[{stack:direct}]:search(code);
      if(found.length!==1)return result({opened:false,message:'Traži točnu oznaku stupca; ne biraj prvu podudarnost.'});
      choose(found[0].stack.id);remember(ctx);return result({opened:true,stack:found[0].stack.id});
    },
    open_customer:async()=>result({opened:false,message:'Ovdje su samo probni kupci. Koristi search_sets za njihove lokacije.'}),
    generate_sticker:async({code=''},ctx)=>{
      guard(ctx);const tire=state().tires.find(t=>t.code===code||t.id===code),stack=tire&&state().stacks.find(s=>s.tireIds.includes(tire.id));
      if(!stack)return result({printed:false,message:'Za detalje treba točna oznaka pojedine probne gume.'});
      choose(stack.id);remember(ctx);api.showTyre(tire.id);return result({printed:false,message:'Otvoreni su detalji gume. Korisnik može proširiti QR. Ispis nije izvršen.'});
    }
  };
  return {context,actions,localRequest,tools};
}

export function mountWarehouseAssistant(api){return mountAssistant(api.mount,{...warehouseConversation(api),isActive:api.isActive});}
