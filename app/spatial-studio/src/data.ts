// Studio reads the same authenticated, paginated records and placement projection as ASC.
// No customer or inventory data goes into persistent storage.
export interface StudioArea {id:string;zone:string;name:string;width:number;depth:number;unit:'grid'|'m';spaceId:string|null}
export interface Column {id:string;areaId:string;rack:string;x:number;z:number;capacity:number;occupancy:number|null}
export interface InventorySet {id:string;code:string;owner:string;plate:string;size:string;sku:string;loadIndex:string;quantity:number|null;areaId:string|null;columnId:string|null;rack:string;zone:string;location:string;checkInDate:string}
export interface PlaceDraft {areaId:string;rack:string;x:number;z:number;capacity:number}
export interface StudioLocation {id:string;warehouse:string;zone:string;rack:string;qr:string;shelf:string;slot:string}
type SyncMode='online'|'offline'|'error'|'conflict'|'syncing';
interface Issue {id:string;reason:string;area_id:string;rack:string}
interface SyncState {mode:SyncMode;pending:number;conflicts:number;issues:Issue[]}
export interface Snapshot {status:'loading'|'signed-out'|'forbidden'|'online'|'offline'|'error';message:string;updatedAt:number|null;canEdit:boolean;areas:StudioArea[];columns:Column[];sets:InventorySet[];locations:StudioLocation[];pending:number;conflicts:number;issues:Issue[];syncMode:SyncMode|null;layoutAvailable:boolean}
export const initialSnapshot=():Snapshot=>({status:'loading',message:'Provjera pristupa…',updatedAt:null,canEdit:false,areas:[],columns:[],sets:[],locations:[],pending:0,conflicts:0,issues:[],syncMode:null,layoutAvailable:false});
type Session={user:{id:string}}|null;
interface RawArea {id:string;zone:string;warehouse:string;name:string;width:number;depth:number;unit:'grid'|'m'}
interface RawPosition {id:string;area_id:string;rack:string;x:number;z:number;capacity:number}
interface Binding {warehouse:string;area_id:string;space_id:string}
interface Geometry {areas:RawArea[];positions:RawPosition[];bindings:Binding[]}
interface RawLocation {id:string;warehouse:string;zone:string;rack:string;shelf?:string;slot?:string;qr_code?:string;status?:string}
interface RawTire {size?:string;sku?:string;load_index?:string}
interface RawSet {id:string;public_code:string;quantity?:number;check_in_date?:string;tires?:RawTire[];vehicle?:{plate?:string;customer?:{name?:string}}}
interface Placement {source:RawSet;setId:string;areaId?:string;stackId?:string;status:string;location?:RawLocation}
interface Projection {setPlacements:Placement[];state:{stacks:{id:string;occupiedQuantity:number}[]}}
interface Db {
 getSession:()=>Promise<Session>;loadMyProfile:()=>Promise<{id:string;role:string}|null>;canEditWarehouse:(role:string)=>boolean;
 listWarehouseLayout:()=>Promise<{available:boolean;areas:RawArea[];positions:RawPosition[]}>;
 listWarehouseSpaceBindings:()=>Promise<{available:boolean;bindings:Binding[]}>;
 listWarehouseInventory:()=>Promise<{sets:RawSet[];locations:RawLocation[];readCompletedAt:string}>;
 onAuthChange:(fn:(event:string,session:Session)=>void)=>{data:{subscription:{unsubscribe():void}}};
}
type GeometryMap=(spaceId:string,area:StudioArea,x:number,z:number,radius:number)=>unknown;
interface Sync {dispose():void;flush():Promise<unknown>;discard(id:string):Promise<unknown>;enqueue(input:{area_id:string;rack:string;x:number;z:number;capacity:number}):Promise<unknown>;cacheLayout(input:Geometry):Promise<unknown>;readLayout():Promise<(Geometry&{cachedAt:number})|null>}
interface Runtime {db:Db;project(input:unknown):Projection;map:GeometryMap;sync(user:string,onState:(s:SyncState)=>void,onInvalidate:()=>void):Promise<Sync>}
const key=(v:unknown)=>String(v??'').normalize('NFC').trim().replace(/\s+/g,' ').toUpperCase();
const nativeModule=async<T>(file:string):Promise<T>=>import(/* @vite-ignore */new URL(file,document.baseURI).href) as Promise<T>;
async function runtime():Promise<Runtime>{
 const [db,projection,building,queue,client,configuration]=await Promise.all([
  nativeModule<Db>('../../js/db.js'),nativeModule<{projectLiveInventory:Runtime['project']}>('../warehouse-preview/live-inventory.js'),
  nativeModule<{mapAreaPoint:GeometryMap}>('../warehouse-preview/building.js'),
  nativeModule<{createLayoutSync(options:{userId:string;client:unknown;url:string;publishableKey:string;onState:(state:SyncState)=>void;onInvalidate:()=>void}):Promise<Sync>}>('./sync.js'),
  nativeModule<{supabase:unknown}>('../../js/supabaseClient.js'),nativeModule<{config:{SUPABASE_URL:string;SUPABASE_ANON_KEY:string}}>('../../js/config.js')
 ]);
 return {db,project:projection.projectLiveInventory,map:building.mapAreaPoint,sync:(user,onState,onInvalidate)=>queue.createLayoutSync({userId:user,client:client.supabase,url:configuration.config.SUPABASE_URL,publishableKey:configuration.config.SUPABASE_ANON_KEY,onState,onInvalidate})};
}
export function convertGeometry(raw:Geometry){
 const areas:StudioArea[]=raw.areas.filter(a=>a.warehouse==='main').map(a=>{
  const pairs=raw.bindings.filter(b=>b.warehouse==='main'&&b.area_id===a.id);
  return {id:a.id,zone:a.zone,name:a.name,width:Number(a.width),depth:Number(a.depth),unit:a.unit,spaceId:pairs.length===1&&raw.bindings.filter(b=>b.warehouse==='main'&&b.space_id===pairs[0].space_id).length===1?pairs[0].space_id:null};
 });
 const ids=new Set(areas.map(a=>a.id));const columns:Column[]=raw.positions.filter(p=>ids.has(p.area_id)).map(p=>({id:p.id,areaId:p.area_id,rack:p.rack,x:Number(p.x),z:Number(p.z),capacity:Number(p.capacity),occupancy:null}));
 return {areas,columns};
}
export function convertInventory(project:Runtime['project'],geometry:Geometry,inventory:{sets:RawSet[];locations:RawLocation[]}){
 const {areas,columns}=convertGeometry(geometry);
 const projection=project({layout:{areas,stacks:columns.map(c=>({...c,radius:.27,tireIds:[]})),tires:[]},sets:inventory.sets,locations:inventory.locations});
 const counts=new Map(projection.state.stacks.map(s=>[s.id,s.occupiedQuantity]));
 const sets:InventorySet[]=projection.setPlacements.map(p=>{
  const s=p.source,t=s.tires||[],l=p.location;
  const join=(vs:(string|undefined)[])=>[...new Set(vs.filter(Boolean))].join(' · ');
  const size=join(t.map(v=>v.size)),loadIndex=join(t.map(v=>v.load_index||v.size?.match(/\b(\d{2,3}(?:\/\d{2,3})?)[A-Z]\b/i)?.[1]));
  return {id:p.setId,code:s.public_code||'',owner:s.vehicle?.customer?.name||'',plate:s.vehicle?.plate||'',size,sku:join(t.map(v=>v.sku)),loadIndex,quantity:Number.isSafeInteger(s.quantity)&&Number(s.quantity)>0?Number(s.quantity):null,areaId:p.areaId||null,columnId:p.status==='mapped'?p.stackId||null:null,rack:l?.rack||'',zone:l?.zone||'',location:[l?.zone,l?.rack,l?.shelf,l?.slot].filter(Boolean).join(' / '),checkInDate:s.check_in_date||''};
 });
 return {areas,columns:columns.map(c=>({...c,occupancy:counts.get(c.id)??null})),sets,locations:inventory.locations.filter(l=>l.warehouse==='main').map(l=>({id:l.id,warehouse:l.warehouse,zone:l.zone,rack:l.rack,shelf:l.shelf??'',slot:l.slot??'',qr:l.qr_code||''}))};
}
export function validateDraft(d:PlaceDraft,s:Snapshot,map:GeometryMap){
 const a=s.areas.find(v=>v.id===d.areaId),r=key(d.rack);
 if(!a||!s.layoutAvailable||!s.canEdit)throw Error('Nemate pristup uređivanju ovog prostora.');
 if(!r||!s.locations.some(l=>l.warehouse==='main'&&key(l.zone)===key(a.zone)&&key(l.rack)===r))throw Error('Odaberite postojeći regal iz ove zone.');
 if(!Number.isInteger(d.capacity)||d.capacity<1||d.capacity>16)throw Error('Kapacitet mora biti između 1 i 16.');
 if(![d.x,d.z].every(Number.isFinite)||Math.abs(d.x)+.27>a.width/2||Math.abs(d.z)+.27>a.depth/2||(a.spaceId&&!map(a.spaceId,a,d.x,d.z,.27)))throw Error('Cijeli stupac mora biti na čvrstom podu.');
 const neighbours=s.columns.filter(c=>c.areaId===d.areaId);
 if(neighbours.some(c=>key(c.rack)===r))throw Error('Regal već ima položaj. Osvježite prikaz.');
 if(neighbours.some(c=>Math.hypot(c.x-d.x,c.z-d.z)<.54))throw Error('Na odabranom je mjestu drugi stupac.');
 return {area_id:a.id,rack:r,x:d.x,z:d.z,capacity:d.capacity};
}
export interface StudioController {refresh():Promise<void>;dispose():void;addColumn(d:PlaceDraft):Promise<void>;flush():Promise<void>;discard(id:string):Promise<void>}
export function startStudio(onChange:(s:Snapshot)=>void,load:()=>Promise<Runtime>=runtime):StudioController{
 let s=initialSnapshot(),rt:Runtime|null=null,authSub:{unsubscribe():void}|null=null,sync:Sync|null=null;
 let uid:string|null=null,epoch=0,dead=false,verified=false,busy:Promise<void>|null=null,again=false,task:ReturnType<typeof setTimeout>|null=null;
 const emit=(patch:Partial<Snapshot>)=>{if(!dead){s={...s,...patch};onChange(s);}};
 const valid=(e:number)=>!dead&&e===epoch;
 const clear=(id:string|null)=>{++epoch;uid=id;verified=false;sync?.dispose();sync=null;emit({...initialSnapshot(),status:id?'loading':'signed-out',message:id?'Provjera pristupa…':'Prijavite se za pristup evidenciji.'});};
 const schedule=()=>{if(!dead&&task===null)task=setTimeout(()=>{task=null;void refresh();},0);};
 const offline=()=>{if(!dead&&verified){emit({status:'offline',message:'Bez mreže · posljednji raspored',sets:[],columns:s.columns.map(c=>({...c,occupancy:null})),syncMode:'offline'});}};
 async function fetchData(){
  if(!rt||dead)return;
  const r=rt;let e=epoch;
  try{
   const session=await r.db.getSession();if(!valid(e))return;
   const user=session?.user?.id||null;if(user!==uid){clear(user);e=epoch;}
   if(!user){emit({status:'signed-out',message:'Prijavite se za pristup evidenciji.'});return;}
   if(!navigator.onLine&&verified){offline();return;}
   const profile=await r.db.loadMyProfile();if(!valid(e))return;
   if(!profile||profile.id!==user||!r.db.canEditWarehouse(profile.role)){
    clear(user);emit({status:'forbidden',message:'Za pristup evidenciji potrebne su ovlasti osoblja.'});return;
   }
   verified=true;
   if(!sync){
    try{
     const fresh=await r.sync(user,state=>{if(valid(e))emit({syncMode:state.mode,pending:state.pending,conflicts:state.conflicts,issues:state.issues});},schedule);
     if(!valid(e)){fresh.dispose();return;}
     sync=fresh;
    }catch{if(!valid(e))return;/* Reads still work if persistent storage is denied. */}
   }
   const [layout,binding,inventory]=await Promise.all([r.db.listWarehouseLayout(),r.db.listWarehouseSpaceBindings(),r.db.listWarehouseInventory()]);
   if(!valid(e))return;
   const check=await r.db.getSession();if(!valid(e))return;if(check?.user?.id!==user){clear(check?.user?.id||null);schedule();return;}
   const g={areas:layout.areas,positions:layout.positions,bindings:binding.bindings};
   const data=convertInventory(r.project,g,inventory),available=layout.available&&binding.available;
   emit({...data,status:'online',message:!available?'Evidencija je dostupna; zajednički raspored nije postavljen.':sync?'Podaci su osvježeni.':'Podaci su osvježeni; uređivanje nije dostupno u ovom pregledniku.',updatedAt:Date.parse(inventory.readCompletedAt)||Date.now(),layoutAvailable:available,canEdit:available&&!!sync});
   if(available&&sync)await sync.cacheLayout(g).catch(()=>{});
  }catch{
   if(!valid(e))return;
   // A lost connection may keep a verified user's geometry and location labels
   // in this tab. Inventory and occupants are immediately redacted.
   if(!navigator.onLine&&verified){
    const cached=await sync?.readLayout().catch(()=>null);
    if(!valid(e))return;
    if(cached)emit({...convertGeometry(cached),updatedAt:cached.cachedAt});
    offline();
   }else{
    verified=false;sync?.dispose();sync=null;
    emit({...initialSnapshot(),status:navigator.onLine?'error':'offline',message:navigator.onLine?'Evidencija nije dostupna. Pokušajte ponovno.':'Bez mreže. Pristup evidenciji nije potvrđen.'});
   }
  }
 }
 async function refresh(){
  if(dead)return;
  if(!rt){await boot;return;}
  again=true;if(!busy)busy=(async()=>{while(again&&!dead){again=false;await fetchData();}})().finally(()=>{busy=null;});
  await busy;
 }
 async function initialize(){
  try{
   const r=await load();if(dead)return;rt=r;
   authSub=r.db.onAuthChange((event,session)=>{
    if(dead)return;const id=session?.user?.id||null;
    if(id!==uid||event==='SIGNED_OUT')clear(id);
    if(event==='SIGNED_OUT')return;
    if(event==='SIGNED_IN'||event==='USER_UPDATED'||event==='TOKEN_REFRESHED'||event==='INITIAL_SESSION')schedule();
   }).data.subscription;
   await refresh();
  }catch{if(!dead)emit({...initialSnapshot(),status:'error',message:'Povezivanje s ASC evidencijom nije uspjelo.'});}
 }
 const focus=()=>{if(!document.hidden&&!sync)schedule();};
 const suspend=()=>{if(!dead)clear(uid);}; // bfcache must never restore a previous operator's private records
 window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',schedule);
 window.addEventListener('online',schedule);window.addEventListener('offline',offline);
 window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
 const fallback=setInterval(()=>{if(!sync&&uid&&navigator.onLine&&!document.hidden)schedule();},30000);
 onChange(s);let boot:Promise<void>=initialize();
 return {refresh:async()=>{if(!rt&&!dead&&s.status==='error'){boot=initialize();}await refresh();},async flush(){await sync?.flush();await refresh();},async discard(id){await sync?.discard(id);await refresh();},
  async addColumn(d){const r=rt,q=sync,e=epoch;if(!r||!q||!verified||!uid||!s.canEdit)throw Error('Uređivanje trenutačno nije dostupno.');
   const payload=validateDraft(d,s,r.map);const session=await r.db.getSession();
   if(!valid(e)||session?.user?.id!==uid||!s.canEdit||q!==sync)throw Error('Pristup je promijenjen. Ponovno se prijavite.');
   await q.enqueue(payload);
  },dispose(){if(dead)return;dead=true;++epoch;clearInterval(fallback);if(task!==null)clearTimeout(task);
   authSub?.unsubscribe();sync?.dispose();window.removeEventListener('online',schedule);window.removeEventListener('offline',offline);
   window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);
   window.removeEventListener('pagehide',suspend);window.removeEventListener('pageshow',schedule);
   s=initialSnapshot();
  }};
}
