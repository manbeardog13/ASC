import React,{useEffect,useMemo,useRef,useState,Suspense,lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {create} from 'zustand';
import {rooms} from './rooms';
import {geometryProvenance} from './geometry-provenance';
import {Icon} from './Icon';
import {makeIndex,matches,occupancy,normalize,scanValue} from './search';
import {startStudio,type Snapshot,type InventorySet} from './data';
import './style.css';
import {Guide} from './Guide';
import {isPlaceable} from './canvas-geometry';
import {guideEntry,guideParams} from './guide';
const summitTenants = document.documentElement.dataset.summitTenants;
const entry=new URLSearchParams(location.search);
const initialGuide=guideEntry(location.search);
function SceneUnavailable() {
  return <div className="boot"><div className="empty">
    <strong role="status">Prikaz prostora nije učitan.</strong>
    <p>Vodič i evidencija i dalje su dostupni.</p>
    <button className="action-link" onClick={()=>window.location.reload()}>Ponovno učitaj studio</button>
    <a className="sub-link" href="../warehouse-preview/index.html">Otvori skladište <Icon name="arrow" size={15}/></a>
  </div></div>;
}
// An offline or superseded scene chunk must not unmount the inventory or guide.
const WarehouseCanvas=lazy(()=>import('./Canvas').catch(()=>({default:SceneUnavailable})));
const useStudio=create<{room:string;sel:string|null;query:string;snap:Snapshot|null;mode:'3d'|'walk'|'plan';collapsed:boolean;tab:'columns'|'sets'|'unassigned'}>(()=>({room:initialGuide.room||'house-ground',sel:null,query:'',snap:null,mode:entry.get('view')==='walk'?'walk':entry.get('view')==='plan'?'plan':'3d',collapsed:false,tab:'columns'}));
const update=useStudio.setState;
const nh=(n:number|null|undefined)=>n==null?'—':new Intl.NumberFormat('hr-HR').format(n);
const clock=(n:number|null|undefined)=>n?new Date(n).toLocaleTimeString('hr-HR',{hour:'2-digit',minute:'2-digit'}):'—';
const icons={space:'cube',search:'search',scan:'scan'} as const;
type Modal='guide'|'space'|'search'|'scan'|'status'|null;
function Dialog({title,children,close}:{title:string;children:React.ReactNode;close:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const d=ref.current;if(!d)return;d.showModal();return()=>d.close()},[]);return <dialog ref={ref} onCancel={close} aria-labelledby="dlg-title" onClick={e=>{if(e.target===ref.current)close()}}><div className="dialog-body"><div className="row spread"><div><div className="eyebrow">ASC / STUDIO</div><h2 id="dlg-title">{title}</h2></div><button className="icon-btn" onClick={close} aria-label="Zatvori"><Icon name="close"/></button></div>{children}</div></dialog>}
function App(){
 const st=useStudio(),{snap,room,sel,query,mode,collapsed,tab}=st;
 useEffect(()=>{if(entry.has('vodic')) document.dispatchEvent(new Event('asc:studio-guide-ready'))},[]);
 const loginParams = new URLSearchParams({from:'studio',view:mode});
 if(rooms.some(r=>r.id===room))loginParams.set('room',room);
 const inlineStep=entry.get('vodic');
 if(inlineStep==='regal'||inlineStep==='obilazak') loginParams.set('vodic',inlineStep);
 const currentEntry=new URLSearchParams(location.search);
 const currentGuide=guideEntry(currentEntry.toString());
 if(currentGuide.step)loginParams.set('guide',String(currentGuide.step));
 const find=currentEntry.get('find');if(find&&/^[a-zA-Z0-9_-]{1,80}$/.test(find))loginParams.set('find',find);
 const api=useRef<ReturnType<typeof startStudio>|null>(null);
 const [guideStep,setGuideStep]=useState(initialGuide.step??1);
 const [modal,setModal]=useState<Modal>(initialGuide.step?'guide':null),[cmd,setCmd]=useState(''),[scanErr,setScanErr]=useState(''),[place,setPlace]=useState(false),[coordinates,setCoordinates]=useState<[string,string]>(['','']),[rack,setRack]=useState(''),[cap,setCap]=useState(8),[working,setWorking]=useState(false),[notice,setNotice]=useState(''),[reset,setReset]=useState(0);
 function openGuide(step:number) {
   setGuideStep(step);setModal('guide');
   const url=new URL(location.href);
   const params=guideParams(step,room);
   url.searchParams.delete('room');
   params.forEach((value,key)=>url.searchParams.set(key,value));
   history.replaceState(history.state,'',url);
 }
 function closeGuide() {
   setModal(null);
   const url=new URL(location.href);
   url.searchParams.delete('guide');
   if(rooms.some(r=>r.id===room))url.searchParams.set('room',room);else url.searchParams.delete('room');
   history.replaceState(history.state,'',url);
 }
 const pick=(id:string)=>{update({room:id,sel:null,query:'',tab:'columns'});setModal(null);setPlace(false);setPoint(null);setNotice('')};
 const roomList=useMemo(()=>[...rooms.map(r=>({...r} as {id:string;zone:string;name:string;site:string;width:number;depth:number})),...(snap?.areas||[]).filter(a=>!a.spaceId).map(a=>({id:'area:'+a.id,zone:a.zone,name:a.name,site:'Skladište',width:a.width,depth:a.depth}))],[snap?.areas]);
 const cfg=roomList.find(r=>r.id===room)||roomList[0];
 const [gpuFailed,setGpuFailed]=useState(false);
 const leaveWalk=React.useCallback(()=>update({mode:'plan'}),[]);
 const gpuFailure=React.useCallback(()=>{setGpuFailed(true);if(useStudio.getState().mode==='3d')update({mode:'plan'})},[]);
 const custom=cfg.id.startsWith('area:'),viewMode=custom?'plan':mode;
 const area=snap?.areas.find(a=>a.spaceId===room||'area:'+a.id===room);
 const live=snap?.status==='online',privateAvailable=live||snap?.status==='offline';
 const realLayout=privateAvailable&&area&&snap?.layoutAvailable;
 const cols=(snap?.columns||[]).filter(c=>Boolean(area)&&c.areaId===area?.id),selected=cols.find(c=>c.id===sel);
 const setPoint=(next:[number,number]|null)=>setCoordinates(next?[String(next[0]),String(next[1])]:['','']);
 const hasCoordinates=coordinates.every(v=>v.trim()!==''&&Number.isFinite(Number(v)));
 const x=Number(coordinates[0]),z=Number(coordinates[1]);
 const point=hasCoordinates&&area&&isPlaceable(area.spaceId||cfg.id,area,x,z,cols)?[x,z]:null;
 const coordinateUnit=area?.unit==='m'?'m':'polja mreže';
 const sets=snap?.sets||[],localSets=sets.filter(s=>area&&s.areaId===area.id),unassigned=sets.filter(s=>!s.columnId);
 const idx=useMemo(()=>new Map((snap?.sets||[]).map(s=>[s.id,makeIndex([s.code,s.owner,s.plate,s.sku,s.size,s.loadIndex,s.zone,s.rack,s.location])])),[snap?.sets]);
 const setMatches=(s:InventorySet,q:string)=>{const i=idx.get(s.id);return i?matches(i,q):false};
 const filtered=(tab==='unassigned'?unassigned:localSets).filter(s=>setMatches(s,query)&&(!selected||tab==='unassigned'||s.columnId===selected.id));
 const rackMatches=(id:string,label:string)=>matches(makeIndex([label,area?.zone]),query)||localSets.some(s=>s.columnId===id&&setMatches(s,query));
 const filteredCols=cols.filter(c=>rackMatches(c.id,c.rack));
 const totalCap=cols.reduce((n,c)=>n+c.capacity,0),occupied=!live||cols.some(c=>c.occupancy===null)?null:cols.reduce((n,c)=>n+(c.occupancy||0),0);
 const scanOpen=()=>{setModal('scan');setCmd('');setScanErr('')};const commandOpen=()=>{setModal('search');setCmd('');setScanErr('')};
 useEffect(()=>{const ctrl=startStudio(s=>update({snap:s}));api.current=ctrl;return()=>{ctrl.dispose();api.current=null}},[]);
 // Resolve a record link only against the current staff member’s authorized projection.
 const requestedSet=useRef(new URLSearchParams(location.search).get('find'));
 useEffect(()=>{
   const code=requestedSet.current;
   if(!code||snap?.status!=='online')return;
   requestedSet.current=null;
   const record=snap.sets.find(s=>s.code===code);
   const area=record&&snap.areas.find(a=>a.id===record.areaId);
   const column=area&&snap.columns.find(c=>c.id===record?.columnId&&c.areaId===area.id);
   if(area&&column&&record){
     update({room:area.spaceId||'area:'+area.id,mode:'plan',sel:column.id,tab:'sets',query:record.code,collapsed:false});
     setNotice([record.code,record.location].filter(Boolean).join(' · '));
   }else{
     update({sel:null,collapsed:false,tab:'unassigned',query:record?.code||''});
     setNotice(record?'Položaj kompleta još nije potvrđen na karti. Provjerite adresu u njegovu zapisu.':'Komplet nije pronađen u dostupnoj evidenciji.');
   }
   const url=new URL(location.href);
   url.searchParams.delete('find');
   history.replaceState(history.state,'',url);
 },[snap]);
 const wasPrivate=useRef(false);
 useEffect(()=>{if(privateAvailable)wasPrivate.current=true;else if(wasPrivate.current&&snap?.status!=='loading'){wasPrivate.current=false;update({sel:null,query:'',tab:'columns'});setCmd('');setModal(null);setPlace(false);setPoint(null);setRack('');setNotice('')}},[privateAvailable,snap?.status]);
 useEffect(()=>{if(!live)return;const scripts=['../composer.js'];for(const path of scripts){const url=new URL(path,document.baseURI).href;if([...document.scripts].some(s=>s.src===url))continue;const script=document.createElement('script');script.src=url;document.body.append(script)}},[live]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(!modal&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();commandOpen()}else if(e.key==='Escape'&&!modal){if(useStudio.getState().mode==='walk')update({mode:'3d'});setPlace(false);setPoint(null);update({sel:null})}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[modal]);
 function openSet(s:InventorySet){location.assign('../set-detail.html?code='+encodeURIComponent(s.code))}
 function scan(){
   const code=normalize(scanValue(cmd));
   if(!live||!snap){setScanErr('Za provjeru koda potrebna je veza s evidencijom.');return}
   const hits=sets.filter(s=>code&&[s.code,s.id,s.sku].some(v=>normalize(v)===code));
   if(hits.length===1){openSet(hits[0]);return}
   if(hits.length>1){setModal('search');setCmd(code);return}
   const location=snap.locations.find(l=>code&&[l.qr,l.id].some(v=>normalize(v)===code));
   if(location){
     const areas=snap.areas.filter(a=>a.zone===location.zone);
     if(areas.length===1){
       const [a]=areas;
       const columns=snap.columns.filter(c=>c.areaId===a.id&&c.rack===location.rack);
       pick(a.spaceId||'area:'+a.id);
       update({mode:'plan',sel:columns.length===1?columns[0].id:null,query:location.rack,tab:'columns',collapsed:false});
       setNotice([location.zone,location.rack,location.shelf,location.slot].filter(Boolean).join(' / ')+
         (columns.length===1?'':' · Regal još nema potvrđen položaj na karti.'));
       return;
     }
   }
   setScanErr('Kod nije povezan s dostupnim kompletom ili prostorom.');
 }
 const rackOptions=[...new Set((snap?.locations||[]).filter(l=>area&&l.zone===area.zone&&!cols.some(c=>c.rack===l.rack)).map(l=>l.rack))];
 const canAdd=Boolean(area&&snap?.canEdit&&rackOptions.length&&realLayout);
 function openRackPlacement(){
   setPoint(null);setNotice('');setPlace(canAdd);
   if(canAdd)setRack(rackOptions[0]);
   update({mode:'plan',sel:null,collapsed:false,tab:'columns',query:''});
 }
 async function save(){if(!canAdd||!point||!area||!api.current||working)return;setWorking(true);try{await api.current.addColumn({areaId:area.id,rack,x:point[0],z:point[1],capacity:cap});setNotice('Položaj je predan za sinkronizaciju.');setPlace(false);setPoint(null)}catch(err){setNotice(err instanceof Error?err.message:'Položaj nije spremljen.')}finally{setWorking(false)}}
 const statusText=snap?.syncMode==='conflict'?'Sukob izmjena':snap?.pending?'Izmjene na čekanju':live?'Povezano':snap?.status==='signed-out'?'Bez prijave':snap?.status==='forbidden'?'Ograničen pristup':snap?.status==='offline'?'Izvan mreže':snap?.status==='error'?'Nedostupno':'Povezivanje';
 const provenance=geometryProvenance(!custom,area?.unit);
 const stamp=String(roomList.indexOf(cfg)+1).padStart(2,'0');
 return <div className="studio">
 <header className="topbar"><a className="brandmark" href="../dashboard.html" aria-label="ASC početna"><span className="asc-brand-frame"><img className="asc-brandmark" src="../assets/logo.png" alt="ASC" width="488" height="92"/></span></a><div className="brandsplit"/><div className="brandtext">Prostorni studio</div><div className="top-actions"><button className="command" aria-label="Pretraži" onClick={commandOpen}><Icon name="search"/><span>Pretraži</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl'} K</kbd></button><button className="top-btn" aria-label="Skeniraj" onClick={scanOpen}><Icon name="scan"/><span>Skeniraj</span></button><button className={'health '+(live&&!snap?.pending?'good':'')} onClick={()=>setModal('status')}><i/>{statusText}</button></div></header>
 <main><div className="sectionhead"><div><div className="eyebrow"><b/> ASC / SKLADIŠTE</div><h1>Prostorni pregled</h1></div><div className="studio-room-actions"><button className="room-button" aria-haspopup="dialog" onClick={()=>{setModal('space');setCmd('')}}><Icon name="layers"/><span>{cfg.site} <em>/</em> {cfg.name}</span><Icon name="down" size={14}/></button>{!entry.has('vodic')&&<button className="guide-trigger" aria-haspopup="dialog" onClick={()=>openGuide(guideStep)}><Icon name="target" size={16}/> Vodič</button>}</div></div>
 {entry.has('vodic')&&<div id="studio-guide-host"/>}
 <div className={'workspace '+(collapsed?'collapsed':'')}>
 <section className="viewport" aria-label="Prikaz odabranog prostora"><div className="view-head"><div className="eyebrow view-code"><i/> PROSTOR {stamp}</div><div className="switch" role="group" aria-label="Vrsta prikaza">{(['3d','walk','plan'] as const).map(m=><button key={m} aria-pressed={viewMode===m} disabled={(custom&&m!=='plan')||(gpuFailed&&m==='3d')} onClick={()=>{if(m!==viewMode){setPlace(false);setPoint(null);update({mode:m})}}}>{m==='3d'?'3D':m==='walk'?'Šetnja':'Tlocrt'}</button>)}</div></div>
 <div className="canvas-wrap"><Suspense fallback={<div className="boot">Učitavanje prostora…</div>}><WarehouseCanvas reset={reset} onWebGLFailure={gpuFailure} onWalkBlocked={leaveWalk} spaceId={area?.spaceId||cfg.id} width={area?.width??cfg.width} depth={area?.depth??cfg.depth} racks={cols.map(c=>({id:c.id,label:c.rack,x:c.x,z:c.z,capacity:c.capacity,occupied:c.occupancy}))} selectedId={sel} matchIds={query?filteredCols.map(c=>c.id):null} placing={place} mode={viewMode} onSelect={id=>{update({sel:id,collapsed:false,tab:'sets'});setPlace(false)}} onPlace={(x,z)=>{if(place){setPoint([x,z]);setNotice('')}}}/></Suspense></div>
 <div className="view-foot"><div><div className="zonecode">ZONA {area?.zone||cfg.zone}</div><h2>{cfg.name}</h2><small>{provenance.label} · {provenance.detail}</small></div><button className="icon-btn" title="Centriraj prikaz" aria-label="Centriraj prikaz" onClick={()=>{update({sel:null});setReset(r=>r+1)}}><Icon name="target"/></button></div>
 </section>
 <aside className="intelligence"><div className="panel-heading"><div><div className="eyebrow">EVIDENCIJA</div><h2>Inventar prostora</h2></div><button className="icon-btn" aria-expanded={!collapsed} aria-label={collapsed?'Otvori inventar':'Sažmi inventar'} title={collapsed?'Otvori inventar':'Sažmi inventar'} onClick={()=>update({collapsed:!collapsed})}><Icon name="panel"/></button></div>
 {!collapsed&&snap?.status==='signed-out'&&<div className="access-gate"><Icon name="lock"/><h3>Evidencija za djelatnike</h3><p className="access-note">Prijavite se za pregled kompleta i upravljanje mjestima.</p><a className="primary" href={`../login.html?${loginParams}`}>Prijava <Icon name="arrow" size={15}/></a></div>}
 {!collapsed&&snap?.status!=='signed-out'&&<><div className="metrics"><div><small>Stupci</small><b>{nh(realLayout?cols.length:null)}</b></div><div><small>Gume</small><b>{nh(realLayout?occupied:null)}</b></div><div><small>Kapacitet</small><b>{nh(realLayout?totalCap:null)}</b></div></div>
 <div className="capline"><span>Zauzetost</span><b>{realLayout&&occupied!==null&&totalCap?Math.round(100*occupied/totalCap)+' %':'—'}</b></div><div className="fillbar"><i className={occupancy(occupied,totalCap)} style={{width:Math.min(100,100*(occupied||0)/(totalCap||1))+'%'}}/></div>
 <div className="tabs" role="group" aria-label="Popis evidencije">{(['columns','sets','unassigned'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>update({tab:t,sel:null})}>{t==='columns'?'Stupci':t==='sets'?'Kompleti':'Bez stupca'}</button>)}</div>
 <label className="filter"><Icon name="search" size={16}/><input type="search" aria-label="Filtriraj evidenciju" placeholder="Regal, registracija, oznaka…" value={query} onChange={e=>update({query:e.target.value})}/></label>
 {sel&&selected&&<button className="selection" onClick={()=>update({sel:null})}>Regal {selected.rack} <Icon name="close" size={14}/></button>}
 {place?<form className="editbox" onSubmit={e=>{e.preventDefault();void save()}}><div className="row spread"><h3>Novi stupac</h3><button type="button" className="icon-btn" aria-label="Odustani" onClick={()=>setPlace(false)}><Icon name="close"/></button></div><p role="status">{point?'Odabran položaj: '+point.map(v=>v.toLocaleString('hr-HR',{maximumFractionDigits:2})).join(' / '):hasCoordinates?'Položaj nije slobodan. Odaberite čvrsti pod dalje od drugog stupca.':'Odaberite položaj na tlocrtu ili unesite koordinate.'}</p>
 <details className="coordinate-entry"><summary>Unesi koordinate</summary><p>Središte prostora je 0 / 0. X raste udesno, Z prema dnu tlocrta.</p>
 <div>{(['X','Z'] as const).map((axis,index)=><label key={axis}>{axis} ({coordinateUnit})
 <input type="number" inputMode="decimal" step="any" value={coordinates[index]} onChange={e=>{
   const next:[string,string]=[...coordinates];next[index]=e.target.value;setCoordinates(next);setNotice('');
 }}/></label>)}</div></details><label>Regal<select value={rack} onChange={e=>setRack(e.target.value)} required>{rackOptions.map(r=><option key={r}>{r}</option>)}</select></label><label>Kapacitet<input type="number" min="1" max="16" step="1" value={cap} onChange={e=>setCap(Number(e.target.value))} required/></label><button className="primary" disabled={!canAdd||!point||working||!rack}>{working?'Spremanje…':'Spremi položaj'}</button></form>:
 <div className="list" aria-live="polite">
 {!live&&(tab!=='columns'||!realLayout)?<div className="empty"><Icon name="lock"/><strong>{statusText}</strong><p>{snap?.message||'Provjeravamo dostupnost evidencije.'}</p></div>:
 tab==='columns'?filteredCols.length?filteredCols.map(c=><button className="data-row" key={c.id} onClick={()=>update({sel:c.id,tab:'sets'})}><Icon name="rack"/><span><strong>{c.rack}</strong><small>Regal · {area?.zone}</small></span><b className={occupancy(c.occupancy,c.capacity)}>{nh(c.occupancy)} / {c.capacity}</b></button>):<div className="empty"><Icon name="rack"/><strong>{query?'Nema podudaranja':area?'Nema stupaca':'Nema povezanog rasporeda'}</strong><p>{query?'Promijenite upit ili pretražite sve prostore.':area?'Otvorite mjesta i QR oznake kako biste evidentirali prvi regal.':'Arhitektonski prostor dostupan je neovisno o rasporedu regala.'}</p></div>:
 filtered.length?filtered.map(s=><button key={s.id} className="data-row" onClick={()=>openSet(s)}><Icon name="layers"/><span><strong>{s.owner||s.code}</strong><small>{[s.plate,s.rack,s.code].filter(Boolean).join(' · ')}</small></span><Icon name="arrow" size={15}/></button>):<div className="empty"><Icon name="layers"/><strong>{query?'Nema podudaranja':'Nema kompleta u ovom prikazu'}</strong></div>}
 </div>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 <div className="panel-foot">{snap?.canEdit&&realLayout&&<>{canAdd?<button className="primary" onClick={openRackPlacement}><Icon name="plus" size={16}/> Dodaj stupac</button>:<a className="primary" href={'../locations.html?zone='+encodeURIComponent(area!.zone)}><Icon name="plus" size={16}/> Dodaj mjesto</a>}</>}<a className="sub-link" href="../warehouse-preview/index.html">Otvori skladište <Icon name="arrow" size={15}/></a></div></>}
 </aside></div>
 <footer><a href="../guide.html">Vodič za skladište</a><span>Powered by <a href={summitTenants || 'https://nerosummit.com'}>{summitTenants ? 'Nero Summit · Organizacije' : 'Nero Summit'}</a></span></footer></main>
 {modal&&<Dialog title={modal==='guide'?'Vodič kroz skladište':modal==='space'?'Odaberite prostor':modal==='search'?'Brza pretraga':modal==='scan'?'Skeniranje koda':'Sinkronizacija'} close={modal==='guide'?closeGuide:()=>setModal(null)}>
 {modal==='guide'&&<Guide step={guideStep} room={room} zone={area?.zone||cfg.zone} name={cfg.name} status={snap?.status??'loading'} canAdd={canAdd} hasRacks={cols.length>0}
   hasLocations={Boolean(area&&snap?.locations.some(l=>l.zone===area.zone))} custom={custom} change={openGuide} close={closeGuide}
   explore={()=>{closeGuide();setPoint(null);setPlace(false);update({mode:custom?'plan':'walk',sel:null})}}
   mapRack={()=>{closeGuide();openRackPlacement()}}/>}
 {modal==='space'&&<div className="room-list">{roomList.map((r,i)=><button key={r.id} aria-current={room===r.id?'true':undefined} onClick={()=>pick(r.id)}><small>{String(i+1).padStart(2,'0')}</small><span>{r.name}<em>{r.site} · {r.zone}</em></span><Icon name="arrow" size={16}/></button>)}</div>}
 {(modal==='search'||modal==='scan')&&<><form className="cmdfield" onSubmit={e=>{e.preventDefault();if(modal==='scan')scan()}}><Icon name={icons[modal]}/><input autoFocus aria-label={modal==='scan'?'Kod naljepnice':'Pretražite sve prostore'} placeholder={modal==='scan'?'Skenirajte ili zalijepite kod…':'Prostor, oznaka, kupac, registracija…'} value={cmd} onChange={e=>{setCmd(e.target.value);setScanErr('')}}/>{modal==='scan'&&<button className="icon-btn" aria-label="Potvrdi kod"><Icon name="arrow"/></button>}</form>
 {modal==='scan'?<><p>Očitajte naljepnicu ručnim čitačem i pritisnite Enter.</p>{scanErr&&<p role="alert">{scanErr}</p>}<a className="action-link" href="../scan.html">Otvori kameru <Icon name="arrow" size={15}/></a></>:<div className="room-list">{roomList.filter(r=>matches(makeIndex([r.site,r.name,r.zone]),cmd)).map(r=><button key={r.id} onClick={()=>pick(r.id)}><Icon name="cube"/><span>{r.name}<em>Prostor · {r.zone}</em></span></button>)}{cmd&&sets.filter(s=>setMatches(s,cmd)).slice(0,80).map(s=><button key={s.id} onClick={()=>openSet(s)}><Icon name="layers"/><span>{s.code}<em>{s.owner} · {s.plate}</em></span></button>)}{cmd&&!roomList.some(r=>matches(makeIndex([r.site,r.name,r.zone]),cmd))&&!sets.some(s=>setMatches(s,cmd))&&<p>Nema podudaranja u dostupnoj evidenciji.</p>}</div>}</>}
 {modal==='status'&&<><p><b>{statusText}</b> · Zadnje učitavanje: {clock(snap?.updatedAt)}</p><p>{snap?.message}</p>{Boolean(snap?.pending)&&<p>Promjene na čekanju: {snap?.pending}</p>}{snap?.issues?.map(i=><div className="issue" key={i.id}><b>{i.rack}</b><p>{i.reason}</p><button onClick={()=>void api.current?.discard(i.id)}>Odbaci lokalnu promjenu</button></div>)}<button className="primary" onClick={()=>{void api.current?.refresh();void api.current?.flush()}}>Osvježi stanje</button></>}
 </Dialog>}</div>
}
createRoot(document.getElementById('root')!).render(<App/>);
